export interface Customer {
    id: string;
    name: string;
    status: 'Active' | 'Inactive';
    createdDate: string; // ISO date
    email: string;
    mobileNumber?: string;
    address?: string;
}
