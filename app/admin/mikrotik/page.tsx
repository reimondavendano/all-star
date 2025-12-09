'use client';

import { useState, useEffect, useRef } from 'react';
import { getMikrotikData } from '@/app/actions/mikrotik';
import {
    Server,
    Activity,
    Cpu,
    HardDrive,
    Clock,
    Wifi,
    Network,
    AlertCircle,
    RefreshCw,
    Smartphone,
    Users,
    Zap,
    Globe
} from 'lucide-react';

interface MikrotikData {
    resources: any;
    interfaces: any[];
    leases: any[];
    hotspotUsers: any[];
    activeUsers: any[];
    pppInterfaces: any[];
}

export default function MikrotikPage() {
    const [data, setData] = useState<MikrotikData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const isFetchingRef = useRef(false);

    const fetchData = async () => {
        // Prevent duplicate fetches
        if (isFetchingRef.current) {
            console.log('Fetch already in progress, skipping...');
            return;
        }

        isFetchingRef.current = true;
        setIsLoading(true);
        setError('');

        try {
            console.log('Fetching Mikrotik data...');
            const result = await getMikrotikData();

            if (result.success && result.data) {
                setData(result.data);
                setLastUpdated(new Date());
                console.log('Mikrotik data loaded successfully');
            } else {
                setError(result.error || 'Failed to fetch data');
            }
        } catch (err) {
            console.error(err);
            setError('An unexpected error occurred');
        } finally {
            setIsLoading(false);
            isFetchingRef.current = false;
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const formatUptime = (uptime: string) => {
        // Mikrotik uptime format can vary, usually like "2w3d4h5m6s"
        return uptime || '-';
    };

    const formatBytes = (bytes: number) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (isLoading && !data) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white neon-text flex items-center gap-3">
                        <Server className="w-8 h-8 text-red-500" />
                        Mikrotik Router
                    </h1>
                    <p className="text-gray-400 text-sm mt-1 font-mono">
                        System Status & Network Overview
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    {lastUpdated && (
                        <span className="text-xs text-gray-500 font-mono hidden md:block">
                            Last updated: {lastUpdated.toLocaleTimeString()}
                        </span>
                    )}
                    <button
                        onClick={fetchData}
                        disabled={isLoading}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {error ? (
                <div className="tech-card p-8 text-center rounded-xl border border-red-500/30 bg-red-900/10">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">Connection Failed</h3>
                    <p className="text-gray-400 mb-4">{error}</p>
                    <p className="text-sm text-gray-500 font-mono">
                        Please check your MIKROTIK_HOST, MIKROTIK_USER, and MIKROTIK_PASSWORD environment variables.
                    </p>
                </div>
            ) : data ? (
                <>
                    {/* System Resources Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="tech-card p-6 rounded-xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-gray-400 text-xs font-mono uppercase">CPU Load</h3>
                                <Cpu className="w-5 h-5 text-red-500" />
                            </div>
                            <p className="text-2xl font-bold text-white neon-text">
                                {data.resources['cpu-load']}%
                            </p>
                            <p className="text-xs text-gray-500 mt-1 font-mono">
                                {data.resources['cpu-count']} Core(s) @ {data.resources['cpu-frequency']}MHz
                            </p>
                        </div>

                        <div className="tech-card p-6 rounded-xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-gray-400 text-xs font-mono uppercase">Memory Usage</h3>
                                <Activity className="w-5 h-5 text-red-500" />
                            </div>
                            <p className="text-2xl font-bold text-white neon-text">
                                {formatBytes(parseInt(data.resources['total-memory']) - parseInt(data.resources['free-memory']))}
                            </p>
                            <p className="text-xs text-gray-500 mt-1 font-mono">
                                of {formatBytes(parseInt(data.resources['total-memory']))} Total
                            </p>
                        </div>

                        <div className="tech-card p-6 rounded-xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-gray-400 text-xs font-mono uppercase">HDD Usage</h3>
                                <HardDrive className="w-5 h-5 text-red-500" />
                            </div>
                            <p className="text-2xl font-bold text-white neon-text">
                                {formatBytes(parseInt(data.resources['total-hdd-space']) - parseInt(data.resources['free-hdd-space']))}
                            </p>
                            <p className="text-xs text-gray-500 mt-1 font-mono">
                                of {formatBytes(parseInt(data.resources['total-hdd-space']))} Total
                            </p>
                        </div>

                        <div className="tech-card p-6 rounded-xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-gray-400 text-xs font-mono uppercase">Uptime</h3>
                                <Clock className="w-5 h-5 text-red-500" />
                            </div>
                            <p className="text-xl font-bold text-white neon-text truncate">
                                {formatUptime(data.resources.uptime)}
                            </p>
                            <p className="text-xs text-gray-500 mt-1 font-mono">
                                Ver: {data.resources.version} ({data.resources['board-name']})
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Interfaces List */}
                        <div className="tech-card p-6 rounded-xl">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Network className="w-5 h-5 text-red-500" />
                                Interfaces
                            </h3>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {data.interfaces.map((iface: any) => (
                                    <div key={iface['.id']} className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-red-500/30 transition-colors">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-medium text-white flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${iface.running === 'true' ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                                                {iface.name}
                                            </span>
                                            <span className="text-xs text-gray-400 font-mono">{iface.type}</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-500 font-mono">
                                            <span>TX: {formatBytes(parseInt(iface['tx-byte']))}</span>
                                            <span>RX: {formatBytes(parseInt(iface['rx-byte']))}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* DHCP Leases */}
                        <div className="tech-card p-6 rounded-xl">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Smartphone className="w-5 h-5 text-red-500" />
                                Active DHCP Leases ({data.leases.length})
                            </h3>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {data.leases.map((lease: any) => (
                                    <div key={lease['.id']} className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-red-500/30 transition-colors">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-medium text-white">
                                                {lease['host-name'] || 'Unknown Device'}
                                            </span>
                                            <span className={`text-xs px-2 py-0.5 rounded ${lease.status === 'bound' ? 'bg-green-900/20 text-green-400' : 'bg-gray-800 text-gray-400'}`}>
                                                {lease.status}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-500 font-mono">
                                            <span>IP: {lease['address']}</span>
                                            <span>MAC: {lease['mac-address']}</span>
                                        </div>
                                    </div>
                                ))}
                                {data.leases.length === 0 && (
                                    <p className="text-gray-500 text-center py-4">No active leases found</p>
                                )}
                            </div>
                        </div>

                        {/* Hotspot Users */}
                        <div className="tech-card p-6 rounded-xl">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Users className="w-5 h-5 text-red-500" />
                                Hotspot Users ({data.hotspotUsers.length})
                            </h3>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {data.hotspotUsers.map((user: any) => (
                                    <div key={user['.id']} className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-red-500/30 transition-colors">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-medium text-white">
                                                {user.name}
                                            </span>
                                            <span className="text-xs text-gray-500 font-mono">
                                                {user.profile}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-500 font-mono">
                                            <span>Up/Down: {formatBytes(parseInt(user['bytes-in'] || 0))}/{formatBytes(parseInt(user['bytes-out'] || 0))}</span>
                                            <span>Limit: {user['limit-uptime'] || 'Unl'}</span>
                                        </div>
                                    </div>
                                ))}
                                {data.hotspotUsers.length === 0 && (
                                    <p className="text-gray-500 text-center py-4">No hotspot users found</p>
                                )}
                            </div>
                        </div>

                        {/* Active Sessions */}
                        <div className="tech-card p-6 rounded-xl">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Zap className="w-5 h-5 text-red-500" />
                                Active Sessions ({data.activeUsers.length})
                            </h3>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {data.activeUsers.map((active: any) => (
                                    <div key={active['.id']} className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-red-500/30 transition-colors">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-medium text-white">
                                                {active.user}
                                            </span>
                                            <span className="text-xs text-green-400 px-2 py-0.5 bg-green-900/20 rounded">
                                                Active
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-500 font-mono">
                                            <span>IP: {active.address}</span>
                                            <span>Time Left: {active['session-time-left'] || 'Unlimited'}</span>
                                        </div>
                                    </div>
                                ))}
                                {data.activeUsers.length === 0 && (
                                    <p className="text-gray-500 text-center py-4">No active sessions</p>
                                )}
                            </div>
                        </div>

                        {/* PPP Interfaces */}
                        <div className="tech-card p-6 rounded-xl lg:col-span-2">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Globe className="w-5 h-5 text-red-500" />
                                PPP Interfaces (Active Clients: {data.pppInterfaces.length})
                            </h3>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar grid grid-cols-1 md:grid-cols-2 gap-4">
                                {data.pppInterfaces.map((ppp: any) => (
                                    <div key={ppp['.id']} className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-red-500/30 transition-colors">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-medium text-white flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${ppp.running === 'true' ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                                                {ppp.name.replace('<pppoe-', '').replace('>', '')}
                                            </span>
                                            <span className="text-xs text-gray-400 font-mono">PPPoE</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-500 font-mono">
                                            <span>TX: {formatBytes(parseInt(ppp['tx-byte'] || 0))}</span>
                                            <span>RX: {formatBytes(parseInt(ppp['rx-byte'] || 0))}</span>
                                        </div>
                                    </div>
                                ))}
                                {data.pppInterfaces.length === 0 && (
                                    <div className="col-span-full text-center">
                                        <p className="text-gray-500 py-4">No PPP interfaces found</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}
