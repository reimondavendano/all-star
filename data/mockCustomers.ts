import { Customer } from '@/types/customer';

export const mockCustomers: Customer[] = [
    {
        id: 'cust-1',
        name: 'John Doe',
        mobileNumber: '09171234567',
        status: 'Active',
        createdDate: '2024-01-15',
    },
    {
        id: 'cust-2',
        name: 'Jane Smith',
        mobileNumber: '09181234567',
        status: 'Active',
        createdDate: '2024-02-20',
    },
    {
        id: 'cust-3',
        name: 'Bob Johnson',
        mobileNumber: '09191234567',
        status: 'Inactive',
        createdDate: '2024-03-10',
    },
];
