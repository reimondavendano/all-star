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
        dateInstalled: '2024-01-20',
        contactPerson: 'John Doe',
        mobileNumber: '09171234567',
        address: '123 Main St',
        landmark: 'Near the big tree',
        invoiceDate: '15th',
        balance: 0,
        referralCreditApplied: false,
        customer: mockCustomers.find(c => c.id === 'cust-1'),
        businessUnit: mockBusinessUnits.find(b => b.id === 'bu-1'),
        plan: mockPlans.find(p => p.id === 'plan-1'),
    },
    {
        id: 'sub-2',
        subscriberId: 'cust-2',
        businessUnitId: 'bu-2',
        planId: 'plan-2',
        active: true,
        dateInstalled: '2024-02-25',
        contactPerson: 'Jane Smith',
        mobileNumber: '09181234567',
        address: '456 Oak Ave',
        landmark: 'Opposite the bakery',
        invoiceDate: '30th',
        balance: 2500,
        referralCreditApplied: true,
        customer: mockCustomers.find(c => c.id === 'cust-2'),
        businessUnit: mockBusinessUnits.find(b => b.id === 'bu-2'),
        plan: mockPlans.find(p => p.id === 'plan-2'),
    },
];
