/**
 * Invoice Generation Service
 * Handles automatic and manual invoice generation with pro-rating support
 */

import { createClient } from '@supabase/supabase-js';
import {
    getBillingSchedule,
    calculateBillingDates,
    calculateProratedAmount,
    needsProrating,
    toISODateString,
    formatDatePH,
    BILLING_SCHEDULES,
} from './billing';
import { sendSMS, SMSTemplates, sendBulkSMS } from './sms';

// Server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
    return createClient(supabaseUrl, supabaseServiceKey);
}

interface Subscription {
    id: string;
    subscriber_id: string;
    business_unit_id: string;
    plan_id: string;
    date_installed: string;
    balance: number;
    active: boolean;
    referral_credit_applied: boolean;
    customers: {
        id: string;
        name: string;
        mobile_number: string;
    };
    plans: {
        name: string;
        monthly_fee: number;
    };
    business_units: {
        id: string;
        name: string;
    };
}

interface GenerateInvoiceResult {
    success: boolean;
    generated: number;
    skipped: number;
    smsSent: number;
    errors: string[];
    invoices: Array<{
        subscriptionId: string;
        customerName: string;
        amountDue: number;
        isProrated: boolean;
    }>;
}

/**
 * Generate invoices for a specific business unit
 */
export async function generateInvoicesForBusinessUnit(
    businessUnitId: string,
    year: number,
    month: number, // 1-12
    sendSmsNotifications: boolean = true
): Promise<GenerateInvoiceResult> {
    const supabase = getSupabaseAdmin();
    const result: GenerateInvoiceResult = {
        success: false,
        generated: 0,
        skipped: 0,
        smsSent: 0,
        errors: [],
        invoices: [],
    };

    try {
        // 1. Get business unit details
        const { data: businessUnit, error: buError } = await supabase
            .from('business_units')
            .select('id, name')
            .eq('id', businessUnitId)
            .single();

        if (buError || !businessUnit) {
            result.errors.push('Business unit not found');
            return result;
        }

        // 2. Calculate billing dates
        const dates = calculateBillingDates(businessUnit.name, year, month);

        // 3. Get all active subscriptions for this business unit
        const { data: subscriptions, error: subError } = await supabase
            .from('subscriptions')
            .select(`
                id,
                subscriber_id,
                business_unit_id,
                plan_id,
                date_installed,
                balance,
                active,
                referral_credit_applied,
                customers!subscriptions_subscriber_id_fkey (
                    id,
                    name,
                    mobile_number
                ),
                plans (
                    name,
                    monthly_fee
                ),
                business_units (
                    id,
                    name
                )
            `)
            .eq('business_unit_id', businessUnitId)
            .eq('active', true);

        if (subError) {
            result.errors.push(`Error fetching subscriptions: ${subError.message}`);
            return result;
        }

        if (!subscriptions || subscriptions.length === 0) {
            result.success = true;
            return result;
        }

        // 4. Get existing invoices to avoid duplicates
        const startOfMonth = new Date(year, month - 1, 1);
        const endOfMonth = new Date(year, month, 0);

        const { data: existingInvoices } = await supabase
            .from('invoices')
            .select('subscription_id')
            .gte('due_date', toISODateString(startOfMonth))
            .lte('due_date', toISODateString(endOfMonth));

        const invoicedSubIds = new Set(existingInvoices?.map(i => i.subscription_id) || []);

        // 5. Get previous invoice counts to determine first-time customers
        const subIds = subscriptions.map(s => s.id);
        const { data: previousInvoiceCounts } = await supabase
            .from('invoices')
            .select('subscription_id')
            .in('subscription_id', subIds)
            .lt('due_date', toISODateString(startOfMonth));

        const invoiceCountMap = new Map<string, number>();
        previousInvoiceCounts?.forEach(inv => {
            const count = invoiceCountMap.get(inv.subscription_id) || 0;
            invoiceCountMap.set(inv.subscription_id, count + 1);
        });

        // 6. Check for referrers (for discount calculation)
        const { data: referrerData } = await supabase
            .from('subscriptions')
            .select('subscriber_id, referrer_id:customers!referrer_id(id)')
            .in('subscriber_id', subscriptions.map(s => s.subscriber_id));

        const customersWithReferrers = new Set(
            referrerData?.filter(r => r.referrer_id).map(r => r.subscriber_id) || []
        );

        // 7. Get first subscription per customer (for referral discount)
        const customerFirstSub = new Map<string, string>();
        const sortedSubs = [...subscriptions].sort((a, b) =>
            new Date(a.date_installed || '2099-01-01').getTime() -
            new Date(b.date_installed || '2099-01-01').getTime()
        );
        sortedSubs.forEach(sub => {
            const customerId = (sub.customers as any)?.id;
            if (customerId && !customerFirstSub.has(customerId)) {
                customerFirstSub.set(customerId, sub.id);
            }
        });

        // 8. Generate invoices
        const invoicesToInsert: any[] = [];
        const subscriptionUpdates: Array<{ id: string; balance: number }> = [];
        const smsMessages: Array<{ to: string; message: string }> = [];

        for (const sub of subscriptions as any[]) {
            // Skip if already invoiced
            if (invoicedSubIds.has(sub.id)) {
                result.skipped++;
                continue;
            }

            const customer = sub.customers as any;
            const plan = sub.plans as any;
            const previousInvoices = invoiceCountMap.get(sub.id) || 0;
            const dateInstalled = sub.date_installed ? new Date(sub.date_installed) : null;

            let amountDue = plan.monthly_fee;
            let isProrated = false;

            // Pro-rating logic for new customers
            if (dateInstalled && previousInvoices === 0) {
                const needsProratingCheck = needsProrating(
                    dateInstalled,
                    dates.generationDate,
                    dates.fromDate
                );

                if (needsProratingCheck) {
                    const prorated = calculateProratedAmount(
                        plan.monthly_fee,
                        dateInstalled,
                        dates.dueDate
                    );
                    amountDue = prorated.proratedAmount;
                    isProrated = true;
                }
            }

            // Apply referral discount (only to first subscription)
            const customerId = customer?.id;
            const isFirstSubscription = customerId && customerFirstSub.get(customerId) === sub.id;
            const hasReferrer = customerId && customersWithReferrers.has(customerId);

            if (isFirstSubscription && hasReferrer && !sub.referral_credit_applied) {
                const discount = 300; // ₱300 referral discount
                amountDue = Math.max(0, amountDue - discount);

                // Mark referral credit as applied
                await supabase
                    .from('subscriptions')
                    .update({ referral_credit_applied: true })
                    .eq('id', sub.id);
            }

            // Apply existing credits (negative balance)
            let currentBalance = Number(sub.balance) || 0;
            if (currentBalance < 0) {
                const credit = Math.abs(currentBalance);
                if (credit >= amountDue) {
                    currentBalance = currentBalance + amountDue;
                    amountDue = 0;
                } else {
                    amountDue = amountDue - credit;
                    currentBalance = 0;
                }
                subscriptionUpdates.push({ id: sub.id, balance: currentBalance });
            }

            // Calculate final amount (add any outstanding balance from previous)
            const outstandingBalance = currentBalance > 0 ? currentBalance : 0;
            const totalAmountDue = amountDue + outstandingBalance;

            // Update subscription balance to reflect new invoice
            const newBalance = totalAmountDue;
            subscriptionUpdates.push({ id: sub.id, balance: newBalance });

            // Create invoice record
            invoicesToInsert.push({
                subscription_id: sub.id,
                from_date: toISODateString(dates.fromDate),
                to_date: toISODateString(dates.toDate),
                due_date: toISODateString(dates.dueDate),
                amount_due: totalAmountDue,
                payment_status: totalAmountDue === 0 ? 'Paid' : 'Unpaid',
            });

            result.invoices.push({
                subscriptionId: sub.id,
                customerName: customer?.name || 'Unknown',
                amountDue: totalAmountDue,
                isProrated,
            });

            // Prepare SMS notification
            if (sendSmsNotifications && customer?.mobile_number && totalAmountDue > 0) {
                const buName = (sub.business_units as any)?.name || businessUnit.name;
                smsMessages.push({
                    to: customer.mobile_number,
                    message: SMSTemplates.invoiceGenerated(
                        customer.name,
                        totalAmountDue,
                        formatDatePH(dates.dueDate),
                        buName
                    ),
                });
            }
        }

        // 9. Insert invoices
        if (invoicesToInsert.length > 0) {
            const { error: insertError } = await supabase
                .from('invoices')
                .insert(invoicesToInsert);

            if (insertError) {
                result.errors.push(`Error inserting invoices: ${insertError.message}`);
                return result;
            }

            result.generated = invoicesToInsert.length;
        }

        // 10. Update subscription balances
        for (const update of subscriptionUpdates) {
            await supabase
                .from('subscriptions')
                .update({ balance: update.balance })
                .eq('id', update.id);
        }

        // 11. Send SMS notifications
        if (sendSmsNotifications && smsMessages.length > 0) {
            const smsResult = await sendBulkSMS(smsMessages);
            result.smsSent = smsResult.sent;
        }

        result.success = true;
        return result;

    } catch (error) {
        result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown'}`);
        return result;
    }
}

/**
 * Send due date reminders for a specific business unit
 */
export async function sendDueDateReminders(businessUnitId: string): Promise<{
    success: boolean;
    sent: number;
    errors: string[];
}> {
    const supabase = getSupabaseAdmin();
    const result = { success: false, sent: 0, errors: [] as string[] };

    try {
        const today = new Date();
        const todayStr = toISODateString(today);

        // Find invoices due today that are unpaid
        const { data: unpaidInvoices, error } = await supabase
            .from('invoices')
            .select(`
                id,
                amount_due,
                due_date,
                subscriptions (
                    id,
                    business_unit_id,
                    customers!subscriptions_subscriber_id_fkey (
                        name,
                        mobile_number
                    )
                )
            `)
            .eq('due_date', todayStr)
            .eq('payment_status', 'Unpaid');

        if (error) {
            result.errors.push(error.message);
            return result;
        }

        const smsMessages: Array<{ to: string; message: string }> = [];

        for (const invoice of unpaidInvoices || []) {
            const sub = invoice.subscriptions as any;
            if (sub?.business_unit_id !== businessUnitId) continue;

            const customer = sub?.customers as any;
            if (customer?.mobile_number) {
                smsMessages.push({
                    to: customer.mobile_number,
                    message: SMSTemplates.dueDateReminder(
                        customer.name,
                        invoice.amount_due,
                        formatDatePH(new Date(invoice.due_date))
                    ),
                });
            }
        }

        if (smsMessages.length > 0) {
            const smsResult = await sendBulkSMS(smsMessages);
            result.sent = smsResult.sent;
        }

        result.success = true;
        return result;

    } catch (error) {
        result.errors.push(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
        return result;
    }
}

/**
 * Generate invoice on disconnection
 * Creates an invoice from last billing date to disconnection date
 */
export async function generateDisconnectionInvoice(
    subscriptionId: string,
    disconnectionDate: Date
): Promise<{
    success: boolean;
    invoiceId?: string;
    amount?: number;
    errors: string[];
}> {
    const supabase = getSupabaseAdmin();
    const result: { success: boolean; invoiceId?: string; amount?: number; errors: string[] } = {
        success: false,
        errors: [],
    };

    try {
        // 1. Get subscription details
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select(`
                id,
                subscriber_id,
                business_unit_id,
                plan_id,
                balance,
                plans (
                    name,
                    monthly_fee
                ),
                business_units (
                    name
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
            result.errors.push('Subscription not found');
            return result;
        }

        // 2. Get the last invoice to determine billing period start
        const { data: lastInvoice } = await supabase
            .from('invoices')
            .select('to_date, due_date')
            .eq('subscription_id', subscriptionId)
            .order('due_date', { ascending: false })
            .limit(1)
            .single();

        if (!lastInvoice) {
            result.errors.push('No previous invoice found. Cannot determine billing period.');
            return result;
        }

        const fromDate = new Date(lastInvoice.to_date);
        fromDate.setDate(fromDate.getDate() + 1); // Start from day after last invoice end
        const toDate = disconnectionDate;

        // 3. Calculate prorated amount
        const plan = subscription.plans as any;
        const prorated = calculateProratedAmount(
            plan.monthly_fee,
            fromDate,
            toDate
        );

        if (prorated.daysUsed <= 0) {
            result.errors.push('No days to bill for disconnection period');
            return result;
        }

        // 4. Create disconnection invoice
        const { data: invoice, error: invoiceError } = await supabase
            .from('invoices')
            .insert({
                subscription_id: subscriptionId,
                from_date: toISODateString(fromDate),
                to_date: toISODateString(toDate),
                due_date: toISODateString(disconnectionDate), // Due immediately
                amount_due: prorated.proratedAmount,
                payment_status: 'Unpaid',
            })
            .select('id')
            .single();

        if (invoiceError) {
            result.errors.push(`Error creating invoice: ${invoiceError.message}`);
            return result;
        }

        // 5. Update subscription balance
        const newBalance = (Number(subscription.balance) || 0) + prorated.proratedAmount;
        await supabase
            .from('subscriptions')
            .update({ balance: newBalance })
            .eq('id', subscriptionId);

        // 6. Send SMS notification (optional)
        const customer = subscription.customers as any;
        if (customer?.mobile_number) {
            const buName = (subscription.business_units as any)?.name || '';
            await sendSMS(
                customer.mobile_number,
                SMSTemplates.invoiceGenerated(
                    customer.name,
                    prorated.proratedAmount,
                    formatDatePH(disconnectionDate),
                    buName
                )
            );
        }

        result.success = true;
        result.invoiceId = invoice.id;
        result.amount = prorated.proratedAmount;
        return result;

    } catch (error) {
        result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown'}`);
        return result;
    }
}

/**
 * Generate invoice on activation/reconnection
 * Creates an invoice from activation date to next billing date
 */
export async function generateActivationInvoice(
    subscriptionId: string,
    activationDate: Date
): Promise<{
    success: boolean;
    invoiceId?: string;
    amount?: number;
    errors: string[];
}> {
    const supabase = getSupabaseAdmin();
    const result: { success: boolean; invoiceId?: string; amount?: number; errors: string[] } = {
        success: false,
        errors: [],
    };

    try {
        // 1. Get subscription details
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select(`
                id,
                subscriber_id,
                business_unit_id,
                plan_id,
                balance,
                invoice_date,
                plans (
                    name,
                    monthly_fee
                ),
                business_units (
                    name
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
            result.errors.push('Subscription not found');
            return result;
        }

        const plan = subscription.plans as any;
        const buName = (subscription.business_units as any)?.name || '';

        // 2. Calculate next billing date based on business unit schedule
        const schedule = getBillingSchedule(buName);
        const activationMonth = activationDate.getMonth();
        const activationYear = activationDate.getFullYear();
        const activationDay = activationDate.getDate();

        let nextBillingDate: Date;
        
        if (schedule.billingPeriodType === 'mid-month') {
            // For 15th billing (Bulihan/Extension)
            if (activationDay <= 15) {
                // Activated before or on 15th, bill until 15th of same month
                nextBillingDate = new Date(activationYear, activationMonth, 15);
            } else {
                // Activated after 15th, bill until 15th of next month
                nextBillingDate = new Date(activationYear, activationMonth + 1, 15);
            }
        } else {
            // For 30th billing (Malanggam)
            const lastDayOfMonth = getLastDayOfMonth(activationYear, activationMonth + 1);
            const billingDay = Math.min(schedule.dueDay, lastDayOfMonth);
            
            if (activationDay <= billingDay) {
                // Activated before or on billing day, bill until billing day of same month
                nextBillingDate = new Date(activationYear, activationMonth, billingDay);
            } else {
                // Activated after billing day, bill until billing day of next month
                const nextMonth = activationMonth + 1;
                const nextMonthLastDay = getLastDayOfMonth(activationYear, nextMonth + 1);
                nextBillingDate = new Date(activationYear, nextMonth, Math.min(schedule.dueDay, nextMonthLastDay));
            }
        }

        // 3. Calculate prorated amount
        const prorated = calculateProratedAmount(
            plan.monthly_fee,
            activationDate,
            nextBillingDate
        );

        if (prorated.daysUsed <= 0) {
            result.errors.push('No days to bill for activation period');
            return result;
        }

        // 4. Create activation invoice
        const { data: invoice, error: invoiceError } = await supabase
            .from('invoices')
            .insert({
                subscription_id: subscriptionId,
                from_date: toISODateString(activationDate),
                to_date: toISODateString(nextBillingDate),
                due_date: toISODateString(nextBillingDate),
                amount_due: prorated.proratedAmount,
                payment_status: 'Unpaid',
            })
            .select('id')
            .single();

        if (invoiceError) {
            result.errors.push(`Error creating invoice: ${invoiceError.message}`);
            return result;
        }

        // 5. Update subscription balance
        const newBalance = (Number(subscription.balance) || 0) + prorated.proratedAmount;
        await supabase
            .from('subscriptions')
            .update({ balance: newBalance })
            .eq('id', subscriptionId);

        // 6. Send SMS notification (optional)
        const customer = subscription.customers as any;
        if (customer?.mobile_number) {
            await sendSMS(
                customer.mobile_number,
                SMSTemplates.invoiceGenerated(
                    customer.name,
                    prorated.proratedAmount,
                    formatDatePH(nextBillingDate),
                    buName
                )
            );
        }

        result.success = true;
        result.invoiceId = invoice.id;
        result.amount = prorated.proratedAmount;
        return result;

    } catch (error) {
        result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown'}`);
        return result;
    }
}

/**
 * Send disconnection warnings
 */
export async function sendDisconnectionWarnings(businessUnitId: string): Promise<{
    success: boolean;
    sent: number;
    errors: string[];
}> {
    const supabase = getSupabaseAdmin();
    const result = { success: false, sent: 0, errors: [] as string[] };

    try {
        const today = new Date();

        // Get business unit to determine disconnection date logic
        const { data: businessUnit } = await supabase
            .from('business_units')
            .select('name')
            .eq('id', businessUnitId)
            .single();

        if (!businessUnit) {
            result.errors.push('Business unit not found');
            return result;
        }

        const schedule = getBillingSchedule(businessUnit.name);

        // Calculate the disconnection date for current period
        const year = today.getFullYear();
        const month = today.getMonth() + 1;

        let disconnectionDate: Date;
        if (schedule.disconnectionNextMonth) {
            disconnectionDate = new Date(year, month, schedule.disconnectionDay);
        } else {
            disconnectionDate = new Date(year, month - 1, schedule.disconnectionDay);
        }

        // If disconnection is today, send warnings
        if (toISODateString(today) !== toISODateString(disconnectionDate)) {
            result.success = true;
            return result;
        }

        // Find unpaid invoices for this business unit
        const { data: unpaidInvoices } = await supabase
            .from('invoices')
            .select(`
                id,
                amount_due,
                subscriptions (
                    id,
                    business_unit_id,
                    customers!subscriptions_subscriber_id_fkey (
                        name,
                        mobile_number
                    )
                )
            `)
            .in('payment_status', ['Unpaid', 'Partially Paid']);

        const smsMessages: Array<{ to: string; message: string }> = [];

        for (const invoice of unpaidInvoices || []) {
            const sub = invoice.subscriptions as any;
            if (sub?.business_unit_id !== businessUnitId) continue;

            const customer = sub?.customers as any;
            if (customer?.mobile_number) {
                smsMessages.push({
                    to: customer.mobile_number,
                    message: SMSTemplates.disconnectionWarning(
                        customer.name,
                        formatDatePH(disconnectionDate)
                    ),
                });
            }
        }

        if (smsMessages.length > 0) {
            const smsResult = await sendBulkSMS(smsMessages);
            result.sent = smsResult.sent;
        }

        result.success = true;
        return result;

    } catch (error) {
        result.errors.push(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
        return result;
    }
}

/**
 * Get today's scheduled tasks based on the current date (Philippine Time)
 * Since Vercel cron runs in UTC, we convert to PHT (UTC+8) for accurate scheduling
 */
export function getTodaysTasks(today: Date): {
    shouldGenerateInvoices: string[];  // Business unit types
    shouldSendDueReminders: string[];
    shouldSendDisconnectionWarnings: string[];
} {
    // Convert to Philippine Time (UTC+8)
    const philippineTime = new Date(today.getTime() + (8 * 60 * 60 * 1000));
    const day = philippineTime.getUTCDate();
    const month = philippineTime.getUTCMonth(); // 0-indexed

    const tasks = {
        shouldGenerateInvoices: [] as string[],
        shouldSendDueReminders: [] as string[],
        shouldSendDisconnectionWarnings: [] as string[],
    };

    // Check Bulihan/Extension schedule (10th gen, 15th due, 20th disc)
    if (day === 10) {
        tasks.shouldGenerateInvoices.push('bulihan', 'extension');
    }
    if (day === 15) {
        tasks.shouldSendDueReminders.push('bulihan', 'extension');
    }
    if (day === 20) {
        tasks.shouldSendDisconnectionWarnings.push('bulihan', 'extension');
    }

    // Check Malanggam schedule (25th gen, 30th due, 5th disc next month)
    if (day === 25) {
        tasks.shouldGenerateInvoices.push('malanggam');
    }
    // Handle February (month === 1) which may have 28 or 29 days
    const isFebruary = month === 1;
    const lastDayOfFeb = new Date(philippineTime.getUTCFullYear(), 2, 0).getDate(); // 28 or 29
    if (day === 30 || (isFebruary && day === lastDayOfFeb)) {
        tasks.shouldSendDueReminders.push('malanggam');
    }
    if (day === 5) {
        tasks.shouldSendDisconnectionWarnings.push('malanggam');
    }

    return tasks;
}
