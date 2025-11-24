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
    Receipt
} from 'lucide-react';
import clsx from 'clsx';

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
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <div className="flex flex-col w-64 bg-[#0a0a0a]/90 backdrop-blur-xl border-r border-red-900/30 h-screen fixed left-0 top-0 overflow-y-auto z-50 tech-border">
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
                <div className="flex items-center p-2 rounded-lg border border-transparent hover:border-red-900/30 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-red-600 to-red-900 flex items-center justify-center shadow-[0_0_10px_rgba(255,0,0,0.4)]">
                        <span className="text-xs font-bold text-white">AD</span>
                    </div>
                    <div className="ml-3">
                        <p className="text-sm font-medium text-white neon-text">Admin User</p>
                        <p className="text-xs text-red-400">System Operator</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
