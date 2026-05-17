'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
    Search, ChevronLeft, ChevronRight, ChevronDown, RefreshCw,
    User, Wifi, Server, Edit, Check, Phone, MapPin, Calendar, CalendarClock,
    Building2, DollarSign, Hash, Shield, Globe, Save
} from 'lucide-react';
import { syncSubscriptionToMikrotik, checkMikrotikStatus, updatePppSecret } from '@/app/actions/mikrotik';
import { changeSubscriptionPlan, previewPlanChangeInvoices } from '@/app/actions/subscription';
import { useMultipleRealtimeSubscriptions } from '@/hooks/useRealtimeSubscription';
import ConfirmationDialog from '@/components/shared/ConfirmationDialog';
import DisconnectionModal from '@/components/admin/DisconnectionModal';
import { getMikrotikProfileForPlan } from '@/lib/mikrotikProfiles';
import { getPlanChangeDateWindow } from '@/lib/billing';

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
    promised_date?: string | null;
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

interface Plan {
    id: string;
    name: string;
    monthly_fee: number;
}

interface PlanChangePreview {
    oldPlan: { days: number; amount: number; fromDate: string; toDate: string };
    newPlan: { days: number; amount: number; fromDate: string; toDate: string };
    totalDifference: number;
    isUpgrade: boolean;
}

const MIKROTIK_PROFILE_OPTIONS = ['50MBPS-2', '100MBPS-2', '130MBPS', '150MBPS'];

function addDays(dateString: string, days: number) {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
}

function datePartsToISO(year: number, monthIndex: number, day: number) {
    return new Date(Date.UTC(year, monthIndex, day)).toISOString().split('T')[0];
}

function formatDisplayDate(dateString?: string | null) {
    if (!dateString) return '-';
    return new Date(`${dateString}T00:00:00`).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
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
    const [showDisconnectModal, setShowDisconnectModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [modalTab, setModalTab] = useState<'mikrotik' | 'plan' | 'extension'>('mikrotik');
    const [plans, setPlans] = useState<Plan[]>([]);
    const [selectedPlanId, setSelectedPlanId] = useState('');
    const [promisedDate, setPromisedDate] = useState('');
    const [planChangeDate, setPlanChangeDate] = useState(new Date().toISOString().split('T')[0]);
    const [planPreview, setPlanPreview] = useState<PlanChangePreview | null>(null);
    const [planPreviewLoading, setPlanPreviewLoading] = useState(false);
    const [planChangeError, setPlanChangeError] = useState<string | null>(null);

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
    const [togglingSubId, setTogglingSubId] = useState<string | null>(null);

    const itemsPerPage = 10;

    useEffect(() => {
        fetchData();
        fetchPlans();
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

    const fetchPlans = async () => {
        const { data, error } = await supabase
            .from('plans')
            .select('id, name, monthly_fee')
            .order('monthly_fee');

        if (error) {
            console.error('Error fetching plans:', error);
            return;
        }

        setPlans(data || []);
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
        setSelectedPlanId(subscription.plan_id);
        setPromisedDate(subscription.promised_date?.split('T')[0] || '');
        setPlanPreview(null);
        setPlanChangeError(null);
        const planDateWindow = getPlanChangeDateWindow(subscription.invoice_date || '15th');
        setPlanChangeDate(planDateWindow.isOpen ? planDateWindow.minDate : planDateWindow.nextOpenDate);

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
            setModalTab('mikrotik');
        } else {
            setMikrotikForm({
                name: '',
                password: '',
                profile: getMikrotikProfileForPlan(subscription.plans?.name),
                service: 'pppoe',
                caller_id: '',
                comment: '',
                enabled: subscription.active
            });
            setModalTab('plan');
        }
        setIsModalOpen(true);
    };

    const handleToggleActive = async (customer: Customer, subscription: Subscription, e: React.MouseEvent) => {
        e.stopPropagation();

        setTogglingSubId(subscription.id);

        try {
            // Check MikroTik status first
            const status = await checkMikrotikStatus();
            if (!status.online) {
                alert('MikroTik router is offline. Please ensure the router is online before activating or deactivating subscriptions.');
                return;
            }

            // If disabling (subscription is currently active), show disconnection modal with invoice option
            if (subscription.active) {
                setSelectedCustomer(customer);
                setSelectedSubscription(subscription);
                setShowDisconnectModal(true);
            } else {
                // If enabling (subscription is currently inactive), just show confirmation
                setConfirmationParams({
                    sub: subscription,
                    isActive: true
                });
            }
        } finally {
            setTogglingSubId(null);
        }
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

    const formatCurrency = (amount: number) => `₱${Math.round(amount).toLocaleString()}`;
    const selectedPlan = plans.find(plan => plan.id === selectedPlanId);
    const hasPlanChanged = Boolean(selectedSubscription && selectedPlanId && selectedPlanId !== selectedSubscription.plan_id);
    const planChangeWindow = getPlanChangeDateWindow(selectedSubscription?.invoice_date || '15th');
    const defaultDisconnectionDate = (() => {
        const today = new Date();
        const unitName = selectedSubscription?.business_units?.name?.toLowerCase() || '';
        const isThirtyCycle = selectedSubscription?.invoice_date === '30th' || unitName.includes('malanggam');

        if (isThirtyCycle) {
            return today.getDate() <= 5
                ? datePartsToISO(today.getFullYear(), today.getMonth(), 5)
                : datePartsToISO(today.getFullYear(), today.getMonth() + 1, 5);
        }

        return today.getDate() <= 20
            ? datePartsToISO(today.getFullYear(), today.getMonth(), 20)
            : datePartsToISO(today.getFullYear(), today.getMonth() + 1, 20);
    })();
    const minimumPromisedDate = addDays(defaultDisconnectionDate, 1);
    const autoDisconnectDate = promisedDate ? addDays(promisedDate, 1) : null;

    const loadPlanChangePreview = async (planId = selectedPlanId, date = planChangeDate) => {
        if (!selectedSubscription || !planId || planId === selectedSubscription.plan_id) {
            setPlanPreview(null);
            return;
        }

        setPlanPreviewLoading(true);
        setPlanChangeError(null);
        try {
            const result = await previewPlanChangeInvoices(selectedSubscription.id, planId, date);
            if (!result.success || !result.preview) {
                throw new Error(result.error || 'Unable to preview plan change');
            }
            setPlanPreview(result.preview);
        } catch (error) {
            setPlanPreview(null);
            setPlanChangeError(error instanceof Error ? error.message : 'Unable to preview plan change');
        } finally {
            setPlanPreviewLoading(false);
        }
    };

    const saveChanges = async () => {
        if (!selectedCustomer || !selectedSubscription) return;

        setIsSaving(true);

        try {
            if (modalTab === 'extension') {
                if (promisedDate && promisedDate < minimumPromisedDate) {
                    alert(`Payment extension date must be after the normal disconnection date (${formatDisplayDate(defaultDisconnectionDate)}).`);
                    return;
                }

                const { error } = await supabase
                    .from('subscriptions')
                    .update({ promised_date: promisedDate || null })
                    .eq('id', selectedSubscription.id);

                if (error) throw error;

                setIsModalOpen(false);
                fetchData();
                return;
            }

            if (modalTab === 'plan') {
                if (!hasPlanChanged) {
                    alert('Please select a different plan before saving.');
                    return;
                }

                if (!planChangeWindow.isOpen || planChangeDate < planChangeWindow.minDate || planChangeDate > planChangeWindow.maxDate) {
                    setPlanChangeError(`${planChangeWindow.message} Next available date: ${formatDisplayDate(planChangeWindow.nextOpenDate)}.`);
                    return;
                }

                const status = await checkMikrotikStatus();
                if (!status.online) {
                    alert('MikroTik router is offline. Please ensure the router is online before changing the subscription plan.');
                    return;
                }

                const result = await changeSubscriptionPlan(selectedSubscription.id, selectedPlanId, planChangeDate);
                if (!result.success) {
                    throw new Error(result.error || 'Failed to change subscription plan');
                }

                if (result.warning) {
                    alert(result.warning);
                }

                setIsModalOpen(false);
                fetchData();
                return;
            }

            // Save ONLY MikroTik PPP
            const ppp = selectedSubscription.mikrotik_ppp_secrets?.[0];
            if (ppp) {
                const mtResult = await updatePppSecret(ppp.name, {
                    name: mikrotikForm.name,
                    password: mikrotikForm.password || '',
                    profile: mikrotikForm.profile,
                    service: mikrotikForm.service,
                    'caller-id': mikrotikForm.caller_id || '',
                    comment: mikrotikForm.comment || '',
                    disabled: mikrotikForm.enabled ? 'false' : 'true'
                });

                if (!mtResult.success) {
                    throw new Error(mtResult.error || 'Failed to sync MikroTik PPP secret');
                }

                const { error } = await supabase
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

                if (error) throw error;
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
                                        className="p-4 hover:bg-[#1a1a1a] cursor-pointer flex flex-col sm:flex-row sm:items-center gap-3 transition-colors"
                                        onClick={() => toggleCustomer(customer.id)}
                                    >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            {expandedCustomers.has(customer.id) ? (
                                                <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0" />
                                            ) : (
                                                <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0" />
                                            )}
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/30 flex-shrink-0">
                                                <User className="w-5 h-5 text-white" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-white truncate text-sm sm:text-base">{customer.name}</div>
                                                <div className="text-[10px] sm:text-xs text-gray-500 flex flex-wrap items-center gap-1 sm:gap-2 mt-0.5">
                                                    <span>{subs.length} sub(s)</span>
                                                    {customer.mobile_number && (
                                                        <><span className="text-gray-700 hidden sm:inline">•</span><Phone className="w-3 h-3 flex-shrink-0" /><span className="truncate">{customer.mobile_number}</span></>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 pl-12 sm:pl-0 mt-2 sm:mt-0">
                                            {activeCount > 0 && (
                                                <span className="px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-emerald-900/40 text-emerald-400 border border-emerald-700/50 whitespace-nowrap">
                                                    {activeCount} Active
                                                </span>
                                            )}
                                            {subs.length - activeCount > 0 && (
                                                <span className="px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-red-900/40 text-red-400 border border-red-700/50 whitespace-nowrap">
                                                    {subs.length - activeCount} Inact
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
                                                            className="p-3 hover:bg-[#121212] cursor-pointer flex flex-col sm:flex-row sm:items-center gap-3 transition-colors"
                                                            onClick={() => toggleSubscription(sub.id)}
                                                        >
                                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                                {expandedSubscriptions.has(sub.id) ? (
                                                                    <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                                                ) : (
                                                                    <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                                                )}
                                                                <Wifi className={`w-4 h-4 flex-shrink-0 ${sub.active ? 'text-emerald-500' : 'text-red-500'}`} />
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-sm text-white font-medium truncate">
                                                                        {sub.plans?.name || 'Unknown Plan'}
                                                                        {sub.label && <span className="ml-1 sm:ml-2 text-[10px] sm:text-xs text-gray-500">({sub.label})</span>}
                                                                    </div>
                                                                    <div className="text-[10px] sm:text-xs text-gray-500 flex flex-wrap items-center gap-1 sm:gap-1.5 mt-0.5">
                                                                        <span className="truncate max-w-[120px] sm:max-w-none">{sub.business_units?.name}</span>
                                                                        <span className="text-gray-700">•</span>
                                                                        <span className="whitespace-nowrap">₱{sub.plans?.monthly_fee?.toLocaleString()}/mo</span>
                                                                        {ppp && <><span className="text-gray-700">•</span><span className="truncate max-w-[120px] sm:max-w-none text-cyan-500">PPP: {ppp.name}</span></>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto pl-8 sm:pl-0 mt-2 sm:mt-0 gap-2">
                                                                {/* Toggle Switch */}
                                                                <button
                                                                    onClick={(e) => handleToggleActive(customer, sub, e)}
                                                                    disabled={togglingSubId === sub.id}
                                                                    className="group relative w-10 h-5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                                                                    style={{ background: sub.active ? '#059669' : '#374151' }}
                                                                >
                                                                    {togglingSubId === sub.id ? (
                                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                        </div>
                                                                    ) : (
                                                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${sub.active ? 'left-5' : 'left-0.5'}`} />
                                                                    )}
                                                                </button>

                                                                {/* Edit Button (Restricted to MikroTik) */}
                                                                {ppp && (
                                                                    <button
                                                                        onClick={(e) => openEditModal(customer, sub, e)}
                                                                        className="group relative p-1.5 text-purple-400 hover:text-purple-300 hover:bg-purple-900/30 rounded-lg transition-colors flex-shrink-0"
                                                                    >
                                                                        <Edit className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Subscription + MikroTik Details */}
                                                        {expandedSubscriptions.has(sub.id) && (
                                                            <div className="bg-[#0a0a0a] border-t border-gray-800/50 p-4 pl-12">
                                                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
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
                                                                    <div className="flex items-start gap-2">
                                                                        <Calendar className="w-4 h-4 text-purple-400 mt-0.5" />
                                                                        <div><div className="text-xs text-gray-500">Promised Date</div><div className="text-gray-300">{sub.promised_date ? formatDisplayDate(sub.promised_date) : '-'}</div></div>
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

                            {/* Collector edit tabs */}
                            <div className="relative flex gap-1 mt-6 bg-gray-900/50 p-1 rounded-xl">
                                <button
                                    onClick={() => setModalTab('mikrotik')}
                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${modalTab === 'mikrotik'
                                        ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-purple-900/30'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-800/70'
                                    }`}
                                >
                                    <Globe className="w-4 h-4" />
                                    MikroTik PPP
                                </button>
                                <button
                                    onClick={async () => {
                                        setModalTab('plan');
                                        await loadPlanChangePreview();
                                    }}
                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${modalTab === 'plan'
                                        ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-900/20'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-800/70'
                                    }`}
                                >
                                    <Wifi className="w-4 h-4" />
                                    Change Plan
                                </button>
                                <button
                                    onClick={() => setModalTab('extension')}
                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${modalTab === 'extension'
                                        ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-purple-900/30'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-800/70'
                                    }`}
                                >
                                    <CalendarClock className="w-4 h-4" />
                                    Payment Extension
                                </button>
                            </div>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 max-h-[50vh] overflow-y-auto">
                            {modalTab === 'mikrotik' ? (
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
                                        <select
                                            value={mikrotikForm.profile}
                                            onChange={(e) => setMikrotikForm({ ...mikrotikForm, profile: e.target.value })}
                                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-all"
                                        >
                                            {MIKROTIK_PROFILE_OPTIONS.map(profile => (
                                                <option key={profile} value={profile}>{profile}</option>
                                            ))}
                                        </select>
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
                            ) : modalTab === 'extension' ? (
                                <div className="space-y-5">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl">
                                            <div className="text-xs text-gray-500 uppercase mb-2">Business Unit</div>
                                            <div className="text-white font-medium">{selectedSubscription.business_units?.name || 'Unknown'}</div>
                                            <div className="text-xs text-gray-500 mt-1">{selectedSubscription.invoice_date || 'No'} billing cycle</div>
                                        </div>
                                        <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl">
                                            <div className="text-xs text-gray-500 uppercase mb-2">Normal Disconnection</div>
                                            <div className="text-white font-medium">{formatDisplayDate(defaultDisconnectionDate)}</div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                {selectedSubscription.invoice_date === '30th' ? '5th of next month' : '20th of the month'}
                                            </div>
                                        </div>
                                        <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl">
                                            <div className="text-xs text-gray-500 uppercase mb-2">Auto Disconnect</div>
                                            <div className={`font-medium ${autoDisconnectDate ? 'text-red-300' : 'text-gray-500'}`}>
                                                {autoDisconnectDate ? formatDisplayDate(autoDisconnectDate) : 'Normal schedule'}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                {autoDisconnectDate ? 'One day after promise' : 'No active extension'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5 bg-gray-900/30 border border-gray-800 rounded-xl space-y-4">
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-2">Promised Payment Date</label>
                                            <input
                                                type="date"
                                                value={promisedDate}
                                                min={minimumPromisedDate}
                                                onChange={(e) => setPromisedDate(e.target.value)}
                                                className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-all"
                                            />
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setPromisedDate(minimumPromisedDate)}
                                                className="px-4 py-2 bg-purple-600/80 hover:bg-purple-600 text-white rounded-lg text-sm transition-colors"
                                            >
                                                Set Next Available Date
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPromisedDate('')}
                                                className="px-4 py-2 border border-gray-700 hover:bg-gray-800 text-gray-300 rounded-lg text-sm transition-colors"
                                            >
                                                Clear Extension
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <div className="p-4 bg-amber-900/20 border border-amber-700/50 rounded-xl">
                                        <div className="flex items-start gap-3">
                                            <Shield className="w-5 h-5 text-amber-500 mt-0.5" />
                                            <div>
                                                <div className="text-amber-400 font-medium">Upgrade/Downgrade Plan</div>
                                                <div className="text-sm text-amber-300/70">
                                                    This handles the old-plan prorated invoice now. The new-plan remainder is only an estimate here and stays for the next invoice run.
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-2">Current Plan</label>
                                            <div className="w-full bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 text-white">
                                                {selectedSubscription.plans?.name || 'Unknown Plan'} - {formatCurrency(selectedSubscription.plans?.monthly_fee || 0)}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-2">New Plan</label>
                                            <select
                                                value={selectedPlanId}
                                                onChange={async (e) => {
                                                    setSelectedPlanId(e.target.value);
                                                    await loadPlanChangePreview(e.target.value, planChangeDate);
                                                }}
                                                className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 transition-all"
                                            >
                                                {plans.map(plan => (
                                                    <option key={plan.id} value={plan.id}>
                                                        {plan.name} - {formatCurrency(plan.monthly_fee)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm text-gray-400 mb-2">Old Plan End Date</label>
                                        <input
                                            type="date"
                                            value={planChangeDate}
                                            min={planChangeWindow.minDate}
                                            max={planChangeWindow.maxDate}
                                            disabled={!planChangeWindow.isOpen}
                                            onChange={async (e) => {
                                                setPlanChangeDate(e.target.value);
                                                await loadPlanChangePreview(selectedPlanId, e.target.value);
                                            }}
                                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            The new plan starts the next day. Allowed dates: {formatDisplayDate(planChangeWindow.minDate)} to {formatDisplayDate(planChangeWindow.maxDate)}.
                                        </p>
                                        {!planChangeWindow.isOpen && (
                                            <p className="text-xs text-amber-400 mt-1">
                                                {planChangeWindow.message} Next available date: {formatDisplayDate(planChangeWindow.nextOpenDate)}.
                                            </p>
                                        )}
                                    </div>

                                    {planChangeError && (
                                        <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-sm text-red-400">
                                            {planChangeError}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl">
                                            <div className="text-xs text-gray-500 uppercase mb-2">Old Plan Invoice</div>
                                            {planPreviewLoading ? (
                                                <div className="text-sm text-gray-400">Calculating...</div>
                                            ) : planPreview ? (
                                                <>
                                                    <div className="text-white font-semibold">{selectedSubscription.plans?.name || 'Old plan'}</div>
                                                    <div className="text-xs text-gray-500 mt-1">{planPreview.oldPlan.fromDate} to {planPreview.oldPlan.toDate}</div>
                                                    <div className="text-lg font-bold text-amber-400 mt-2">{formatCurrency(planPreview.oldPlan.amount)}</div>
                                                    <div className="text-xs text-gray-500">{planPreview.oldPlan.days} day(s)</div>
                                                </>
                                            ) : (
                                                <div className="text-sm text-gray-500">Select a different plan to preview.</div>
                                            )}
                                        </div>

                                        <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl">
                                            <div className="text-xs text-gray-500 uppercase mb-2">New Plan Estimate</div>
                                            {planPreviewLoading ? (
                                                <div className="text-sm text-gray-400">Calculating...</div>
                                            ) : planPreview ? (
                                                <>
                                                    <div className="text-white font-semibold">{selectedPlan?.name || 'New plan'}</div>
                                                    <div className="text-xs text-gray-500 mt-1">{planPreview.newPlan.fromDate} to {planPreview.newPlan.toDate}</div>
                                                    <div className="text-lg font-bold text-cyan-400 mt-2">{formatCurrency(planPreview.newPlan.amount)}</div>
                                                    <div className="text-xs text-gray-500">{planPreview.newPlan.days} day(s), billed by next invoice run</div>
                                                </>
                                            ) : (
                                                <div className="text-sm text-gray-500">Select a different plan to preview.</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-3 bg-blue-950/30 border border-blue-900/50 rounded-xl text-xs text-blue-300">
                                        Existing full-period unpaid invoices for this billing period will be converted to the old-plan prorated invoice to prevent duplicates. Confirming also updates subscriptions, mikrotik_ppp_secrets, and the MikroTik PPP profile. The new-plan remainder stays queued for the next invoice run.
                                    </div>
                                </div>
                            )}
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
                                disabled={isSaving || (modalTab === 'plan' && (!hasPlanChanged || planPreviewLoading || !planPreview || !planChangeWindow.isOpen))}
                                className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl font-medium shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {modalTab === 'plan' ? 'Apply Plan Change' : modalTab === 'extension' ? 'Save Payment Extension' : 'Save Changes'}
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

            {/* Disconnection Modal */}
            {showDisconnectModal && selectedSubscription && (
                <DisconnectionModal
                    isOpen={showDisconnectModal}
                    onClose={() => {
                        setShowDisconnectModal(false);
                        setSelectedSubscription(null);
                    }}
                    subscription={{
                        id: selectedSubscription.id,
                        customer_name: selectedCustomer?.name || 'Unknown',
                        business_unit_name: selectedSubscription.business_units?.name || 'Unknown',
                        business_unit_id: selectedSubscription.business_unit_id,
                        date_installed: selectedSubscription.date_installed,
                        plan_fee: selectedSubscription.plans?.monthly_fee
                    }}
                    onConfirm={() => {
                        fetchData();
                    }}
                />
            )}
        </div>
    );
}
