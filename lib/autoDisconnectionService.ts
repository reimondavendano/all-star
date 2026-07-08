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
    reason: 'payment_extension' | 'standard';
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

        // Process in chunks to speed up execution and avoid Vercel timeouts
        const CHUNK_SIZE = 5;
        for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
            const chunk = candidates.slice(i, i + CHUNK_SIZE);
            
            await Promise.all(chunk.map(async (candidate) => {
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
            }));
        }

        result.success = result.errors.length === 0;
        return result;
    } catch (error) {
        result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return result;
    }
}

export async function runGeneralAutoDisconnectionBatch(now = new Date()): Promise<AutoDisconnectionBatchResult> {
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
        const { data: rules, error: rulesError } = await supabase
            .from('auto_disconnect_rules')
            .select('*')
            .not('disconnect_date', 'is', null);

        if (rulesError) {
            result.errors.push(`Error fetching auto disconnect rules: ${rulesError.message}`);
            return result;
        }

        const activeRules = (rules || []).filter(r => {
            const disconnectOn = addDaysISO(r.disconnect_date, 1);
            return todayISO === disconnectOn;
        });

        if (activeRules.length === 0) {
            result.success = true;
            return result;
        }

        const { data: subs, error: subsError } = await supabase
            .from('subscriptions')
            .select(`
                id, active, is_free, balance, invoice_date, business_unit_id,
                promised_date,
                business_units ( name ), 
                customers!subscriptions_subscriber_id_fkey ( name )
            `)
            .eq('active', true)
            .gt('balance', 0);

        if (subsError) {
            result.errors.push(`Error fetching subscriptions: ${subsError.message}`);
            return result;
        }

        for (const rule of activeRules) {
            const candidates = (subs || []).filter(sub => {
                if (sub.is_free) return false;
                
                // CRITICAL: Skip if they have a manual payment extension (promised_date).
                // The individual extension cron job handles these.
                if (sub.promised_date) return false;
                
                if (sub.business_unit_id !== rule.business_unit_id) return false;
                if (rule.invoice_cycle && sub.invoice_date !== rule.invoice_cycle) return false;
                
                return true;
            });

            result.checked += subs?.length || 0;
            result.due += candidates.length;

            const CHUNK_SIZE = 5;
            for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
                const chunk = candidates.slice(i, i + CHUNK_SIZE);
                
                await Promise.all(chunk.map(async (candidate) => {
                    const customerName = firstRelation(candidate.customers)?.name || 'Unknown';
                    const buName = firstRelation(candidate.business_units)?.name || '';

                    const disconnectResult = await processSubscriptionDisconnection(
                        candidate.id,
                        dateOnlyToUTCNoon(rule.disconnect_date),
                        true,
                        'standard'
                    );

                    if (disconnectResult.success) {
                        result.disconnected += 1;
                    } else {
                        result.errors.push(`${customerName}: ${disconnectResult.error || 'Unknown error'}`);
                    }

                    result.details.push({
                        subscriptionId: candidate.id,
                        customerName,
                        businessUnitName: buName,
                        promisedDate: rule.disconnect_date,
                        disconnectOn: todayISO,
                        reason: 'standard' as const,
                        success: disconnectResult.success,
                        error: disconnectResult.error,
                        generatedInvoiceId: disconnectResult.invoiceId,
                        amount: disconnectResult.amount,
                    });
                }));
            }

            if (rule.is_recurring) {
                // Roll over to next month
                const dateParts = rule.disconnect_date.split('-');
                let y = parseInt(dateParts[0]);
                let m = parseInt(dateParts[1]);
                const d = parseInt(dateParts[2]);
                m++;
                if (m > 12) {
                    m = 1;
                    y++;
                }
                const newDateStr = `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
                await supabase.from('auto_disconnect_rules').update({ disconnect_date: newDateStr }).eq('id', rule.id);
            } else {
                // Clear the date so it doesn't run again
                await supabase.from('auto_disconnect_rules').update({ disconnect_date: null }).eq('id', rule.id);
            }
        }

        result.success = result.errors.length === 0;
        return result;
    } catch (error) {
        result.errors.push(`Unexpected error in general batch: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return result;
    }
}

