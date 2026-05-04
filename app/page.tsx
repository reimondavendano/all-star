'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Activity, Shield, Zap, ChevronRight } from 'lucide-react';
import NetworkBackground from '@/components/admin/NetworkBackground';
import SubscribeModal from '@/components/SubscribeModal';
import { toggleTunnel } from '@/app/actions/system';
import ConfirmationDialog from '@/components/shared/ConfirmationDialog';
import { getMikrotikData } from '@/app/actions/mikrotik';

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mikrotikStatus, setMikrotikStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [mounted, setMounted] = useState(false);

  // Tunnel Control State
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'start' | 'stop' | null>(null);
  const [isLoadingTunnel, setIsLoadingTunnel] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkStatus = async () => {
      try {
        const result = await getMikrotikData();
        setMikrotikStatus(result.success ? 'online' : 'offline');
      } catch {
        setMikrotikStatus('offline');
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleStatusClick = () => {
    setConfirmAction(mikrotikStatus === 'online' ? 'stop' : 'start');
    setIsConfirmOpen(true);
  };

  const handleConfirmToggle = async () => {
    if (!confirmAction) return;
    setIsLoadingTunnel(true);
    try {
      const result = await toggleTunnel(confirmAction);
      if (!result.success) {
        alert(`Failed to ${confirmAction} tunnel: ${result.message}`);
      } else {
        if (confirmAction === 'start') {
          setTimeout(() => {
            getMikrotikData().then(res => setMikrotikStatus(res.success ? 'online' : 'offline'));
          }, 5000);
        } else {
          setMikrotikStatus('offline');
        }
      }
    } catch {
      alert('An unexpected error occurred.');
    } finally {
      setIsLoadingTunnel(false);
      setIsConfirmOpen(false);
      setConfirmAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col relative overflow-hidden">

      {/* Full-screen wallpaper background */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/allstar-wallpaper.png"
          alt="Allstar Tech Background"
          fill
          className="object-cover object-center opacity-40"
          priority
        />
        {/* Dark overlay gradient for readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-[#050505]/60" />
      </div>

      <NetworkBackground />



      {/* Hero Section — two column layout */}
      <div className="relative z-10 flex-1 flex items-center">
        <div className="max-w-7xl mx-auto w-full px-6 py-16 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          {/* LEFT: Text content */}
          <div className={`transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600/10 border border-red-600/30 text-red-400 text-xs font-semibold tracking-wider mb-6">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              NEXT-GEN FIBER INTERNET
            </div>

            {/* Main headline */}
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-white mb-4 leading-none tracking-tight">
              <span
                className="text-transparent bg-clip-text"
                style={{ backgroundImage: 'linear-gradient(135deg, #ef4444 0%, #dc2626 40%, #ffffff 100%)' }}
              >
                ALLSTAR
              </span>
              <br />
              <span className="text-white">TECH</span>
            </h1>

            <p className="text-lg text-gray-400 mb-8 max-w-lg leading-relaxed">
              Lightning-fast fiber connectivity built for homes and businesses.{' '}
              <span className="text-white font-semibold">99.9% uptime</span> guaranteed with
              round-the-clock technical support.
            </p>

            {/* CTA Button */}
            <div className="flex flex-wrap items-center gap-4 mb-12">
              <button
                onClick={() => setIsModalOpen(true)}
                className="group relative px-8 py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-base transition-all shadow-[0_0_30px_rgba(220,38,38,0.4)] hover:shadow-[0_0_50px_rgba(220,38,38,0.6)] flex items-center gap-2 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-white/10 to-red-500/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <span className="relative">Subscribe Now</span>
                <ChevronRight className="relative w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-8">
              {[
                { value: '99.9%', label: 'Uptime' },
                { value: '1Gbps', label: 'Max Speed' },
                { value: '24/7', label: 'Support' },
              ].map(stat => (
                <div key={stat.label}>
                  <div className="text-2xl font-black text-white">{stat.value}</div>
                  <div className="text-xs text-gray-500 font-mono tracking-wider">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Logo + glowing ring */}
          <div className={`flex flex-col items-center justify-center transition-all duration-1000 delay-200 ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
            <div className="relative">
              {/* Outer glow rings */}
              <div className="absolute inset-0 rounded-full bg-red-600/20 blur-3xl scale-125 animate-pulse" />
              <div className="absolute inset-0 rounded-full border border-red-600/20 scale-110 animate-ping" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-0 rounded-full border border-red-600/10 scale-125" />

              {/* Logo container */}
              <div className="relative w-72 h-72 md:w-80 md:h-80 rounded-full p-1"
                style={{ background: 'conic-gradient(from 180deg, #dc2626, #7f1d1d, #dc2626)' }}
              >
                <div className="w-full h-full rounded-full bg-[#0a0a0a] flex items-center justify-center p-6 shadow-[inset_0_0_40px_rgba(0,0,0,0.8)]">
                  <Image
                    src="/logo/allstars.png"
                    alt="ALLSTAR Tech Logo"
                    width={260}
                    height={260}
                    className="object-contain drop-shadow-[0_0_20px_rgba(220,38,38,0.5)]"
                    priority
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="relative z-10 max-w-7xl mx-auto w-full px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: <Activity className="w-6 h-6 text-red-500" />,
              title: 'Ultra-Fast Speeds',
              desc: 'Blazing-fast fiber internet up to 1Gbps. Perfect for streaming, gaming, and remote work.',
            },
            {
              icon: <Shield className="w-6 h-6 text-red-500" />,
              title: 'Reliable Connection',
              desc: '99.9% uptime guarantee with redundant infrastructure and automatic failover protection.',
            },
            {
              icon: <Zap className="w-6 h-6 text-red-500" />,
              title: 'Technical Support',
              desc: 'Round-the-clock technical assistance and instant activation for seamless connectivity.',
            },
          ].map(feature => (
            <div
              key={feature.title}
              className="group p-6 rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-md hover:border-red-500/30 hover:bg-white/[0.06] transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-xl bg-red-600/10 border border-red-600/20 flex items-center justify-center mb-4 group-hover:bg-red-600/20 transition-colors">
                {feature.icon}
              </div>
              <h3 className="text-base font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#050505] to-transparent pointer-events-none z-10" />

      <SubscribeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      <ConfirmationDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmToggle}
        title={confirmAction === 'start' ? 'Start Remote Connection?' : 'Stop Remote Connection?'}
        message={
          confirmAction === 'start'
            ? 'Are you sure you want to open the MikroTik remote connection tunnel? A separate window will open to handle the connection process.'
            : 'Are you sure you want to close the MikroTik remote connection tunnel?'
        }
        confirmText={confirmAction === 'start' ? 'Start Connection' : 'Stop Connection'}
        type={confirmAction === 'start' ? 'info' : 'warning'}
        isLoading={isLoadingTunnel}
      />
    </div>
  );
}
