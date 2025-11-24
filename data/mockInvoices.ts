import { Invoice } from '@/types/invoice';

export const mockInvoices: Invoice[] = [
    { id: 'inv-1', subscriptionId: 'sub-1', from: '2024-02-15', to: '2024-03-15', dueDate: '2024-03-20', amountDue: 1500, paid: true, invoiceNumber: 'INV-001' },
    { id: 'inv-2', subscriptionId: 'sub-1', from: '2024-03-15', to: '2024-04-15', dueDate: '2024-04-20', amountDue: 1500, paid: false, invoiceNumber: 'INV-002' },
    { id: 'inv-3', subscriptionId: 'sub-2', from: '2024-03-01', to: '2024-04-01', dueDate: '2024-04-05', amountDue: 2500, paid: false, invoiceNumber: 'INV-003' },
];
