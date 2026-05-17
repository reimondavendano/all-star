'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Users, MapPin, CheckCircle, DollarSign, ArrowUpDown } from 'lucide-react';
import clsx from 'clsx';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { getPendingPlanChangeRequestCount } from '@/app/actions/planChangeRequests';

const navigation = [
    { name: 'Invoices', href: '/collector/invoices', icon: FileText, badge: null },
    { name: 'Verification', href: '/collector/verification', icon: CheckCircle, badge: null },
    { name: 'Expenses', href: '/collector/expenses', icon: DollarSign, badge: null },
    { name: 'Customers', href: '/collector/customers', icon: Users, badge: null },
    { name: 'Requests', href: '/collector/plan-change-requests', icon: ArrowUpDown, badge: 'planChangeRequests' },
    { name: 'Locations', href: '/collector/locations', icon: MapPin, badge: null },
];

export default function CollectorMobileNav() {
    const pathname = usePathname();
    const [planChangeRequestCount, setPlanChangeRequestCount] = useState(0);

    const fetchCounts = useCallback(async () => {
        try {
            const requestsCount = await getPendingPlanChangeRequestCount();
            setPlanChangeRequestCount(requestsCount);
        } catch (error) {
            console.error('Error fetching collector plan-change count:', error);
        }
    }, []);

    useEffect(() => {
        fetchCounts();
    }, [fetchCounts]);

    useEffect(() => {
        window.addEventListener('plan-change-requests:changed', fetchCounts);
        return () => window.removeEventListener('plan-change-requests:changed', fetchCounts);
    }, [fetchCounts]);

    useRealtimeSubscription({
        table: 'plan_changes',
        onAny: fetchCounts
    });

    const getBadgeCount = (badgeType: string | null) => {
        if (badgeType === 'planChangeRequests') return planChangeRequestCount;
        return 0;
    };

    return (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-purple-900/30 pb-safe">
            <nav className="flex items-center justify-around h-16 px-2">
                {navigation.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    const badgeCount = getBadgeCount(item.badge);
                    const showBadge = badgeCount > 0;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={clsx(
                                'flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors',
                                isActive
                                    ? 'text-purple-400'
                                    : 'text-gray-500 hover:text-gray-300'
                            )}
                        >
                            <div className={clsx(
                                "p-1.5 rounded-xl transition-all duration-200 relative",
                                isActive ? "bg-purple-900/30" : "bg-transparent"
                            )}>
                                {showBadge && (
                                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center">
                                        {badgeCount > 9 ? '9+' : badgeCount}
                                    </span>
                                )}
                                <item.icon className={clsx("w-5 h-5", isActive && "stroke-[2.5]")} />
                            </div>
                            <span className="text-[10px] font-medium">{item.name}</span>
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
