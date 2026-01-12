'use client';

import Link from 'next/link';
import { usePathname, useParams, useRouter } from 'next/navigation';
import { Home, User, CreditCard, LogOut, Wifi } from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function CustomerNav() {
    const pathname = usePathname();
    const params = useParams();
    const router = useRouter();
    const id = params?.id as string;
    const [initials, setInitials] = useState('..');

    useEffect(() => {
        const fetchCustomer = async () => {
            if (!id) return;
            const { data } = await supabase
                .from('customers')
                .select('name')
                .eq('id', id)
                .single();

            if (data?.name) {
                const nameParts = data.name.split(' ');
                if (nameParts.length >= 2) {
                    setInitials(`${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase());
                } else {
                    setInitials(data.name.substring(0, 2).toUpperCase());
                }
            }
        };

        fetchCustomer();
    }, [id]);

    const basePath = id ? `/portal/${id}` : '/portal';

    const navigation = [
        { name: 'Dashboard', href: basePath, icon: Home },
        { name: 'Profile', href: `${basePath}/profile`, icon: User },
        { name: 'Payments', href: `${basePath}/payments`, icon: CreditCard },
    ];

    return (
        <nav className="bg-gradient-to-b from-[#0a0a0a]/95 to-[#050505]/95 backdrop-blur-xl border-b border-purple-900/30 fixed w-full z-50 top-0">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <h1 className="text-2xl font-bold text-white tracking-wider">
                                <span className="bg-gradient-to-r from-violet-500 to-purple-500 bg-clip-text text-transparent">ALLSTAR</span>
                            </h1>
                        </div>
                        <div className="hidden md:block">
                            <div className="ml-10 flex items-baseline space-x-2">
                                {navigation.map((item) => {
                                    const isActive = pathname === item.href;
                                    return (
                                        <Link
                                            key={item.name}
                                            href={item.href}
                                            className={clsx(
                                                'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                                                isActive
                                                    ? 'text-white bg-gradient-to-r from-violet-600 to-purple-600 shadow-lg shadow-purple-900/30'
                                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                            )}
                                        >
                                            <item.icon className="w-4 h-4 inline-block mr-2" />
                                            {item.name}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="hidden md:block">
                        <div className="ml-4 flex items-center md:ml-6 gap-3">
                            <div className="flex items-center px-3 py-1.5 bg-emerald-900/30 border border-emerald-700/50 rounded-full text-xs text-emerald-400">
                                <Wifi className="w-3 h-3 mr-1.5" />
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse mr-1.5"></span>
                                CONNECTED
                            </div>
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg shadow-purple-900/30 text-xs">
                                {initials}
                            </div>
                            <button
                                onClick={() => router.push('/login')}
                                className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                                title="Logout"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Mobile menu */}
                    <div className="md:hidden flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                            {initials}
                        </div>
                    </div>
                </div>

                {/* Mobile Navigation - Removed (Moved to Bottom Nav) */}
                <div className="md:hidden pb-3"></div>
            </div>
        </nav>
    );
}
