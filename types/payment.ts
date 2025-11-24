export type PaymentMode = 'Cash' | 'E-Wallet' | 'Referral Credit';

export interface Payment {
    id: string;
    subscriptionId: string;
    settlementDate: string;
    amount: number;
    mode: PaymentMode;
    notes?: string;
    referenceNumber?: string;
}
