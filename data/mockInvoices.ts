import { Invoice } from '@/types/invoice';

export const mockInvoices: Invoice[] = [
    {
        id: 'inv-1',
        subscriptionId: 'sub-1',
        from: '2024-03-15',
        to: '2024-04-14',
        dueDate: '2024-04-19',
        amountDue: 1500,
        paid: true,
        paymentStatus: 'Paid',
    },
    {
        id: 'inv-2',
        subscriptionId: 'sub-2',
        from: '2024-03-30',
        to: '2024-04-29',
        dueDate: '2024-05-04',
        amountDue: 2000,
        paid: false,
        paymentStatus: 'Unpaid',
    },
];
