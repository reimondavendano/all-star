'use server';

import { generateActivationInvoice } from '@/lib/invoiceService';

/**
 * Server Action to handle subscription activation/reconnection
 * This runs on the server and has access to service role keys
 */
export async function processActivation(
    subscriptionId: string,
    activationDate: Date,
    generateInvoice: boolean
): Promise<{
    success: boolean;
    error?: string;
    invoiceId?: string;
    amount?: number;
}> {
    try {
        let invoiceId: string | undefined;
        let amount: number | undefined;

        // Generate invoice if requested
        if (generateInvoice) {
            const invoiceResult = await generateActivationInvoice(subscriptionId, activationDate);

            if (!invoiceResult.success) {
                return {
                    success: false,
                    error: invoiceResult.errors.join(', ')
                };
            }

            invoiceId = invoiceResult.invoiceId;
            amount = invoiceResult.amount;
        }

        // Update subscription to active
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            return {
                success: false,
                error: 'Server configuration error: Missing Supabase credentials'
            };
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { error: updateError } = await supabase
            .from('subscriptions')
            .update({ active: true })
            .eq('id', subscriptionId);

        if (updateError) {
            return {
                success: false,
                error: updateError.message
            };
        }

        // Sync to MikroTik (restore profile based on plan and enable)
        const { syncSubscriptionToMikrotik } = await import('./mikrotik');
        const mikrotikResult = await syncSubscriptionToMikrotik(subscriptionId, true);

        if (!mikrotikResult.success) {
            console.error('[Activation] MikroTik sync failed:', mikrotikResult.error);
            // Don't fail the whole operation, just log the error
        }

        return {
            success: true,
            invoiceId,
            amount
        };

    } catch (error) {
        console.error('Activation error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}
