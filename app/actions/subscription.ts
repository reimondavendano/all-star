'use server';

import { createClient } from '@supabase/supabase-js';
import { processPlanChange, previewPlanChange, getBillingPeriodStart, getBillingPeriodEnd, getPlanChangeCycleConflict } from '@/lib/planChangeService';
import { getPlanChangeDateWindow, toISODateString } from '@/lib/billing';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function isDateWithinPlanChangeWindow(date: Date, window: { minDate: string; maxDate: string }) {
    const dateString = toISODateString(date);
    return dateString >= window.minDate && dateString <= window.maxDate;
}

/**
 * Change a subscription's plan with automatic prorated invoicing
 * 
 * When a customer upgrades or downgrades:
 * 1. Creates a prorated invoice for days used on OLD plan
 * 2. Updates the subscription to the new plan
 * 3. Updates MikroTik profile if applicable
 * 4. Records the plan change for future invoice generation
 */
export async function changeSubscriptionPlan(
    subscriptionId: string,
    newPlanId: string,
    changeDate?: string,
    planChangeRequestId?: string
) {
    try {
        // 1. Process plan change with prorated invoicing
        const result = await processPlanChange(
            subscriptionId,
            newPlanId,
            changeDate ? new Date(`${changeDate}T00:00:00`) : new Date(),
            { planChangeId: planChangeRequestId }
        );

        if (!result.success) {
            return { success: false, error: result.error };
        }

        // 2. Sync MikroTik after the subscription has the new plan.
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('active')
            .eq('id', subscriptionId)
            .single();

        const { syncSubscriptionToMikrotik } = await import('./mikrotik');
        const mtResult = await syncSubscriptionToMikrotik(subscriptionId, Boolean(subscription?.active));

        return {
            success: true,
            proratedInvoice: result.proratedInvoice,
            warning: mtResult.success ? undefined : `Plan updated but MikroTik sync failed: ${mtResult.error}`,
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
 * Customer submits a plan-change request.
 * This only records a pending request; it does not update the subscription,
 * invoices, balances, or MikroTik profile.
 */
export async function submitPlanChangeRequest(subscriptionId: string, newPlanId: string, changeDate?: string) {
    try {
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select(`
                id,
                subscriber_id,
                plan_id,
                invoice_date,
                date_installed,
                plans!subscriptions_plan_id_fkey (
                    id,
                    name,
                    monthly_fee
                )
            `)
            .eq('id', subscriptionId)
            .single();

        if (subError || !subscription) {
            return { success: false, error: 'Subscription not found' };
        }

        const currentPlan = Array.isArray(subscription.plans)
            ? subscription.plans[0]
            : subscription.plans;

        if (!currentPlan) {
            return { success: false, error: 'Current plan not found' };
        }

        if (currentPlan.id === newPlanId) {
            return { success: false, error: 'Selected plan is already active' };
        }

        const { data: existingPending } = await supabase
            .from('plan_changes')
            .select('id')
            .eq('subscription_id', subscriptionId)
            .eq('status', 'pending')
            .maybeSingle();

        if (existingPending) {
            return { success: false, error: 'You already have a pending plan-change request for this subscription.' };
        }

        const { data: newPlan, error: planError } = await supabase
            .from('plans')
            .select('id, name, monthly_fee')
            .eq('id', newPlanId)
            .single();

        if (planError || !newPlan) {
            return { success: false, error: 'New plan not found' };
        }

        const oldPlanEndDate = changeDate ? new Date(`${changeDate}T00:00:00`) : new Date();
        oldPlanEndDate.setHours(0, 0, 0, 0);
        const dateWindow = getPlanChangeDateWindow(subscription.invoice_date || '15th', oldPlanEndDate);
        if (!dateWindow.isOpen || !isDateWithinPlanChangeWindow(oldPlanEndDate, dateWindow)) {
            return {
                success: false,
                error: `${dateWindow.message} Next available date: ${dateWindow.nextOpenDate}.`
            };
        }

        const billingPeriodStart = getBillingPeriodStart(subscription.invoice_date || '15th', oldPlanEndDate);
        const billingPeriodEnd = getBillingPeriodEnd(subscription.invoice_date || '15th', oldPlanEndDate);
        const cycleConflict = await getPlanChangeCycleConflict(
            subscriptionId,
            subscription.invoice_date || '15th',
            oldPlanEndDate
        );

        if (cycleConflict.hasConflict) {
            return {
                success: false,
                error: cycleConflict.message || 'This subscription already has a plan change in this billing cycle.'
            };
        }

        const preview = previewPlanChange(
            currentPlan.monthly_fee,
            newPlan.monthly_fee,
            subscription.invoice_date || '15th',
            oldPlanEndDate,
            false,
            subscription.date_installed
        );
        const requestType = newPlan.monthly_fee > currentPlan.monthly_fee
            ? 'upgrade'
            : newPlan.monthly_fee < currentPlan.monthly_fee
                ? 'downgrade'
                : 'same';

        const { data: request, error: insertError } = await supabase
            .from('plan_changes')
            .insert({
                subscription_id: subscriptionId,
                old_plan_id: currentPlan.id,
                new_plan_id: newPlan.id,
                status: 'pending',
                request_type: requestType,
                requested_by_customer_id: subscription.subscriber_id,
                requested_at: new Date().toISOString(),
                requested_old_plan_end_date: toISODateString(oldPlanEndDate),
                old_monthly_fee: currentPlan.monthly_fee,
                new_monthly_fee: newPlan.monthly_fee,
                change_date: toISODateString(oldPlanEndDate),
                prorated_amount: preview.oldPlan.amount + preview.newPlan.amount,
                prorated_days: preview.oldPlan.days + preview.newPlan.days,
                billing_period_start: toISODateString(billingPeriodStart),
                billing_period_end: toISODateString(billingPeriodEnd),
                processed: false
            })
            .select('id')
            .single();

        if (insertError) {
            throw insertError;
        }

        return {
            success: true,
            requestId: request?.id,
            message: 'Plan-change request submitted. An admin will review it before any billing or service changes are applied.'
        };
    } catch (error: any) {
        console.error('Submit Plan Change Request Error:', error);
        return { success: false, error: error.message };
    }
}

export async function getCustomerPendingPlanChangeRequests(customerId: string) {
    try {
        const { data, error } = await supabase
            .from('plan_changes')
            .select(`
                id,
                subscription_id,
                status,
                new_plan_id,
                new_plan:plans!plan_changes_new_plan_id_fkey (
                    name
                )
            `)
            .eq('requested_by_customer_id', customerId)
            .eq('status', 'pending');

        if (error) throw error;

        return {
            success: true,
            requests: (data || []).map((request: any) => ({
                id: request.id,
                subscriptionId: request.subscription_id,
                status: request.status,
                newPlanId: request.new_plan_id,
                newPlanName: (Array.isArray(request.new_plan) ? request.new_plan[0] : request.new_plan)?.name || 'selected plan'
            }))
        };
    } catch (error: any) {
        console.error('Get Pending Plan Change Requests Error:', error);
        return { success: false, requests: [], error: error.message };
    }
}

export async function getCustomerCurrentCyclePlanChanges(customerId: string) {
    try {
        const { data: subscriptions, error: subError } = await supabase
            .from('subscriptions')
            .select('id, invoice_date')
            .eq('subscriber_id', customerId);

        if (subError) throw subError;
        if (!subscriptions || subscriptions.length === 0) {
            return { success: true, locks: [] };
        }

        const today = new Date();
        const locks = await Promise.all(subscriptions.map(async (subscription) => {
            const invoiceDate = subscription.invoice_date || '15th';
            const billingPeriodStart = getBillingPeriodStart(invoiceDate, today);
            const billingPeriodEnd = getBillingPeriodEnd(invoiceDate, today);

            const { data: planChanges, error } = await supabase
                .from('plan_changes')
                .select(`
                    id,
                    status,
                    new_plan_id,
                    requested_at,
                    reviewed_at,
                    billing_period_start,
                    billing_period_end,
                    new_plan:plans!plan_changes_new_plan_id_fkey (
                        name
                    )
                `)
                .eq('subscription_id', subscription.id)
                .in('status', ['pending', 'approved'])
                .eq('billing_period_start', toISODateString(billingPeriodStart))
                .eq('billing_period_end', toISODateString(billingPeriodEnd))
                .order('requested_at', { ascending: false })
                .limit(1);

            if (error) throw error;

            const planChange = planChanges?.[0];
            if (!planChange) return null;

            const newPlan = Array.isArray(planChange.new_plan)
                ? planChange.new_plan[0]
                : planChange.new_plan;
            const nextCycleStart = new Date(billingPeriodEnd);
            nextCycleStart.setDate(nextCycleStart.getDate() + 1);

            return {
                id: planChange.id,
                subscriptionId: subscription.id,
                status: planChange.status as 'pending' | 'approved',
                newPlanId: planChange.new_plan_id,
                newPlanName: newPlan?.name || 'selected plan',
                billingPeriodStart: toISODateString(billingPeriodStart),
                billingPeriodEnd: toISODateString(billingPeriodEnd),
                availableOn: toISODateString(nextCycleStart)
            };
        }));

        return {
            success: true,
            locks: locks.filter(Boolean)
        };
    } catch (error: any) {
        console.error('Get Current Cycle Plan Changes Error:', error);
        return { success: false, locks: [], error: error.message };
    }
}

export async function declinePlanChangeRequest(planChangeId: string, reason?: string) {
    try {
        const { error } = await supabase
            .from('plan_changes')
            .update({
                status: 'declined',
                reviewed_at: new Date().toISOString(),
                decision_notes: reason || null
            })
            .eq('id', planChangeId)
            .eq('status', 'pending');

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error('Decline Plan Change Request Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Preview what invoices would be created for a plan change
 * (Does not make any changes - for UI display only)
 */
export async function previewPlanChangeInvoices(
    subscriptionId: string,
    newPlanId: string,
    changeDate?: string
) {
    try {
        // Get current subscription details
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select(`
                invoice_date,
                date_installed,
                plans!subscriptions_plan_id_fkey (name, monthly_fee)
            `)
            .eq('id', subscriptionId)
            .single();

        if (subError || !subscription) {
            return { success: false, error: 'Subscription not found' };
        }

        // Get new plan details
        const { data: newPlan, error: planError } = await supabase
            .from('plans')
            .select('name, monthly_fee')
            .eq('id', newPlanId)
            .single();

        if (planError || !newPlan) {
            return { success: false, error: 'Plan not found' };
        }

        const currentPlan = Array.isArray(subscription.plans)
            ? subscription.plans[0]
            : subscription.plans;

        const invoiceDate = subscription.invoice_date || '15th';

        // Check for Paid Invoice covering current period
        const today = changeDate ? new Date(`${changeDate}T00:00:00`) : new Date();
        const billingStart = getBillingPeriodStart(invoiceDate, today);
        const billingEnd = getBillingPeriodEnd(invoiceDate, today);

        const { data: paidInvoice } = await supabase
            .from('invoices')
            .select('id')
            .eq('subscription_id', subscriptionId)
            .lte('from_date', toISODateString(billingStart))
            .gte('to_date', toISODateString(billingEnd))
            .eq('payment_status', 'Paid')
            .maybeSingle();

        const isPaid = !!paidInvoice;

        const preview = previewPlanChange(
            currentPlan?.monthly_fee || 0,
            newPlan.monthly_fee,
            invoiceDate,
            today,
            isPaid,
            subscription.date_installed
        );

        return {
            success: true,
            preview,
            currentPlan: currentPlan ? { name: currentPlan.name, monthlyFee: currentPlan.monthly_fee } : null,
            newPlan: { name: newPlan.name, monthlyFee: newPlan.monthly_fee }
        };

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
        const updatedNotes = (payment.notes || 'Manual Payment')
            .replace(/\s*\(?Pending Verification\)?/i, ' (Verified)')
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
        const updatedNotes = (payment.notes || 'Manual Payment')
            .replace(/\s*\(?Pending Verification\)?/i, ' (REJECTED)')
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
