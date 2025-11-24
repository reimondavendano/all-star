'use client';

import DataTable from '@/components/shared/DataTable';
import { mockBusinessUnits } from '@/data/mockBusinessUnits';
import { BusinessUnit } from '@/types/businessUnit';

export default function BusinessUnitsPage() {
    const columns = [
        { header: 'Name', accessor: 'name' as keyof BusinessUnit },
        { header: 'Active Subscriptions', accessor: 'activeSubscriptions' as keyof BusinessUnit },
    ];

    return (
        <DataTable
            data={mockBusinessUnits}
            columns={columns}
            title="Business Units"
            actionLabel="Add Unit"
            onAction={() => console.log('Add unit')}
        />
    );
}
