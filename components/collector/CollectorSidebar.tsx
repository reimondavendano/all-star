'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
    Users,
    FileText,
    LogOut,
    MapPin,
    X,
    CreditCard,
    CheckCircle,
    DollarSign
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';

const navigation = [
    { name: 'Invoices & Payments', href: '/collector/invoices', icon: FileText },
    { name: 'E-Payment Verification', href: '/collector/verification', icon: CheckCircle },
    { name: 'Expenses', href: '/collector/expenses', icon: DollarSign },
    { name: 'Customers & Subscriptions', href: '/collector/customers', icon: Users },
    { name: 'Locations', href: '/collector/locations', icon: MapPin },
];

interface CollectorSidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

export default function CollectorSidebar({ isOpen = true, onClose }: CollectorSidebarProps) {
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
                "flex flex-col w-64 bg-gradient-to-b from-[#0a0a0a]/95 to-[#050505]/95 backdrop-blur-xl border-r border-purple-900/30 h-screen fixed left-0 top-0 overflow-y-auto z-50 transition-transform duration-300",
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
                    <div className="absolute inset-0 bg-purple-900/5 pointer-events-none" />
                    <div className="relative w-full h-20 bg-white/90 rounded-xl p-2 shadow-lg shadow-purple-900/20">
                        <Image
                            src="/logo/allstars.png"
                            alt="AllStar Logo"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                </div>

                {/* Collector Badge */}
                <div className="mx-4 mb-4 p-3 bg-purple-900/20 rounded-xl border border-purple-700/30 text-center">
                    <div className="flex items-center justify-center gap-2">
                        <CreditCard className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-medium text-purple-400">Collector Portal</span>
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-2">
                    {navigation.map((item) => {
                        const isActive = pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                onClick={onClose}
                                className={clsx(
                                    'flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 relative overflow-hidden group',
                                    isActive
                                        ? 'text-white bg-gradient-to-r from-violet-600 to-purple-600 shadow-lg shadow-purple-900/30'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                )}
                            >
                                <item.icon className={clsx("w-5 h-5 mr-3 transition-transform duration-300 group-hover:scale-110")} />
                                <span className="relative z-10">{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-purple-900/30 bg-black/20">
                    <div className="flex items-center justify-between p-2 rounded-lg border border-transparent hover:border-purple-900/30 transition-colors group">
                        <div className="flex items-center">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
                                <span className="text-xs font-bold text-white">
                                    {user?.full_name?.charAt(0).toUpperCase() || 'C'}
                                </span>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm font-medium text-white truncate max-w-[100px]">
                                    {user?.full_name || 'Collector'}
                                </p>
                                <p className="text-xs text-purple-400 uppercase">
                                    {user?.role?.replace('_', ' ') || 'Collector'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={logout}
                            className="text-gray-400 hover:text-purple-400 transition-colors p-1 rounded hover:bg-purple-900/20"
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
