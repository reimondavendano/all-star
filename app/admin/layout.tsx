'use client';

import { useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import TopNav from '@/components/admin/TopNav';
import NetworkBackground from '@/components/admin/NetworkBackground';

import AdminMobileNav from '@/components/admin/AdminMobileNav';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[#050505] grid-bg relative overflow-hidden">
            <div className="scanline-effect" />
            <NetworkBackground />

            {/* Desktop Sidebar */}
            <div className="hidden lg:block">
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
            </div>

            <TopNav onMenuClick={() => setIsSidebarOpen(true)} />

            <main className="lg:pl-64 pt-16 pb-20 lg:pb-0 min-h-screen relative z-10">
                <div className="p-4 lg:p-6">
                    {children}
                </div>
            </main>

            {/* Mobile Bottom Nav */}
            <AdminMobileNav />
        </div>
    );
}
