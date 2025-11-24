'use client';

import DataTable from '@/components/shared/DataTable';
import { mockExpenses } from '@/data/mockExpenses';
import { Expense } from '@/types/expense';

export default function ExpensesPage() {
    const columns = [
        { header: 'Date', accessor: 'date' as keyof Expense },
        { header: 'Reason', accessor: 'reason' as keyof Expense },
        { header: 'Amount', accessor: (exp: Expense) => `₱${exp.amount}` },
        { header: 'Notes', accessor: 'notes' as keyof Expense },
    ];

    return (
        <DataTable
            data={mockExpenses}
            columns={columns}
            title="Expenses"
            actionLabel="Add Expense"
            onAction={() => console.log('Add expense')}
        />
    );
}
