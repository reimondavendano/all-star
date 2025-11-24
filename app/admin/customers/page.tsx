'use client';

import DataTable from '@/components/shared/DataTable';
import { mockCustomers } from '@/data/mockCustomers';
import { Customer } from '@/types/customer';

export default function CustomersPage() {
    const columns = [
        { header: 'Name', accessor: 'name' as keyof Customer },
        { header: 'Email', accessor: 'email' as keyof Customer },
        { header: 'Mobile', accessor: 'mobileNumber' as keyof Customer },
        {
            header: 'Status',
            accessor: (customer: Customer) => (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${customer.status === 'Active' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                    }`}>
                    {customer.status}
                </span>
            )
        },
        { header: 'Created Date', accessor: 'createdDate' as keyof Customer },
    ];

    return (
        <DataTable
            data={mockCustomers}
            columns={columns}
            title="Customers"
            actionLabel="Add Customer"
            onAction={() => console.log('Add customer')}
        />
    );
}
