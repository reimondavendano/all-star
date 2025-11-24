'use client';

import DataTable from '@/components/shared/DataTable';
import { mockPlans } from '@/data/mockPlans';
import { Plan } from '@/types/plan';

export default function PlansPage() {
    const columns = [
        { header: 'Name', accessor: 'name' as keyof Plan },
        { header: 'Monthly Fee', accessor: (plan: Plan) => `₱${plan.monthlyFee}` },
    ];

    return (
        <DataTable
            data={mockPlans}
            columns={columns}
            title="Plans"
            actionLabel="Add Plan"
            onAction={() => console.log('Add plan')}
        />
    );
}
