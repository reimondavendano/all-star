/**
 * Payment Service
 * Handles payment processing and balance updates
 */

import { createClient } from '@supabase/supabase-js';
import { calculateNewBalance, determinePaymentStatus, toISODateString } from './billing';
import { sendSMS, SMSTemplates } from './sms';

// Server-side Supabase client
function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured in environment variables');
    }

    if (!supabaseServiceKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in environment variables');
    }

    return createClient(supabaseUrl, supabaseServiceKey);
}

interface ProcessPaymentParams {
    subscriptionId: string;
    amount: number;
    mode: 'Cash' | 'E-Wallet' | 'Referral Credit';
    settlementDate: string;
    notes?: string;
    invoiceId?: string;
    sendSmsNotification?: boolean;
}

interface ProcessPaymentResult {
    success: boolean;
    paymentId?: string;
    newBalance: number;
    previousBalance: number;
    invoiceStatus?: 'Paid' | 'Partially Paid' | 'Unpaid';
    error?: string;
}

/**
 * Process a payment and update subscription balance and invoice status
 */
export async function processPayment(params: ProcessPaymentParams): Promise<ProcessPaymentResult> {
    const supabase = getSupabaseAdmin();

    try {
        // 1. Get subscription details
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select(`
                id,
                balance,
                customers!subscriptions_subscriber_id_fkey (
                    name,
                    mobile_number
                ),
                plans (
                    name,
                    monthly_fee
                )
            `)
            .eq('id', params.subscriptionId)
            .single();

        if (subError || !subscription) {
            return {
                success: false,
                newBalance: 0,
                previousBalance: 0,
                error: 'Subscription not found',
            };
        }

        const previousBalance = Number(subscription.balance) || 0;
        const paymentAmount = params.amount;

        // 2. Insert payment record
        const { data: payment, error: paymentError } = await supabase
            .from('payments')
            .insert({
                subscription_id: params.subscriptionId,
                amount: paymentAmount,
                mode: params.mode,
                settlement_date: params.settlementDate,
                notes: params.notes || null,
            })
            .select('id')
            .single();

        if (paymentError) {
            return {
                success: false,
                newBalance: previousBalance,
                previousBalance,
                error: `Failed to record payment: ${paymentError.message}`,
            };
        }

        // 3. Calculate new balance
        // New Balance = Previous Balance - Payment Amount
        const newBalance = calculateNewBalance(previousBalance, paymentAmount);

        // 4. Update subscription balance
        const { error: updateError } = await supabase
            .from('subscriptions')
            .update({ balance: newBalance })
            .eq('id', params.subscriptionId);

        if (updateError) {
            console.error('Failed to update subscription balance:', updateError);
        }

        // 5. Update invoice status if an invoice was specified
        let invoiceStatus: 'Paid' | 'Partially Paid' | 'Unpaid' | undefined;

        if (params.invoiceId) {
            // Get the invoice
            const { data: invoice } = await supabase
                .from('invoices')
                .select('id, amount_due')
                .eq('id', params.invoiceId)
                .single();

            if (invoice) {
                // Get total payments for this invoice period
                const { data: allPayments } = await supabase
                    .from('payments')
                    .select('amount')
                    .eq('subscription_id', params.subscriptionId);

                const totalPaid = allPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

                invoiceStatus = determinePaymentStatus(totalPaid, invoice.amount_due);

                await supabase
                    .from('invoices')
                    .update({ payment_status: invoiceStatus })
                    .eq('id', params.invoiceId);
            }
        } else {
            // Try to update the most recent unpaid invoice
            const { data: recentInvoice } = await supabase
                .from('invoices')
                .select('id, amount_due')
                .eq('subscription_id', params.subscriptionId)
                .in('payment_status', ['Unpaid', 'Partially Paid'])
                .order('due_date', { ascending: false })
                .limit(1)
                .single();

            if (recentInvoice) {
                // Get all payments for this subscription
                const { data: allPayments } = await supabase
                    .from('payments')
                    .select('amount')
                    .eq('subscription_id', params.subscriptionId);

                const totalPaid = allPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

                // Calculate how much has been paid vs total invoiced
                const { data: allInvoices } = await supabase
                    .from('invoices')
                    .select('amount_due')
                    .eq('subscription_id', params.subscriptionId);

                const totalInvoiced = allInvoices?.reduce((sum, i) => sum + Number(i.amount_due), 0) || 0;

                // If total paid covers all invoiced, mark as paid
                if (totalPaid >= totalInvoiced) {
                    invoiceStatus = 'Paid';
                } else if (totalPaid > 0) {
                    invoiceStatus = 'Partially Paid';
                } else {
                    invoiceStatus = 'Unpaid';
                }

                await supabase
                    .from('invoices')
                    .update({ payment_status: invoiceStatus })
                    .eq('id', recentInvoice.id);
            }
        }

        // 6. Send SMS notification if requested
        if (params.sendSmsNotification) {
            const customer = subscription.customers as any;
            if (customer?.mobile_number) {
                await sendSMS({
                    to: customer.mobile_number,
                    message: SMSTemplates.paymentReceived(
                        customer.name,
                        paymentAmount,
                        newBalance
                    ),
                });
            }
        }

        return {
            success: true,
            paymentId: payment.id,
            newBalance,
            previousBalance,
            invoiceStatus,
        };

    } catch (error) {
        return {
            success: false,
            newBalance: 0,
            previousBalance: 0,
            error: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown'}`,
        };
    }
}

/**
 * Get payment history for a subscription
 */
export async function getPaymentHistory(subscriptionId: string): Promise<{
    success: boolean;
    payments: Array<{
        id: string;
        amount: number;
        mode: string;
        settlementDate: string;
        notes?: string;
        createdAt: string;
    }>;
    error?: string;
}> {
    const supabase = getSupabaseAdmin();

    try {
        const { data, error } = await supabase
            .from('payments')
            .select('id, amount, mode, settlement_date, notes, created_at')
            .eq('subscription_id', subscriptionId)
            .order('settlement_date', { ascending: false });

        if (error) {
            return {
                success: false,
                payments: [],
                error: error.message,
            };
        }

        return {
            success: true,
            payments: (data || []).map(p => ({
                id: p.id,
                amount: p.amount,
                mode: p.mode,
                settlementDate: p.settlement_date,
                notes: p.notes,
                createdAt: p.created_at,
            })),
        };

    } catch (error) {
        return {
            success: false,
            payments: [],
            error: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
        };
    }
}

/**
 * Get payment summary for a customer
 */
export async function getCustomerPaymentSummary(customerId: string): Promise<{
    success: boolean;
    totalPaid: number;
    totalInvoiced: number;
    currentBalance: number;
    subscriptions: Array<{
        id: string;
        planName: string;
        balance: number;
        totalPaid: number;
        totalInvoiced: number;
    }>;
    error?: string;
}> {
    const supabase = getSupabaseAdmin();

    try {
        // Get all subscriptions for this customer
        const { data: subscriptions, error: subError } = await supabase
            .from('subscriptions')
            .select(`
                id,
                balance,
                plans (name)
            `)
            .eq('subscriber_id', customerId);

        if (subError) {
            return {
                success: false,
                totalPaid: 0,
                totalInvoiced: 0,
                currentBalance: 0,
                subscriptions: [],
                error: subError.message,
            };
        }

        const subIds = (subscriptions || []).map(s => s.id);

        // Get all payments
        const { data: payments } = await supabase
            .from('payments')
            .select('subscription_id, amount')
            .in('subscription_id', subIds);

        // Get all invoices
        const { data: invoices } = await supabase
            .from('invoices')
            .select('subscription_id, amount_due')
            .in('subscription_id', subIds);

        // Calculate per-subscription totals
        const subSummaries = (subscriptions || []).map(sub => {
            const subPayments = (payments || []).filter(p => p.subscription_id === sub.id);
            const subInvoices = (invoices || []).filter(i => i.subscription_id === sub.id);

            const totalPaid = subPayments.reduce((sum, p) => sum + Number(p.amount), 0);
            const totalInvoiced = subInvoices.reduce((sum, i) => sum + Number(i.amount_due), 0);

            return {
                id: sub.id,
                planName: (sub.plans as any)?.name || 'Unknown',
                balance: Number(sub.balance) || 0,
                totalPaid,
                totalInvoiced,
            };
        });

        const totalPaid = subSummaries.reduce((sum, s) => sum + s.totalPaid, 0);
        const totalInvoiced = subSummaries.reduce((sum, s) => sum + s.totalInvoiced, 0);
        const currentBalance = subSummaries.reduce((sum, s) => sum + s.balance, 0);

        return {
            success: true,
            totalPaid,
            totalInvoiced,
            currentBalance,
            subscriptions: subSummaries,
        };

    } catch (error) {
        return {
            success: false,
            totalPaid: 0,
            totalInvoiced: 0,
            currentBalance: 0,
            subscriptions: [],
            error: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
        };
    }
}

/**
 * Recalculate and fix balance for a subscription
 * Useful for data reconciliation
 */
export async function recalculateBalance(subscriptionId: string): Promise<{
    success: boolean;
    previousBalance: number;
    newBalance: number;
    error?: string;
}> {
    const supabase = getSupabaseAdmin();

    try {
        // Get current balance
        const { data: sub } = await supabase
            .from('subscriptions')
            .select('balance')
            .eq('id', subscriptionId)
            .single();

        const previousBalance = Number(sub?.balance) || 0;

        // Get all invoices
        const { data: invoices } = await supabase
            .from('invoices')
            .select('amount_due')
            .eq('subscription_id', subscriptionId);

        const totalInvoiced = invoices?.reduce((sum, i) => sum + Number(i.amount_due), 0) || 0;

        // Get all payments
        const { data: payments } = await supabase
            .from('payments')
            .select('amount')
            .eq('subscription_id', subscriptionId);

        const totalPaid = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

        // Calculate correct balance
        const newBalance = totalInvoiced - totalPaid;

        // Update subscription
        await supabase
            .from('subscriptions')
            .update({ balance: newBalance })
            .eq('id', subscriptionId);

        return {
            success: true,
            previousBalance,
            newBalance,
        };

    } catch (error) {
        return {
            success: false,
            previousBalance: 0,
            newBalance: 0,
            error: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
        };
    }
}
