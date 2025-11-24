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

    // Redirect logic based on auth state
    useEffect(() => {
        if (isLoading) return;

        const isAuthPage = pathname === '/login' || pathname === '/';
        const isAdminPage = pathname?.startsWith('/admin');

        if (user && isAuthPage) {
            // User is logged in but on auth page, redirect to dashboard
            router.push('/admin/dashboard');
        } else if (!user && isAdminPage) {
            // User is not logged in but trying to access admin page, redirect to login
            router.push('/login');
        }
    }, [user, pathname, isLoading, router]);

    const login = (userData: UserProfile) => {
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        router.push('/admin/dashboard');
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
