export type UserRole = 'super_admin' | 'user_admin' | 'customer';

export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    businessUnitId?: string; // For user_admin
    customerId?: string; // For customer
    avatarUrl?: string;
}
