export interface Invoice {
    id: string;
    subscriptionId: string;
    from: string;
    to: string;
    dueDate: string;
    amountDue: number;
    paid: boolean;
    invoiceNumber: string;
}
