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

            {/* Wallpaper background — same as landing page */}
            <div className="absolute inset-0 z-0">
                <Image
                    src="/allstar-wallpaper.png"
                    alt="Allstar Tech Background"
                    fill
                    className="object-cover object-center opacity-35"
                    priority
                />
                {/* Directional overlays for readability */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#050505]/80 via-[#050505]/60 to-[#050505]/80" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-[#050505]/70" />
            </div>

            <NetworkBackground />

            <div className="relative z-10 w-full max-w-md p-6">
                <div className="text-center mb-8">
                    {/* Logo with circular ring style matching landing page */}
                    <div className="relative w-28 h-28 mx-auto mb-5">
                        <div className="absolute inset-0 rounded-full bg-red-600/20 blur-xl scale-110 animate-pulse" />
                        <div
                            className="w-full h-full rounded-full p-[2px]"
                            style={{ background: 'conic-gradient(from 180deg, #dc2626, #7f1d1d, #dc2626)' }}
                        >
                            <div className="w-full h-full rounded-full bg-[#0a0a0a] flex items-center justify-center p-2">
                                <Image
                                    src="/logo/allstars.png"
                                    alt="ALLSTAR Systems Logo"
                                    width={90}
                                    height={90}
                                    className="object-contain drop-shadow-[0_0_10px_rgba(220,38,38,0.5)]"
                                    priority
                                />
                            </div>
                        </div>
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
