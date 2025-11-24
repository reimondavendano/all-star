'use client';

import DataTable from '@/components/shared/DataTable';
import { mockPayments } from '@/data/mockPayments';
import { Payment } from '@/types/payment';

export default function PaymentsPage() {
    const columns = [
        { header: 'Date', accessor: 'settlementDate' as keyof Payment },
        { header: 'Amount', accessor: (pay: Payment) => `₱${pay.amount}` },
        { header: 'Mode', accessor: 'mode' as keyof Payment },
        { header: 'Reference', accessor: 'referenceNumber' as keyof Payment },
    ];

    return (
        <DataTable
            data={mockPayments}
            columns={columns}
            title="Payments"
            actionLabel="Record Payment"
            onAction={() => console.log('Record payment')}
        />
    );
}
