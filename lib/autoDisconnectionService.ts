import { createClient } from '@supabase/supabase-js';
import { processSubscriptionDisconnection } from '@/lib/disconnectionService';

type SubscriptionForAutoDisconnection = {
    id: string;
    active: boolean;
    promised_date: string | null;
    invoice_date: '15th' | '30th' | null;
    balance: number | null;
    is_free?: boolean | null;
    business_units?: { name: string } | Array<{ name: string }> | null;
    customers?: { name: string } | Array<{ name: string }> | null;
};

type InvoiceWithSubscription = {
    id: string;
    due_date: string;
    subscription_id: string;
    subscriptions: SubscriptionForAutoDisconnection | SubscriptionForAutoDisconnection[] | null;
};

type AutoDisconnectionCandidate = {
    subscriptionId: string;
    customerName: string;
    businessUnitName: string;
    invoiceId: string;
    invoiceDueDate: string;
    promisedDate: string | null;
    disconnectOn: string;
    reason: 'normal_schedule' | 'payment_extension';
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] || null;
    return value || null;
}

export type AutoDisconnectionBatchResult = {
    success: boolean;
    checked: number;
    due: number;
    disconnected: number;
    skipped: number;
    errors: string[];
    details: Array<AutoDisconnectionCandidate & {
        success: boolean;
        error?: string;
        generatedInvoiceId?: string;
        amount?: number;
    }>;
};

function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase server configuration');
    }

    return createClient(supabaseUrl, supabaseServiceKey);
}

function getPhilippineTodayISO(now = new Date()): string {
    const philippineTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    return philippineTime.toISOString().split('T')[0];
}

function addDaysISO(dateISO: string, days: number): string {
    const date = new Date(`${dateISO}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
}

function normalDisconnectionDateFromInvoice(
    invoiceDueDate: string,
    invoiceDate: '15th' | '30th' | null,
    businessUnitName: string
): string {
    const dueDate = new Date(`${invoiceDueDate}T00:00:00Z`);
    const normalizedName = businessUnitName.toLowerCase();
    const isThirtyCycle = invoiceDate === '30th' || normalizedName.includes('malanggam');

    if (isThirtyCycle) {
        return new Date(Date.UTC(
            dueDate.getUTCFullYear(),
            dueDate.getUTCMonth() + 1,
            5
        )).toISOString().split('T')[0];
    }

    return new Date(Date.UTC(
        dueDate.getUTCFullYear(),
        dueDate.getUTCMonth(),
        25
    )).toISOString().split('T')[0];
}

export async function runAutoDisconnectionBatch(now = new Date()): Promise<AutoDisconnectionBatchResult> {
    const supabase = getSupabaseAdmin();
    const todayISO = getPhilippineTodayISO(now);
    const result: AutoDisconnectionBatchResult = {
        success: false,
        checked: 0,
        due: 0,
        disconnected: 0,
        skipped: 0,
        errors: [],
        details: [],
    };

    try {
        const { data: invoices, error } = await supabase
            .from('invoices')
            .select(`
                id,
                due_date,
                subscription_id,
                subscriptions!inner (
                    id,
                    active,
                    promised_date,
                    invoice_date,
                    balance,
                    is_free,
                    business_units ( name ),
                    customers!subscriptions_subscriber_id_fkey ( name )
                )
            `)
            .in('payment_status', ['Unpaid', 'Partially Paid'])
            .eq('subscriptions.active', true)
            .order('due_date', { ascending: true });

        if (error) {
            result.errors.push(`Error fetching unpaid invoices: ${error.message}`);
            return result;
        }

        const earliestBySubscription = new Map<string, InvoiceWithSubscription>();

        for (const invoice of (invoices || []) as InvoiceWithSubscription[]) {
            const subscription = firstRelation(invoice.subscriptions);
            if (!subscription?.active || subscription.is_free || Number(subscription.balance || 0) <= 0) {
                result.skipped += 1;
                continue;
            }

            if (!earliestBySubscription.has(subscription.id)) {
                earliestBySubscription.set(subscription.id, invoice);
            }
        }

        result.checked = earliestBySubscription.size;

        const candidates: AutoDisconnectionCandidate[] = [];
        for (const invoice of earliestBySubscription.values()) {
            const subscription = firstRelation(invoice.subscriptions);
            if (!subscription) continue;

            const businessUnit = firstRelation(subscription.business_units);
            const customer = firstRelation(subscription.customers);
            const businessUnitName = businessUnit?.name || '';
            const promisedDate = subscription.promised_date;
            const disconnectOn = promisedDate
                ? addDaysISO(promisedDate, 1)
                : normalDisconnectionDateFromInvoice(invoice.due_date, subscription.invoice_date, businessUnitName);

            if (todayISO < disconnectOn) {
                continue;
            }

            candidates.push({
                subscriptionId: subscription.id,
                customerName: customer?.name || 'Unknown',
                businessUnitName,
                invoiceId: invoice.id,
                invoiceDueDate: invoice.due_date,
                promisedDate,
                disconnectOn,
                reason: promisedDate ? 'payment_extension' : 'normal_schedule',
            });
        }

        result.due = candidates.length;

        for (const candidate of candidates) {
            const disconnectResult = await processSubscriptionDisconnection(
                candidate.subscriptionId,
                new Date(`${todayISO}T00:00:00+08:00`),
                true
            );

            if (disconnectResult.success) {
                result.disconnected += 1;
            } else {
                result.errors.push(`${candidate.customerName}: ${disconnectResult.error || 'Unknown error'}`);
            }

            result.details.push({
                ...candidate,
                success: disconnectResult.success,
                error: disconnectResult.error,
                generatedInvoiceId: disconnectResult.invoiceId,
                amount: disconnectResult.amount,
            });
        }

        result.success = result.errors.length === 0;
        return result;
    } catch (error) {
        result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return result;
    }
}
