export type ExpenseReason = 'Maintenance' | 'Materials' | 'Transportation' | 'Others';

export interface Expense {
    id: string;
    subscriptionId: string;
    quantity: number;
    amount: number;
    reason: ExpenseReason;
    notes?: string;
    date: string; // Added date for tracking
}
