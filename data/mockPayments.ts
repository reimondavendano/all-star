import { Payment } from '@/types/payment';

export const mockPayments: Payment[] = [
    {
        id: 'pay-1',
        subscriptionId: 'sub-1',
        settlementDate: '2024-04-18',
        amount: 1500,
        mode: 'Cash',
        notes: 'Paid at office',
    },
    {
        id: 'pay-2',
        subscriptionId: 'sub-2',
        settlementDate: '2024-03-01',
        amount: 300,
        mode: 'Referral Credit',
        notes: 'Referral bonus for cust-3',
    },
];
