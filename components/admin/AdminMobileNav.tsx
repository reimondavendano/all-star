'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Users,
    FileText,
    Menu,
    X,
    UserPlus,
    CheckCircle,
    DollarSign,
    Briefcase,
    Package,
    MapPin,
    Router,
    LogOut
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

// Primary Bottom Nav Items
const bottomNavItems = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, badge: null },
    { name: 'Prospects', href: '/admin/prospects', icon: UserPlus, badge: 'openProspects' },
    { name: 'Invoices', href: '/admin/invoices', icon: FileText, badge: null },
    { name: 'Customers', href: '/admin/customers', icon: Users, badge: null },
];

// Secondary "More" Menu Items
const moreMenuItems = [
    { name: 'E-Payment Verification', href: '/admin/verification', icon: CheckCircle, badge: 'unverifiedPayments' },
    { name: 'Expenses', href: '/admin/expenses', icon: DollarSign, badge: null },
    { name: 'Business Units', href: '/admin/business-units', icon: Briefcase, badge: null },
    { name: 'Plans', href: '/admin/plans', icon: Package, badge: null },
    { name: 'Locations', href: '/admin/locations', icon: MapPin, badge: null },
    { name: 'Mikrotik', href: '/admin/mikrotik', icon: Router, badge: null },
];

export default function AdminMobileNav() {
    const pathname = usePathname();
    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const { logout, user } = useAuth();
    const [openProspectsCount, setOpenProspectsCount] = useState(0);
    const [unverifiedPaymentsCount, setUnverifiedPaymentsCount] = useState(0);

    // Fetch counts
    const fetchCounts = async () => {
        try {
            // Count Open prospects
            const { count: prospectsCount, error: prospectsError } = await supabase
                .from('prospects')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'Open');

            if (!prospectsError && prospectsCount !== null) {
                setOpenProspectsCount(prospectsCount);
            }

            // Count pending verification payments (notes contains "Pending Verification")
            const { data: paymentsData, error: paymentsError } = await supabase
                .from('payments')
                .select('notes')
                .ilike('notes', '%Pending Verification%');

            if (!paymentsError && paymentsData) {
                setUnverifiedPaymentsCount(paymentsData.length);
            }
        } catch (error) {
            console.error('Error fetching counts:', error);
        }
    };

    useEffect(() => {
        fetchCounts();
    }, []);

    // Real-time updates for prospects
    useRealtimeSubscription({
        table: 'prospects',
        onAny: fetchCounts
    });

    // Real-time updates for payments
    useRealtimeSubscription({
        table: 'payments',
        onAny: fetchCounts
    });

    const getBadgeCount = (badgeType: string | null) => {
        if (!badgeType) return 0;
        if (badgeType === 'openProspects') return openProspectsCount;
        if (badgeType === 'unverifiedPayments') return unverifiedPaymentsCount;
        return 0;
    };

    return (
        <>
            {/* "More" Drawer Overlay */}
            {isMoreOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
                    onClick={() => setIsMoreOpen(false)}
                />
            )}

            {/* "More" Drawer Content */}
            <div className={clsx(
                "fixed bottom-0 left-0 right-0 z-[51] bg-[#0f0f0f] border-t border-red-900/30 rounded-t-3xl transition-transform duration-300 lg:hidden max-h-[85vh] overflow-y-auto pb-safe",
                isMoreOpen ? "translate-y-0" : "translate-y-full"
            )}>
                <div className="p-2 flex justify-center sticky top-0 bg-[#0f0f0f] z-10 border-b border-red-900/10">
                    <div className="w-12 h-1 bg-gray-700/50 rounded-full" />
                </div>

                <div className="p-6 space-y-6">
                    {/* User Profile in Drawer */}
                    <div className="flex items-center gap-3 p-3 bg-red-900/10 rounded-xl border border-red-900/20">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center font-bold text-white shadow-lg">
                            {user?.full_name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                            <div className="font-medium text-white">{user?.full_name}</div>
                            <div className="text-xs text-red-400 opacity-80">{user?.role?.replace('_', ' ')}</div>
                        </div>
                        <button onClick={logout} className="p-2 text-gray-400 hover:text-red-500">
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Menu Items */}
                    <div className="grid grid-cols-2 gap-3">
                        {moreMenuItems.map((item) => {
                            const badgeCount = getBadgeCount(item.badge);
                            const showBadge = badgeCount > 0;

                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    onClick={() => setIsMoreOpen(false)}
                                    className={clsx(
                                        "flex flex-col items-center justify-center p-4 rounded-xl border transition-all relative",
                                        pathname.startsWith(item.href)
                                            ? "bg-red-900/20 border-red-600/50 text-red-400"
                                            : "bg-gray-900/50 border-gray-800 text-gray-400 hover:bg-gray-800"
                                    )}
                                >
                                    {showBadge && (
                                        <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[10px] font-bold bg-orange-500 text-white rounded-full">
                                            {badgeCount}
                                        </span>
                                    )}
                                    <item.icon className="w-6 h-6 mb-2" />
                                    <span className="text-xs text-center font-medium">{item.name}</span>
                                </Link>
                            );
                        })}
                    </div>

                    <button
                        onClick={() => setIsMoreOpen(false)}
                        className="w-full py-3 text-center text-gray-500 font-medium"
                    >
                        Close Menu
                    </button>
                </div>
            </div>

            {/* Bottom Navigation Bar */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-red-900/30 pb-safe">
                <nav className="flex items-center justify-around h-16 px-1">
                    {bottomNavItems.map((item) => {
                        const isActive = pathname.startsWith(item.href);
                        const badgeCount = getBadgeCount(item.badge);
                        const showBadge = badgeCount > 0;

                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={clsx(
                                    'flex flex-col items-center justify-center w-full h-full space-y-1 relative',
                                    isActive ? 'text-red-500' : 'text-gray-500'
                                )}
                            >
                                {showBadge && (
                                    <span className="absolute top-1 right-2 px-1.5 py-0.5 text-[9px] font-bold bg-orange-500 text-white rounded-full min-w-[16px] text-center">
                                        {badgeCount}
                                    </span>
                                )}
                                <div className={clsx(
                                    "p-1.5 rounded-xl transition-all duration-200",
                                    isActive ? "bg-red-900/20" : "bg-transparent"
                                )}>
                                    <item.icon className={clsx("w-5 h-5", isActive && "stroke-[2.5]")} />
                                </div>
                                <span className="text-[10px] font-medium">{item.name}</span>
                            </Link>
                        );
                    })}

                    {/* More Button */}
                    <button
                        onClick={() => setIsMoreOpen(true)}
                        className={clsx(
                            'flex flex-col items-center justify-center w-full h-full space-y-1',
                            isMoreOpen ? 'text-red-500' : 'text-gray-500'
                        )}
                    >
                        <div className={clsx(
                            "p-1.5 rounded-xl transition-all duration-200",
                            isMoreOpen ? "bg-red-900/20" : "bg-transparent"
                        )}>
                            <Menu className={clsx("w-5 h-5", isMoreOpen && "stroke-[2.5]")} />
                        </div>
                        <span className="text-[10px] font-medium">More</span>
                    </button>
                </nav>
            </div>
        </>
    );
}
