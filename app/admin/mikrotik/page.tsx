'use client';

import { useState, useEffect, useRef } from 'react';
import { getMikrotikData, addPppSecret, syncMikrotikToDatabase, updatePppSecret, togglePppConnection, removeActivePppConnection, removePppSecret } from '@/app/actions/mikrotik';
import { processDisconnection } from '@/app/actions/disconnection';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import {
    Server,
    Activity,
    Cpu,
    HardDrive,
    Clock,
    Wifi,
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

interface LocalPppSecret {
    id: string;
    name: string;
    password?: string;
    service?: string;
    profile?: string;
    enabled?: boolean;
    disabled?: boolean;
    comment?: string;
    customerName?: string;
    customerMobile?: string;
    planName?: string;
    businessUnitName?: string;
    subscriptionId?: string;
    subscriptionActive?: boolean;
    balance?: number;
    label?: string;
    address?: string;
}

type PppStatusFilter = 'all' | 'connected' | 'disconnected' | 'disabled' | 'dc' | 'mismatch';

interface PppConnectionCard {
    key: string;
    name: string;
    secret?: any;
    active?: any;
    local?: LocalPppSecret;
    status: 'connected' | 'disconnected' | 'disabled' | 'dc' | 'router-only' | 'database-only';
}


export default function MikrotikPage() {
    const [data, setData] = useState<MikrotikData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const isFetchingRef = useRef(false);
    const [localPppSecrets, setLocalPppSecrets] = useState<LocalPppSecret[]>([]);

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

    // Migration State
    const [showMigrationModal, setShowMigrationModal] = useState(false);
    const [migrationFile, setMigrationFile] = useState<File | null>(null);
    const [isMigrating, setIsMigrating] = useState(false);
    const [migrationResult, setMigrationResult] = useState<any>(null);
    const [migrationError, setMigrationError] = useState('');
    const [migrationProgress, setMigrationProgress] = useState({ current: 0, total: 0, percentage: 0 });

    // Expanded PPP items
    const [expandedPpp, setExpandedPpp] = useState<string | null>(null);

    // Search and Pagination State
    const [pppSearchQuery, setPppSearchQuery] = useState('');
    const [pppStatusFilter, setPppStatusFilter] = useState<PppStatusFilter>('all');
    const [pppCurrentPage, setPppCurrentPage] = useState(1);
    const pppItemsPerPage = 24;
    const [pppActionLoading, setPppActionLoading] = useState<string | null>(null);
    const [pppActionMessage, setPppActionMessage] = useState<{ success: boolean; message: string } | null>(null);

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

    const normalizePppName = (name: string) => name?.replace('<pppoe-', '').replace('>', '').replace(/\s+/g, '').trim() || '';

    const fetchLocalPppSecrets = async () => {
        const { data: customers, error } = await supabase
            .from('customers')
            .select(`
                id,
                name,
                mobile_number,
                subscriptions!subscriptions_subscriber_id_fkey(
                    id,
                    active,
                    balance,
                    label,
                    address,
                    plans(name, monthly_fee),
                    business_units(name),
                    mikrotik_ppp_secrets(*)
                )
            `)
            .order('name', { ascending: true });

        if (error) {
            console.error('Error fetching local PPP secrets:', error);
            return;
        }

        const flattened: LocalPppSecret[] = [];
        (customers || []).forEach((customer: any) => {
            (customer.subscriptions || []).forEach((subscription: any) => {
                const plan = Array.isArray(subscription.plans) ? subscription.plans[0] : subscription.plans;
                const businessUnit = Array.isArray(subscription.business_units) ? subscription.business_units[0] : subscription.business_units;
                (subscription.mikrotik_ppp_secrets || []).forEach((secret: any) => {
                    flattened.push({
                        ...secret,
                        customerName: customer.name,
                        customerMobile: customer.mobile_number,
                        planName: plan?.name,
                        businessUnitName: businessUnit?.name,
                        subscriptionId: subscription.id,
                        subscriptionActive: subscription.active,
                        balance: subscription.balance,
                        label: subscription.label,
                        address: subscription.address
                    });
                });
            });
        });

        setLocalPppSecrets(flattened);
    };

    // Helper to get secret details by name
    const getSecretByName = (name: string) => {
        if (!data?.pppSecrets) return null;
        const cleanName = normalizePppName(name);
        return data.pppSecrets.find((s: any) => normalizePppName(s.name) === cleanName);
    };

    const buildPppCards = (): PppConnectionCard[] => {
        const cards = new Map<string, PppConnectionCard>();

        (data?.pppSecrets || []).forEach((secret: any) => {
            const name = normalizePppName(secret.name);
            if (!name) return;
            cards.set(name, {
                key: name,
                name,
                secret,
                status: secret.disabled === 'true' ? 'disabled' : secret.profile === 'DC' ? 'dc' : 'disconnected'
            });
        });

        (data?.pppActive || []).forEach((active: any) => {
            const name = normalizePppName(active.name);
            if (!name) return;
            const existing = cards.get(name);
            cards.set(name, {
                ...(existing || { key: name, name, status: 'router-only' as const }),
                active,
                status: existing?.secret?.disabled === 'true' ? 'disabled' : 'connected'
            });
        });

        localPppSecrets.forEach(local => {
            const name = normalizePppName(local.name);
            if (!name) return;
            const existing = cards.get(name);
            if (existing) {
                cards.set(name, {
                    ...existing,
                    local,
                    status: existing.status
                });
            } else {
                cards.set(name, {
                    key: name,
                    name,
                    local,
                    status: local.disabled || local.enabled === false ? 'disabled' : local.profile === 'DC' ? 'dc' : 'database-only'
                });
            }
        });

        return Array.from(cards.values());
    };

    const pppCards = buildPppCards();
    const pppCounts = {
        all: pppCards.length,
        connected: pppCards.filter(card => card.status === 'connected').length,
        disconnected: pppCards.filter(card => card.status === 'disconnected' || card.status === 'database-only').length,
        disabled: pppCards.filter(card => card.status === 'disabled').length,
        dc: pppCards.filter(card => card.status === 'dc').length,
        mismatch: pppCards.filter(card => card.status === 'router-only' || card.status === 'database-only').length
    };

    const filteredPppCards = pppCards
        .filter(card => {
            if (pppStatusFilter === 'mismatch') return card.status === 'router-only' || card.status === 'database-only';
            if (pppStatusFilter !== 'all') return card.status === pppStatusFilter || (pppStatusFilter === 'disconnected' && card.status === 'database-only');
            return true;
        })
        .filter(card => {
            const haystack = [
                card.name,
                card.local?.customerName,
                card.local?.customerMobile,
                card.local?.planName,
                card.local?.businessUnitName,
                card.secret?.profile,
                card.local?.profile
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(pppSearchQuery.toLowerCase());
        })
        .sort((a, b) => {
            const statusWeight = { connected: 0, disconnected: 1, dc: 2, disabled: 3, 'database-only': 4, 'router-only': 5 };
            return statusWeight[a.status] - statusWeight[b.status] || a.name.localeCompare(b.name);
        });

    const pppTotalPages = Math.max(1, Math.ceil(filteredPppCards.length / pppItemsPerPage));
    const pppStartIndex = (pppCurrentPage - 1) * pppItemsPerPage;
    const paginatedPppCards = filteredPppCards.slice(pppStartIndex, pppStartIndex + pppItemsPerPage);
    const filteredPppInterfaces = data?.pppInterfaces?.filter((ppp: any) => {
        const cleanName = normalizePppName(ppp.name);
        return cleanName.toLowerCase().includes(pppSearchQuery.toLowerCase());
    }) || [];
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
            await fetchLocalPppSecrets();
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

    const getPppStatusLabel = (status: PppConnectionCard['status']) => {
        if (status === 'connected') return 'Connected';
        if (status === 'disconnected') return 'Disconnected';
        if (status === 'disabled') return 'Disabled';
        if (status === 'dc') return 'DC Profile';
        if (status === 'router-only') return 'Router Only';
        return 'Database Only';
    };

    const getPppStatusClass = (status: PppConnectionCard['status']) => {
        if (status === 'connected') return 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300';
        if (status === 'disconnected') return 'border-amber-500/40 bg-amber-950/20 text-amber-300';
        if (status === 'disabled' || status === 'dc') return 'border-red-500/40 bg-red-950/20 text-red-300';
        return 'border-sky-500/40 bg-sky-950/20 text-sky-300';
    };

    const openPppEditModal = (card: PppConnectionCard) => {
        const source = card.secret || card.local || {};
        setEditingPpp(card);
        setEditPppForm({
            name: card.name,
            password: source.password || '',
            service: source.service || 'pppoe',
            profile: source.profile || '50MBPS',
            comment: source.comment || '',
            enabled: source.disabled === 'true' || source.disabled === true ? false : source.enabled !== false
        });
        setShowEditPppModal(true);
    };

    const runPppAction = async (key: string, action: () => Promise<any>, successMessage: string) => {
        setPppActionLoading(key);
        setPppActionMessage(null);
        try {
            const result = await action();
            if (result?.success) {
                setPppActionMessage({ success: true, message: successMessage });
                await fetchData();
            } else {
                setPppActionMessage({ success: false, message: result?.error || 'MikroTik action failed' });
            }
        } catch (error: any) {
            setPppActionMessage({ success: false, message: error?.message || 'MikroTik action failed' });
        } finally {
            setPppActionLoading(null);
        }
    };

    const handleDisconnectSession = (card: PppConnectionCard) => {
        if (card.local?.subscriptionId) {
            const confirmed = window.confirm(`Disconnect ${card.local.customerName || card.name}? This will mark the subscription inactive, generate the disconnection invoice, set MikroTik to DC/disabled, and remove the active session.`);
            if (!confirmed) return;

            runPppAction(
                `disconnect-${card.name}`,
                () => processDisconnection(card.local!.subscriptionId!, new Date(), true),
                `${card.local.customerName || card.name} has been disconnected.`
            );
            return;
        }

        const confirmed = window.confirm(`No linked subscription was found for "${card.name}". Remove only the active MikroTik session?`);
        if (!confirmed) return;
        runPppAction(`disconnect-${card.name}`, () => removeActivePppConnection(card.name), `${card.name} active session removed.`);
    };

    const handleTogglePpp = (card: PppConnectionCard, enable: boolean) => {
        const source = card.secret || card.local || {};
        runPppAction(
            `${enable ? 'enable' : 'disable'}-${card.name}`,
            () => togglePppConnection(card.name, enable, enable ? {
                password: source.password || '',
                service: source.service || 'pppoe',
                profile: source.profile || 'default',
                comment: source.comment || ''
            } : undefined),
            `${card.name} ${enable ? 'enabled' : 'disabled'} on MikroTik.`
        );
    };

    const handleSavePppEdit = () => {
        const normalizedName = normalizePppName(editPppForm.name);
        const updates = {
            name: normalizedName,
            password: editPppForm.password,
            service: editPppForm.service,
            profile: editPppForm.profile,
            comment: editPppForm.comment,
            disabled: editPppForm.enabled ? 'false' : 'true'
        };

        runPppAction(
            `edit-${normalizedName}`,
            async () => {
                const result = await updatePppSecret(normalizedName, updates);
                if (!result.success) return result;

                let query = supabase
                    .from('mikrotik_ppp_secrets')
                    .update({
                        name: normalizedName,
                        password: editPppForm.password,
                        service: editPppForm.service,
                        profile: editPppForm.profile,
                        comment: editPppForm.comment,
                        enabled: editPppForm.enabled,
                        disabled: !editPppForm.enabled,
                        last_synced_at: new Date().toISOString()
                    });

                if ((editingPpp as PppConnectionCard)?.local?.id) {
                    query = query.eq('id', (editingPpp as PppConnectionCard).local!.id);
                } else {
                    query = query.eq('name', normalizedName);
                }

                await query;

                return result;
            },
            `${normalizedName} PPP secret updated.`
        );
        setShowEditPppModal(false);
    };

    const handleRemovePppSecret = (card: PppConnectionCard) => {
        const confirmed = window.confirm(`Remove PPP secret "${card.name}" from MikroTik and this system? This cannot be undone.`);
        if (!confirmed) return;

        runPppAction(
            `remove-${card.name}`,
            async () => {
                const result = await removePppSecret(card.name);
                if (!result.success) return result;

                let query = supabase.from('mikrotik_ppp_secrets').delete();
                if (card.local?.id) {
                    query = query.eq('id', card.local.id);
                } else {
                    query = query.eq('name', normalizePppName(card.name));
                }

                await query;

                return result;
            },
            `${card.name} PPP secret removed.`
        );
    };

    // Handle Add PPP User
    const handleAddPppUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsAddingPpp(true);
        setPppAddError('');

        try {
            const normalizedName = normalizePppName(pppForm.name);
            const result = await addPppSecret({
                name: normalizedName,
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

    // Handle Migration
    const handleMigration = async () => {
        if (!migrationFile) {
            setMigrationError('Please select a file');
            return;
        }

        setIsMigrating(true);
        setMigrationError('');
        setMigrationResult(null);

        try {
            const formData = new FormData();
            formData.append('file', migrationFile);

            const response = await fetch('/api/admin/migrate-data', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Migration failed');
            }

            setMigrationResult(result);
            
            // Refresh MikroTik data after successful migration
            fetchData();
        } catch (err) {
            setMigrationError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsMigrating(false);
        }
    };

    // Handle Export to Excel
    const handleExportToExcel = () => {
        if (!data) return;

        try {
            // Prepare Secrets data
            const secretsData = data.pppSecrets.map((secret: any) => ({
                'Name': secret.name || '',
                'Password': secret.password || '',
                'Service': secret.service || '',
                'Profile': secret.profile || '',
                'Caller ID': secret['caller-id'] || '',
                'Local Address': secret['local-address'] || '',
                'Remote Address': secret['remote-address'] || '',
                'Comment': secret.comment || '',
                'Disabled': secret.disabled === 'true' ? 'Yes' : 'No',
                'Last Logged Out': secret['last-logged-out'] || '',
                'Last Caller ID': secret['last-caller-id'] || '',
                'Last Disconnect Reason': secret['last-disconnect-reason'] || ''
            }));

            // Prepare Interfaces data with matching by username
            const interfacesData = data.pppInterfaces.map((iface: any) => {
                const cleanName = iface.name.replace('<pppoe-', '').replace('>', '');
                const secret = getSecretByName(cleanName);
                
                return {
                    'Name': cleanName,
                    'Type': iface.type || '',
                    'Profile': secret?.profile || '',
                    'Running': iface.running === 'true' ? 'Yes' : 'No',
                    'Disabled': iface.disabled === 'true' ? 'Yes' : 'No',
                    'Actual MTU': iface['actual-mtu'] || '',
                    'L2 MTU': iface['l2-mtu'] || '',
                    'TX Bytes': iface['tx-byte'] || '0',
                    'RX Bytes': iface['rx-byte'] || '0',
                    'TX Packets': iface['tx-packet'] || '0',
                    'RX Packets': iface['rx-packet'] || '0',
                    'FP TX Bytes': iface['fp-tx-byte'] || '0',
                    'FP RX Bytes': iface['fp-rx-byte'] || '0',
                    'FP TX Packets': iface['fp-tx-packet'] || '0',
                    'FP RX Packets': iface['fp-rx-packet'] || '0',
                    'Uptime': iface.uptime || '',
                    'Encoding': iface.encoding || '',
                    'Session Uptime': iface['session-uptime'] || '',
                    'Caller ID': iface['caller-id'] || '',
                    'Address': iface.address || '',
                    'Remote Address': iface['remote-address'] || ''
                };
            });

            // Create workbook
            const wb = XLSX.utils.book_new();

            // Add Secrets sheet
            const wsSecrets = XLSX.utils.json_to_sheet(secretsData);
            XLSX.utils.book_append_sheet(wb, wsSecrets, 'PPP Secrets');

            // Add Interfaces sheet
            const wsInterfaces = XLSX.utils.json_to_sheet(interfacesData);
            XLSX.utils.book_append_sheet(wb, wsInterfaces, 'PPP Interfaces');

            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `MikroTik_Export_${timestamp}.xlsx`;

            // Download file
            XLSX.writeFile(wb, filename);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export data to Excel');
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
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto mt-4 md:mt-0 justify-start sm:justify-end">
                        <div className={`hidden md:inline-flex items-center px-3 py-1 rounded-full border ${!error
                            ? 'border-green-500/30 bg-green-900/10 text-green-400'
                            : 'border-red-500/30 bg-red-900/10 text-red-500'
                            } text-[10px] sm:text-xs font-mono animate-pulse-slow mr-1 sm:mr-2`}>
                            <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full mr-1.5 sm:mr-2 animate-pulse ${!error ? 'bg-green-500' : 'bg-red-500'
                                }`}></span>
                            {error ? 'OFFLINE' : 'ONLINE'}
                        </div>
                        {lastUpdated && (
                            <span className="text-[10px] sm:text-xs text-gray-500 font-mono hidden md:block">
                                Last updated: {lastUpdated.toLocaleTimeString()}
                            </span>
                        )}
                        <button
                            onClick={handleExportToExcel}
                            disabled={!data || isLoading}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg transition-all text-xs sm:text-sm font-medium shadow-lg shadow-green-900/30 disabled:opacity-50 whitespace-nowrap min-w-[100px]"
                        >
                            <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span className="hidden lg:inline">Export to Excel</span>
                            <span className="lg:hidden">Export</span>
                        </button>
                        <button
                            onClick={handleSyncToDatabase}
                            disabled={isSyncing}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-lg transition-all text-xs sm:text-sm font-medium shadow-lg shadow-blue-900/30 disabled:opacity-50 whitespace-nowrap min-w-[100px]"
                        >
                            <ArrowRightLeft className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                            <span className="hidden lg:inline">Sync to DB</span>
                            <span className="lg:hidden">Sync</span>
                        </button>
                        <button
                            onClick={() => setShowMigrationModal(true)}
                            className="w-full sm:w-auto flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg transition-all text-xs sm:text-sm font-medium shadow-lg shadow-purple-900/30 whitespace-nowrap"
                        >
                            <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span className="hidden lg:inline">AutoGenerate Mikrotik + Data</span>
                            <span className="lg:hidden">Migrate Data</span>
                        </button>
                        <button
                            onClick={() => setShowAddPppModal(true)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-lg transition-all text-xs sm:text-sm font-medium shadow-lg shadow-emerald-900/30 whitespace-nowrap min-w-[100px]"
                        >
                            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span className="hidden lg:inline">Add User</span>
                            <span className="lg:hidden">Add</span>
                        </button>
                        <button
                            onClick={fetchData}
                            disabled={isLoading}
                            className="p-1.5 sm:p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isLoading ? 'animate-spin' : ''}`} />
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

                    <div className="grid grid-cols-1 gap-6">

                        {/* PPP Operations - Full Width */}
                        <div className="tech-card p-6 rounded-xl">
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                            <Globe className="w-5 h-5 text-red-500" />
                                            PPP Connection Operations
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Manage customer PPP sessions from this system using the MikroTik API.
                                        </p>
                                    </div>
                                    <div className="relative w-full xl:w-80">
                                        <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                                        <input
                                            type="text"
                                            placeholder="Search customer, phone, PPP, profile..."
                                            value={pppSearchQuery}
                                            onChange={(e) => {
                                                setPppSearchQuery(e.target.value);
                                                setPppCurrentPage(1);
                                            }}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                                    {([
                                        ['all', 'All', pppCounts.all],
                                        ['connected', 'Connected', pppCounts.connected],
                                        ['disconnected', 'Disconnected', pppCounts.disconnected],
                                        ['disabled', 'Disabled', pppCounts.disabled],
                                        ['dc', 'DC Profile', pppCounts.dc],
                                        ['mismatch', 'Needs Sync', pppCounts.mismatch]
                                    ] as const).map(([value, label, count]) => (
                                        <button
                                            key={value}
                                            onClick={() => {
                                                setPppStatusFilter(value);
                                                setPppCurrentPage(1);
                                            }}
                                            className={`rounded-lg border px-3 py-2 text-left transition-colors ${pppStatusFilter === value
                                                ? 'border-red-500/60 bg-red-950/30 text-white'
                                                : 'border-white/10 bg-black/30 text-gray-400 hover:border-white/20 hover:text-white'
                                                }`}
                                        >
                                            <div className="text-[11px] uppercase tracking-wide">{label}</div>
                                            <div className="mt-1 text-lg font-bold">{count}</div>
                                        </button>
                                    ))}
                                </div>

                                {pppActionMessage && (
                                    <div className={`rounded-lg border px-4 py-3 text-sm ${pppActionMessage.success
                                        ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                                        : 'border-red-500/30 bg-red-950/20 text-red-300'
                                        }`}>
                                        {pppActionMessage.message}
                                    </div>
                                )}
                            </div>

                            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[760px] overflow-y-auto pr-2 custom-scrollbar">
                                {paginatedPppCards.map((card) => {
                                    const isExpanded = expandedPpp === card.key;
                                    const profile = card.secret?.profile || card.local?.profile || 'No profile';
                                    const isBusy = Boolean(pppActionLoading?.endsWith(card.name));
                                    const canEnable = Boolean(card.secret || card.local?.password);

                                    return (
                                        <div
                                            key={card.key}
                                            className={`rounded-xl border bg-black/30 transition-colors ${card.status === 'connected'
                                                ? 'border-emerald-500/30 hover:border-emerald-400/50'
                                                : card.status === 'disabled' || card.status === 'dc'
                                                    ? 'border-red-500/30 hover:border-red-400/50'
                                                    : 'border-white/10 hover:border-red-500/30'
                                                }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setExpandedPpp(isExpanded ? null : card.key)}
                                                className="w-full p-4 text-left"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`h-2.5 w-2.5 rounded-full ${card.status === 'connected' ? 'bg-emerald-400' : card.status === 'disabled' || card.status === 'dc' ? 'bg-red-400' : 'bg-amber-400'}`} />
                                                            <h4 className="truncate font-semibold text-white">{card.local?.customerName || card.name}</h4>
                                                        </div>
                                                        <p className="mt-1 truncate font-mono text-xs text-cyan-300">{card.name}</p>
                                                    </div>
                                                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium ${getPppStatusClass(card.status)}`}>
                                                        {getPppStatusLabel(card.status)}
                                                    </span>
                                                </div>

                                                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                                                    <div>
                                                        <p className="text-gray-500">Profile</p>
                                                        <p className="truncate font-medium text-white">{profile}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-gray-500">Plan / Unit</p>
                                                        <p className="truncate font-medium text-white">{card.local?.planName || card.local?.businessUnitName || '-'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-gray-500">Uptime</p>
                                                        <p className="font-mono text-gray-300">{card.active?.uptime || '-'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-gray-500">Traffic</p>
                                                        <p className="font-mono text-gray-300">{formatBytes(parseInt(card.active?.['rx-byte'] || 0))}</p>
                                                    </div>
                                                </div>
                                            </button>

                                            {isExpanded && (
                                                <div className="border-t border-white/10 px-4 pb-4">
                                                    <div className="grid grid-cols-2 gap-3 py-3 text-xs">
                                                        <div>
                                                            <p className="text-gray-500">Mobile</p>
                                                            <p className="text-gray-300">{card.local?.customerMobile || '-'}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-gray-500">Address</p>
                                                            <p className="truncate text-gray-300">{card.local?.label || card.local?.address || '-'}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-gray-500">TX</p>
                                                            <p className="font-mono text-gray-300">{formatBytes(parseInt(card.active?.['tx-byte'] || 0))}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-gray-500">RX</p>
                                                            <p className="font-mono text-gray-300">{formatBytes(parseInt(card.active?.['rx-byte'] || 0))}</p>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button
                                                            onClick={() => openPppEditModal(card)}
                                                            className="rounded-lg border border-blue-500/30 bg-blue-950/20 px-3 py-2 text-xs font-medium text-blue-300 hover:bg-blue-900/30"
                                                        >
                                                            Edit Secret
                                                        </button>
                                                        {card.status === 'connected' ? (
                                                            <button
                                                                onClick={() => handleDisconnectSession(card)}
                                                                disabled={isBusy}
                                                                className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-900/30 disabled:opacity-50"
                                                            >
                                                                Disconnect
                                                            </button>
                                                        ) : card.status === 'disabled' ? (
                                                            <button
                                                                onClick={() => handleTogglePpp(card, true)}
                                                                disabled={isBusy || !canEnable}
                                                                className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-50"
                                                            >
                                                                Enable
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleTogglePpp(card, false)}
                                                                disabled={isBusy || card.status === 'database-only'}
                                                                className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-900/30 disabled:opacity-50"
                                                            >
                                                                Disable
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleRemovePppSecret(card)}
                                                            disabled={isBusy}
                                                            className="col-span-2 rounded-lg border border-red-600/40 bg-red-950/30 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-900/40 disabled:opacity-50"
                                                        >
                                                            Remove PPP Secret
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {filteredPppCards.length === 0 && (
                                    <div className="col-span-full text-center py-10">
                                        <p className="text-gray-500">
                                            {pppSearchQuery ? 'No matching PPP accounts found' : 'No PPP accounts found'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {filteredPppCards.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <p className="text-xs text-gray-500">
                                        Showing {pppStartIndex + 1}-{Math.min(pppStartIndex + pppItemsPerPage, filteredPppCards.length)} of {filteredPppCards.length}
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


                        {/* PPP Interfaces - Full Width with Search and Pagination */}
                        <div className="hidden">
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
                                <input type="text" required value={pppForm.name} onChange={(e) => setPppForm({ ...pppForm, name: normalizePppName(e.target.value) })} className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500" placeholder="Enter username" />
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

                            <button
                                type="button"
                                onClick={() => {
                                    handleRemovePppSecret(editingPpp as PppConnectionCard);
                                    setShowEditPppModal(false);
                                }}
                                className="w-full rounded-lg border border-red-600/40 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-900/40"
                            >
                                Remove PPP Secret
                            </button>

                            {/* Buttons */}
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowEditPppModal(false)}
                                    className="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSavePppEdit}
                                    disabled={pppActionLoading === `edit-${editPppForm.name}`}
                                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {pppActionLoading === `edit-${editPppForm.name}` ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Migration Modal */}
            {showMigrationModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-purple-500/30 rounded-2xl w-full max-w-2xl shadow-2xl shadow-purple-900/30">
                        {/* Header */}
                        <div className="border-b border-purple-500/30 p-6 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-purple-900/20 rounded-lg flex items-center justify-center">
                                    <Database className="w-5 h-5 text-purple-500" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">AutoGenerate Mikrotik + Data</h2>
                                    <p className="text-xs text-purple-400">Upload WEBSITEE.xlsx to migrate data</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setShowMigrationModal(false);
                                    setMigrationFile(null);
                                    setMigrationResult(null);
                                    setMigrationError('');
                                    setMigrationProgress({ current: 0, total: 0, percentage: 0 });
                                }}
                                className="text-gray-400 hover:text-white transition-colors"
                                disabled={isMigrating}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                            {!migrationResult ? (
                                <>
                                    {/* File Upload */}
                                    <div className="mb-6">
                                        <label className="block text-sm font-medium text-gray-300 mb-3">
                                            Select Excel File (WEBSITEE.xlsx)
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <label className="flex-1 cursor-pointer">
                                                <input
                                                    type="file"
                                                    accept=".xlsx,.xls"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            setMigrationFile(file);
                                                            setMigrationError('');
                                                        }
                                                    }}
                                                    className="hidden"
                                                    disabled={isMigrating}
                                                />
                                                <div className="px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white hover:border-purple-500 transition-colors flex items-center justify-between">
                                                    <span className="text-sm">
                                                        {migrationFile ? migrationFile.name : 'Choose file...'}
                                                    </span>
                                                    <Database className="w-4 h-4 text-gray-400" />
                                                </div>
                                            </label>
                                        </div>
                                        {migrationFile && !isMigrating && (
                                            <p className="text-xs text-green-400 mt-2">
                                                ✓ {migrationFile.name} ({(migrationFile.size / 1024).toFixed(2)} KB)
                                            </p>
                                        )}
                                    </div>

                                    {/* Progress Bar */}
                                    {isMigrating && (
                                        <div className="mb-6">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm text-purple-300 font-medium">Processing Migration...</span>
                                                <span className="text-sm text-purple-400 font-mono animate-pulse">
                                                    Working...
                                                </span>
                                            </div>
                                            {/* Indeterminate progress bar */}
                                            <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden relative">
                                                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 animate-shimmer" 
                                                     style={{ 
                                                         backgroundSize: '200% 100%',
                                                         animation: 'shimmer 2s infinite linear'
                                                     }}
                                                />
                                            </div>
                                            <p className="text-xs text-gray-400 mt-2 text-center">
                                                Creating customers, subscriptions, and MikroTik secrets...
                                            </p>
                                            <p className="text-xs text-yellow-400 mt-1 text-center">
                                                ⚠️ Please do not close this window. This may take a few minutes.
                                            </p>
                                        </div>
                                    )}

                                    {/* Error */}
                                    {migrationError && (
                                        <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                                            <p className="text-red-400 text-sm">{migrationError}</p>
                                        </div>
                                    )}

                                    {/* Info */}
                                    {!isMigrating && (
                                        <div className="mb-6 p-4 bg-purple-900/10 border border-purple-500/20 rounded-lg">
                                            <p className="text-purple-300 text-sm">
                                                This will create customers, subscriptions, and MikroTik PPP secrets from the Excel file.
                                            </p>
                                        </div>
                                    )}

                                    {/* Buttons */}
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => {
                                                setShowMigrationModal(false);
                                                setMigrationFile(null);
                                                setMigrationError('');
                                                setMigrationProgress({ current: 0, total: 0, percentage: 0 });
                                            }}
                                            className="flex-1 px-4 py-3 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors font-medium"
                                            disabled={isMigrating}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleMigration}
                                            disabled={!migrationFile || isMigrating}
                                            className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg transition-all font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {isMigrating ? (
                                                <>
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                    Processing...
                                                </>
                                            ) : (
                                                <>
                                                    <Database className="w-4 h-4" />
                                                    Start Migration
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Success Result */}
                                    <div className="mb-6">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-12 h-12 bg-green-900/20 rounded-full flex items-center justify-center">
                                                <Database className="w-6 h-6 text-green-500" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-green-400">Migration Completed!</h3>
                                                <p className="text-sm text-gray-400">Data has been imported successfully</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-4 mb-4">
                                            <div className="bg-black/40 rounded-lg p-4 border border-white/10">
                                                <p className="text-gray-400 text-xs mb-1">Customers</p>
                                                <p className="text-2xl font-bold text-white">{migrationResult.customersCreated || 0}</p>
                                            </div>
                                            <div className="bg-black/40 rounded-lg p-4 border border-white/10">
                                                <p className="text-gray-400 text-xs mb-1">Subscriptions</p>
                                                <p className="text-2xl font-bold text-white">{migrationResult.subscriptionsCreated || 0}</p>
                                            </div>
                                            <div className="bg-black/40 rounded-lg p-4 border border-white/10">
                                                <p className="text-gray-400 text-xs mb-1">MikroTik Secrets</p>
                                                <p className="text-2xl font-bold text-white">{migrationResult.mikrotikSecretsCreated || 0}</p>
                                            </div>
                                        </div>

                                        {migrationResult.columnsFound && (
                                            <div className="mb-4 p-3 bg-blue-900/10 border border-blue-500/20 rounded-lg">
                                                <p className="text-blue-400 text-xs font-medium mb-2">Excel Columns Detected:</p>
                                                <p className="text-blue-300 text-xs font-mono break-all">
                                                    {migrationResult.columnsFound.join(', ')}
                                                </p>
                                            </div>
                                        )}

                                        {migrationResult.errors && migrationResult.errors.length > 0 && (
                                            <div className="p-3 bg-yellow-900/10 border border-yellow-500/20 rounded-lg max-h-60 overflow-y-auto">
                                                <p className="text-yellow-400 text-xs font-medium mb-2">
                                                    Warnings ({migrationResult.errors.length}):
                                                </p>
                                                <ul className="text-yellow-300 text-xs space-y-1">
                                                    {migrationResult.errors.map((err: string, idx: number) => (
                                                        <li key={idx} className="font-mono">• {err}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => {
                                            setShowMigrationModal(false);
                                            setMigrationFile(null);
                                            setMigrationResult(null);
                                            setMigrationError('');
                                            setMigrationProgress({ current: 0, total: 0, percentage: 0 });
                                        }}
                                        className="w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors font-medium"
                                    >
                                        Close
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
