import { Prospect } from '@/types/prospect';

export const mockProspects: Prospect[] = [
    {
        id: 'pros-1',
        name: 'Alice Wonderland',
        planId: 'plan-1',
        businessUnitId: 'bu-1',
        landmark: 'Near the rabbit hole',
        barangay: 'Wonderland',
        address: '123 Fantasy Lane',
        mobileNumber: '09170000001',
        installationDate: '2024-04-01',
        referrerId: 'cust-1',
        status: 'Open',
        details: 'Interested in high speed internet',
    },
    {
        id: 'pros-2',
        name: 'Bob Builder',
        planId: 'plan-2',
        businessUnitId: 'bu-2',
        landmark: 'Construction Site',
        barangay: 'Builderville',
        address: '456 Construction Rd',
        mobileNumber: '09180000002',
        installationDate: '2024-04-05',
        referrerId: 'cust-2',
        status: 'Closed Won',
        details: 'Needs internet for office',
    },
];
