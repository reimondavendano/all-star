'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, User, CreditCard, LogOut } from 'lucide-react';
import clsx from 'clsx';

const navigation = [
    { name: 'Dashboard', href: '/portal', icon: Home },
    { name: 'Profile', href: '/portal/profile', icon: User },
    { name: 'Payments', href: '/portal/payments', icon: CreditCard },
];

export default function CustomerNav() {
    const pathname = usePathname();

    return (
        <nav className="bg-[#0a0a0a]/80 backdrop-blur-md border-b border-red-900/30 fixed w-full z-50 top-0 tech-border">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <h1 className="text-2xl font-bold text-white tracking-wider neon-text">
                                <span className="text-red-600">ALLSTAR</span>
                            </h1>
                        </div>
                        <div className="hidden md:block">
                            <div className="ml-10 flex items-baseline space-x-4">
                                {navigation.map((item) => {
                                    const isActive = pathname === item.href;
                                    return (
                                        <Link
                                            key={item.name}
                                            href={item.href}
                                            className={clsx(
                                                'px-3 py-2 rounded-md text-sm font-medium transition-all duration-300 relative overflow-hidden group',
                                                isActive
                                                    ? 'text-red-500 bg-red-900/10 border border-red-500/30 shadow-[0_0_10px_rgba(255,0,0,0.2)]'
                                                    : 'text-gray-400 hover:text-white hover:bg-white/5 hover:border hover:border-red-500/20 border border-transparent'
                                            )}
                                        >
                                            <item.icon className={clsx("w-4 h-4 inline-block mr-2 transition-transform duration-300 group-hover:scale-110", isActive && "animate-pulse")} />
                                            {item.name}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="hidden md:block">
                        <div className="ml-4 flex items-center md:ml-6">
                            <div className="flex items-center px-3 py-1 bg-red-900/10 border border-red-900/30 rounded text-xs text-red-400 mr-4">
                                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2"></span>
                                CONNECTED
                            </div>
                            <button className="bg-white/5 p-1 rounded-full text-gray-400 hover:text-white focus:outline-none border border-transparent hover:border-red-500/30 transition-all">
                                <span className="sr-only">View notifications</span>
                                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-red-600 to-red-900 flex items-center justify-center text-white font-bold shadow-[0_0_10px_rgba(255,0,0,0.4)]">
                                    JD
                                </div>
                            </button>
                            <button className="ml-3 text-gray-400 hover:text-red-500 transition-colors">
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}
