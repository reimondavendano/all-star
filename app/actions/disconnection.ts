'use server';

import { processSubscriptionDisconnection } from '@/lib/disconnectionService';

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
    return processSubscriptionDisconnection(subscriptionId, disconnectionDate, generateInvoice);
}
