'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Activity, Shield, Zap } from 'lucide-react';
import NetworkBackground from '@/components/admin/NetworkBackground';
import SubscribeModal from '@/components/SubscribeModal';
import { toggleTunnel } from '@/app/actions/system';
import ConfirmationDialog from '@/components/shared/ConfirmationDialog';
import { getMikrotikData } from '@/app/actions/mikrotik';

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mikrotikStatus, setMikrotikStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Tunnel Control State
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'start' | 'stop' | null>(null);
  const [isLoadingTunnel, setIsLoadingTunnel] = useState(false);

  useEffect(() => {
    // Check Mikrotik Status
    const checkStatus = async () => {
      try {
        const result = await getMikrotikData();
        if (result.success) {
          setMikrotikStatus('online');
        } else {
          setMikrotikStatus('offline');
        }
      } catch (error) {
        console.error('Failed to check Mikrotik status:', error);
        setMikrotikStatus('offline');
      }
    };

    checkStatus();

    // Poll every 30 seconds
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleStatusClick = () => {
    if (mikrotikStatus === 'online') {
      // It's ON, ask to turn OFF
      setConfirmAction('stop');
      setIsConfirmOpen(true);
    } else {
      // It's OFF (or checking), ask to turn ON
      setConfirmAction('start');
      setIsConfirmOpen(true);
    }
  };

  const handleConfirmToggle = async () => {
    if (!confirmAction) return;

    setIsLoadingTunnel(true);
    try {
      const result = await toggleTunnel(confirmAction);
      if (!result.success) {
        alert(`Failed to ${confirmAction} tunnel: ${result.message}`);
      } else {
        // Optimistic update or just wait for next poll
        // If we started it, we might want to manually trigger a check after a delay
        if (confirmAction === 'start') {
          // wait a bit for tunnel to start then check
          setTimeout(() => {
            // Re-trigger check (cleaner way would be to extract checkStatus)
            getMikrotikData().then(res => setMikrotikStatus(res.success ? 'online' : 'offline'));
          }, 5000);
        } else {
          setMikrotikStatus('offline');
        }
      }
    } catch (error) {
      console.error('Tunnel toggle error:', error);
      alert('An unexpected error occurred.');
    } finally {
      setIsLoadingTunnel(false);
      setIsConfirmOpen(false);
      setConfirmAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center relative overflow-hidden grid-bg">
      <div className="scanline-effect" />
      <NetworkBackground />

      <div className="relative z-10 text-center max-w-4xl px-6">
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className="inline-flex items-center px-3 py-1 rounded-full border border-red-500/30 bg-red-900/10 text-red-400 text-xs font-mono animate-pulse-slow">
            <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
            SYSTEM STATUS: ONLINE
          </div>

          <button
            onClick={handleStatusClick}
            className={`inline-flex items-center px-3 py-1 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${mikrotikStatus === 'online' ? 'border-green-500/30 bg-green-900/10 text-green-400' :
              mikrotikStatus === 'offline' ? 'border-red-500/30 bg-red-900/10 text-red-500' :
                'border-yellow-500/30 bg-yellow-900/10 text-yellow-500'
              } text-xs font-mono animate-pulse-slow`}
          >
            <span className={`w-2 h-2 rounded-full mr-2 animate-pulse ${mikrotikStatus === 'online' ? 'bg-green-500' :
              mikrotikStatus === 'offline' ? 'bg-red-500' :
                'bg-yellow-500'
              }`}></span>
            MIKROTIK: {mikrotikStatus.toUpperCase()}
          </button>
        </div>

        <div className="relative w-48 h-24 mb-8 bg-white/90 rounded-lg p-3 shadow-[0_0_20px_rgba(255,0,0,0.4)] mx-auto">
          <Image
            src="/logo/allstars.png"
            alt="ALLSTAR Systems Logo"
            fill
            className="object-contain"
            priority
          />
        </div>

        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight neon-text">
          <span className="text-red-600">ALLSTAR</span> TECH
        </h1>

        <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
          Next-Generation <span className="text-red-500">Fiber Internet Service Provider</span>.
          Lightning-fast connectivity with <span className="text-white font-semibold">99.9% uptime</span> and technical support.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-16">
          <button
            onClick={() => setIsModalOpen(true)}
            className="group relative px-8 py-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all overflow-hidden shadow-[0_0_20px_rgba(255,0,0,0.3)] hover:shadow-[0_0_30px_rgba(255,0,0,0.5)]"
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            <span className="relative flex items-center">
              Subscribe Now
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="tech-card p-6 rounded-xl group hover:border-red-500/50 transition-colors">
            <Activity className="w-8 h-8 text-red-500 mb-4 group-hover:animate-pulse" />
            <h3 className="text-lg font-bold text-white mb-2">Ultra-Fast Speeds</h3>
            <p className="text-sm text-gray-400">Experience blazing-fast fiber internet up to 1Gbps. Perfect for streaming, gaming, and remote work.</p>
          </div>
          <div className="tech-card p-6 rounded-xl group hover:border-red-500/50 transition-colors">
            <Shield className="w-8 h-8 text-red-500 mb-4 group-hover:animate-pulse" />
            <h3 className="text-lg font-bold text-white mb-2">Reliable Connection</h3>
            <p className="text-sm text-gray-400">99.9% uptime guarantee with redundant infrastructure and automatic failover protection.</p>
          </div>
          <div className="tech-card p-6 rounded-xl group hover:border-red-500/50 transition-colors">
            <Zap className="w-8 h-8 text-red-500 mb-4 group-hover:animate-pulse" />
            <h3 className="text-lg font-bold text-white mb-2">Technical Support</h3>
            <p className="text-sm text-gray-400">Round-the-clock technical assistance and instant activation for seamless connectivity.</p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#050505] to-transparent pointer-events-none" />

      <SubscribeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      <ConfirmationDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmToggle}
        title={confirmAction === 'start' ? 'Start Remote Connection?' : 'Stop Remote Connection?'}
        message={confirmAction === 'start'
          ? 'Are you sure you want to open the MikroTik remote connection tunnel? A separate window will open to handle the connection process. This window is normal and necessary for the tunnel to function.'
          : 'Are you sure you want to close the MikroTik remote connection tunnel? Use this only if you are done managing the router.'}
        confirmText={confirmAction === 'start' ? 'Start Connection' : 'Stop Connection'}
        type={confirmAction === 'start' ? 'info' : 'warning'}
        isLoading={isLoadingTunnel}
      />
    </div>
  );
}
