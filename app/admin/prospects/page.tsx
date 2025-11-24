'use client';

import DataTable from '@/components/shared/DataTable';
import { mockProspects } from '@/data/mockProspects';
import { Prospect } from '@/types/prospect';

export default function ProspectsPage() {
    const columns = [
        { header: 'Name', accessor: 'name' as keyof Prospect },
        { header: 'Mobile', accessor: 'mobileNumber' as keyof Prospect },
        { header: 'Address', accessor: 'address' as keyof Prospect },
        { header: 'Installation Date', accessor: 'installationDate' as keyof Prospect },
        {
            header: 'Status',
            accessor: (prospect: Prospect) => (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${prospect.status === 'Converted' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'
                    }`}>
                    {prospect.status}
                </span>
            )
        },
    ];

    return (
        <DataTable
            data={mockProspects}
            columns={columns}
            title="Prospects"
            actionLabel="Add Prospect"
            onAction={() => console.log('Add prospect')}
        />
    );
}
