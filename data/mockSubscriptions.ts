import { Subscription } from '@/types/subscription';
import { mockCustomers } from './mockCustomers';
import { mockBusinessUnits } from './mockBusinessUnits';
import { mockPlans } from './mockPlans';

export const mockSubscriptions: Subscription[] = [
    {
        id: 'sub-1',
        subscriberId: 'cust-1',
        businessUnitId: 'bu-1',
        planId: 'plan-1',
        active: true,
        dateInstalled: '2024-01-15',
        contactPerson: 'John Doe',
        address: '123 Main St, Malanggam',
        landmark: 'Near Plaza',
        invoiceDate: '15th',
        balance: 0,
        referralCreditApplied: false,
        customer: mockCustomers[0],
        businessUnit: mockBusinessUnits[0],
        plan: mockPlans[0],
    },
    {
        id: 'sub-2',
        subscriberId: 'cust-2',
        businessUnitId: 'bu-2',
        planId: 'plan-2',
        active: true,
        dateInstalled: '2024-02-20',
        contactPerson: 'Jane Smith',
        address: '456 Oak Ave, Bulihan',
        landmark: 'Near School',
        invoiceDate: '30th',
        balance: 2000,
        referralCreditApplied: true,
        customer: mockCustomers[1],
        businessUnit: mockBusinessUnits[1],
        plan: mockPlans[1],
    },
];
