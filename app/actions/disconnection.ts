'use server';

import { generateDisconnectionInvoice } from '@/lib/invoiceService';

/**
 * Server Action to handle subscription disconnection
 * This runs on the server and has access to service role keys
 */
export async function processDisconnection(
    subscriptionId: string,
    disconnectionDate: Date,
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
            const invoiceResult = await generateDisconnectionInvoice(subscriptionId, disconnectionDate);

            if (!invoiceResult.success) {
                return {
                    success: false,
                    error: invoiceResult.errors.join(', ')
                };
            }

            invoiceId = invoiceResult.invoiceId;
            amount = invoiceResult.amount;
        }

        // Update subscription to inactive
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
            .update({ active: false })
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
