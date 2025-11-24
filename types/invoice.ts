export interface Invoice {
    id: string;
    subscriptionId: string; // Lookup -> Subscription
    from: string; // Date
    to: string; // Date
    dueDate: string; // Date
    amountDue: number; // Currency
    paid: boolean;
}
