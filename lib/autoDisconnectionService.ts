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

type AutoDisconnectionCandidate = {
    subscriptionId: string;
    customerName: string;
    businessUnitName: string;
    promisedDate: string;
    disconnectOn: string;
    reason: 'payment_extension';
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

function dateOnlyToUTCNoon(dateISO: string): Date {
    return new Date(`${dateISO}T12:00:00Z`);
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
        const { data: subscriptions, error } = await supabase
            .from('subscriptions')
            .select(`
                id,
                active,
                promised_date,
                invoice_date,
                balance,
                is_free,
                business_units ( name ),
                customers!subscriptions_subscriber_id_fkey ( name )
            `)
            .eq('active', true)
            .not('promised_date', 'is', null)
            .gt('balance', 0)
            .order('promised_date', { ascending: true });

        if (error) {
            result.errors.push(`Error fetching promised-date subscriptions: ${error.message}`);
            return result;
        }

        result.checked = subscriptions?.length || 0;

        const candidates: AutoDisconnectionCandidate[] = [];
        for (const subscription of (subscriptions || []) as SubscriptionForAutoDisconnection[]) {
            const businessUnit = firstRelation(subscription.business_units);
            const customer = firstRelation(subscription.customers);
            const businessUnitName = businessUnit?.name || '';
            const promisedDate = subscription.promised_date;

            if (!subscription.active || subscription.is_free || !promisedDate || Number(subscription.balance || 0) <= 0) {
                result.skipped += 1;
                continue;
            }

            const disconnectOn = addDaysISO(promisedDate, 1);

            if (todayISO < disconnectOn) {
                continue;
            }

            candidates.push({
                subscriptionId: subscription.id,
                customerName: customer?.name || 'Unknown',
                businessUnitName,
                promisedDate,
                disconnectOn,
                reason: 'payment_extension',
            });
        }

        result.due = candidates.length;

        for (const candidate of candidates) {
            const disconnectResult = await processSubscriptionDisconnection(
                candidate.subscriptionId,
                dateOnlyToUTCNoon(candidate.promisedDate),
                true,
                'payment_extension'
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
