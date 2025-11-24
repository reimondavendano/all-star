import { Customer } from '@/types/customer';

export const mockCustomers: Customer[] = [
    { id: 'cust-1', name: 'John Doe', status: 'Active', createdDate: '2024-01-15', email: 'john@example.com', mobileNumber: '09171234567', address: '123 Main St' },
    { id: 'cust-2', name: 'Jane Smith', status: 'Active', createdDate: '2024-02-20', email: 'jane@example.com', mobileNumber: '09181234567', address: '456 Oak Ave' },
    { id: 'cust-3', name: 'Bob Johnson', status: 'Inactive', createdDate: '2024-03-10', email: 'bob@example.com', mobileNumber: '09191234567', address: '789 Pine Rd' },
];
