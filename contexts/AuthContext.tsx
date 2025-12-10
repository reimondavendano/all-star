'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { UserProfile } from '@/types/userProfile';

interface AuthContextType {
    user: UserProfile | null;
    login: (userData: UserProfile) => void;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    // Load user from localStorage on mount
    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch (error) {
                console.error('Error parsing stored user:', error);
                localStorage.removeItem('user');
            }
        }
        setIsLoading(false);
    }, []);

    // Get the appropriate redirect path based on role
    const getRedirectPath = (role: string): string => {
        switch (role) {
            case 'super_admin':
            case 'user_admin':
                return '/admin/dashboard';
            case 'collector':
                return '/collector/invoices';
            case 'customer':
                return '/portal';
            default:
                return '/admin/dashboard';
        }
    };

    // Redirect logic based on auth state
    useEffect(() => {
        if (isLoading) return;

        const isAuthPage = pathname === '/login' || pathname === '/';
        const isAdminPage = pathname?.startsWith('/admin');
        const isCollectorPage = pathname?.startsWith('/collector');
        const isPortalPage = pathname?.startsWith('/portal');

        if (user && isAuthPage) {
            // User is logged in but on auth page, redirect based on role
            router.push(getRedirectPath(user.role));
        } else if (!user && (isAdminPage || isCollectorPage)) {
            // User is not logged in but trying to access protected page
            router.push('/login');
        } else if (user) {
            // User is logged in, check role access
            const role = user.role;

            // Collectors can't access admin pages
            if (role === 'collector' && isAdminPage) {
                router.push('/collector/invoices');
            }

            // Admins redirected from collector pages (optional - could allow access)
            // if ((role === 'super_admin' || role === 'user_admin') && isCollectorPage) {
            //     router.push('/admin/dashboard');
            // }
        }
    }, [user, pathname, isLoading, router]);

    const login = (userData: UserProfile) => {
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        router.push(getRedirectPath(userData.role));
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('user');
        router.push('/login');
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
