import { Expense } from '@/types/expense';

export const mockExpenses: Expense[] = [
    {
        id: 'exp-1',
        subscriptionId: 'sub-1',
        quantity: 1,
        amount: 500,
        reason: 'Maintenance',
        notes: 'Replaced router',
    },
    {
        id: 'exp-2',
        subscriptionId: 'sub-2',
        quantity: 2,
        amount: 100,
        reason: 'Transportation',
        notes: 'Gas for site visit',
    },
];
