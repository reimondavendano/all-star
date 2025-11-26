'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Users,
    UserPlus,
    CreditCard,
    FileText,
    DollarSign,
    Briefcase,
    Package,
    Receipt,
    LogOut,
    MapPin,
    X,
    Router
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';

const navigation = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Prospects', href: '/admin/prospects', icon: UserPlus },
    { name: 'Customers', href: '/admin/customers', icon: Users },
    { name: 'Subscriptions', href: '/admin/subscriptions', icon: Receipt },
    { name: 'Invoices', href: '/admin/invoices', icon: FileText },
    { name: 'Payments', href: '/admin/payments', icon: CreditCard },
    { name: 'Expenses', href: '/admin/expenses', icon: DollarSign },
    { name: 'Business Units', href: '/admin/business-units', icon: Briefcase },
    { name: 'Plans', href: '/admin/plans', icon: Package },
    { name: 'Locations', href: '/admin/locations', icon: MapPin },
    // { name: 'Mikrotik', href: '/admin/mikrotik', icon: Router }, // Temporarily disabled - API service not configured
];

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
    const pathname = usePathname();
    const { logout, user } = useAuth();

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <div className={clsx(
                "flex flex-col w-64 bg-[#0a0a0a]/90 backdrop-blur-xl border-r border-red-900/30 h-screen fixed left-0 top-0 overflow-y-auto z-50 tech-border transition-transform duration-300",
                // Mobile: slide in/out
                "lg:translate-x-0",
                isOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                {/* Close button for mobile */}
                <button
                    onClick={onClose}
                    className="lg:hidden absolute top-4 right-4 text-gray-400 hover:text-white p-2 hover:bg-white/5 rounded transition-colors z-10"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="p-6 flex justify-center relative">
                    <div className="absolute inset-0 bg-red-900/5 animate-pulse-slow pointer-events-none" />
                    <div className="relative w-full h-20 bg-white/90 rounded-lg p-2 shadow-[0_0_15px_rgba(255,0,0,0.3)]">
                        <Image
                            src="/logo/allstars.png"
                            alt="AllStar Logo"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-2 mt-4">
                    {navigation.map((item) => {
                        const isActive = pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                onClick={onClose}
                                className={clsx(
                                    'flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-300 relative overflow-hidden group',
                                    isActive
                                        ? 'text-red-500 bg-red-900/10 border border-red-500/30 shadow-[0_0_10px_rgba(255,0,0,0.2)]'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5 hover:border hover:border-red-500/20'
                                )}
                            >
                                <div className={`absolute left-0 top-0 bottom-0 w-1 bg-red-500 transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
                                <item.icon className={clsx("w-5 h-5 mr-3 transition-transform duration-300 group-hover:scale-110", isActive && "animate-pulse")} />
                                <span className="relative z-10">{item.name}</span>
                                {isActive && <div className="absolute inset-0 bg-gradient-to-r from-red-900/10 to-transparent opacity-50" />}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-red-900/30 bg-black/20">
                    <div className="flex items-center justify-between p-2 rounded-lg border border-transparent hover:border-red-900/30 transition-colors group">
                        <div className="flex items-center">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-red-600 to-red-900 flex items-center justify-center shadow-[0_0_10px_rgba(255,0,0,0.4)]">
                                <span className="text-xs font-bold text-white">
                                    {user?.full_name?.charAt(0).toUpperCase() || 'A'}
                                </span>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm font-medium text-white neon-text truncate max-w-[100px]">
                                    {user?.full_name || 'Admin User'}
                                </p>
                                <p className="text-xs text-red-400 uppercase">
                                    {user?.role?.replace('_', ' ') || 'System Operator'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={logout}
                            className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-900/20"
                            title="Logout"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
