export interface Customer {
    id: string;
    name: string;
    mobileNumber: string;
    status: 'Active' | 'Inactive'; // Formula: Active if any related Subscription is Active
    createdDate: string; // Date
}
