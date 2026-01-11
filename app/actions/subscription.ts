'use server';

import { createClient } from '@supabase/supabase-js';
import { updatePppSecret } from './mikrotik';
import { processPlanChange, previewPlanChange } from '@/lib/planChangeService';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const PLAN_TO_PROFILE: Record<string, string> = {
    'Plan 799': '50MBPS',
    'Plan 999': '100MBPS',
    'Plan 1299': '130MBPS',
    'Plan 1499': '150MBPS'
};

/**
 * Change a subscription's plan with automatic prorated invoicing
 * 
 * When a customer upgrades or downgrades:
 * 1. Creates a prorated invoice for days used on OLD plan
 * 2. Updates the subscription to the new plan
 * 3. Updates MikroTik profile if applicable
 * 4. Records the plan change for future invoice generation
 */
export async function changeSubscriptionPlan(subscriptionId: string, newPlanId: string) {
    try {
        // 1. Process plan change with prorated invoicing
        const result = await processPlanChange(subscriptionId, newPlanId);

        if (!result.success) {
            return { success: false, error: result.error };
        }

        // 2. Get new plan details for MikroTik update
        const { data: newPlan, error: planError } = await supabase
            .from('plans')
            .select('name, monthly_fee')
            .eq('id', newPlanId)
            .single();

        if (planError || !newPlan) {
            // Plan change succeeded but we couldn't get plan details for MikroTik
            console.warn('Plan updated but could not fetch plan details for MikroTik');
            return {
                success: true,
                proratedInvoice: result.proratedInvoice,
                warning: 'MikroTik profile not updated - plan details not found'
            };
        }

        // 3. Update MikroTik profile if linked
        const { data: secrets } = await supabase
            .from('mikrotik_ppp_secrets')
            .select('name, id')
            .eq('subscription_id', subscriptionId);

        if (secrets && secrets.length > 0) {
            const secretName = secrets[0].name;
            const newProfile = PLAN_TO_PROFILE[newPlan.name];

            if (newProfile) {
                const mtResult = await updatePppSecret(secretName, { profile: newProfile });

                if (mtResult.success) {
                    await supabase
                        .from('mikrotik_ppp_secrets')
                        .update({ profile: newProfile })
                        .eq('subscription_id', subscriptionId);
                } else {
                    console.warn(`Failed to update MikroTik profile for ${secretName}: ${mtResult.error}`);
                    return {
                        success: true,
                        proratedInvoice: result.proratedInvoice,
                        warning: `Plan updated but MikroTik sync failed: ${mtResult.error}`
                    };
                }
            } else {
                console.warn(`No MikroTik profile mapped for plan ${newPlan.name}`);
            }
        }

        return {
            success: true,
            proratedInvoice: result.proratedInvoice,
            message: result.proratedInvoice
                ? `Plan changed successfully. Prorated invoice of ₱${result.proratedInvoice.amount.toLocaleString()} created for ${result.proratedInvoice.description}.`
                : 'Plan changed successfully.'
        };

    } catch (error: any) {
        console.error('Change Plan Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Preview what invoices would be created for a plan change
 * (Does not make any changes - for UI display only)
 */
export async function previewPlanChangeInvoices(
    subscriptionId: string,
    newPlanId: string
) {
    try {
        // Get current subscription details
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select(`
                invoice_date,
                plans!subscriptions_plan_id_fkey (monthly_fee)
            `)
            .eq('id', subscriptionId)
            .single();

        if (subError || !subscription) {
            return { success: false, error: 'Subscription not found' };
        }

        // Get new plan details
        const { data: newPlan, error: planError } = await supabase
            .from('plans')
            .select('monthly_fee')
            .eq('id', newPlanId)
            .single();

        if (planError || !newPlan) {
            return { success: false, error: 'Plan not found' };
        }

        const currentPlan = Array.isArray(subscription.plans)
            ? subscription.plans[0]
            : subscription.plans;

        const preview = previewPlanChange(
            currentPlan?.monthly_fee || 0,
            newPlan.monthly_fee,
            subscription.invoice_date || '15th'
        );

        return { success: true, preview };

    } catch (error: any) {
        console.error('Preview Plan Change Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Submit a manual e-wallet payment for verification.
 * This creates a PENDING payment record that admin must verify.
 * Balance is NOT deducted until admin approves.
 */
export async function submitManualPayment(
    subscriptionId: string,
    amount: number,
    walletProvider: string,
    referenceNumber: string,
    proofImageBase64?: string
) {
    try {
        const settlementDate = new Date().toISOString().split('T')[0];

        // 1. Get Subscription Info
        const { data: sub, error: subError } = await supabase
            .from('subscriptions')
            .select('balance, address, subscriber_id')
            .eq('id', subscriptionId)
            .single();

        if (subError || !sub) throw new Error('Subscription not found');

        // 2. Save proof image if provided (Upload to Supabase Storage)
        let proofImageUrl = null;
        if (proofImageBase64) {
            try {
                const base64Data = proofImageBase64.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                const fileName = `payment-proofs/proof_${subscriptionId}_${Date.now()}.png`;

                // Upload to Supabase Storage
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('allstar')
                    .upload(fileName, buffer, {
                        contentType: 'image/png',
                        upsert: true
                    });

                if (uploadError) {
                    console.error('Storage upload error:', uploadError);
                } else {
                    // Get public URL
                    const { data: urlData } = supabase.storage
                        .from('allstar')
                        .getPublicUrl(fileName);

                    proofImageUrl = urlData.publicUrl;
                }
            } catch (imageError) {
                console.error('Failed to save proof image:', imageError);
                // Continue without image
            }
        }

        // 3. Find oldest unpaid invoice to link (FIFO)
        let { data: invoices } = await supabase
            .from('invoices')
            .select('id, amount_due, payment_status')
            .eq('subscription_id', subscriptionId)
            .neq('payment_status', 'Paid')
            .order('due_date', { ascending: true })
            .limit(1);

        let targetInvoiceId = invoices && invoices.length > 0 ? invoices[0].id : null;

        // Fallback: If all paid, link to latest invoice
        if (!targetInvoiceId) {
            const { data: latest } = await supabase
                .from('invoices')
                .select('id')
                .eq('subscription_id', subscriptionId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            targetInvoiceId = latest?.id;
        }

        if (!targetInvoiceId) throw new Error('No invoice found to link payment.');

        // 4. Create notes with PENDING status for admin filter
        const notes = `E-Wallet Payment (${walletProvider}) - Ref: ${referenceNumber} - (Pending Verification)${proofImageUrl ? ` - Proof: ${proofImageUrl}` : ''}`;

        // 5. Insert Payment Record (Amount=0 until verified, actual amount in notes)
        // Actually, we'll insert with full amount but with "Pending" marker so admin can see the expected amount
        const { data: paymentRecord, error: payError } = await supabase
            .from('payments')
            .insert({
                subscription_id: subscriptionId,
                amount: amount, // Store expected amount
                mode: 'E-Wallet',
                notes: notes,
                settlement_date: settlementDate,
                invoice_id: targetInvoiceId
            })
            .select('id')
            .single();

        if (payError) throw payError;

        // 6. Update Invoice Status to "Pending Verification" (new status)
        // This prevents it showing as "Unpaid" but also not "Paid" yet
        await supabase
            .from('invoices')
            .update({ payment_status: 'Pending Verification' })
            .eq('id', targetInvoiceId);

        // NOTE: We do NOT update subscription balance here.
        // Balance will be updated when admin verifies the payment.

        return { success: true, paymentId: paymentRecord?.id };
    } catch (error: any) {
        console.error('Manual Payment Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Admin approves a pending payment
 */
export async function approvePayment(paymentId: string, approvedAmount: number, adminNotes?: string) {
    try {
        // 1. Get payment details
        const { data: payment, error: paymentError } = await supabase
            .from('payments')
            .select('id, amount, subscription_id, invoice_id, notes')
            .eq('id', paymentId)
            .single();

        if (paymentError || !payment) throw new Error('Payment not found');

        const originalAmount = payment.amount;
        const subscriptionId = payment.subscription_id;
        const invoiceId = payment.invoice_id;

        // 2. Get subscription current balance
        const { data: sub } = await supabase
            .from('subscriptions')
            .select('balance')
            .eq('id', subscriptionId)
            .single();

        const currentBalance = sub?.balance || 0;

        // 3. Update payment record (remove "Pending Verification" from notes, update amount if different)
        const updatedNotes = payment.notes
            .replace('(Pending Verification)', '(Verified)')
            + (adminNotes ? ` | Admin: ${adminNotes}` : '')
            + (approvedAmount !== originalAmount ? ` | Original: ₱${originalAmount}, Approved: ₱${approvedAmount}` : '');

        await supabase
            .from('payments')
            .update({
                amount: approvedAmount,
                notes: updatedNotes
            })
            .eq('id', paymentId);

        // 4. Update subscription balance
        const newBalance = currentBalance - approvedAmount;
        await supabase
            .from('subscriptions')
            .update({ balance: newBalance })
            .eq('id', subscriptionId);

        // 5. Update invoice status
        if (invoiceId) {
            // Get invoice amount
            const { data: invoice } = await supabase
                .from('invoices')
                .select('amount_due')
                .eq('id', invoiceId)
                .single();

            // Get total payments for this invoice
            const { data: invoicePayments } = await supabase
                .from('payments')
                .select('amount')
                .eq('invoice_id', invoiceId)
                .not('notes', 'ilike', '%Pending Verification%');

            const totalPaid = invoicePayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
            const invoiceAmount = invoice?.amount_due || 0;

            let newStatus = 'Unpaid';
            if (totalPaid >= invoiceAmount) {
                newStatus = 'Paid';
            } else if (totalPaid > 0) {
                newStatus = 'Partially Paid';
            }

            await supabase
                .from('invoices')
                .update({ payment_status: newStatus })
                .eq('id', invoiceId);
        }

        return { success: true };
    } catch (error: any) {
        console.error('Approve Payment Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Admin rejects a pending payment
 */
export async function rejectPayment(paymentId: string, reason?: string) {
    try {
        // 1. Get payment details
        const { data: payment, error: paymentError } = await supabase
            .from('payments')
            .select('id, invoice_id, notes')
            .eq('id', paymentId)
            .single();

        if (paymentError || !payment) throw new Error('Payment not found');

        // 2. Update payment notes to mark as rejected (or delete it)
        const updatedNotes = payment.notes
            .replace('(Pending Verification)', '(REJECTED)')
            + (reason ? ` | Reason: ${reason}` : '');

        await supabase
            .from('payments')
            .update({
                amount: 0, // Set to 0 for rejected
                notes: updatedNotes
            })
            .eq('id', paymentId);

        // 3. Revert invoice status back to Unpaid
        if (payment.invoice_id) {
            await supabase
                .from('invoices')
                .update({ payment_status: 'Unpaid' })
                .eq('id', payment.invoice_id);
        }

        return { success: true };
    } catch (error: any) {
        console.error('Reject Payment Error:', error);
        return { success: false, error: error.message };
    }
}
