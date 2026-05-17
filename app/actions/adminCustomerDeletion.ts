'use server';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabaseAdmin() {
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase admin environment variables are not configured.');
    }

    return createClient(supabaseUrl, supabaseServiceKey);
}

async function runStep(label: string, operation: PromiseLike<{ error: any }>) {
    const { error } = await operation;
    if (error) {
        throw new Error(`${label}: ${error.message}`);
    }
}

async function ignoreMissingColumn(operation: PromiseLike<{ error: any }>) {
    const { error } = await operation;
    if (error && error.code !== '42703' && error.code !== 'PGRST204') {
        throw error;
    }
}

async function deleteSubscriptionDependencies(supabase: ReturnType<typeof getSupabaseAdmin>, subscriptionIds: string[]) {
    if (subscriptionIds.length === 0) return;

    await runStep(
        'Delete plan-change records',
        supabase.from('plan_changes').delete().in('subscription_id', subscriptionIds)
    );
    await runStep(
        'Delete payments',
        supabase.from('payments').delete().in('subscription_id', subscriptionIds)
    );
    await runStep(
        'Delete invoices',
        supabase.from('invoices').delete().in('subscription_id', subscriptionIds)
    );
    await runStep(
        'Delete expenses',
        supabase.from('expenses').delete().in('subscription_id', subscriptionIds)
    );
    await runStep(
        'Delete MikroTik PPP secrets',
        supabase.from('mikrotik_ppp_secrets').delete().in('subscription_id', subscriptionIds)
    );
}

export async function deleteAdminSubscriptionAccount(subscriptionId: string) {
    try {
        const supabase = getSupabaseAdmin();

        await deleteSubscriptionDependencies(supabase, [subscriptionId]);
        await runStep(
            'Delete subscription',
            supabase.from('subscriptions').delete().eq('id', subscriptionId)
        );

        return { success: true };
    } catch (error) {
        console.error('Delete subscription account error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unable to delete subscription.'
        };
    }
}

export async function deleteAdminCustomerAccount(customerId: string) {
    try {
        const supabase = getSupabaseAdmin();

        const { data: subscriptions, error: subError } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('subscriber_id', customerId);

        if (subError) throw subError;

        const subscriptionIds = (subscriptions || []).map(subscription => subscription.id);

        await deleteSubscriptionDependencies(supabase, subscriptionIds);
        await runStep(
            'Delete customer MikroTik PPP secrets',
            supabase.from('mikrotik_ppp_secrets').delete().eq('customer_id', customerId)
        );
        await runStep(
            'Delete customer plan-change requests',
            supabase.from('plan_changes').delete().eq('requested_by_customer_id', customerId)
        );

        await ignoreMissingColumn(
            supabase.from('subscriptions').update({ referrer_id: null }).eq('referrer_id', customerId)
        );
        await ignoreMissingColumn(
            supabase.from('prospects').update({ referrer_id: null }).eq('referrer_id', customerId)
        );

        if (subscriptionIds.length > 0) {
            await runStep(
                'Delete subscriptions',
                supabase.from('subscriptions').delete().in('id', subscriptionIds)
            );
        }

        await runStep(
            'Delete customer',
            supabase.from('customers').delete().eq('id', customerId)
        );

        return { success: true, deletedSubscriptions: subscriptionIds.length };
    } catch (error) {
        console.error('Delete customer account error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unable to delete customer account.'
        };
    }
}
