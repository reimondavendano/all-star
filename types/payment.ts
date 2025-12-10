export type PaymentMode = 'Cash' | 'E-Wallet' | 'Referral Credit';
export type PaymentStatus = 'recorded' | 'refunded' | 'adjusted';

export interface Payment {
    id: string;
    subscriptionId: string; // Lookup -> Subscription
    invoiceId?: string; // Lookup -> Invoice (optional, for linking to specific invoice)
    settlementDate: string; // Date
    amount: number; // Currency
    mode: PaymentMode;
    notes?: string;
    createdAt?: string;
}

export interface PaymentWithDetails extends Payment {
    subscription?: {
        id: string;
        customerName?: string;
        customerId?: string;
        planName?: string;
        balance?: number;
    };
    invoice?: {
        id: string;
        dueDate: string;
        amountDue: number;
        paymentStatus: string;
    };
}

export interface PaymentHistory {
    id: string;
    paymentId?: string;
    subscriptionId: string;
    customerId?: string;
    invoiceId?: string;
    amount: number;
    paymentMode: string;
    status: PaymentStatus;
    balanceBefore: number;
    balanceAfter: number;
    notes?: string;
    recordedBy?: string;
    createdAt: string;
}

export interface ProcessPaymentParams {
    subscriptionId: string;
    amount: number;
    mode: PaymentMode;
    settlementDate: string;
    notes?: string;
    invoiceId?: string;
    sendSmsNotification?: boolean;
}

export interface ProcessPaymentResult {
    success: boolean;
    paymentId?: string;
    newBalance: number;
    previousBalance: number;
    invoiceStatus?: 'Paid' | 'Partially Paid' | 'Unpaid';
    error?: string;
}

export interface PaymentSummary {
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
}
