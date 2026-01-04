'use client';

import { useState, useEffect, useRef } from 'react';
import { getMikrotikData, addPppSecret, syncMikrotikToDatabase } from '@/app/actions/mikrotik';
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
    Globe,
    Plus,
    X,
    Database,
    ArrowRightLeft,
    ChevronDown,
    ChevronUp,
    Search,
    Edit,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

interface MikrotikData {
    resources: any;
    interfaces: any[];
    leases: any[];
    hotspotUsers: any[];
    activeUsers: any[];
    pppInterfaces: any[];
    pppActive: any[];
    pppSecrets: any[];
    pppProfiles: any[];
    ipAddresses: any[];
}


export default function MikrotikPage() {
    const [data, setData] = useState<MikrotikData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const isFetchingRef = useRef(false);

    // Add User Modal State
    const [showAddPppModal, setShowAddPppModal] = useState(false);
    const [isAddingPpp, setIsAddingPpp] = useState(false);
    const [pppAddError, setPppAddError] = useState('');
    const [pppForm, setPppForm] = useState({
        name: '',
        password: '',
        service: 'any',
        profile: 'default',
        comment: '',
        enabled: true
    });

    // Sync State
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ success: boolean; message?: string; synced?: number; total?: number; errors?: string[] } | null>(null);

    // Expanded PPP items
    const [expandedPpp, setExpandedPpp] = useState<string | null>(null);

    // Search and Pagination State
    const [pppSearchQuery, setPppSearchQuery] = useState('');
    const [pppCurrentPage, setPppCurrentPage] = useState(1);
    const pppItemsPerPage = 20;

    // Edit Modal State
    const [showEditPppModal, setShowEditPppModal] = useState(false);
    const [editingPpp, setEditingPpp] = useState<any>(null);
    const [editPppForm, setEditPppForm] = useState({
        name: '',
        password: '',
        service: 'pppoe',
        profile: '50MBPS',
        comment: '',
        enabled: true
    });

    // Helper to get secret details by name
    const getSecretByName = (name: string) => {
        if (!data?.pppSecrets) return null;
        const cleanName = name.replace('<pppoe-', '').replace('>', '');
        return data.pppSecrets.find((s: any) => s.name === cleanName);
    };

    // Filter and paginate PPP interfaces
    const filteredPppInterfaces = data?.pppInterfaces?.filter((ppp: any) => {
        const cleanName = ppp.name.replace('<pppoe-', '').replace('>', '');
        return cleanName.toLowerCase().includes(pppSearchQuery.toLowerCase());
    }) || [];

    const pppTotalPages = Math.ceil(filteredPppInterfaces.length / pppItemsPerPage);
    const pppStartIndex = (pppCurrentPage - 1) * pppItemsPerPage;
    const paginatedPppInterfaces = filteredPppInterfaces.slice(pppStartIndex, pppStartIndex + pppItemsPerPage);


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

    // Real-time subscription for mikrotik PPP secrets
    useRealtimeSubscription({
        table: 'mikrotik_ppp_secrets',
        onAny: () => {
            console.log('[MikroTik Realtime] PPP secrets changed, refetching...');
            fetchData();
        }
    });

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

    // Handle Add PPP User
    const handleAddPppUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsAddingPpp(true);
        setPppAddError('');

        try {
            const result = await addPppSecret({
                name: pppForm.name,
                password: pppForm.password,
                service: pppForm.service,
                profile: pppForm.profile,
                comment: pppForm.comment
            });

            if (result.success) {
                setShowAddPppModal(false);
                setPppForm({ name: '', password: '', service: 'any', profile: 'default', comment: '', enabled: true });
                fetchData(); // Refresh data
            } else {
                setPppAddError(result.error || 'Failed to add user');
            }
        } catch (err) {
            setPppAddError('An error occurred');
        } finally {
            setIsAddingPpp(false);
        }
    };

    // Handle Sync to Database
    const handleSyncToDatabase = async () => {
        setIsSyncing(true);
        setSyncResult(null);

        try {
            const result = await syncMikrotikToDatabase();
            setSyncResult(result);
        } catch (err) {
            setSyncResult({ success: false, message: 'Sync failed' });
        } finally {
            setIsSyncing(false);
        }
    };

    if (isLoading && !data) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-600 to-rose-600 flex items-center justify-center shadow-lg shadow-red-900/30">
                    <RefreshCw className="w-8 h-8 animate-spin text-white" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Server className="w-6 h-6 text-red-500" />
                            MikroTik Router
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">System status and network overview</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`hidden md:inline-flex items-center px-3 py-1 rounded-full border ${!error
                            ? 'border-green-500/30 bg-green-900/10 text-green-400'
                            : 'border-red-500/30 bg-red-900/10 text-red-500'
                            } text-xs font-mono animate-pulse-slow mr-2`}>
                            <span className={`w-2 h-2 rounded-full mr-2 animate-pulse ${!error ? 'bg-green-500' : 'bg-red-500'
                                }`}></span>
                            {error ? 'OFFLINE' : 'ONLINE'}
                        </div>
                        {lastUpdated && (
                            <span className="text-xs text-gray-500 font-mono hidden md:block">
                                Last updated: {lastUpdated.toLocaleTimeString()}
                            </span>
                        )}
                        <button
                            onClick={handleSyncToDatabase}
                            disabled={isSyncing}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-lg transition-all font-medium shadow-lg shadow-blue-900/30 disabled:opacity-50"
                        >
                            <ArrowRightLeft className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                            Sync to DB
                        </button>
                        <button
                            onClick={() => setShowAddPppModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-lg transition-all font-medium shadow-lg shadow-emerald-900/30"
                        >
                            <Plus className="w-4 h-4" />
                            Add User
                        </button>
                        <button
                            onClick={fetchData}
                            disabled={isLoading}
                            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Sync Result Message */}
            {syncResult && (
                <div className={`p-4 rounded-lg ${syncResult.success ? 'bg-green-900/30 border border-green-500/30' : 'bg-red-900/30 border border-red-500/30'}`}>
                    <p className={`text-sm ${syncResult.success ? 'text-green-400' : 'text-red-400'}`}>
                        {syncResult.success
                            ? `✓ Synced ${syncResult.synced || 0} of ${syncResult.total || 0} PPP secrets to database`
                            : `✗ ${syncResult.message || 'Sync failed'}`}
                    </p>
                    {syncResult.errors && syncResult.errors.length > 0 && (
                        <details className="mt-2">
                            <summary className="text-xs text-yellow-400 cursor-pointer">Show {syncResult.errors.length} warnings</summary>
                            <ul className="mt-1 text-xs text-gray-400 list-disc list-inside">
                                {syncResult.errors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                        </details>
                    )}
                </div>
            )}

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

                        {/* IP Addresses */}
                        <div className="tech-card p-6 rounded-xl">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Globe className="w-5 h-5 text-blue-500" />
                                IP Addresses ({data.ipAddresses?.length || 0})
                            </h3>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {data.ipAddresses && data.ipAddresses.length > 0 ? (
                                    data.ipAddresses.map((ip: any) => (
                                        <div key={ip['.id']} className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-blue-500/30 transition-colors">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-medium text-white font-mono">
                                                    {ip.address}
                                                </span>
                                                <span className={`text-xs px-2 py-0.5 rounded ${ip.disabled === 'true' ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'}`}>
                                                    {ip.disabled === 'true' ? 'Disabled' : 'Active'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-xs text-gray-500 font-mono">
                                                <span>Interface: {ip.interface}</span>
                                                <span>Network: {ip.network || '-'}</span>
                                            </div>
                                            {ip.comment && (
                                                <p className="text-xs text-gray-400 mt-1">{ip.comment}</p>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-gray-500 text-center py-4">No IP addresses found</p>
                                )}
                            </div>
                        </div>


                        {/* PPP Interfaces - Full Width with Search and Pagination */}
                        <div className="tech-card p-6 rounded-xl lg:col-span-2">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <Globe className="w-5 h-5 text-red-500" />
                                    PPP Interfaces (Active: {filteredPppInterfaces.length} / {data.pppInterfaces.length})
                                </h3>
                                {/* Search */}
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                                    <input
                                        type="text"
                                        placeholder="Search username..."
                                        value={pppSearchQuery}
                                        onChange={(e) => {
                                            setPppSearchQuery(e.target.value);
                                            setPppCurrentPage(1);
                                        }}
                                        className="bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-red-500 w-full sm:w-64"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                {paginatedPppInterfaces.map((ppp: any) => {
                                    const pppId = ppp['.id'];
                                    const cleanName = ppp.name.replace('<pppoe-', '').replace('>', '');
                                    const secret = getSecretByName(cleanName);
                                    const isExpanded = expandedPpp === pppId;

                                    return (
                                        <div key={pppId} className="bg-white/5 rounded-lg border border-white/5 hover:border-red-500/30 transition-colors">
                                            {/* Main Row */}
                                            <div
                                                className="p-3 flex items-center justify-between cursor-pointer"
                                                onClick={() => setExpandedPpp(isExpanded ? null : pppId)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className={`w-2 h-2 rounded-full ${ppp.running === 'true' ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                                                    <span className="font-medium text-white">{cleanName}</span>
                                                    <span className="text-xs text-gray-400 font-mono">{secret?.profile || 'PPPoE'}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-xs text-gray-500 font-mono hidden sm:block">
                                                        TX: {formatBytes(parseInt(ppp['tx-byte'] || 0))} | RX: {formatBytes(parseInt(ppp['rx-byte'] || 0))}
                                                    </div>
                                                    {/* Edit Button */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingPpp(ppp);
                                                            setEditPppForm({
                                                                name: cleanName,
                                                                password: secret?.password || '',
                                                                service: secret?.service || 'pppoe',
                                                                profile: secret?.profile || '50MBPS',
                                                                comment: secret?.comment || '',
                                                                enabled: secret?.disabled !== 'true'
                                                            });
                                                            setShowEditPppModal(true);
                                                        }}
                                                        className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition-colors"
                                                        title="Edit PPP Secret"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    {isExpanded ? (
                                                        <ChevronUp className="w-4 h-4 text-gray-400" />
                                                    ) : (
                                                        <ChevronDown className="w-4 h-4 text-gray-400" />
                                                    )}
                                                </div>
                                            </div>

                                            {/* Expanded Details */}
                                            {isExpanded && (
                                                <div className="px-3 pb-3 pt-0 border-t border-white/5">
                                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs mt-3">
                                                        <div>
                                                            <span className="text-gray-500">Profile:</span>
                                                            <p className="text-white font-mono">{secret?.profile || '-'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500">Service:</span>
                                                            <p className="text-white font-mono">{secret?.service || '-'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500">Local Address:</span>
                                                            <p className="text-white font-mono">{secret?.['local-address'] || '-'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500">Caller ID:</span>
                                                            <p className="text-white font-mono">{secret?.['caller-id'] || '-'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500">Password:</span>
                                                            <p className="text-white font-mono">••••••</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500">Enabled:</span>
                                                            <p className={`font-mono ${secret?.disabled === 'true' ? 'text-red-400' : 'text-green-400'}`}>
                                                                {secret?.disabled === 'true' ? 'No' : 'Yes'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {secret?.comment && (
                                                        <p className="text-xs text-gray-400 mt-2">Comment: {secret.comment}</p>
                                                    )}
                                                    <div className="mt-2 pt-2 border-t border-white/5 grid grid-cols-3 gap-3 text-xs">
                                                        <div>
                                                            <span className="text-gray-500">TX:</span>
                                                            <p className="text-white font-mono">{formatBytes(parseInt(ppp['tx-byte'] || 0))}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500">RX:</span>
                                                            <p className="text-white font-mono">{formatBytes(parseInt(ppp['rx-byte'] || 0))}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500">Uptime:</span>
                                                            <p className="text-white font-mono">{ppp.uptime || '-'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {filteredPppInterfaces.length === 0 && (
                                    <div className="text-center py-8">
                                        <p className="text-gray-500">
                                            {pppSearchQuery ? 'No matching users found' : 'No PPP interfaces found'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Pagination */}
                            {pppTotalPages > 1 && (
                                <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                                    <p className="text-xs text-gray-500">
                                        Showing {pppStartIndex + 1}-{Math.min(pppStartIndex + pppItemsPerPage, filteredPppInterfaces.length)} of {filteredPppInterfaces.length}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setPppCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={pppCurrentPage === 1}
                                            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <span className="text-sm text-gray-400">
                                            Page {pppCurrentPage} of {pppTotalPages}
                                        </span>
                                        <button
                                            onClick={() => setPppCurrentPage(prev => Math.min(pppTotalPages, prev + 1))}
                                            disabled={pppCurrentPage === pppTotalPages}
                                            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            ) : null}

            {/* Add PPP User Modal */}
            {showAddPppModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowAddPppModal(false)} />
                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-emerald-900/50 rounded-2xl shadow-[0_0_60px_rgba(16,185,129,0.15)] w-full max-w-md overflow-hidden">
                        <div className="relative p-6 border-b border-gray-800/50">
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/10 via-green-600/10 to-teal-600/10" />
                            <div className="relative flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-900/30">
                                    <Plus className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">Add PPP Secret</h2>
                                    <p className="text-sm text-gray-400">Create a new MikroTik user</p>
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleAddPppUser} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Username</label>
                                <input type="text" required value={pppForm.name} onChange={(e) => setPppForm({ ...pppForm, name: e.target.value })} className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500" placeholder="Enter username" />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Password</label>
                                <input type="text" required value={pppForm.password} onChange={(e) => setPppForm({ ...pppForm, password: e.target.value })} className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500" placeholder="Enter password" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Service</label>
                                    <select value={pppForm.service} onChange={(e) => setPppForm({ ...pppForm, service: e.target.value })} className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500">
                                        <option value="any">any</option>
                                        <option value="pppoe">pppoe</option>
                                        <option value="pptp">pptp</option>
                                        <option value="l2tp">l2tp</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Profile</label>
                                    <select value={pppForm.profile} onChange={(e) => setPppForm({ ...pppForm, profile: e.target.value })} className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500">
                                        <option value="default">default</option>
                                        <option value="50MBPS">50MBPS</option>
                                        <option value="100MBPS">100MBPS</option>
                                        <option value="150MBPS">150MBPS</option>
                                        {data?.pppProfiles?.map((p: any) => (<option key={p['.id']} value={p.name}>{p.name}</option>))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Comment (optional)</label>
                                <input type="text" value={pppForm.comment} onChange={(e) => setPppForm({ ...pppForm, comment: e.target.value })} className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500" placeholder="Optional comment" />
                            </div>
                            {pppAddError && <p className="text-red-400 text-sm">{pppAddError}</p>}
                        </form>

                        <div className="p-6 border-t border-gray-800/50 flex justify-end gap-3">
                            <button onClick={() => setShowAddPppModal(false)} className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium">Cancel</button>
                            <button onClick={(e) => handleAddPppUser(e as any)} disabled={isAddingPpp} className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl font-medium shadow-lg shadow-emerald-900/30 flex items-center gap-2 disabled:opacity-50">
                                {isAddingPpp ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                {isAddingPpp ? 'Adding...' : 'Create Secret'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit PPP User Modal */}
            {showEditPppModal && editingPpp && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-md relative shadow-2xl">
                        <button
                            onClick={() => setShowEditPppModal(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <Edit className="w-5 h-5 text-blue-500" />
                            Edit PPP Secret
                        </h2>

                        <div className="space-y-4">
                            {/* Name (Username) - Read only */}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Name (Username)</label>
                                <input
                                    type="text"
                                    value={editPppForm.name}
                                    readOnly
                                    className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white font-mono opacity-60 cursor-not-allowed"
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                                <input
                                    type="text"
                                    value={editPppForm.password}
                                    onChange={(e) => setEditPppForm({ ...editPppForm, password: e.target.value })}
                                    className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg focus:border-blue-500 focus:outline-none text-white font-mono"
                                    placeholder="Enter new password"
                                />
                            </div>

                            {/* Service */}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Service</label>
                                <select
                                    value={editPppForm.service}
                                    onChange={(e) => setEditPppForm({ ...editPppForm, service: e.target.value })}
                                    className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg focus:border-blue-500 focus:outline-none text-white"
                                >
                                    <option value="any">any</option>
                                    <option value="pppoe">pppoe</option>
                                    <option value="pptp">pptp</option>
                                    <option value="l2tp">l2tp</option>
                                    <option value="ovpn">ovpn</option>
                                    <option value="sstp">sstp</option>
                                </select>
                            </div>

                            {/* Profile */}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Profile</label>
                                <select
                                    value={editPppForm.profile}
                                    onChange={(e) => setEditPppForm({ ...editPppForm, profile: e.target.value })}
                                    className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg focus:border-blue-500 focus:outline-none text-white"
                                >
                                    <option value="default">default</option>
                                    <option value="50MBPS">50MBPS</option>
                                    <option value="50MBPS-2">50MBPS-2</option>
                                    <option value="100MBPS">100MBPS</option>
                                    <option value="100MBPS-2">100MBPS-2</option>
                                    <option value="130MBPS">130MBPS</option>
                                    <option value="150MBPS">150MBPS</option>
                                    {data?.pppProfiles?.map((p: any) => (
                                        <option key={p['.id']} value={p.name}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Comment */}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Comment</label>
                                <input
                                    type="text"
                                    value={editPppForm.comment}
                                    onChange={(e) => setEditPppForm({ ...editPppForm, comment: e.target.value })}
                                    className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg focus:border-blue-500 focus:outline-none text-white"
                                    placeholder="Optional comment"
                                />
                            </div>

                            {/* Enabled */}
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="edit-ppp-enabled"
                                    checked={editPppForm.enabled}
                                    onChange={(e) => setEditPppForm({ ...editPppForm, enabled: e.target.checked })}
                                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                                />
                                <label htmlFor="edit-ppp-enabled" className="text-sm font-medium text-gray-300">Enabled</label>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowEditPppModal(false)}
                                    className="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        // TODO: Implement update PPP secret API call
                                        alert('Edit functionality coming soon! For now, please edit directly in MikroTik WinBox.');
                                        setShowEditPppModal(false);
                                    }}
                                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
