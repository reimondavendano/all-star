'use client';

import DataTable from '@/components/shared/DataTable';
import { mockInvoices } from '@/data/mockInvoices';
import { Invoice } from '@/types/invoice';

export default function InvoicesPage() {
    const columns = [
        { header: 'Invoice #', accessor: 'invoiceNumber' as keyof Invoice },
        { header: 'Due Date', accessor: 'dueDate' as keyof Invoice },
        { header: 'Amount', accessor: (inv: Invoice) => `₱${inv.amountDue}` },
        {
            header: 'Status',
            accessor: (inv: Invoice) => (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${inv.paid ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
                    }`}>
                    {inv.paid ? 'Paid' : 'Unpaid'}
                </span>
            )
        },
    ];

    return (
        <DataTable
            data={mockInvoices}
            columns={columns}
            title="Invoices"
            actionLabel="Generate Invoice"
            onAction={() => console.log('Generate invoice')}
        />
    );
}
