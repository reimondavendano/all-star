'use client';

import { useState } from 'react';
import CollectorSidebar from '@/components/collector/CollectorSidebar';
import CollectorMobileNav from '@/components/collector/CollectorMobileNav';
import CollectorMobileHeader from '@/components/collector/CollectorMobileHeader';
import { Menu } from 'lucide-react';

export default function CollectorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[#050505]">
            {/* Mobile Header (Top) */}
            <CollectorMobileHeader />

            {/* Desktop Sidebar (Left) */}
            <div className="hidden lg:block">
                <CollectorSidebar isOpen={true} />
            </div>

            {/* Main Content */}
            <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0 pb-20 lg:pb-0">
                <div className="p-4 lg:p-6">
                    {children}
                </div>
            </main>

            {/* Mobile Bottom Nav (Bottom) */}
            <CollectorMobileNav />
        </div>
    );
}
