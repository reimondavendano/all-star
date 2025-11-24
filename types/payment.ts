export type PaymentMode = 'Cash' | 'E-Wallet' | 'Referral Credit';

export interface Payment {
    id: string;
    subscriptionId: string; // Lookup -> Subscription
    settlementDate: string; // Date
    amount: number; // Currency
    mode: PaymentMode;
    notes?: string;
}
