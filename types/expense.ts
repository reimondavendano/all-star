export type ExpenseReason = 'Maintenance' | 'Materials' | 'Transportation' | 'Others';

export interface Expense {
    id: string;
    subscriptionId: string; // Lookup -> Subscription
    quantity: number;
    amount: number; // Currency
    reason: ExpenseReason;
    notes?: string; // Long Text
}
