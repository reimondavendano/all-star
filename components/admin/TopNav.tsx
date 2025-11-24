'use client';

import { Search, Bell, Menu } from 'lucide-react';

export default function TopNav() {
    return (
        <div className="h-16 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-red-900/30 flex items-center justify-between px-6 fixed top-0 right-0 left-64 z-40 tech-border">
            <div className="flex items-center">
                <button className="md:hidden mr-4 text-gray-400 hover:text-white">
                    <Menu className="w-6 h-6" />
                </button>
                <div className="relative group">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 group-hover:text-red-500 transition-colors" />
                    <input
                        type="text"
                        placeholder="Search system..."
                        className="bg-black/50 border border-gray-800 rounded-none pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-red-500 w-64 transition-all duration-300 focus:w-80 focus:shadow-[0_0_10px_rgba(255,0,0,0.2)]"
                    />
                    <div className="absolute bottom-0 left-0 w-0 h-[1px] bg-red-500 transition-all duration-300 group-focus-within:w-full" />
                </div>
            </div>

            <div className="flex items-center space-x-4">
                <div className="flex items-center px-3 py-1 bg-red-900/10 border border-red-900/30 rounded text-xs text-red-400">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2"></span>
                    SYSTEM ONLINE
                </div>
                <button className="relative text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded">
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_5px_#ff0000]"></span>
                </button>
            </div>
        </div>
    );
}
