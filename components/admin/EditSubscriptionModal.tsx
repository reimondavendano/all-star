'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, User, MapPin, Wifi, CheckCircle, Loader2, CreditCard, Copy, Globe, Hash, Save, ArrowUpDown, Shield, CalendarClock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { syncSubscriptionToMikrotik, checkMikrotikStatus } from '@/app/actions/mikrotik';
import { changeSubscriptionPlan, previewPlanChangeInvoices } from '@/app/actions/subscription';
import { getPlanChangeDateWindow } from '@/lib/billing';
import dynamic from 'next/dynamic';
import ConfirmationDialog from '@/components/shared/ConfirmationDialog';

// Dynamically import MapPicker
const MapPicker = dynamic(() => import('@/components/admin/MapPicker'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-64 flex items-center justify-center bg-[#1a1a1a] text-gray-400 rounded-lg border border-gray-800">
            <Loader2 className="w-8 h-8 animate-spin" />
        </div>
    )
});

interface Subscription {
    id: string;
    subscriber_id: string;
    business_unit_id: string;
    plan_id: string;
    active: boolean;
    date_installed: string;
    contact_person: string; // This is the referrer ID
    address: string;
    barangay: string;
    landmark: string;
    label?: string;
    customer_portal: string;
    invoice_date: string;
    referral_credit_applied: boolean;
    customer_name?: string;
    router_serial_number?: string;
    is_free?: boolean;
    promised_date?: string | null;
    last_reconnection_date?: string | null;
    last_disconnection_date?: string | null;
    'x-coordinates'?: number;
    'y-coordinates'?: number;
}

interface BusinessUnit {
    id: string;
    name: string;
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

interface MikrotikPppSecret {
    id: string;
    name: string;
    service: string;
    profile: string;
    local_address?: string | null;
    comment?: string | null;
}

interface EditSubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    subscription: Subscription;
    onUpdate: () => void;
    initialTab?: EditTab;
    initialPlanId?: string;
    initialPlanChangeDate?: string;
    planChangeRequestId?: string;
}

const BARANGAY_OPTIONS = ['Bulihan', 'San Agustin', 'San Gabriel', 'Liang', 'Catmon'] as const;
const EDIT_TABS = ['customer', 'subscription', 'paymentExtension', 'plan', 'mikrotik'] as const;
type EditTab = typeof EDIT_TABS[number];

function toDateInputValue(dateString?: string | null) {
    if (!dateString) return '';
    return dateString.split('T')[0];
}

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

export default function EditSubscriptionModal({
    isOpen,
    onClose,
    subscription,
    onUpdate,
    initialTab,
    initialPlanId,
    initialPlanChangeDate,
    planChangeRequestId
}: EditSubscriptionModalProps) {
    const [activeTab, setActiveTab] = useState<EditTab>('subscription');
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState('The subscription details have been saved.');
    const [showStatusConfirm, setShowStatusConfirm] = useState(false);
    const [pendingActiveStatus, setPendingActiveStatus] = useState<boolean | null>(null);
    const [planChangeDate, setPlanChangeDate] = useState(initialPlanChangeDate || new Date().toISOString().split('T')[0]);
    const [planPreview, setPlanPreview] = useState<PlanChangePreview | null>(null);
    const [planPreviewLoading, setPlanPreviewLoading] = useState(false);
    const [planChangeError, setPlanChangeError] = useState<string | null>(null);

    // MikroTik PPP Secret State
    const [pppSecret, setPppSecret] = useState<MikrotikPppSecret | null>(null);
    const [loadingPpp, setLoadingPpp] = useState(false);

    const [formData, setFormData] = useState({
        active: subscription.active,
        invoice_date: subscription.invoice_date || '',
        plan_id: initialPlanId || subscription.plan_id,
        business_unit_id: subscription.business_unit_id,
        date_installed: subscription.date_installed ? new Date(subscription.date_installed).toISOString().split('T')[0] : '',
        address: subscription.address,
        barangay: subscription.barangay,
        landmark: subscription.landmark,
        label: subscription.label || '',
        contact_person: subscription.contact_person, // referrer ID
        referral_credit_applied: subscription.referral_credit_applied,
        router_serial_number: subscription.router_serial_number || '',
        is_free: subscription.is_free || false,
        promised_date: toDateInputValue(subscription.promised_date),
        last_reconnection_date: subscription.last_reconnection_date ? new Date(subscription.last_reconnection_date).toISOString().split('T')[0] : ''
    });

    const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchBusinessUnits();
            fetchPlans();
            fetchCustomers();
            fetchPppSecret();
            setActiveTab(initialTab || 'subscription');
            setPlanPreview(null);
            setPlanChangeError(null);
            setPlanChangeDate(initialPlanChangeDate || new Date().toISOString().split('T')[0]);

            // Initialize form data when modal opens or subscription changes
            setFormData({
                active: subscription.active,
                invoice_date: subscription.invoice_date || '',
                plan_id: initialPlanId || subscription.plan_id,
                business_unit_id: subscription.business_unit_id,
                date_installed: subscription.date_installed ? new Date(subscription.date_installed).toISOString().split('T')[0] : '',
                address: subscription.address,
                barangay: subscription.barangay,
                landmark: subscription.landmark,
                label: subscription.label || '',
                contact_person: subscription.contact_person || '',
                referral_credit_applied: subscription.referral_credit_applied,
                router_serial_number: subscription.router_serial_number || '',
                is_free: subscription.is_free || false,
                promised_date: toDateInputValue(subscription.promised_date),
                last_reconnection_date: subscription.last_reconnection_date ? new Date(subscription.last_reconnection_date).toISOString().split('T')[0] : ''
            });

            // Initialize coordinates
            if (subscription['x-coordinates'] && subscription['y-coordinates']) {
                setCoordinates({
                    lat: subscription['y-coordinates'],
                    lng: subscription['x-coordinates']
                });
            } else {
                setCoordinates(null);
            }
        }
    }, [isOpen, subscription, initialTab, initialPlanId, initialPlanChangeDate]);

    // Auto-set and Lock Invoice Date logic
    useEffect(() => {
        if (formData.business_unit_id) {
            const unit = businessUnits.find(u => u.id === formData.business_unit_id);
            if (unit) {
                const unitName = unit.name.toLowerCase();
                // Logic:
                // Bulihan -> Locked to 15th
                // Malanggam -> Locked to 30th
                // Extension -> Unlocked (User can choose 15th or 30th)
                if (unitName.includes('malanggam')) {
                    setFormData(prev => ({ ...prev, invoice_date: '30th' }));
                } else if (unitName.includes('bulihan') && !unitName.includes('extension')) {
                    setFormData(prev => ({ ...prev, invoice_date: '15th' }));
                }
                // Extension does not force set, keeps current or default
            }
        }
    }, [formData.business_unit_id, businessUnits]);

    const isInvoiceDateDisabled = () => {
        if (!formData.business_unit_id) return false;
        const unit = businessUnits.find(u => u.id === formData.business_unit_id);
        if (!unit) return false;
        const name = unit.name.toLowerCase();

        // Extension is explicitly enabled
        if (name.includes('extension')) return false;

        // Bulihan and Malanggam are locked
        if (name.includes('bulihan') || name.includes('malanggam')) return true;

        return false;
    };

    // ... existing fetch functions ...

    const fetchPppSecret = async () => {
        setLoadingPpp(true);
        try {
            const { data } = await supabase
                .from('mikrotik_ppp_secrets')
                .select('*')
                .eq('subscription_id', subscription.id)
                .single();

            if (data) setPppSecret(data);
        } catch (error) {
            console.error('Error fetching PPP secret:', error);
        } finally {
            setLoadingPpp(false);
        }
    };

    const fetchBusinessUnits = async () => {
        const { data } = await supabase.from('business_units').select('id, name').order('name');
        setBusinessUnits(data || []);
    };

    const fetchPlans = async () => {
        const { data } = await supabase.from('plans').select('id, name, monthly_fee').order('monthly_fee');
        setPlans(data || []);
    };

    const fetchCustomers = async () => {
        const { data } = await supabase.from('customers').select('id, name').order('name');
        setCustomers(data || []);
    };

    const fetchAddress = useCallback(async (lat: number, lng: number) => {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
                { headers: { 'User-Agent': 'AllStarISP/1.0' } }
            );
            const data = await response.json();

            if (data && data.address) {
                const street = data.address.road || '';
                const houseNumber = data.address.house_number || '';
                const city = data.address.city || data.address.town || '';

                setFormData(prev => ({
                    ...prev,
                    address: `${houseNumber} ${street}, ${city}`.trim(),
                }));
            }
        } catch (error) {
            console.error('Error fetching address:', error);
        }
    }, []);

    const handleLocationSelect = (lat: number, lng: number) => {
        setCoordinates({ lat, lng });
        fetchAddress(lat, lng);
    };

    const handleBarangayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedBarangay = e.target.value;
        setFormData(prev => ({ ...prev, barangay: selectedBarangay }));

        // Optional: Center map on Barangay
        if (selectedBarangay === 'Bulihan') handleLocationSelect(14.8437, 120.8113); // Approximate coords
    };

    const selectedPlan = plans.find(plan => plan.id === formData.plan_id);
    const currentPlan = plans.find(plan => plan.id === subscription.plan_id);
    const hasPlanChanged = formData.plan_id !== subscription.plan_id;
    const planChangeWindowBaseDate = planChangeRequestId && initialPlanChangeDate
        ? new Date(`${initialPlanChangeDate}T00:00:00`)
        : new Date();
    const planChangeWindow = getPlanChangeDateWindow(
        formData.invoice_date || subscription.invoice_date || '15th',
        planChangeWindowBaseDate
    );
    const formatCurrency = (amount: number) => `₱${Math.round(amount).toLocaleString()}`;
    const selectedBusinessUnit = businessUnits.find(unit => unit.id === formData.business_unit_id);
    const defaultDisconnectionDate = (() => {
        const today = new Date();
        const unitName = selectedBusinessUnit?.name?.toLowerCase() || '';
        const isThirtyCycle = formData.invoice_date === '30th' || unitName.includes('malanggam');
        const day = today.getDate();

        if (isThirtyCycle) {
            return day <= 5
                ? datePartsToISO(today.getFullYear(), today.getMonth(), 5)
                : datePartsToISO(today.getFullYear(), today.getMonth() + 1, 5);
        }

        return day <= 25
            ? datePartsToISO(today.getFullYear(), today.getMonth(), 25)
            : datePartsToISO(today.getFullYear(), today.getMonth() + 1, 25);
    })();
    const minimumPromisedDate = addDays(defaultDisconnectionDate, 1);
    const autoDisconnectDate = formData.promised_date ? addDays(formData.promised_date, 1) : null;
    const tabLabel = (tab: EditTab) => {
        if (tab === 'mikrotik') return 'MikroTik PPP';
        if (tab === 'plan') return 'Upgrade/Downgrade';
        if (tab === 'paymentExtension') return 'Payment Extension';
        return tab.charAt(0).toUpperCase() + tab.slice(1);
    };

    const loadPlanChangePreview = useCallback(async (planId = formData.plan_id, date = planChangeDate) => {
        if (!planId || planId === subscription.plan_id) {
            setPlanPreview(null);
            return;
        }

        setPlanPreviewLoading(true);
        setPlanChangeError(null);
        try {
            const result = await previewPlanChangeInvoices(subscription.id, planId, date);
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
    }, [formData.plan_id, planChangeDate, subscription.id, subscription.plan_id]);

    useEffect(() => {
        if (isOpen && initialTab === 'plan' && formData.plan_id !== subscription.plan_id) {
            loadPlanChangePreview(formData.plan_id, planChangeDate);
        }
    }, [formData.plan_id, initialTab, isOpen, loadPlanChangePreview, planChangeDate, subscription.plan_id]);

    const handleUpdateClick = async () => {
        if (hasPlanChanged) {
            if (activeTab !== 'plan') {
                setActiveTab('plan');
                await loadPlanChangePreview();
                return;
            }

            const status = await checkMikrotikStatus();
            if (!status.online) {
                alert('MikroTik router is offline. Please ensure the router is online before changing the subscription plan.');
                return;
            }

            if (!planPreview) {
                await loadPlanChangePreview();
                return;
            }

            if (!planChangeWindow.isOpen) {
                setPlanChangeError(`${planChangeWindow.message} Next available date: ${formatDisplayDate(planChangeWindow.nextOpenDate)}.`);
                return;
            }

            await handleConfirmUpdate(true);
            return;
        }

        if (activeTab === 'plan') {
            alert('Please select a different plan before saving.');
            return;
        }

        if (activeTab === 'paymentExtension' && formData.promised_date && formData.promised_date < minimumPromisedDate) {
            alert(`Payment extension date must be after the normal disconnection date (${formatDisplayDate(defaultDisconnectionDate)}).`);
            return;
        }

        setShowConfirmation(true);
    };

    const handleConfirmUpdate = async (confirmedPlanChange = false) => {
        setIsLoading(true);
        setShowConfirmation(false);
        setPlanChangeError(null);

        try {
            const updatePayload: Record<string, string | boolean | number | null> = {
                active: formData.active,
                invoice_date: formData.invoice_date || null,
                business_unit_id: formData.business_unit_id,
                date_installed: formData.date_installed,
                address: formData.address,
                barangay: formData.barangay,
                landmark: formData.landmark,
                label: formData.label,
                contact_person: formData.contact_person || null,
                referral_credit_applied: formData.referral_credit_applied,
                router_serial_number: formData.router_serial_number || null,
                is_free: formData.is_free,
                promised_date: formData.promised_date || null,
                last_reconnection_date: formData.last_reconnection_date || null,
                'x-coordinates': coordinates?.lng || null,
                'y-coordinates': coordinates?.lat || null
            };

            if (!hasPlanChanged) {
                updatePayload.plan_id = formData.plan_id;
            }

            const { error } = await supabase
                .from('subscriptions')
                .update(updatePayload)
                .eq('id', subscription.id);

            if (error) throw error;

            if (hasPlanChanged) {
                if (!confirmedPlanChange) {
                    throw new Error('Plan change was not confirmed');
                }

                const planResult = await changeSubscriptionPlan(subscription.id, formData.plan_id, planChangeDate, planChangeRequestId);
                if (!planResult.success) {
                    throw new Error(planResult.error || 'Failed to change subscription plan');
                }

                if (planResult.warning) {
                    setSuccessMessage(`Subscription updated. ${planResult.warning}`);
                } else {
                    setSuccessMessage('Subscription updated and prorated plan-change invoices were generated.');
                }
            } else {
                setSuccessMessage('The subscription details have been saved.');
            }

            if (!hasPlanChanged && formData.active !== subscription.active) {
                await syncSubscriptionToMikrotik(subscription.id, formData.active);
            }

            setShowSuccess(true);
        } catch (error) {
            console.error('Error updating subscription:', error);
            const message = error instanceof Error ? error.message : 'Failed to update subscription';
            setPlanChangeError(message);
            if (activeTab !== 'plan') alert(message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSuccessClose = () => {
        setShowSuccess(false);
        onUpdate();
        onClose();
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

                <div className="relative bg-[#0a0a0a] border-2 border-purple-900/50 rounded-xl shadow-[0_0_50px_rgba(139,92,246,0.15)] w-full max-w-5xl max-h-[90vh] overflow-y-auto flex flex-col">
                    {/* Header */}
                    <div className="bg-[#0a0a0a] border-b border-gray-800 p-6 flex justify-between items-center z-10 sticky top-0">
                        <div>
                            <h2 className="text-xl font-bold text-white">{subscription.customer_name}</h2>
                            <p className="text-gray-400 text-xs mt-1">Edit Subscription Details</p>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-gray-800 px-6 bg-[#0a0a0a] sticky top-[80px] z-10 gap-8">
                        {EDIT_TABS.map((tab) => (
                            <button
                                key={tab}
                                onClick={async () => {
                                    setActiveTab(tab);
                                    if (tab === 'plan') {
                                        await loadPlanChangePreview();
                                    }
                                }}
                                className={`py-4 text-sm font-medium transition-all border-b-2 flex items-center gap-2 relative ${activeTab === tab ? 'border-purple-500 text-purple-400' : 'border-transparent text-gray-400 hover:text-white'
                                    }`}
                            >
                                {tab === 'customer' && <User className="w-4 h-4" />}
                                {tab === 'subscription' && <Wifi className="w-4 h-4" />}
                                {tab === 'paymentExtension' && <CalendarClock className="w-4 h-4" />}
                                {tab === 'plan' && <ArrowUpDown className="w-4 h-4" />}
                                {tab === 'mikrotik' && <Globe className="w-4 h-4" />}
                                <span>{tabLabel(tab)}</span>
                                {activeTab === tab && (
                                    <div className="absolute inset-0 bg-purple-500/5 -z-10 rounded-t-lg" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="p-6 flex-1 overflow-y-auto">

                        {/* CUSTOMER TAB */}
                        {activeTab === 'customer' && (
                            <div className="space-y-6 max-w-2xl mx-auto">
                                <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-800 space-y-4">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-10 h-10 rounded-full bg-purple-900/30 flex items-center justify-center">
                                            <User className="w-5 h-5 text-purple-400" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Customer Name</label>
                                            <div className="text-lg font-medium text-white">{subscription.customer_name || 'Unknown'}</div>
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-500 bg-gray-900 p-3 rounded border border-gray-800">
                                        Note: To edit core customer details like Name or Mobile Number, please use the &quot;Edit Customer&quot; option from the main list.
                                    </div>
                                </div>

                                {/* Customer Portal Link */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-400">Customer Portal Link</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={subscription.customer_portal ? `${typeof window !== 'undefined' ? window.location.origin : ''}${subscription.customer_portal}` : 'Not generated'}
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-gray-500 font-mono text-sm"
                                        />
                                        <button
                                            onClick={() => {
                                                if (subscription.customer_portal) {
                                                    navigator.clipboard.writeText(`${window.location.origin}${subscription.customer_portal}`);
                                                }
                                            }}
                                            className="px-4 py-2 bg-gray-800 text-white rounded border border-gray-700 hover:bg-gray-700"
                                            disabled={!subscription.customer_portal}
                                            title="Copy"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-400">Referrer (Contact Person)</label>
                                    <select
                                        value={formData.contact_person || ''}
                                        onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                                    >
                                        <option value="">No Referrer</option>
                                        {customers.filter(c => c.id !== subscription.subscriber_id).map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* SUBSCRIPTION TAB - REDESIGNED */}
                        {activeTab === 'subscription' && (
                            <div className="space-y-6">
                                {/* Top Grid: 3 Columns for logical grouping */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                                    {/* Column 1: Service Plan Details */}
                                    <div className="space-y-4 lg:col-span-1">
                                        <div className="flex items-center gap-2 mb-2 text-purple-400">
                                            <CreditCard className="w-4 h-4" />
                                            <h4 className="text-sm font-semibold uppercase tracking-wider">Plan & Billing</h4>
                                        </div>

                                        <div className="bg-gray-900/30 p-4 rounded-xl border border-gray-800 space-y-4">
                                            <div>
                                                <label className="text-xs font-medium text-gray-500 block mb-1.5">Business Unit</label>
                                                <select
                                                    value={formData.business_unit_id}
                                                    onChange={(e) => setFormData({ ...formData, business_unit_id: e.target.value })}
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none transition-colors"
                                                >
                                                    {businessUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="text-xs font-medium text-gray-500 block mb-1.5">Invoice Date</label>
                                                <select
                                                    value={formData.invoice_date}
                                                    onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                                                    disabled={isInvoiceDateDisabled()}
                                                    className={`w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none transition-colors ${isInvoiceDateDisabled() ? 'opacity-50 cursor-not-allowed bg-gray-900' : ''}`}
                                                >
                                                    <option value="15th">15th of Month</option>
                                                    <option value="30th">30th of Month</option>
                                                </select>
                                                {isInvoiceDateDisabled() && (
                                                    <p className="text-[10px] text-gray-500 mt-1">Locked by Business Unit</p>
                                                )}
                                            </div>

                                            <div className="pt-2 border-t border-gray-800">
                                                <label className="text-xs font-medium text-gray-500 block mb-2">Service Status</label>
                                                <div className="flex items-center justify-between bg-[#151515] p-2.5 rounded-lg border border-gray-800">
                                                    <span className={`text-sm font-medium ${formData.active ? 'text-green-500' : 'text-gray-400'}`}>
                                                        {formData.active ? 'Active' : 'Disconnected'}
                                                    </span>
                                                    <label className="relative inline-flex items-center cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            className="sr-only peer"
                                                            checked={formData.active}
                                                            onChange={async (e) => {
                                                                // Check MikroTik status first
                                                                const status = await checkMikrotikStatus();
                                                                if (!status.online) {
                                                                    alert('MikroTik router is offline. Please ensure the router is online before changing subscription status.');
                                                                    return;
                                                                }
                                                                setPendingActiveStatus(e.target.checked);
                                                                setShowStatusConfirm(true);
                                                            }}
                                                        />
                                                        <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                                                    </label>
                                                </div>
                                            </div>

                                            <div className="pt-2 border-t border-gray-800">
                                                <label className="text-xs font-medium text-gray-500 block mb-2">Billing Type</label>
                                                <div
                                                    onClick={() => setFormData({ ...formData, is_free: !formData.is_free })}
                                                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${formData.is_free ? 'border-green-500/50 bg-green-500/10' : 'border-gray-800 bg-[#151515]'}`}
                                                >
                                                    <div>
                                                        <span className={`text-sm font-medium block ${formData.is_free ? 'text-green-400' : 'text-gray-400'}`}>
                                                            {formData.is_free ? 'FREE Subscription' : 'Normal Billing'}
                                                        </span>
                                                        <span className="text-[10px] text-gray-500 block mt-0.5">
                                                            {formData.is_free ? 'No invoices or SMS' : 'Regular billing cycle'}
                                                        </span>
                                                    </div>
                                                    <div className={`w-9 h-5 rounded-full relative transition-colors ${formData.is_free ? 'bg-green-500' : 'bg-gray-700'}`}>
                                                        <div className={`absolute top-[2px] w-4 h-4 rounded-full bg-white transition-all ${formData.is_free ? 'left-[18px]' : 'left-[2px]'}`} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Column 2: Location Details */}
                                    <div className="space-y-4 lg:col-span-1">
                                        <div className="flex items-center gap-2 mb-2 text-blue-400">
                                            <MapPin className="w-4 h-4" />
                                            <h4 className="text-sm font-semibold uppercase tracking-wider">Location</h4>
                                        </div>

                                        <div className="bg-gray-900/30 p-4 rounded-xl border border-gray-800 space-y-4 h-full">
                                            <div>
                                                <label className="text-xs font-medium text-gray-500 block mb-1.5">Barangay</label>
                                                <select
                                                    value={formData.barangay}
                                                    onChange={handleBarangayChange}
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none transition-colors"
                                                >
                                                    <option value="">Select Barangay</option>
                                                    {BARANGAY_OPTIONS.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="text-xs font-medium text-gray-500 block mb-1.5">Exact Address</label>
                                                <textarea
                                                    value={formData.address}
                                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                                    rows={3}
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none resize-none transition-colors"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-xs font-medium text-gray-500 block mb-1.5">Landmark</label>
                                                <input
                                                    type="text"
                                                    value={formData.landmark}
                                                    onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none transition-colors"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Column 3: Equipment & Info */}
                                    <div className="space-y-4 lg:col-span-1">
                                        <div className="flex items-center gap-2 mb-2 text-amber-500">
                                            <Hash className="w-4 h-4" />
                                            <h4 className="text-sm font-semibold uppercase tracking-wider">Technical</h4>
                                        </div>

                                        <div className="bg-gray-900/30 p-4 rounded-xl border border-gray-800 space-y-4 h-full">
                                            <div>
                                                <label className="text-xs font-medium text-gray-500 block mb-1.5">Label (Tag)</label>
                                                <input
                                                    type="text"
                                                    value={formData.label}
                                                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                                                    placeholder="e.g. Home, Bakery"
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none transition-colors"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-xs font-medium text-gray-500 block mb-1.5">Date Installed</label>
                                                <input
                                                    type="date"
                                                    value={formData.date_installed}
                                                    onChange={(e) => setFormData({ ...formData, date_installed: e.target.value })}
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none transition-colors"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-xs font-medium text-gray-500 block mb-1.5 flex items-center gap-2">
                                                    Last Reconnection Date
                                                    <span className="text-xs text-amber-500">(Optional)</span>
                                                </label>
                                                <input
                                                    type="date"
                                                    value={formData.last_reconnection_date}
                                                    onChange={(e) => setFormData({ ...formData, last_reconnection_date: e.target.value })}
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 outline-none transition-colors"
                                                />
                                                <p className="text-xs text-gray-600 mt-1">
                                                    Used for pro-rating invoices after reconnection
                                                </p>
                                            </div>

                                            <div>
                                                <label className="text-xs font-medium text-gray-500 block mb-1.5">Router Serial Number</label>
                                                <input
                                                    type="text"
                                                    value={formData.router_serial_number}
                                                    onChange={(e) => setFormData({ ...formData, router_serial_number: e.target.value })}
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none transition-colors font-mono"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Map Section - Full Width Bottom */}
                                <div className="mt-4 pt-4 border-t border-gray-800">
                                    <h4 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-red-500" />
                                        Pin Exact Location
                                    </h4>
                                    <div className="h-64 rounded-xl overflow-hidden border border-gray-800 relative shadow-inner">
                                        <MapPicker
                                            onChange={(val) => handleLocationSelect(val.lat, val.lng)}
                                            center={coordinates ? [coordinates.lat, coordinates.lng] : [14.8437, 120.8113]}
                                            value={coordinates}
                                        />
                                    </div>
                                    <div className="flex gap-4 mt-3">
                                        <div className="text-xs text-gray-500 font-mono bg-gray-900 border border-gray-800 px-2 py-1 rounded">
                                            LAT: {coordinates?.lat.toFixed(6) || '-'}
                                        </div>
                                        <div className="text-xs text-gray-500 font-mono bg-gray-900 border border-gray-800 px-2 py-1 rounded">
                                            LNG: {coordinates?.lng.toFixed(6) || '-'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* PAYMENT EXTENSION TAB */}
                        {activeTab === 'paymentExtension' && (
                            <div className="space-y-5 max-w-3xl mx-auto">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="p-4 bg-gray-900/40 border border-gray-800 rounded-xl">
                                        <div className="text-xs text-gray-500 uppercase mb-2">Business Unit</div>
                                        <div className="text-white font-medium">{selectedBusinessUnit?.name || 'Unknown'}</div>
                                        <div className="text-xs text-gray-500 mt-1">{formData.invoice_date || 'No'} billing cycle</div>
                                    </div>
                                    <div className="p-4 bg-gray-900/40 border border-gray-800 rounded-xl">
                                        <div className="text-xs text-gray-500 uppercase mb-2">Normal Disconnection</div>
                                        <div className="text-white font-medium">{formatDisplayDate(defaultDisconnectionDate)}</div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {formData.invoice_date === '30th' ? '5th of next month' : '25th of the month'}
                                        </div>
                                    </div>
                                    <div className="p-4 bg-gray-900/40 border border-gray-800 rounded-xl">
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
                                            value={formData.promised_date}
                                            min={minimumPromisedDate}
                                            onChange={(e) => setFormData({ ...formData, promised_date: e.target.value })}
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none transition-colors"
                                        />
                                    </div>

                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, promised_date: minimumPromisedDate })}
                                            className="px-4 py-2 bg-purple-600/80 hover:bg-purple-600 text-white rounded-lg text-sm transition-colors"
                                        >
                                            Set Next Available Date
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, promised_date: '' })}
                                            className="px-4 py-2 border border-gray-700 hover:bg-gray-800 text-gray-300 rounded-lg text-sm transition-colors"
                                        >
                                            Clear Extension
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* UPGRADE/DOWNGRADE TAB */}
                        {activeTab === 'plan' && (
                            <div className="space-y-5 max-w-3xl mx-auto">
                                <div className="p-4 bg-amber-900/20 border border-amber-700/50 rounded-xl">
                                    <div className="flex items-start gap-3">
                                        <Shield className="w-5 h-5 text-amber-500 mt-0.5" />
                                        <div>
                                            <div className="text-amber-400 font-medium">Upgrade/Downgrade Plan</div>
                                            <div className="text-sm text-amber-300/70">
                                                This creates prorated plan-change invoices and updates the MikroTik PPP profile.
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-2">Current Plan</label>
                                        <div className="w-full bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 text-white">
                                            {currentPlan?.name || 'Unknown Plan'} - {formatCurrency(currentPlan?.monthly_fee || 0)}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-2">New Plan</label>
                                        <select
                                            value={formData.plan_id}
                                            onChange={async (e) => {
                                                const nextPlanId = e.target.value;
                                                setFormData({ ...formData, plan_id: nextPlanId });
                                                await loadPlanChangePreview(nextPlanId, planChangeDate);
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
                                            await loadPlanChangePreview(formData.plan_id, e.target.value);
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
                                                <div className="text-white font-semibold">{currentPlan?.name || 'Old plan'}</div>
                                                <div className="text-xs text-gray-500 mt-1">{planPreview.oldPlan.fromDate} to {planPreview.oldPlan.toDate}</div>
                                                <div className="text-lg font-bold text-amber-400 mt-2">{formatCurrency(planPreview.oldPlan.amount)}</div>
                                                <div className="text-xs text-gray-500">{planPreview.oldPlan.days} day(s)</div>
                                            </>
                                        ) : (
                                            <div className="text-sm text-gray-500">Select a different plan to preview.</div>
                                        )}
                                    </div>

                                    <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl">
                                        <div className="text-xs text-gray-500 uppercase mb-2">New Plan Invoice</div>
                                        {planPreviewLoading ? (
                                            <div className="text-sm text-gray-400">Calculating...</div>
                                        ) : planPreview ? (
                                            <>
                                                <div className="text-white font-semibold">{selectedPlan?.name || 'New plan'}</div>
                                                <div className="text-xs text-gray-500 mt-1">{planPreview.newPlan.fromDate} to {planPreview.newPlan.toDate}</div>
                                                <div className="text-lg font-bold text-cyan-400 mt-2">{formatCurrency(planPreview.newPlan.amount)}</div>
                                                <div className="text-xs text-gray-500">{planPreview.newPlan.days} day(s)</div>
                                            </>
                                        ) : (
                                            <div className="text-sm text-gray-500">Select a different plan to preview.</div>
                                        )}
                                    </div>
                                </div>

                                <div className="p-3 bg-blue-950/30 border border-blue-900/50 rounded-xl text-xs text-blue-300">
                                    Existing full-period unpaid invoices for this billing period will be converted to the old-plan prorated invoice to prevent duplicates. Confirming also updates subscriptions, mikrotik_ppp_secrets, and the MikroTik PPP profile.
                                </div>
                            </div>
                        )}

                        {/* MIKROTIK PPP TAB */}
                        {activeTab === 'mikrotik' && (
                            <div className="space-y-6">
                                {loadingPpp ? (
                                    <div className="text-center py-12 text-gray-500">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                                        Loading PPP Details...
                                    </div>
                                ) : pppSecret ? (
                                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-4">
                                        <div className="flex items-center gap-3 mb-4">
                                            <Globe className="w-5 h-5 text-blue-500" />
                                            <h3 className="text-lg font-medium text-white">Active PPP Secret</h3>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <label className="text-gray-500 block mb-1">Username</label>
                                                <div className="text-white font-mono bg-[#0a0a0a] px-3 py-2 rounded border border-gray-800">{pppSecret.name}</div>
                                            </div>
                                            <div>
                                                <label className="text-gray-500 block mb-1">Service</label>
                                                <div className="text-white bg-[#0a0a0a] px-3 py-2 rounded border border-gray-800">{pppSecret.service}</div>
                                            </div>
                                            <div>
                                                <label className="text-gray-500 block mb-1">Profile</label>
                                                <div className="text-white bg-[#0a0a0a] px-3 py-2 rounded border border-gray-800">{pppSecret.profile}</div>
                                            </div>
                                            <div>
                                                <label className="text-gray-500 block mb-1">Local Address</label>
                                                <div className="text-white font-mono bg-[#0a0a0a] px-3 py-2 rounded border border-gray-800">{pppSecret.local_address || '-'}</div>
                                            </div>
                                            <div className="col-span-2">
                                                <label className="text-gray-500 block mb-1">Comment</label>
                                                <div className="text-gray-400 italic">{pppSecret.comment || 'No comment'}</div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-12 border-2 border-dashed border-gray-800 rounded-xl">
                                        <Globe className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                                        <h3 className="text-gray-400 font-medium">No PPP Secret Found</h3>
                                        <p className="text-gray-600 text-sm mt-1">This subscription is not linked to a MikroTik PPP secret.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer - Fixed */}
                    <div className="p-6 border-t border-gray-800 bg-[#0a0a0a] flex justify-end gap-3 sticky bottom-0 z-10">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 border border-gray-700 rounded-xl text-gray-300 hover:bg-gray-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleUpdateClick}
                            disabled={isLoading || (activeTab === 'plan' && (!hasPlanChanged || planPreviewLoading || !planPreview || !planChangeWindow.isOpen))}
                            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-purple-900/20"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {activeTab === 'plan' ? 'Apply Plan Change' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Reuse Confirmation Modals... */}
            {showConfirmation && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
                    <div className="relative bg-[#0a0a0a] border-2 border-purple-500/50 rounded-xl shadow w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-white mb-4">Confirm Changes</h3>
                        <p className="text-gray-400 mb-6">Are you sure you want to update this subscription?</p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowConfirmation(false)} className="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-300">Cancel</button>
                            <button onClick={() => handleConfirmUpdate()} className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg">Confirm</button>
                        </div>
                    </div>
                </div>
            )}

            {showSuccess && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
                    <div className="relative bg-[#0a0a0a] border-2 border-green-500/50 rounded-xl shadow w-full max-w-md p-6 flex flex-col items-center text-center">
                        <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">Updated Successfully</h3>
                        <p className="text-gray-400 mb-6">{successMessage}</p>
                        <button onClick={handleSuccessClose} className="w-full px-4 py-2 bg-green-600 rounded-lg text-white">Close</button>
                    </div>
                </div>
            )}

            <ConfirmationDialog
                isOpen={showStatusConfirm}
                onClose={() => { setShowStatusConfirm(false); setPendingActiveStatus(null); }}
                onConfirm={() => {
                    if (pendingActiveStatus !== null) setFormData({ ...formData, active: pendingActiveStatus });
                    setShowStatusConfirm(false); setPendingActiveStatus(null);
                }}
                title={pendingActiveStatus ? 'Enable Subscription?' : 'Disable Subscription?'}
                message={pendingActiveStatus ? 'Enable service for this customer?' : 'Disconnect this customer?'}
                confirmText={pendingActiveStatus ? 'Enable' : 'Disconnect'}
                type={pendingActiveStatus ? 'info' : 'warning'}
            />
        </>
    );
}
