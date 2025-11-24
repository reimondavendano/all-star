import Sidebar from '@/components/admin/Sidebar';
import TopNav from '@/components/admin/TopNav';
import NetworkBackground from '@/components/admin/NetworkBackground';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-[#050505] grid-bg relative overflow-hidden">
            <div className="scanline-effect" />
            <NetworkBackground />
            <Sidebar />
            <TopNav />
            <main className="pl-64 pt-16 min-h-screen relative z-10">
                <div className="p-6">
                    {children}
                </div>
            </main>
        </div>
    );
}
