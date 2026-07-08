'use client';

import { useState, useEffect, useMemo } from 'react';
import { Power, Save, RefreshCw, X, History, Calendar, Search, ChevronLeft, ChevronRight, Filter, ChevronDown } from 'lucide-react';
import { getAutoDisconnectRules, upsertAutoDisconnectRule, getRecentlyDisconnectedSubscriptions, getBusinessUnits } from '@/app/actions/autoDisconnect';
import toast from 'react-hot-toast';

interface RuleFormState {
    business_unit_id: string;
    invoice_cycle: string | null;
    disconnect_date: string;
    is_recurring: boolean;
}

interface TargetGroup {
    id: string;
    label: string;
    business_unit_id: string;
    invoice_cycle: string | null;
}

export default function AutoDisconnectContent() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [targetGroups, setTargetGroups] = useState<TargetGroup[]>([]);
    const [rules, setRules] = useState<Record<string, RuleFormState>>({});
    const [selectedGroupId, setSelectedGroupId] = useState<string>('combined_malanggam');
    
    // Disconnected Table State
    const [disconnectedSubs, setDisconnectedSubs] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterBU, setFilterBU] = useState('ALL');
    const [filterMonth, setFilterMonth] = useState('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 10;

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Business Units
            const buResponse = await getBusinessUnits();
            const bus = Array.isArray(buResponse) ? buResponse : (buResponse?.data || []);
            
            const bulihan = bus.find((b: any) => b.name.toLowerCase() === 'bulihan');
            const malanggam = bus.find((b: any) => b.name.toLowerCase() === 'malanggam');
            const extension = bus.find((b: any) => b.name.toLowerCase() === 'extension');

            const groups: TargetGroup[] = [];
            
            // Special Combined Group (Requires both to exist)
            if (malanggam && extension) {
                groups.push({ id: 'combined_malanggam', label: 'Malanggam + Extension (30th)', business_unit_id: 'combined', invoice_cycle: null });
            }
            if (malanggam) groups.push({ id: 'malanggam', label: 'Malanggam', business_unit_id: malanggam.id, invoice_cycle: null });
            if (bulihan) groups.push({ id: 'bulihan', label: 'Bulihan', business_unit_id: bulihan.id, invoice_cycle: null });
            if (extension) {
                groups.push({ id: 'extension', label: 'Extension (All)', business_unit_id: extension.id, invoice_cycle: null });
                groups.push({ id: 'extension_15th', label: 'Extension (15th Cycle)', business_unit_id: extension.id, invoice_cycle: '15th' });
                groups.push({ id: 'extension_30th', label: 'Extension (30th Cycle)', business_unit_id: extension.id, invoice_cycle: '30th' });
            }
            setTargetGroups(groups);

            if (groups.length > 0 && !groups.find(g => g.id === selectedGroupId)) {
                setSelectedGroupId(groups[0].id);
            }

            // 2. Fetch Rules
            const { data, success } = await getAutoDisconnectRules();
            if (success && data) {
                const initialRules: Record<string, RuleFormState> = {};
                
                groups.forEach(g => {
                    initialRules[g.id] = { business_unit_id: g.business_unit_id, invoice_cycle: g.invoice_cycle, disconnect_date: '', is_recurring: false };
                });

                data.forEach((rule: any) => {
                    // Try to map back to our groups
                    const matchedGroups = groups.filter(g => g.business_unit_id === rule.business_unit_id && g.invoice_cycle === rule.invoice_cycle);
                    matchedGroups.forEach(matchedGroup => {
                        initialRules[matchedGroup.id] = {
                            business_unit_id: rule.business_unit_id,
                            invoice_cycle: rule.invoice_cycle,
                            disconnect_date: rule.disconnect_date || '',
                            is_recurring: rule.is_recurring || false
                        };
                    });
                    
                    // Special case for combined malanggam logic when loading
                    // We just let the individual malanggam or ext30 dictate its value
                    if (rule.business_unit_id === malanggam?.id) {
                        initialRules['combined_malanggam'] = {
                            business_unit_id: 'combined',
                            invoice_cycle: null,
                            disconnect_date: rule.disconnect_date || '',
                            is_recurring: rule.is_recurring || false
                        };
                    }
                });
                setRules(initialRules);
            }

            // 3. Fetch Disconnected Subscriptions
            const { data: subsData, success: subsSuccess } = await getRecentlyDisconnectedSubscriptions();
            if (subsSuccess && subsData) {
                setDisconnectedSubs(subsData);
            }

        } catch (error) {
            console.error(error);
            toast.error("Failed to load settings");
        }
        setLoading(false);
    };

    const handleSave = async (forceClear: boolean = false) => {
        setSaving(true);
        const rule = rules[selectedGroupId];
        const dateValue = forceClear ? null : (rule.disconnect_date ? rule.disconnect_date : null);
        
        let success = true;
        let errorMessage = '';

        try {
            if (selectedGroupId === 'combined_malanggam') {
                const malanggamGroup = targetGroups.find(g => g.id === 'malanggam');
                const ext30Group = targetGroups.find(g => g.id === 'extension_30th');
                
                if (malanggamGroup && ext30Group) {
                    const res1 = await upsertAutoDisconnectRule(malanggamGroup.business_unit_id, malanggamGroup.invoice_cycle, dateValue, rule.is_recurring);
                    const res2 = await upsertAutoDisconnectRule(ext30Group.business_unit_id, ext30Group.invoice_cycle, dateValue, rule.is_recurring);
                    success = res1.success && res2.success;
                    if (!success) errorMessage = "Failed to save one or both combined rules";
                }
            } else if (selectedGroupId === 'extension') {
                 // Save for both 15th and 30th
                 const extGroup = targetGroups.find(g => g.id === 'extension');
                 if (extGroup) {
                     const res1 = await upsertAutoDisconnectRule(extGroup.business_unit_id, '15th', dateValue, rule.is_recurring);
                     const res2 = await upsertAutoDisconnectRule(extGroup.business_unit_id, '30th', dateValue, rule.is_recurring);
                     success = res1.success && res2.success;
                     if (!success) errorMessage = "Failed to save extension rules";
                 }
            } else {
                const res = await upsertAutoDisconnectRule(
                    rule.business_unit_id,
                    rule.invoice_cycle,
                    dateValue,
                    rule.is_recurring
                );
                success = res.success;
                if (!success) errorMessage = res.error || "Unknown error";
            }

            if (success) {
                toast.success(dateValue ? `Settings saved for ${targetGroups.find(g => g.id === selectedGroupId)?.label}` : `Rule removed completely`);
                // Refresh data to keep sync
                fetchData();
            } else {
                toast.error(`Error saving settings: ${errorMessage}`);
            }
        } catch (e) {
            toast.error("An unexpected error occurred");
        }
        
        setSaving(false);
    };

    const handleClearDate = async () => {
        setRules(prev => ({
            ...prev,
            [selectedGroupId]: { ...prev[selectedGroupId], disconnect_date: '', is_recurring: false }
        }));
        
        // Force clear to database, bypassing state closure issues
        handleSave(true);
    };

    // Filter Logic
    const filteredSubs = useMemo(() => {
        return disconnectedSubs.filter(sub => {
            // Search
            if (searchQuery && !sub.customers?.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            
            // BU Filter
            if (filterBU !== 'ALL') {
                const buName = sub.business_units?.name || '';
                const cycle = sub.invoice_date || '';
                if (filterBU === 'Malanggam + Extension (30th)') {
                    const isMalanggam = buName.toLowerCase() === 'malanggam';
                    const isExt30 = buName.toLowerCase() === 'extension' && cycle === '30th';
                    if (!isMalanggam && !isExt30) return false;
                } else if (filterBU === 'Extension (15th)') {
                     if (buName.toLowerCase() !== 'extension' || cycle !== '15th') return false;
                } else if (filterBU === 'Extension (30th)') {
                     if (buName.toLowerCase() !== 'extension' || cycle !== '30th') return false;
                } else {
                    if (buName !== filterBU) return false;
                }
            }
            
            // Month Filter
            if (filterMonth !== 'ALL' && sub.last_disconnection_date) {
                const dDate = new Date(sub.last_disconnection_date);
                const mName = dDate.toLocaleString('default', { month: 'long' });
                if (mName !== filterMonth) return false;
            }
            
            return true;
        });
    }, [disconnectedSubs, searchQuery, filterBU, filterMonth]);

    // Pagination Logic
    const totalPages = Math.max(1, Math.ceil(filteredSubs.length / rowsPerPage));
    const paginatedSubs = filteredSubs.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, filterBU, filterMonth]);

    // Derive unique months for filter
    const availableMonths = useMemo(() => {
        const months = new Set<string>();
        disconnectedSubs.forEach(sub => {
            if (sub.last_disconnection_date) {
                months.add(new Date(sub.last_disconnection_date).toLocaleString('default', { month: 'long' }));
            }
        });
        return Array.from(months);
    }, [disconnectedSubs]);

    // Unique BUs for filter
    const availableBUs = ['Malanggam', 'Bulihan', 'Extension', 'Malanggam + Extension (30th)', 'Extension (15th)', 'Extension (30th)'];

    if (loading && Object.keys(rules).length === 0) {
        return (
            <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="h-8 w-8 animate-spin text-red-500" />
                    <p className="text-sm text-gray-400">Loading settings...</p>
                </div>
            </div>
        );
    }

    const currentRule = rules[selectedGroupId] || { disconnect_date: '', is_recurring: false };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Power className="w-8 h-8 text-red-500" />
                        Auto Disconnect
                    </h1>
                    <p className="mt-2 text-gray-400">
                        Set automated batch disconnection dates per business unit.
                    </p>
                </div>
            </div>

            {/* Redesigned Single Form UI */}
            <div className="tech-panel p-6 space-y-6 max-w-2xl">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                        Target Business Unit
                    </label>
                    <div className="relative">
                        <select
                            className="tech-input w-full appearance-none cursor-pointer pr-10 border border-red-900/30 bg-black/40 focus:border-red-500 transition-colors"
                            value={selectedGroupId}
                            onChange={(e) => setSelectedGroupId(e.target.value)}
                        >
                            {targetGroups.map(g => (
                                <option key={g.id} value={g.id} className="bg-gray-900 text-white">{g.label}</option>
                            ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-red-500">
                            <ChevronDown className="w-5 h-5" />
                        </div>
                    </div>
                </div>

                <div className="space-y-5 p-5 bg-black/20 rounded-lg border border-red-900/20">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Disconnection Date
                        </label>
                        <div className="relative">
                            <input
                                type="date"
                                className="tech-input w-full pr-10 [color-scheme:dark]"
                                value={currentRule.disconnect_date}
                                onChange={(e) => setRules({
                                    ...rules,
                                    [selectedGroupId]: { ...currentRule, disconnect_date: e.target.value }
                                })}
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            The cron job will execute disconnections on this date.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="recurring-checkbox"
                            className="w-4 h-4 rounded border-red-900/50 bg-black/50 text-red-500 focus:ring-red-500 focus:ring-offset-black cursor-pointer"
                            checked={currentRule.is_recurring}
                            onChange={(e) => setRules({
                                ...rules,
                                [selectedGroupId]: { ...currentRule, is_recurring: e.target.checked }
                            })}
                        />
                        <label htmlFor="recurring-checkbox" className="text-sm font-medium text-white cursor-pointer select-none">
                            Repeat every month?
                        </label>
                    </div>
                </div>

                <div className="pt-2 flex gap-3">
                    <button
                        onClick={() => handleSave(false)}
                        disabled={saving}
                        className="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {saving ? (
                            <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                Save Settings
                            </>
                        )}
                    </button>
                    
                    {currentRule.disconnect_date && (
                        <button
                            onClick={handleClearDate}
                            disabled={saving}
                            title="Remove rule completely"
                            className="bg-red-900/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center disabled:opacity-50"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Disconnected Subscriptions Data Table */}
            <div className="mt-8 tech-panel p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-red-900/30 pb-4">
                    <div className="flex items-center gap-3">
                        <History className="w-6 h-6 text-red-500" />
                        <h2 className="text-xl font-bold text-white">Recently Disconnected ({filteredSubs.length})</h2>
                    </div>

                    {/* Filters & Search */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search customer..."
                                className="tech-input pl-9 w-48 text-sm py-1.5"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <Filter className="w-4 h-4 text-gray-500" />
                            <select 
                                className="tech-input text-sm py-1.5 px-3 appearance-none cursor-pointer bg-gray-900 text-white"
                                value={filterBU}
                                onChange={(e) => setFilterBU(e.target.value)}
                            >
                                <option value="ALL">All Business Units</option>
                                {availableBUs.map(bu => (
                                    <option key={bu} value={bu}>{bu}</option>
                                ))}
                            </select>
                        </div>
                        
                        <select 
                            className="tech-input text-sm py-1.5 px-3 appearance-none cursor-pointer bg-gray-900 text-white"
                            value={filterMonth}
                            onChange={(e) => setFilterMonth(e.target.value)}
                        >
                            <option value="ALL">All Months</option>
                            {availableMonths.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {paginatedSubs.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        {disconnectedSubs.length === 0 
                            ? "No recently disconnected subscriptions found."
                            : "No results match your current filters."}
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[600px]">
                                <thead>
                                    <tr className="border-b border-red-900/50 bg-black/20">
                                        <th className="p-3 text-sm font-semibold text-gray-300 rounded-tl-lg">Customer</th>
                                        <th className="p-3 text-sm font-semibold text-gray-300">Business Unit</th>
                                        <th className="p-3 text-sm font-semibold text-gray-300">Cycle</th>
                                        <th className="p-3 text-sm font-semibold text-gray-300">Disconnected On</th>
                                        <th className="p-3 text-sm font-semibold text-gray-300 text-right rounded-tr-lg">Final Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-red-900/20">
                                    {paginatedSubs.map((sub) => (
                                        <tr key={sub.id} className="hover:bg-red-900/10 transition-colors">
                                            <td className="p-3 text-sm text-white font-medium">{sub.customers?.name || 'Unknown'}</td>
                                            <td className="p-3 text-sm text-gray-300">{sub.business_units?.name || 'Unknown'}</td>
                                            <td className="p-3 text-sm text-gray-400">{sub.invoice_date || '-'}</td>
                                            <td className="p-3 text-sm text-red-400">
                                                {sub.last_disconnection_date ? new Date(sub.last_disconnection_date).toLocaleDateString() : '-'}
                                            </td>
                                            <td className="p-3 text-sm text-gray-300 text-right font-mono">₱{Number(sub.balance).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-red-900/30">
                                <span className="text-sm text-gray-400">
                                    Showing {(currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, filteredSubs.length)} of {filteredSubs.length} entries
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="p-2 rounded bg-black/20 text-gray-400 hover:text-white hover:bg-red-900/40 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <div className="flex items-center px-4 font-medium text-sm text-white bg-black/20 rounded">
                                        Page {currentPage} of {totalPages}
                                    </div>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="p-2 rounded bg-black/20 text-gray-400 hover:text-white hover:bg-red-900/40 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
