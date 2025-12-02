'use client';

import { useState, useEffect } from 'react';
import { X, User, Phone, MapPin, Home, Landmark as LandmarkIcon, Wifi, Calendar, Building2, FileText, CheckCircle, AlertCircle, Save, Loader2, ClipboardCheck, Hash, UserCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import dynamic from 'next/dynamic';

const MapPicker = dynamic(() => import('@/components/admin/MapPicker'), {
    ssr: false,
    loading: () => <div className="h-full w-full flex items-center justify-center bg-gray-900/50 rounded-lg"><Loader2 className="w-8 h-8 animate-spin text-red-600" /></div>
});

interface Prospect {
    id: string;
    name: string;
    plan_id: string;
    business_unit_id: string;
    landmark: string;
    barangay: string;
    address: string;
    label?: string;
    mobile_number: string;
    installation_date: string;
    referrer_id: string;
    details: string;
    status: string;
    router_serial_number?: string;
    created_at: string;
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

interface EditProspectModalProps {
    isOpen: boolean;
    onClose: () => void;
    prospect: Prospect;
    onUpdate: () => void;
}

export default function EditProspectModal({ isOpen, onClose, prospect, onUpdate }: EditProspectModalProps) {
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [plans, setPlans] = useState<{ [key: string]: Plan }>({});
    const [isLoading, setIsLoading] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [showReasonModal, setShowReasonModal] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [reason, setReason] = useState('');

    const [formData, setFormData] = useState({
        business_unit_id: prospect.business_unit_id || '',
        status: prospect.status || 'Closed Won',
        installation_date: prospect.installation_date || '',
        router_serial_number: prospect.router_serial_number || ''
    });

    const [prospectData, setProspectData] = useState({
        name: prospect.name || '',
        mobile_number: prospect.mobile_number || '',
        barangay: prospect.barangay || '',
        address: prospect.address || '',
        landmark: prospect.landmark || '',
        label: prospect.label || '',
        details: prospect.details || '',
        plan_id: prospect.plan_id || ''
    });

    const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
    const [referrerName, setReferrerName] = useState<string>('');

    // Calculate tomorrow's date for min attribute (Local Time)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const minDate = `${year}-${month}-${day}`;

    useEffect(() => {
        if (isOpen) {
            fetchBusinessUnits();
            fetchPlans();
            if (prospect['x-coordinates'] && prospect['y-coordinates']) {
                setCoordinates({
                    lat: prospect['y-coordinates'],
                    lng: prospect['x-coordinates']
                });
            } else {
                setCoordinates(null);
            }
            // Initialize form data from prospect
            let initialDate = prospect.installation_date;
            if (!initialDate || initialDate < minDate) {
                initialDate = minDate;
            }

            setFormData({
                business_unit_id: prospect.business_unit_id || '',
                status: prospect.status || 'Closed Won',
                installation_date: initialDate,
                router_serial_number: prospect.router_serial_number || ''
            });

            setProspectData({
                name: prospect.name || '',
                mobile_number: prospect.mobile_number || '',
                barangay: prospect.barangay || '',
                address: prospect.address || '',
                landmark: prospect.landmark || '',
                label: prospect.label || '',
                details: prospect.details || '',
                plan_id: prospect.plan_id || ''
            });
        }
    }, [isOpen, prospect, minDate]);

    useEffect(() => {
        if (prospect.referrer_id) {
            fetchReferrerName();
        } else {
            setReferrerName('');
        }
    }, [prospect.referrer_id]);

    const fetchReferrerName = async () => {
        try {
            const { data, error } = await supabase
                .from('customers')
                .select('name')
                .eq('id', prospect.referrer_id)
                .single();

            if (error) throw error;
            if (data) setReferrerName(data.name);
        } catch (error) {
            console.error('Error fetching referrer name:', error);
        }
    };

    const fetchBusinessUnits = async () => {
        try {
            const { data, error } = await supabase
                .from('business_units')
                .select('id, name')
                .order('name');

            if (error) throw error;
            setBusinessUnits(data || []);
        } catch (error) {
            console.error('Error fetching business units:', error);
        }
    };

    const fetchPlans = async () => {
        try {
            const { data, error } = await supabase
                .from('plans')
                .select('id, name, monthly_fee');

            if (error) throw error;

            const plansMap: { [key: string]: Plan } = {};
            data?.forEach(plan => {
                plansMap[plan.id] = plan;
            });
            setPlans(plansMap);
        } catch (error) {
            console.error('Error fetching plans:', error);
        }
    };

    const getPlanDisplay = (planId: string) => {
        if (!planId || !plans[planId]) return '-';
        const plan = plans[planId];
        return `${plan.name} - ₱${plan.monthly_fee.toLocaleString()}`;
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toISOString().split('T')[0];
    };

    const formatDateDisplay = (dateString: string) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    };

    // Check if all required fields are filled
    const isFormValid = () => {
        // For Open status, always valid (just editing prospect)
        if (formData.status === 'Open') {
            return true;
        }

        // For Closed Won, we need all fields
        if (formData.status === 'Closed Won') {
            return formData.business_unit_id &&
                formData.business_unit_id !== '' &&
                formData.status &&
                formData.installation_date &&
                formData.router_serial_number;
        }

        // For Closed Lost, we don't need business unit, installation date, or router
        if (formData.status === 'Closed Lost') {
            return true;
        }

        return false;
    };

    const handleApproveClick = async () => {
        // For Open status, just update the prospect
        if (formData.status === 'Open') {
            await handleOpenUpdate();
            return;
        }

        // For Closed Won, validate required fields
        if (formData.status === 'Closed Won' && !isFormValid()) {
            alert('Please fill in all required fields: Business Unit, Status, Installation Date, and Router Serial');
            return;
        }

        // If status is Closed Lost, show reason modal
        if (formData.status === 'Closed Lost') {
            setShowReasonModal(true);
        } else {
            // Closed Won - show confirmation
            setShowConfirmation(true);
        }
    };

    const handleOpenUpdate = async () => {
        setIsLoading(true);
        try {
            const { error } = await supabase
                .from('prospects')
                .update({
                    status: formData.status,
                    name: prospectData.name,
                    mobile_number: prospectData.mobile_number,
                    barangay: prospectData.barangay,
                    address: prospectData.address,
                    landmark: prospectData.landmark,
                    label: prospectData.label,
                    details: prospectData.details,
                    plan_id: prospectData.plan_id,
                    installation_date: formData.installation_date,
                    'x-coordinates': coordinates?.lng || null,
                    'y-coordinates': coordinates?.lat || null
                })
                .eq('id', prospect.id);

            if (error) throw error;
            setShowSuccess(true);
        } catch (error) {
            console.error('Error updating prospect:', error);
            alert('Failed to update prospect');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReasonSubmit = async () => {
        if (!reason.trim()) {
            alert('Please provide a reason for Closed Lost status');
            return;
        }

        setIsLoading(true);
        setShowReasonModal(false);

        try {
            // Update prospect with reason in details field
            const { error } = await supabase
                .from('prospects')
                .update({
                    status: formData.status,
                    business_unit_id: formData.business_unit_id,
                    installation_date: formData.installation_date,
                    router_serial_number: formData.router_serial_number,
                    details: reason
                })
                .eq('id', prospect.id);

            if (error) throw error;

            setShowSuccess(true);
        } catch (error) {
            console.error('Error updating prospect:', error);
            alert('Failed to update prospect');
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmApprove = async () => {
        setIsLoading(true);
        setShowConfirmation(false);

        try {
            // Determine invoice_date based on business unit
            let invoice_date = '15th'; // default
            const unit = businessUnits.find(u => u.id === formData.business_unit_id);
            if (unit) {
                const unitName = unit.name.toLowerCase();
                if (unitName.includes('malanggam')) {
                    invoice_date = '30th';
                } else if (unitName.includes('bulihan') || unitName.includes('extension')) {
                    invoice_date = '15th';
                }
            }

            // 1. Create customer
            const { data: newCustomer, error: customerError } = await supabase
                .from('customers')
                .insert({
                    name: prospect.name,
                    mobile_number: prospect.mobile_number
                })
                .select()
                .single();

            if (customerError) throw customerError;

            // 2. Create subscription
            const { data: newSubscription, error: subscriptionError } = await supabase
                .from('subscriptions')
                .insert({
                    subscriber_id: newCustomer.id,
                    plan_id: prospect.plan_id,
                    business_unit_id: formData.business_unit_id,
                    address: prospect.address,
                    label: prospect.label,
                    landmark: prospect.landmark,
                    barangay: prospect.barangay,
                    invoice_date: invoice_date,
                    contact_person: prospect.referrer_id || null,
                    router_serial_number: formData.router_serial_number,
                    'x-coordinates': coordinates?.lng || null,
                    'y-coordinates': coordinates?.lat || null
                })
                .select()
                .single();

            if (subscriptionError) throw subscriptionError;

            // 3. Referral Logic: If referrer exists, create a 300 payment for the REFERRER's subscription
            if (prospect.referrer_id) {
                console.log('Processing referral for:', prospect.referrer_id);

                // Find referrer's subscription (Latest one created)
                const { data: referrerSubs, error: subError } = await supabase
                    .from('subscriptions')
                    .select('id, balance')
                    .eq('subscriber_id', prospect.referrer_id)
                    .order('created_at', { ascending: false }) // Latest subscription
                    .limit(1);

                if (subError) {
                    console.error('Error finding referrer subscription:', subError);
                }

                const referrerSub = referrerSubs && referrerSubs.length > 0 ? referrerSubs[0] : null;
                console.log('Referrer subscription found:', referrerSub);

                if (referrerSub) {
                    // Create referral credit payment
                    const { error: referralError } = await supabase
                        .from('payments')
                        .insert({
                            subscription_id: referrerSub.id,
                            amount: 300,
                            mode: 'Referral Credit',
                            notes: `Referral bonus for new subscriber: ${prospect.name}`,
                            settlement_date: new Date().toISOString().split('T')[0]
                        });

                    if (referralError) {
                        console.error('Error creating referral credit:', referralError);
                    }

                    // Update referrer's balance by subtracting 300
                    const currentBalance = Number(referrerSub.balance) || 0;
                    const newBalance = currentBalance - 300;

                    console.log(`Updating balance from ${currentBalance} to ${newBalance}`);

                    const { error: updateError } = await supabase
                        .from('subscriptions')
                        .update({
                            balance: newBalance,
                            referral_credit_applied: true
                        })
                        .eq('id', referrerSub.id);

                    if (updateError) {
                        console.error('Error updating referrer balance:', updateError);
                        // alert('Failed to update referrer balance: ' + updateError.message);
                    } else {
                        console.log('Referrer balance updated successfully');
                        // alert(`Referral credit applied! New Balance: ${newBalance}`);
                    }
                } else {
                    console.warn('No subscription found for referrer:', prospect.referrer_id);
                    // alert('Referrer has no subscription to apply credit to.');
                }
            }

            // 4. Delete the prospect from prospects table (conversion complete)
            const { error: prospectError } = await supabase
                .from('prospects')
                .delete()
                .eq('id', prospect.id);

            if (prospectError) throw prospectError;

            setShowSuccess(true);

        } catch (error) {
            console.error('Error approving prospect:', error);
            alert('Failed to approve prospect. Please try again.');
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

                <div className="relative bg-[#0a0a0a] border-2 border-red-900/50 rounded-xl shadow-[0_0_50px_rgba(255,0,0,0.3)] w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div className="sticky top-0 bg-[#0a0a0a] border-b border-red-900/30 p-6 flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-bold text-white neon-text flex items-center gap-2">
                                <ClipboardCheck className="w-6 h-6" />
                                Verify Prospect
                            </h2>
                            <p className="text-gray-400 text-sm mt-1">Review and verify prospect information</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-6">
                        {/* Editable Fields - Status First */}
                        <div className="grid grid-cols-1 gap-4 p-4 bg-[#0f0f0f] border border-red-900/20 rounded-lg">
                            {/* Status Field - Always First */}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    <FileText className="w-4 h-4 inline mr-2" />
                                    Status <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                                >
                                    <option value="Open">Open</option>
                                    <option value="Closed Won">Closed Won</option>
                                    <option value="Closed Lost">Closed Lost</option>
                                </select>
                            </div>

                            {/* Conditional Fields Grid */}
                            <div className={`grid gap-4 ${formData.status === 'Closed Won' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                {/* Business Unit - Disabled for Open and Closed Lost */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        <Building2 className="w-4 h-4 inline mr-2" />
                                        Business Unit {formData.status === 'Closed Won' && <span className="text-red-500">*</span>}
                                    </label>
                                    <select
                                        value={formData.business_unit_id}
                                        onChange={(e) => setFormData({ ...formData, business_unit_id: e.target.value })}
                                        disabled={formData.status === 'Open' || formData.status === 'Closed Lost'}
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <option value="">Select Business Unit</option>
                                        {businessUnits.map(unit => (
                                            <option key={unit.id} value={unit.id}>
                                                {unit.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Installation Date - Enabled for Open and Closed Won, Disabled for Closed Lost */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        <Calendar className="w-4 h-4 inline mr-2" />
                                        Installation Date {formData.status === 'Closed Won' && <span className="text-red-500">*</span>}
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.installation_date}
                                        min={minDate}
                                        onChange={(e) => setFormData({ ...formData, installation_date: e.target.value })}
                                        disabled={formData.status === 'Closed Lost'}
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                </div>

                                {/* Router Serial - Only show for Closed Won */}
                                {formData.status === 'Closed Won' && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">
                                            <Hash className="w-4 h-4 inline mr-2" />
                                            Router Serial <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.router_serial_number}
                                            onChange={(e) => setFormData({ ...formData, router_serial_number: e.target.value })}
                                            placeholder="Enter serial number"
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Prospect Details (Read-only) */}
                        <div className="grid grid-cols-2 gap-6">
                            {/* Basic Information */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase border-b border-gray-800 pb-2">
                                    Basic Information
                                </h3>
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3">
                                        <User className="w-4 h-4 text-blue-500 mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-xs text-gray-500">Name</label>
                                            {formData.status === 'Open' ? (
                                                <input
                                                    type="text"
                                                    value={prospectData.name}
                                                    onChange={(e) => setProspectData({ ...prospectData, name: e.target.value })}
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 mt-1"
                                                />
                                            ) : (
                                                <p className="text-sm text-white">{prospect.name}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <Phone className="w-4 h-4 text-green-500 mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-xs text-gray-500">Mobile Number</label>
                                            {formData.status === 'Open' ? (
                                                <input
                                                    type="tel"
                                                    value={prospectData.mobile_number}
                                                    onChange={(e) => setProspectData({ ...prospectData, mobile_number: e.target.value })}
                                                    maxLength={11}
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 mt-1"
                                                />
                                            ) : (
                                                <p className="text-sm text-gray-300">{prospect.mobile_number || '-'}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Location Details */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase border-b border-gray-800 pb-2">
                                    Location Details
                                </h3>
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3">
                                        <MapPin className="w-4 h-4 text-red-500 mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-xs text-gray-500">Barangay</label>
                                            {formData.status === 'Open' ? (
                                                <input
                                                    type="text"
                                                    value={prospectData.barangay}
                                                    onChange={(e) => setProspectData({ ...prospectData, barangay: e.target.value })}
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 mt-1"
                                                />
                                            ) : (
                                                <p className="text-sm text-gray-300">{prospect.barangay || '-'}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <Home className="w-4 h-4 text-orange-500 mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-xs text-gray-500">Address</label>
                                            {formData.status === 'Open' ? (
                                                <textarea
                                                    value={prospectData.address}
                                                    onChange={(e) => setProspectData({ ...prospectData, address: e.target.value })}
                                                    rows={2}
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 mt-1 resize-none"
                                                />
                                            ) : (
                                                <p className="text-sm text-gray-300">{prospect.address || '-'}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <LandmarkIcon className="w-4 h-4 text-yellow-500 mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-xs text-gray-500">Landmark</label>
                                            {formData.status === 'Open' ? (
                                                <input
                                                    type="text"
                                                    value={prospectData.landmark}
                                                    onChange={(e) => setProspectData({ ...prospectData, landmark: e.target.value })}
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 mt-1"
                                                />
                                            ) : (
                                                <p className="text-sm text-gray-300">{prospect.landmark || '-'}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Service Information */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase border-b border-gray-800 pb-2">
                                    Service Information
                                </h3>
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3">
                                        <Wifi className="w-4 h-4 text-cyan-500 mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-xs text-gray-500">Plan</label>
                                            {formData.status === 'Open' ? (
                                                <select
                                                    value={prospectData.plan_id}
                                                    onChange={(e) => setProspectData({ ...prospectData, plan_id: e.target.value })}
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 mt-1"
                                                >
                                                    <option value="">Select Plan</option>
                                                    {Object.values(plans).map(plan => (
                                                        <option key={plan.id} value={plan.id}>
                                                            {plan.name} - ₱{plan.monthly_fee.toLocaleString()}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <p className="text-sm text-gray-300">{getPlanDisplay(prospect.plan_id)}</p>
                                            )}
                                        </div>
                                    </div>
                                    {(formData.status === 'Open' || prospect.label) && (
                                        <div className="flex items-start gap-3">
                                            <FileText className="w-4 h-4 text-purple-500 mt-0.5" />
                                            <div className="flex-1">
                                                <label className="text-xs text-gray-500">Label</label>
                                                {formData.status === 'Open' ? (
                                                    <input
                                                        type="text"
                                                        value={prospectData.label}
                                                        onChange={(e) => setProspectData({ ...prospectData, label: e.target.value })}
                                                        placeholder="e.g., Home, Office, Work"
                                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 mt-1"
                                                    />
                                                ) : (
                                                    <p className="text-sm text-gray-300">{prospect.label}</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Additional Details */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase border-b border-gray-800 pb-2">
                                    Additional Details
                                </h3>
                                <div className="space-y-4">
                                    {/* Referrer - Always show, read-only */}
                                    {prospect.referrer_id && (
                                        <div className="flex items-start gap-3">
                                            <UserCheck className="w-4 h-4 text-teal-500 mt-0.5" />
                                            <div className="flex-1">
                                                <label className="text-xs text-gray-500">Referrer</label>
                                                <p className="text-sm text-gray-300 font-medium">{referrerName || 'Loading...'}</p>
                                                <p className="text-xs text-gray-500 font-mono mt-0.5">{prospect.referrer_id}</p>
                                            </div>
                                        </div>
                                    )}
                                    {(formData.status === 'Open' || prospect.details) && (
                                        <div className="flex items-start gap-3">
                                            <FileText className="w-4 h-4 text-amber-500 mt-0.5" />
                                            <div className="flex-1">
                                                <label className="text-xs text-gray-500">Notes</label>
                                                {formData.status === 'Open' ? (
                                                    <textarea
                                                        value={prospectData.details}
                                                        onChange={(e) => setProspectData({ ...prospectData, details: e.target.value })}
                                                        rows={3}
                                                        placeholder="Add any additional notes..."
                                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 mt-1 resize-none"
                                                    />
                                                ) : (
                                                    <p className="text-sm text-gray-300">{prospect.details}</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Map */}
                        {coordinates && (
                            <div>
                                <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase">Location Map</h3>
                                <div className="w-full h-64 rounded-lg overflow-hidden border border-gray-800">
                                    <MapPicker
                                        center={[coordinates.lat, coordinates.lng]}
                                        value={coordinates}
                                        onChange={() => { }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="sticky bottom-0 bg-[#0a0a0a] border-t border-red-900/30 p-6 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleApproveClick}
                            disabled={!isFormValid() || isLoading}
                            className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${isFormValid() && !isLoading
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    Save
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Reason Modal for Closed Lost */}
            {showReasonModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowReasonModal(false)} />
                    <div className="relative bg-[#0a0a0a] border-2 border-red-900/50 rounded-xl shadow-[0_0_50px_rgba(255,0,0,0.3)] w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-white mb-4">Reason for Closed Lost</h3>
                        <p className="text-gray-400 text-sm mb-4">Please provide a reason why this prospect is marked as Closed Lost:</p>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={4}
                            placeholder="Enter reason..."
                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 resize-none"
                        />
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowReasonModal(false)}
                                className="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReasonSubmit}
                                disabled={!reason.trim() || isLoading}
                                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${reason.trim() && !isLoading
                                    ? 'bg-red-600 hover:bg-red-700 text-white'
                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    }`}
                            >
                                {isLoading ? 'Saving...' : 'Submit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {/* Confirmation Modal */}
            {showConfirmation && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowConfirmation(false)} />
                    <div className="relative bg-[#0a0a0a] border-2 border-green-900/50 rounded-xl shadow-[0_0_50px_rgba(0,255,0,0.2)] w-full max-w-2xl p-6">
                        <div className="flex flex-col">
                            <div className="flex items-center justify-center mb-4">
                                <div className="w-12 h-12 bg-green-900/20 rounded-full flex items-center justify-center">
                                    <AlertCircle className="w-6 h-6 text-green-500" />
                                </div>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2 text-center">Confirm Approval</h3>
                            <p className="text-gray-400 mb-6 text-center">
                                Please review the details below before approving this prospect.
                            </p>

                            {/* Details Grid */}
                            <div className="bg-[#0f0f0f] border border-gray-800 rounded-lg p-6 mb-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase">Customer Name</label>
                                        <p className="text-white font-medium">{prospect.name}</p>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase">Customer Mobile</label>
                                        <p className="text-white font-medium">{prospect.mobile_number}</p>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase">Router Number</label>
                                        <p className="text-white font-medium">{formData.router_serial_number}</p>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase">Plan</label>
                                        <p className="text-white font-medium">{plans[prospect.plan_id]?.name || '-'}</p>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase">Installation Date</label>
                                        <p className="text-white font-medium">{formatDateDisplay(formData.installation_date)}</p>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase">Business Unit</label>
                                        <p className="text-white font-medium">{businessUnits.find(bu => bu.id === formData.business_unit_id)?.name || '-'}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-xs text-gray-500 uppercase">Location + Brgy</label>
                                        <p className="text-white font-medium">{prospect.address}, {prospect.barangay}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowConfirmation(false)}
                                    className="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmApprove}
                                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                                >
                                    Yes, Approve
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccess && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                    <div className="relative bg-[#0a0a0a] border-2 border-green-900/50 rounded-xl shadow-[0_0_50px_rgba(0,255,0,0.3)] w-full max-w-md p-6">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-green-900/20 rounded-full flex items-center justify-center mb-4">
                                <CheckCircle className="w-8 h-8 text-green-500" />
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">Success!</h3>
                            <p className="text-gray-400 mb-6">
                                {formData.status === 'Closed Lost'
                                    ? 'Prospect has been updated with the reason.'
                                    : 'Prospect has been successfully approved and converted to a customer.'}
                            </p>
                            <button
                                onClick={handleSuccessClose}
                                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
