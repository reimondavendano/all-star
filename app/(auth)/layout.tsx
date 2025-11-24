import Image from 'next/image';
import NetworkBackground from '@/components/admin/NetworkBackground';

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#050505] relative overflow-hidden grid-bg">
            <div className="scanline-effect" />
            <NetworkBackground />
            <div className="relative z-10 w-full max-w-md p-6">
                <div className="text-center mb-8">
                    <div className="relative w-48 h-24 mb-6 bg-white/90 rounded-lg p-3 shadow-[0_0_20px_rgba(255,0,0,0.4)] mx-auto">
                        <Image
                            src="/logo/allstars.png"
                            alt="ALLSTAR Systems Logo"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                    <div className="inline-flex items-center px-3 py-1 rounded-full border border-red-500/30 bg-red-900/10 text-red-400 text-xs font-mono">
                        <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
                        ADMIN ACCESS PORTAL
                    </div>
                </div>
                {children}
            </div>
        </div>
    );
}
