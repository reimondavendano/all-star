'use client';

import { useState } from 'react';
import CollectorSidebar from '@/components/collector/CollectorSidebar';
import { Menu } from 'lucide-react';

export default function CollectorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[#050505]">
            {/* Mobile Header */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-purple-900/30 p-4">
                <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-purple-900/20 rounded-lg transition-colors"
                >
                    <Menu className="w-6 h-6" />
                </button>
            </div>

            {/* Sidebar */}
            <CollectorSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main Content */}
            <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0">
                <div className="p-6">
                    {children}
                </div>
            </main>
        </div>
    );
}
