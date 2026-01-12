'use client';

import Image from 'next/image';
import { LogOut, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function CollectorMobileHeader() {
    const { logout, user } = useAuth();

    return (
        <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-purple-900/30 px-4 h-16 flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
                <div className="relative w-8 h-8">
                    <Image
                        src="/logo/allstars.png"
                        alt="Logo"
                        fill
                        className="object-contain"
                    />
                </div>
                <span className="font-bold text-white tracking-wide">AllStar</span>
            </div>

            {/* Profile & Logout */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-2 py-1 bg-gray-900/50 rounded-lg border border-gray-800">
                    <User className="w-4 h-4 text-purple-400" />
                    <span className="text-xs text-white font-medium max-w-[80px] truncate">
                        {user?.full_name?.split(' ')[0] || 'Collector'}
                    </span>
                </div>
                <button
                    onClick={logout}
                    className="p-2 text-gray-400 hover:text-white bg-gray-900/50 hover:bg-red-900/20 hover:text-red-400 rounded-lg border border-gray-800 transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
