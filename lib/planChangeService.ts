/**
 * Plan Change Service
 * Handles subscription upgrades/downgrades with prorated invoicing
 * 
 * Flow:
 * 1. Customer requests plan change
 * 2. System creates prorated invoice for days used on OLD plan
 * 3. System logs the plan change event
 * 4. When admin generates next invoice, it creates prorated invoice for remaining days on NEW plan
 */

import { createClient } from '@supabase/supabase-js';
import { calculateDailyRate, toISODateString } from './billing';

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

export interface PlanChangeResult {
    success: boolean;
    proratedInvoice?: {
        id: string;
        amount: number;
        fromDate: string;
        toDate: string;
        description: string;
    };
    error?: string;
}

export interface PlanChangeRecord {
    id?: string;
    subscription_id: string;
    old_plan_id: string;
    new_plan_id: string;
    old_monthly_fee: number;
    new_monthly_fee: number;
    change_date: string;
    prorated_amount: number;
    prorated_days: number;
    billing_period_start: string;
    billing_period_end: string;
    invoice_id?: string;
    processed: boolean;
    created_at?: string;
}

/**
 * Calculate the number of days between two dates (inclusive)
 */
export function daysBetween(startDate: Date, endDate: Date): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const timeDiff = end.getTime() - start.getTime();
    return Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end day
}

/**
 * Get the billing period start date based on invoice_date (billing period)
 * For "15th" -> billing period starts on 15th of previous month
 * For "30th" -> billing period starts on 1st of current month
 */
export function getBillingPeriodStart(invoiceDate: string, referenceDate: Date): Date {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();

    if (invoiceDate === '15th') {
        // Mid-month billing: 15th of previous month to 14th of current month
        return new Date(year, month - 1, 15);
    } else {
        // Full month billing: 1st to 30th/31st of current month
        return new Date(year, month, 1);
    }
}

/**
 * Get the billing period end date based on invoice_date (billing period)
 */
export function getBillingPeriodEnd(invoiceDate: string, referenceDate: Date): Date {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();

    if (invoiceDate === '15th') {
        // Mid-month billing: ends on 14th of current month
        return new Date(year, month, 14);
    } else {
        // Full month billing: ends on last day of current month
        const lastDay = new Date(year, month + 1, 0).getDate();
        return new Date(year, month, lastDay);
    }
}

/**
 * Calculate prorated amount for a given period
 */
export function calculateProratedAmountForDays(
    monthlyFee: number,
    days: number
): { amount: number; dailyRate: number } {
    const dailyRate = calculateDailyRate(monthlyFee);
    const amount = Math.round(dailyRate * days * 100) / 100;
    return { amount, dailyRate };
}

/**
 * Process a plan change request
 * Creates a prorated invoice for the old plan and records the change
 * 
 * @param subscriptionId - The subscription being modified
 * @param newPlanId - The new plan ID
 * @param changeDate - The effective date of the change (default: today)
 * @returns Result with prorated invoice details
 */
/**
 * Process a plan change request
 * Creates a prorated invoice for the old plan and records the change
 *
 * @param subscriptionId - The subscription being modified
 * @param newPlanId - The new plan ID
 * @param changeDate - The effective date of the change (default: today)
 * @returns Result with prorated invoice details
 */
export async function processPlanChange(
    subscriptionId: string,
    newPlanId: string,
    changeDate: Date = new Date()
): Promise<PlanChangeResult> {
    const supabase = getSupabaseAdmin();

    try {
        // 1. Get current subscription details
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select(`
                id,
                plan_id,
                invoice_date,
                date_installed,
                subscriber_id,
                balance,
                plans!subscriptions_plan_id_fkey (
                    id,
                    name,
                    monthly_fee
                ),
                customers!subscriptions_subscriber_id_fkey (
                    id,
                    name,
                    mobile_number
                )
            `)
            .eq('id', subscriptionId)
            .single();

        if (subError || !subscription) {
            throw new Error('Subscription not found');
        }

        const oldPlan = Array.isArray(subscription.plans)
            ? subscription.plans[0]
            : subscription.plans;

        if (!oldPlan) {
            throw new Error('Current plan not found');
        }

        // 2. Get new plan details
        const { data: newPlan, error: planError } = await supabase
            .from('plans')
            .select('id, name, monthly_fee')
            .eq('id', newPlanId)
            .single();

        if (planError || !newPlan) {
            throw new Error('New plan not found');
        }

        // Don't process if it's the same plan
        if (oldPlan.id === newPlan.id) {
            return { success: false, error: 'New plan is the same as current plan' };
        }

        // 3. Calculate billing period dates
        const invoiceDate = subscription.invoice_date || '15th';
        const billingPeriodStart = getBillingPeriodStart(invoiceDate, changeDate);
        const billingPeriodEnd = getBillingPeriodEnd(invoiceDate, changeDate);

        // Check for EXISTING PAID INVOICE for this period
        const { data: existingInvoice } = await supabase
            .from('invoices')
            .select('*')
            .eq('subscription_id', subscriptionId)
            .lte('from_date', toISODateString(billingPeriodStart))
            .gte('to_date', toISODateString(billingPeriodEnd))
            .eq('payment_status', 'Paid')
            .maybeSingle();

        const isPaid = !!existingInvoice;

        // Ensure the change date is within the billing period
        // If change date is BEFORE start (rare), snap to start
        const effectiveStartDate = changeDate < billingPeriodStart ? billingPeriodStart : changeDate;

        let proratedAmount = 0;
        let invoiceId: string | undefined;
        let proratedDays = 0;

        const changeDateMidnight = new Date(changeDate);
        changeDateMidnight.setHours(0, 0, 0, 0);

        if (isPaid) {
            // SCENARIO: Already Paid
            // We need to CREDIT the unused days of the OLD plan
            // From Change Date to Billing End

            const remainingDays = daysBetween(changeDateMidnight, billingPeriodEnd);

            if (remainingDays > 0) {
                // Calculate Credit (Negative Amount)
                const { amount: creditAmount } = calculateProratedAmountForDays(oldPlan.monthly_fee, remainingDays);

                // Credit the balance (Subtracting creditAmount from balance effectively gives user money)
                // Wait, logic: `balance` is Amount Due. 
                // We want to reduce Amount Due. So we Subtract.
                // Or if we view it as "User has `creditAmount` to spend".
                // Let's negate it for the "Prorated Amount" return value to signal credit?
                // No, clear variable naming.

                proratedDays = remainingDays;
                proratedAmount = -creditAmount; // Negative to indicate credit

                // Update balance directly (Add negative amount)
                const currentBalance = subscription.balance || 0;
                await supabase
                    .from('subscriptions')
                    .update({ balance: currentBalance - creditAmount }) // Subtract positive credit
                    .eq('id', subscriptionId);

                // We do NOT create an invoice for the Old Plan here, because it's already paid.
                // We effectively applied a credit.
            }

        } else {
            // SCENARIO: Not Paid (Regular)
            // 4. Calculate prorated days on OLD plan (from billing period start to change date - 1)

            const oldPlanEndDate = new Date(changeDateMidnight);
            oldPlanEndDate.setDate(oldPlanEndDate.getDate() - 1); // Day before the change

            // Only calculate if there are days to bill on old plan
            if (oldPlanEndDate >= billingPeriodStart) {
                proratedDays = daysBetween(billingPeriodStart, oldPlanEndDate);
                const { amount } = calculateProratedAmountForDays(oldPlan.monthly_fee, proratedDays);
                proratedAmount = amount;
            }

            // 5. Create prorated invoice for OLD plan (if there are days to bill)
            if (proratedDays > 0 && proratedAmount > 0) {
                const invoiceDescription = `${oldPlan.name} (Prorated: ${proratedDays} days from ${toISODateString(billingPeriodStart)} to ${toISODateString(oldPlanEndDate)}) - Plan changed to ${newPlan.name}`;

                // Calculate due date (use billing period end or a few days from now, whichever is sooner)
                const dueDate = billingPeriodEnd;

                const { data: invoice, error: invoiceError } = await supabase
                    .from('invoices')
                    .insert({
                        subscription_id: subscriptionId,
                        amount_due: proratedAmount,
                        payment_status: 'Unpaid',
                        due_date: toISODateString(dueDate),
                        from_date: toISODateString(billingPeriodStart),
                        to_date: toISODateString(oldPlanEndDate),
                        is_prorated: true,
                        notes: invoiceDescription
                    })
                    .select('id')
                    .single();

                if (invoiceError) {
                    console.error('Failed to create prorated invoice:', invoiceError);
                } else {
                    invoiceId = invoice?.id;

                    // Update subscription balance with prorated amount
                    const currentBalance = subscription.balance || 0;
                    await supabase
                        .from('subscriptions')
                        .update({ balance: currentBalance + proratedAmount })
                        .eq('id', subscriptionId);
                }
            }
        }

        // 6. Record the plan change event (for future invoice generation)
        // If isPaid, we record 'prorated_amount' as the CREDIT (negative) so downstream logic knows?
        // Actually `createNewPlanProratedInvoice` looks at `new_monthly_fee`. It doesn't care about old plan credit.
        // But for record keeping, accurate logging is good.

        const planChangeRecord: Omit<PlanChangeRecord, 'id' | 'created_at'> = {
            subscription_id: subscriptionId,
            old_plan_id: oldPlan.id,
            new_plan_id: newPlan.id,
            old_monthly_fee: oldPlan.monthly_fee,
            new_monthly_fee: newPlan.monthly_fee,
            change_date: toISODateString(changeDate),
            prorated_amount: proratedAmount, // Can be negative
            prorated_days: proratedDays,
            billing_period_start: toISODateString(billingPeriodStart),
            billing_period_end: toISODateString(billingPeriodEnd),
            invoice_id: invoiceId, // Undefined if isPaid
            processed: false // Will be set to true when new plan invoice is generated
        };

        const { error: changeError } = await supabase
            .from('plan_changes')
            .insert(planChangeRecord);

        if (changeError) {
            console.error('Failed to record plan change:', changeError);
        }

        // 7. Update subscription to new plan
        const { error: updateError } = await supabase
            .from('subscriptions')
            .update({ plan_id: newPlanId })
            .eq('id', subscriptionId);

        if (updateError) {
            throw new Error('Failed to update subscription plan');
        }

        // Return result
        let resultInvoice = undefined;
        if (proratedAmount > 0) {
            resultInvoice = {
                id: invoiceId || '',
                amount: proratedAmount,
                fromDate: toISODateString(billingPeriodStart),
                toDate: toISODateString(new Date(new Date(changeDate).setDate(changeDate.getDate() - 1))),
                description: `${oldPlan.name} - ${proratedDays} days`
            };
        } else if (proratedAmount < 0) {
            // Return credit info
            resultInvoice = {
                id: 'CREDIT',
                amount: proratedAmount,
                fromDate: toISODateString(changeDate),
                toDate: toISODateString(billingPeriodEnd),
                description: `Credit for unused ${oldPlan.name} days`
            };
        }

        return {
            success: true,
            proratedInvoice: resultInvoice
        };

    } catch (error: any) {
        console.error('Plan change error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get pending plan changes that need prorated invoices for the new plan
 * This is called during invoice generation to create the remaining period invoice
 * 
 * @param subscriptionId - Optional: filter by subscription
 * @returns List of pending plan changes
 */
export async function getPendingPlanChanges(
    subscriptionId?: string
): Promise<PlanChangeRecord[]> {
    const supabase = getSupabaseAdmin();

    let query = supabase
        .from('plan_changes')
        .select('*')
        .eq('processed', false)
        .order('change_date', { ascending: true });

    if (subscriptionId) {
        query = query.eq('subscription_id', subscriptionId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Failed to fetch pending plan changes:', error);
        return [];
    }

    return data || [];
}

/**
 * Create prorated invoice for NEW plan after a plan change
 * Called during invoice generation
 * 
 * @param planChange - The plan change record
 * @returns Invoice details or null
 */
export async function createNewPlanProratedInvoice(
    planChange: PlanChangeRecord
): Promise<{ invoiceId: string; amount: number } | null> {
    const supabase = getSupabaseAdmin();

    try {
        // Calculate days on new plan (from change date to billing period end)
        const changeDate = new Date(planChange.change_date);
        const billingPeriodEnd = new Date(planChange.billing_period_end);

        const daysOnNewPlan = daysBetween(changeDate, billingPeriodEnd);
        const { amount } = calculateProratedAmountForDays(planChange.new_monthly_fee, daysOnNewPlan);

        if (amount <= 0) {
            return null;
        }

        // Get plan name for description
        const { data: newPlan } = await supabase
            .from('plans')
            .select('name')
            .eq('id', planChange.new_plan_id)
            .single();

        const description = `${newPlan?.name || 'Plan'} (Prorated: ${daysOnNewPlan} days from ${planChange.change_date} to ${planChange.billing_period_end}) - After plan change`;

        // Create invoice
        const { data: invoice, error } = await supabase
            .from('invoices')
            .insert({
                subscription_id: planChange.subscription_id,
                amount_due: amount,
                payment_status: 'Unpaid',
                due_date: planChange.billing_period_end,
                from_date: planChange.change_date,
                to_date: planChange.billing_period_end,
                is_prorated: true,
                notes: description
            })
            .select('id')
            .single();

        if (error) {
            console.error('Failed to create new plan prorated invoice:', error);
            return null;
        }

        // Update subscription balance
        const { data: sub } = await supabase
            .from('subscriptions')
            .select('balance')
            .eq('id', planChange.subscription_id)
            .single();

        await supabase
            .from('subscriptions')
            .update({ balance: (sub?.balance || 0) + amount })
            .eq('id', planChange.subscription_id);

        // Mark plan change as processed
        await supabase
            .from('plan_changes')
            .update({ processed: true })
            .eq('id', planChange.id);

        return { invoiceId: invoice.id, amount };

    } catch (error) {
        console.error('Error creating new plan prorated invoice:', error);
        return null;
    }
}

/**
 * Calculate what the prorated invoices would look like for a plan change
 * (Preview only, doesn't create anything)
 */
export function previewPlanChange(
    currentMonthlyFee: number,
    newMonthlyFee: number,
    invoiceDate: string, // '15th' or '30th'
    changeDate: Date = new Date(),
    isPaid: boolean = false
): {
    oldPlan: { days: number; amount: number; fromDate: string; toDate: string };
    newPlan: { days: number; amount: number; fromDate: string; toDate: string };
    totalDifference: number;
    isUpgrade: boolean;
} {
    const billingPeriodStart = getBillingPeriodStart(invoiceDate, changeDate);
    const billingPeriodEnd = getBillingPeriodEnd(invoiceDate, changeDate);
    const changeDateMidnight = new Date(changeDate);
    changeDateMidnight.setHours(0, 0, 0, 0);

    // Old plan: from billing start to day before change
    const oldPlanEndDate = new Date(changeDateMidnight);
    oldPlanEndDate.setDate(oldPlanEndDate.getDate() - 1);

    // New plan: from change date to billing end
    const newPlanDays = daysBetween(changeDateMidnight, billingPeriodEnd);
    const { amount: newPlanAmount } = calculateProratedAmountForDays(newMonthlyFee, newPlanDays);

    let oldPlanDays = 0;
    let oldPlanAmount = 0;
    let totalNewInvoices = 0;

    if (isPaid) {
        // If PAID: Old Plan Amount is CREDIT for REMAINING DAYS (overlapping with new Plan)
        // Effectively: Unused old plan days = newPlanDays (same period)
        oldPlanDays = newPlanDays;

        // Credit for unused days
        const { amount: credit } = calculateProratedAmountForDays(currentMonthlyFee, oldPlanDays);
        oldPlanAmount = -credit;

        // Total = New - Credit
        totalNewInvoices = newPlanAmount + oldPlanAmount;
    } else {
        // If NOT PAID: Old Plan Amount is CHARGE for USED DAYS
        oldPlanDays = oldPlanEndDate >= billingPeriodStart
            ? daysBetween(billingPeriodStart, oldPlanEndDate)
            : 0;
        const { amount: charge } = calculateProratedAmountForDays(currentMonthlyFee, oldPlanDays);
        oldPlanAmount = charge;

        // Total = Old + New
        totalNewInvoices = oldPlanAmount + newPlanAmount;
    }

    const totalIfNoChange = isPaid ? 0 : currentMonthlyFee;

    // For isPaid, totalDifference represents "Extra Amount to Pay"
    // For Unpaid, totalDifference represents "Diff from original monthly fee"

    return {
        oldPlan: {
            days: oldPlanDays,
            amount: oldPlanAmount,
            fromDate: isPaid ? toISODateString(changeDate) : toISODateString(billingPeriodStart),
            toDate: isPaid ? toISODateString(billingPeriodEnd) : toISODateString(oldPlanEndDate)
        },
        newPlan: {
            days: newPlanDays,
            amount: newPlanAmount,
            fromDate: toISODateString(changeDate),
            toDate: toISODateString(billingPeriodEnd)
        },
        totalDifference: totalNewInvoices - totalIfNoChange,
        isUpgrade: newMonthlyFee > currentMonthlyFee
    };
}
