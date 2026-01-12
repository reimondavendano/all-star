'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
    Search, ChevronLeft, ChevronRight, ChevronDown, RefreshCw,
    User, Wifi, Server, Edit, Check, Phone, MapPin, Calendar,
    Building2, DollarSign, Hash, Shield, Globe, Save
} from 'lucide-react';
import { syncSubscriptionToMikrotik } from '@/app/actions/mikrotik';
import { useMultipleRealtimeSubscriptions } from '@/hooks/useRealtimeSubscription';
import ConfirmationDialog from '@/components/shared/ConfirmationDialog';

interface MikrotikPPP {
    id: string;
    mikrotik_id?: string;
    name: string;
    password?: string;
    service: string;
    profile: string;
    local_address?: string;
    remote_address?: string;
    caller_id?: string;
    enabled: boolean;
    disabled: boolean;
    comment?: string;
    last_synced_at?: string;
}

interface Subscription {
    id: string;
    subscriber_id: string;
    business_unit_id: string;
    plan_id: string;
    active: boolean;
    date_installed: string;
    contact_person?: string;
    address?: string;
    barangay?: string;
    landmark?: string;
    label?: string;
    customer_portal?: string;
    invoice_date?: string;
    referral_credit_applied: boolean;
    customer_name?: string;
    balance?: number;
    router_serial_number?: string;
    'x-coordinates'?: number;
    'y-coordinates'?: number;
    plans?: { name: string; monthly_fee: number };
    business_units?: { name: string };
    mikrotik_ppp_secrets?: MikrotikPPP[];
}

interface Customer {
    id: string;
    name: string;
    mobile_number?: string;
    created_at: string;
    subscriptions?: Subscription[];
}

export default function CollectorCustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
    const [expandedSubscriptions, setExpandedSubscriptions] = useState<Set<string>>(new Set());

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // MikroTik Form State
    const [mikrotikForm, setMikrotikForm] = useState({
        name: '',
        password: '',
        profile: '',
        service: 'any',
        caller_id: '',
        comment: '',
        enabled: true
    });

    const [confirmationParams, setConfirmationParams] = useState<{
        sub: Subscription;
        isActive: boolean;
    } | null>(null);

    const itemsPerPage = 10;

    useEffect(() => {
        fetchData();
    }, []);

    // Real-time subscriptions
    useMultipleRealtimeSubscriptions(
        ['customers', 'subscriptions', 'mikrotik_ppp_secrets'],
        (table, payload) => {
            console.log(`[Collector Customers Realtime] ${table} changed:`, payload.eventType);
            fetchData();
        }
    );

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('customers')
                .select(`
                    *,
                    subscriptions!subscriptions_subscriber_id_fkey(
                        *,
                        plans(name, monthly_fee),
                        business_units(name),
                        mikrotik_ppp_secrets(*)
                    )
                `)
                .order('name', { ascending: true });

            if (error) throw error;
            setCustomers(data || []);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleCustomer = (id: string) => {
        const newSet = new Set(expandedCustomers);
        newSet.has(id) ? newSet.delete(id) : newSet.add(id);
        setExpandedCustomers(newSet);
    };

    const toggleSubscription = (id: string) => {
        const newSet = new Set(expandedSubscriptions);
        newSet.has(id) ? newSet.delete(id) : newSet.add(id);
        setExpandedSubscriptions(newSet);
    };

    const openEditModal = (customer: Customer, subscription: Subscription, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedCustomer(customer);
        setSelectedSubscription(subscription);

        // Initialize MikroTik form if exists
        const ppp = subscription.mikrotik_ppp_secrets?.[0];
        if (ppp) {
            setMikrotikForm({
                name: ppp.name,
                password: ppp.password || '',
                profile: ppp.profile,
                service: ppp.service,
                caller_id: ppp.caller_id || '',
                comment: ppp.comment || '',
                enabled: ppp.enabled
            });
            setIsModalOpen(true);
        } else {
            // If no MikroTik secret, we can't edit it. Maybe show alert or prevent opening?
            // For now, let's just alert strictly as per requirement "edit mikrotik ppp"
            alert("No MikroTik PPP Secret found for this subscription.");
        }
    };

    const handleToggleActive = (subscription: Subscription, e: React.MouseEvent) => {
        e.stopPropagation();
        setConfirmationParams({
            sub: subscription,
            isActive: !subscription.active
        });
    };

    const handleConfirmToggle = async () => {
        if (!confirmationParams) return;
        const { sub, isActive } = confirmationParams;

        try {
            const { error } = await supabase
                .from('subscriptions')
                .update({ active: isActive })
                .eq('id', sub.id);
            if (error) throw error;
            await syncSubscriptionToMikrotik(sub.id, isActive);
            fetchData();
        } catch (error) {
            console.error('Error toggling status:', error);
            alert('Failed to toggle status');
        } finally {
            setConfirmationParams(null);
        }
    };

    const saveChanges = async () => {
        if (!selectedCustomer || !selectedSubscription) return;

        setIsSaving(true);

        try {
            // Save ONLY MikroTik PPP
            const ppp = selectedSubscription.mikrotik_ppp_secrets?.[0];
            if (ppp) {
                await supabase
                    .from('mikrotik_ppp_secrets')
                    .update({
                        name: mikrotikForm.name,
                        password: mikrotikForm.password || null,
                        profile: mikrotikForm.profile,
                        service: mikrotikForm.service,
                        caller_id: mikrotikForm.caller_id || null,
                        comment: mikrotikForm.comment || null,
                        enabled: mikrotikForm.enabled,
                        disabled: !mikrotikForm.enabled
                    })
                    .eq('id', ppp.id);
            }

            setIsModalOpen(false);
            fetchData();
        } catch (error) {
            console.error('Error saving:', error);
            alert('Failed to save changes');
        } finally {
            setIsSaving(false);
        }
    };

    const filteredCustomers = customers.filter(c =>
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.mobile_number?.includes(searchQuery)
    );

    const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedCustomers = filteredCustomers.slice(startIndex, startIndex + itemsPerPage);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <User className="w-6 h-6 text-blue-500" />
                            Customers & Subscriptions
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">
                            Unified view of customers and subscriptions
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search customers..."
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                className="bg-[#1a1a1a] border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 w-64"
                            />
                        </div>
                        <button onClick={fetchData} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Customer List */}
            <div className="glass-card overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-gray-500">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                        Loading...
                    </div>
                ) : paginatedCustomers.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>{searchQuery ? `No customers found matching "${searchQuery}"` : 'No customers found'}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {paginatedCustomers.map((customer) => {
                            const subs = customer.subscriptions || [];
                            const activeCount = subs.filter(s => s.active).length;

                            return (
                                <div key={customer.id}>
                                    {/* Customer Row */}
                                    <div
                                        className="p-4 hover:bg-[#1a1a1a] cursor-pointer flex items-center gap-3 transition-colors"
                                        onClick={() => toggleCustomer(customer.id)}
                                    >
                                        {expandedCustomers.has(customer.id) ? (
                                            <ChevronDown className="w-5 h-5 text-gray-500" />
                                        ) : (
                                            <ChevronRight className="w-5 h-5 text-gray-500" />
                                        )}
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
                                            <User className="w-5 h-5 text-white" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-white truncate">{customer.name}</div>
                                            <div className="text-xs text-gray-500 flex items-center gap-2">
                                                <span>{subs.length} subscription(s)</span>
                                                {customer.mobile_number && (
                                                    <><span className="text-gray-700">•</span><Phone className="w-3 h-3" />{customer.mobile_number}</>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {activeCount > 0 && (
                                                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-900/40 text-emerald-400 border border-emerald-700/50">
                                                    {activeCount} Active
                                                </span>
                                            )}
                                        </div>
                                        {/* REMOVED: Copy Portal Link & Edit Customer buttons for Collector */}
                                    </div>

                                    {/* Subscriptions */}
                                    {expandedCustomers.has(customer.id) && subs.length > 0 && (
                                        <div className="bg-[#080808]">
                                            {subs.map((sub) => {
                                                const ppp = sub.mikrotik_ppp_secrets?.[0];
                                                return (
                                                    <div key={sub.id} className="border-l-2 border-purple-800/50 ml-6">
                                                        {/* Subscription Row */}
                                                        <div
                                                            className="p-3 hover:bg-[#121212] cursor-pointer flex items-center gap-3 transition-colors"
                                                            onClick={() => toggleSubscription(sub.id)}
                                                        >
                                                            {expandedSubscriptions.has(sub.id) ? (
                                                                <ChevronDown className="w-4 h-4 text-gray-500" />
                                                            ) : (
                                                                <ChevronRight className="w-4 h-4 text-gray-500" />
                                                            )}
                                                            <Wifi className={`w-4 h-4 ${sub.active ? 'text-emerald-500' : 'text-red-500'}`} />
                                                            <div className="flex-1">
                                                                <div className="text-sm text-white font-medium">
                                                                    {sub.plans?.name || 'Unknown Plan'}
                                                                    {sub.label && <span className="ml-2 text-xs text-gray-500">({sub.label})</span>}
                                                                </div>
                                                                <div className="text-xs text-gray-500">
                                                                    {sub.business_units?.name} • ₱{sub.plans?.monthly_fee?.toLocaleString()}/mo
                                                                    {ppp && <span className="ml-2 text-cyan-500">• PPP: {ppp.name}</span>}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {/* Toggle Switch */}
                                                                <button
                                                                    onClick={(e) => handleToggleActive(sub, e)}
                                                                    className="group relative w-10 h-5 rounded-full transition-colors"
                                                                    style={{ background: sub.active ? '#059669' : '#374151' }}
                                                                >
                                                                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${sub.active ? 'left-5' : 'left-0.5'}`} />
                                                                </button>

                                                                {/* Edit Button (Restricted to MikroTik) */}
                                                                {ppp && (
                                                                    <button
                                                                        onClick={(e) => openEditModal(customer, sub, e)}
                                                                        className="group relative p-1.5 text-purple-400 hover:text-purple-300 hover:bg-purple-900/30 rounded-lg transition-colors"
                                                                    >
                                                                        <Edit className="w-3.5 h-3.5" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Subscription + MikroTik Details */}
                                                        {expandedSubscriptions.has(sub.id) && (
                                                            <div className="bg-[#0a0a0a] border-t border-gray-800/50 p-4 pl-12">
                                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                                    <div className="flex items-start gap-2">
                                                                        <Calendar className="w-4 h-4 text-pink-500 mt-0.5" />
                                                                        <div><div className="text-xs text-gray-500">Installed</div><div className="text-gray-300">{sub.date_installed ? new Date(sub.date_installed).toLocaleDateString() : '-'}</div></div>
                                                                    </div>
                                                                    <div className="flex items-start gap-2">
                                                                        <MapPin className="w-4 h-4 text-red-500 mt-0.5" />
                                                                        <div><div className="text-xs text-gray-500">Address</div><div className="text-gray-300">{sub.address || '-'}</div></div>
                                                                    </div>
                                                                    <div className="flex items-start gap-2">
                                                                        <DollarSign className="w-4 h-4 text-green-500 mt-0.5" />
                                                                        <div>
                                                                            <div className="text-xs text-gray-500">Balance</div>
                                                                            <div className={`font-medium ${(sub.balance || 0) > 0 ? 'text-red-400' : (sub.balance || 0) < 0 ? 'text-green-400' : 'text-gray-300'}`}>
                                                                                ₱{Math.round(Math.abs(sub.balance || 0)).toLocaleString()}{(sub.balance || 0) < 0 && ' (Credit)'}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-start gap-2">
                                                                        <Hash className="w-4 h-4 text-gray-500 mt-0.5" />
                                                                        <div><div className="text-xs text-gray-500">Invoice Date</div><div className="text-gray-300">{sub.invoice_date || 'Not set'}</div></div>
                                                                    </div>
                                                                </div>

                                                                {/* MikroTik PPP Section (Read-only view) */}
                                                                {ppp && (
                                                                    <div className="mt-4 pt-4 border-t border-gray-800/50">
                                                                        <div className="text-xs text-gray-500 uppercase mb-3 flex items-center gap-2">
                                                                            <Server className="w-3 h-3" /> MikroTik PPP Secret
                                                                        </div>
                                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                                            <div><div className="text-xs text-gray-500">Username</div><div className="text-cyan-400 font-mono">{ppp.name}</div></div>
                                                                            <div><div className="text-xs text-gray-500">Profile</div><div className="text-gray-300">{ppp.profile}</div></div>
                                                                            <div><div className="text-xs text-gray-500">Service</div><div className="text-gray-300">{ppp.service}</div></div>
                                                                            <div><div className="text-xs text-gray-500">Status</div>
                                                                                <div className={ppp.enabled ? 'text-green-400' : 'text-red-400'}>{ppp.enabled ? 'Enabled' : 'Disabled'}</div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination */}
                {filteredCustomers.length > itemsPerPage && (
                    <div className="flex items-center justify-between p-4 border-t border-gray-800">
                        <div className="text-sm text-gray-500">
                            Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredCustomers.length)} of {filteredCustomers.length}
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-sm text-gray-400">Page {currentPage} of {totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Restricted Edit Modal - Single Tab for MikroTik */}
            {isModalOpen && selectedSubscription && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />

                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-purple-900/50 rounded-2xl shadow-[0_0_60px_rgba(139,92,246,0.15)] w-full max-w-2xl max-h-[90vh] overflow-hidden">
                        {/* Modal Header */}
                        <div className="relative p-6 border-b border-gray-800/50">
                            <div className="absolute inset-0 bg-gradient-to-r from-violet-600/10 via-purple-600/10 to-fuchsia-600/10" />
                            <div className="relative flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
                                        <User className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">{selectedCustomer?.name}</h2>
                                        <p className="text-sm text-gray-400">Edit Subscription Details</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:text-white rounded-lg transition-colors">
                                    <span className="sr-only">Close</span>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>

                            {/* Single MikroTik Tab */}
                            <div className="relative flex gap-1 mt-6 bg-gray-900/50 p-1 rounded-xl">
                                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-purple-900/30">
                                    <Globe className="w-4 h-4" />
                                    MikroTik PPP
                                </button>
                            </div>
                        </div>

                        {/* Modal Content - Restricted to MikroTik */}
                        <div className="p-6 max-h-[50vh] overflow-y-auto">
                            <div className="space-y-5">
                                <div className="p-4 bg-amber-900/20 border border-amber-700/50 rounded-xl">
                                    <div className="flex items-start gap-3">
                                        <Shield className="w-5 h-5 text-amber-500 mt-0.5" />
                                        <div>
                                            <div className="text-amber-400 font-medium">MikroTik Sync</div>
                                            <div className="text-sm text-amber-300/70">Changes here will be synced to the MikroTik router.</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-2">PPP Username</label>
                                        <input
                                            type="text"
                                            value={mikrotikForm.name}
                                            onChange={(e) => setMikrotikForm({ ...mikrotikForm, name: e.target.value })}
                                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-cyan-400 font-mono focus:outline-none focus:border-cyan-500 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-2">Password</label>
                                        <input
                                            type="password"
                                            value={mikrotikForm.password}
                                            onChange={(e) => setMikrotikForm({ ...mikrotikForm, password: e.target.value })}
                                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-all"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-2">Profile</label>
                                        <input
                                            type="text"
                                            value={mikrotikForm.profile}
                                            onChange={(e) => setMikrotikForm({ ...mikrotikForm, profile: e.target.value })}
                                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-2">Service Type</label>
                                        <select
                                            value={mikrotikForm.service}
                                            onChange={(e) => setMikrotikForm({ ...mikrotikForm, service: e.target.value })}
                                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-all"
                                        >
                                            <option value="any">Any</option>
                                            <option value="pppoe">PPPoE</option>
                                            <option value="pptp">PPTP</option>
                                            <option value="l2tp">L2TP</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-2">Caller ID</label>
                                        <input
                                            type="text"
                                            value={mikrotikForm.caller_id}
                                            onChange={(e) => setMikrotikForm({ ...mikrotikForm, caller_id: e.target.value })}
                                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-2">Comment</label>
                                        <input
                                            type="text"
                                            value={mikrotikForm.comment}
                                            onChange={(e) => setMikrotikForm({ ...mikrotikForm, comment: e.target.value })}
                                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-4 bg-gray-900/30 rounded-xl border border-gray-800">
                                    <div>
                                        <div className="text-white font-medium">PPP Secret Status</div>
                                        <div className="text-sm text-gray-500">Enable/disable on MikroTik router</div>
                                    </div>
                                    <button
                                        onClick={() => setMikrotikForm({ ...mikrotikForm, enabled: !mikrotikForm.enabled })}
                                        className={`relative w-14 h-7 rounded-full transition-colors ${mikrotikForm.enabled ? 'bg-cyan-600' : 'bg-gray-700'}`}
                                    >
                                        <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform shadow-md ${mikrotikForm.enabled ? 'left-8' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 border-t border-gray-800/50 flex justify-end gap-3">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveChanges}
                                disabled={isSaving}
                                className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl font-medium shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmationDialog
                isOpen={!!confirmationParams}
                onClose={() => setConfirmationParams(null)}
                onConfirm={handleConfirmToggle}
                title={confirmationParams?.isActive ? "Enable Subscription?" : "Disable Subscription?"}
                message={`Are you sure you want to ${confirmationParams?.isActive ? "enable" : "disable"} this subscription? This will update the MikroTik status as well.`}
                confirmText={confirmationParams?.isActive ? "Enable" : "Disable"}
                type={confirmationParams?.isActive ? "info" : "danger"}
            />
        </div>
    );
}
