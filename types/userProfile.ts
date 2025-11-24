export type UserRole = 'super_admin' | 'user_admin' | 'collector';

export interface UserProfile {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    avatar_url?: string;
    created_at: string;
}
