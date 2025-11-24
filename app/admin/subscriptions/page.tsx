'use client';

import DataTable from '@/components/shared/DataTable';
import { mockSubscriptions } from '@/data/mockSubscriptions';
import { Subscription } from '@/types/subscription';

export default function SubscriptionsPage() {
    const columns = [
        { header: 'Subscriber', accessor: (sub: Subscription) => sub.contactPerson },
        { header: 'Plan', accessor: (sub: Subscription) => sub.plan?.name || sub.planId },
        { header: 'Business Unit', accessor: (sub: Subscription) => sub.businessUnit?.name || sub.businessUnitId },
        {
            header: 'Status',
            accessor: (sub: Subscription) => (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${sub.active ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                    }`}>
                    {sub.active ? 'Active' : 'Inactive'}
                </span>
            )
        },
        { header: 'Balance', accessor: (sub: Subscription) => `₱${sub.balance}` },
    ];

    return (
        <DataTable
            data={mockSubscriptions}
            columns={columns}
            title="Subscriptions"
            actionLabel="New Subscription"
            onAction={() => console.log('New subscription')}
        />
    );
}
