export type InvoiceStatus = 'Paid' | 'Unpaid' | 'Partially Paid';

export interface Invoice {
    id: string;
    subscriptionId: string; // Lookup -> Subscription
    from: string; // Date (from_date)
    to: string; // Date (to_date)
    dueDate: string; // Date
    amountDue: number; // Currency
    paid: boolean; // Deprecated - use paymentStatus instead
    paymentStatus: InvoiceStatus;

    // Pro-rating fields
    isProrated?: boolean;
    proratedDays?: number;

    // Discount/Credit tracking
    originalAmount?: number; // Amount before discounts/credits
    discountApplied?: number; // Referral discount amount
    creditsApplied?: number; // Credits applied from previous overpayment

    // Computed fields for display
    totalPaid?: number;
    remainingBalance?: number;

    // Expanded relations (optional)
    subscription?: {
        id: string;
        customerName?: string;
        planName?: string;
        businessUnitName?: string;
        balance?: number;
    };
}

export interface InvoiceWithSubscription extends Invoice {
    subscriptions: {
        id: string;
        address?: string;
        label?: string;
        balance?: number;
        customers: {
            id: string;
            name: string;
        };
        plans: {
            name: string;
            monthly_fee: number;
        };
        business_units: {
            id: string;
            name: string;
        };
    };
}

export interface InvoiceGenerationConfig {
    businessUnitId: string;
    year: number;
    month: number;
    sendSmsNotifications: boolean;
}

export interface InvoiceGenerationResult {
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

export interface InvoiceGenerationLog {
    id: string;
    businessUnitId: string;
    businessUnitName?: string;
    billingYear: number;
    billingMonth: number;
    invoicesGenerated: number;
    invoicesSkipped: number;
    smsSent: number;
    triggeredBy: 'cron' | 'manual' | 'api';
    errors?: Record<string, string>;
    createdAt: string;
}
