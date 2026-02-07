'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Users, MapPin, CheckCircle, DollarSign } from 'lucide-react';
import clsx from 'clsx';

const navigation = [
    { name: 'Invoices', href: '/collector/invoices', icon: FileText },
    { name: 'Verification', href: '/collector/verification', icon: CheckCircle },
    { name: 'Expenses', href: '/collector/expenses', icon: DollarSign },
    { name: 'Customers', href: '/collector/customers', icon: Users },
    { name: 'Locations', href: '/collector/locations', icon: MapPin },
];

export default function CollectorMobileNav() {
    const pathname = usePathname();

    return (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-purple-900/30 pb-safe">
            <nav className="flex items-center justify-around h-16 px-2">
                {navigation.map((item) => {
                    const isActive = pathname.startsWith(item.href);
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
                                "p-1.5 rounded-xl transition-all duration-200",
                                isActive ? "bg-purple-900/30" : "bg-transparent"
                            )}>
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
