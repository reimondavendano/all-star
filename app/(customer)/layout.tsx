import CustomerNav from '@/components/customer/CustomerNav';
import NetworkBackground from '@/components/admin/NetworkBackground';

export default function CustomerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-[#050505] grid-bg relative overflow-hidden">
            <div className="scanline-effect" />
            <NetworkBackground />
            <CustomerNav />
            <main className="pt-24 pb-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
                {children}
            </main>
        </div>
    );
}
