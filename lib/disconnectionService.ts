import { createClient } from '@supabase/supabase-js';
import { generateDisconnectionInvoice } from '@/lib/invoiceService';

type DisconnectionReason = 'standard' | 'payment_extension';

export async function processSubscriptionDisconnection(
    subscriptionId: string,
    disconnectionDate: Date,
    generateInvoice: boolean,
    reason: DisconnectionReason = 'standard'
): Promise<{
    success: boolean;
    error?: string;
    invoiceId?: string;
    amount?: number;
}> {
    try {
        let invoiceId: string | undefined;
        let amount: number | undefined;

        if (generateInvoice) {
            const invoiceResult = await generateDisconnectionInvoice(subscriptionId, disconnectionDate, reason);

            if (!invoiceResult.success) {
                return {
                    success: false,
                    error: invoiceResult.errors.join(', ')
                };
            }

            invoiceId = invoiceResult.invoiceId;
            amount = invoiceResult.amount;
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            return {
                success: false,
                error: 'Server configuration error: Missing Supabase credentials'
            };
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { syncSubscriptionToMikrotik, removeActivePppConnection } = await import('@/app/actions/mikrotik');
        const mikrotikResult = await syncSubscriptionToMikrotik(subscriptionId, false);

        if (!mikrotikResult.success) {
            console.error('[Disconnect] MikroTik sync failed:', mikrotikResult.error);
            return {
                success: false,
                error: `MikroTik sync failed: ${mikrotikResult.error}`
            };
        }

        const { data: pppSecret } = await supabase
            .from('mikrotik_ppp_secrets')
            .select('name')
            .eq('subscription_id', subscriptionId)
            .single();

        if (pppSecret?.name) {
            console.log(`[Disconnect] Removing active connection for ${pppSecret.name}`);
            const removeResult = await removeActivePppConnection(pppSecret.name);

            if (!removeResult.success) {
                console.error('[Disconnect] Failed to remove active connection:', removeResult.error);
            } else {
                console.log(`[Disconnect] Successfully removed active connection for ${pppSecret.name}`);
            }
        }

        const { error: updateError } = await supabase
            .from('subscriptions')
            .update({
                active: false,
                last_disconnection_date: disconnectionDate.toISOString(),
                promised_date: null
            })
            .eq('id', subscriptionId);

        if (updateError) {
            return {
                success: false,
                error: updateError.message
            };
        }

        return {
            success: true,
            invoiceId,
            amount
        };

    } catch (error) {
        console.error('Disconnection error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}
