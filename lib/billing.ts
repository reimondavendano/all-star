/**
 * Billing Configuration and Utilities
 * Contains business unit schedules and billing calculation logic
 */

export interface BillingSchedule {
    invoiceGenerationDay: number;      // Day of month to generate invoices
    dueDay: number;                     // Day of month payment is due
    disconnectionDay: number;           // Day of month for disconnection
    disconnectionNextMonth: boolean;    // If disconnection is in the next month
    billingPeriodType: 'mid-month' | 'full-month';
}

/**
 * Business Unit Billing Schedules
 */
export const BILLING_SCHEDULES: { [key: string]: BillingSchedule } = {
    'bulihan': {
        invoiceGenerationDay: 10,
        dueDay: 15,
        disconnectionDay: 20,
        disconnectionNextMonth: false,
        billingPeriodType: 'mid-month', // Nov 15 - Dec 15 for December
    },
    'extension': {
        invoiceGenerationDay: 10,
        dueDay: 15,
        disconnectionDay: 20,
        disconnectionNextMonth: false,
        billingPeriodType: 'mid-month',
    },
    'malanggam': {
        invoiceGenerationDay: 25,
        dueDay: 30,                      // Will be adjusted for short months
        disconnectionDay: 5,
        disconnectionNextMonth: true,    // Disconnection is 5th of NEXT month
        billingPeriodType: 'full-month', // Dec 1 - Dec 30/31 for December
    },
};

/**
 * Get billing schedule for a business unit by name
 */
export function getBillingSchedule(businessUnitName: string): BillingSchedule {
    const normalized = businessUnitName.toLowerCase().trim();

    if (normalized.includes('bulihan')) return BILLING_SCHEDULES['bulihan'];
    if (normalized.includes('extension')) return BILLING_SCHEDULES['extension'];
    if (normalized.includes('malanggam')) return BILLING_SCHEDULES['malanggam'];

    // Default to Bulihan schedule
    return BILLING_SCHEDULES['bulihan'];
}

/**
 * Get the last day of a month
 */
export function getLastDayOfMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
}

/**
 * Calculate billing dates for a business unit
 */
export function calculateBillingDates(
    businessUnitName: string,
    year: number,
    month: number, // 1-12
    cycleDateOverride?: '15th' | '30th'
): {
    fromDate: Date;
    toDate: Date;
    dueDate: Date;
    disconnectionDate: Date;
    generationDate: Date;
} {
    let schedule = getBillingSchedule(businessUnitName);

    // Apply override if provided
    if (cycleDateOverride) {
        if (cycleDateOverride === '30th') {
            // Use 30th schedule (based on Malanggam template)
            schedule = BILLING_SCHEDULES['malanggam'];
        } else if (cycleDateOverride === '15th') {
            // Use 15th schedule (based on Bulihan template)
            schedule = BILLING_SCHEDULES['bulihan'];
        }
    }

    const lastDay = getLastDayOfMonth(year, month);

    let fromDate: Date;
    let toDate: Date;
    let dueDate: Date;
    let disconnectionDate: Date;
    let generationDate: Date;

    if (schedule.billingPeriodType === 'mid-month') {
        // Billing period: Previous month 15th to current month 15th
        // e.g., for December 2025: Nov 15, 2025 - Dec 15, 2025
        fromDate = new Date(year, month - 2, 15);  // Previous month 15th
        toDate = new Date(year, month - 1, 15);    // Current month 15th
        dueDate = new Date(year, month - 1, schedule.dueDay);
        disconnectionDate = new Date(year, month - 1, schedule.disconnectionDay);
        generationDate = new Date(year, month - 1, schedule.invoiceGenerationDay);
    } else {
        // Full month: 1st to 30th/last day of current month
        const effectiveDueDay = Math.min(schedule.dueDay, lastDay);

        fromDate = new Date(year, month - 1, 1);   // 1st of current month
        toDate = new Date(year, month - 1, lastDay); // Last day of month
        dueDate = new Date(year, month - 1, effectiveDueDay);
        generationDate = new Date(year, month - 1, schedule.invoiceGenerationDay);

        if (schedule.disconnectionNextMonth) {
            disconnectionDate = new Date(year, month, schedule.disconnectionDay); // Next month
        } else {
            disconnectionDate = new Date(year, month - 1, schedule.disconnectionDay);
        }
    }

    return { fromDate, toDate, dueDate, disconnectionDate, generationDate };
}

/**
 * Calculate daily rate for pro-rating
 */
export function calculateDailyRate(monthlyFee: number): number {
    return monthlyFee / 30;
}

/**
 * Calculate pro-rated amount for new customers
 */
export function calculateProratedAmount(
    monthlyFee: number,
    dateInstalled: Date,
    dueDate: Date
): {
    proratedAmount: number;
    daysUsed: number;
    dailyRate: number;
} {
    const dailyRate = calculateDailyRate(monthlyFee);

    // Calculate days from installation to due date
    const timeDiff = dueDate.getTime() - dateInstalled.getTime();
    const daysUsed = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    // Don't allow negative or more than 30 days
    const effectiveDays = Math.max(0, Math.min(30, daysUsed));
    const proratedAmount = Math.round(dailyRate * effectiveDays * 100) / 100;

    return {
        proratedAmount,
        daysUsed: effectiveDays,
        dailyRate: Math.round(dailyRate * 100) / 100,
    };
}

/**
 * Check if a subscription needs pro-rating
 */
export function needsProrating(
    dateInstalled: Date,
    invoiceGenerationDate: Date,
    billingPeriodStart: Date
): boolean {
    // Needs pro-rating if:
    // 1. Installation date is after the billing period start, OR
    // 2. Installation date is close to invoice generation (within same period)

    return dateInstalled > billingPeriodStart ||
        dateInstalled > new Date(invoiceGenerationDate.getTime() - 30 * 24 * 60 * 60 * 1000);
}

/**
 * Determine if customer should get first invoice today
 */
export function isFirstInvoiceForCustomer(
    dateInstalled: Date,
    invoiceGenerationDate: Date,
    previousInvoiceCount: number
): boolean {
    // If they have previous invoices, this is not their first
    if (previousInvoiceCount > 0) return false;

    // If installed before the generation date, they should get an invoice
    return dateInstalled <= invoiceGenerationDate;
}

/**
 * Calculate referral discount eligibility
 */
export function calculateReferralDiscount(
    customerId: string,
    subscriptions: Array<{ id: string; referrer_id?: string }>,
    subscriptionId: string
): number {
    const REFERRAL_DISCOUNT = 300; // ₱300 discount

    // Find customer's subscriptions
    const customerSubs = subscriptions.filter(s =>
        s.id === subscriptionId ||
        subscriptions.some(sub => sub.id === subscriptionId)
    );

    // Only apply discount to the FIRST subscription
    if (customerSubs.length > 0 && customerSubs[0].id === subscriptionId) {
        // Check if this subscription has a referrer
        const sub = subscriptions.find(s => s.id === subscriptionId);
        if (sub?.referrer_id) {
            return REFERRAL_DISCOUNT;
        }
    }

    return 0;
}

/**
 * Format date to Philippine locale string
 */
export function formatDatePH(date: Date): string {
    return date.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

/**
 * Format date to ISO string (YYYY-MM-DD)
 */
export function toISODateString(date: Date): string {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().split('T')[0];
}

/**
 * Determine payment status based on payment amount and invoice amount
 */
export function determinePaymentStatus(
    totalPaid: number,
    amountDue: number
): 'Paid' | 'Partially Paid' | 'Unpaid' {
    if (totalPaid >= amountDue) return 'Paid';
    if (totalPaid > 0) return 'Partially Paid';
    return 'Unpaid';
}

/**
 * Calculate new balance after payment
 */
export function calculateNewBalance(
    currentBalance: number,
    paymentAmount: number
): number {
    // New Balance = Current Balance - Payment Amount
    // Positive balance = amount owed (debt)
    // Negative balance = credits (advance payment)
    return currentBalance - paymentAmount;
}

/**
 * Format balance for display
 * All balances are displayed as whole numbers (rounded up for positive, floor for negative/credits)
 */
export function formatBalanceDisplay(balance: number): {
    label: 'Balance' | 'Credits';
    amount: number;
    display: string;
} {
    // Round to nearest whole number as per requirements (e.g. 233.1 -> 233)
    const roundedBalance = Math.round(balance);

    if (roundedBalance >= 0) {
        return {
            label: 'Balance',
            amount: roundedBalance,
            display: `₱${roundedBalance.toLocaleString()}`,
        };
    }
    return {
        label: 'Credits',
        amount: Math.abs(roundedBalance),
        display: `₱${Math.abs(roundedBalance).toLocaleString()}`,
    };
}
