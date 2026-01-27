'use client';

import { useState, useEffect } from 'react';
import { X, User, Phone, MapPin, Home, Landmark as LandmarkIcon, Wifi, Calendar, Building2, FileText, CheckCircle, AlertCircle, Save, Loader2, ClipboardCheck, Hash, UserCheck, Globe } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { addPppSecret } from '@/app/actions/mikrotik';
import { validatePhilippineMobileNumber } from '@/lib/validation';
import dynamic from 'next/dynamic';

const MapPicker = dynamic(() => import('@/components/admin/MapPicker'), {
    ssr: false,
    loading: () => <div className="h-full w-full flex items-center justify-center bg-gray-900/50 rounded-lg"><Loader2 className="w-8 h-8 animate-spin text-red-600" /></div>
});

const BARANGAY_OPTIONS = ['Bulihan', 'San Agustin', 'San Gabriel', 'Liang', 'Catmon'] as const;

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
    const [showPppModal, setShowPppModal] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [reason, setReason] = useState('');

    // PPP Secret form state
    const [pppForm, setPppForm] = useState({
        name: '',
        password: '',
        service: 'pppoe',
        profile: '50MBPS',
        comment: '',
        enabled: true
    });
    const [pppError, setPppError] = useState('');
    const [addToMikrotik, setAddToMikrotik] = useState(false); // Default unchecked - only save to DB

    const [formData, setFormData] = useState({
        business_unit_id: prospect.business_unit_id || '',
        status: prospect.status || 'Closed Won',
        installation_date: prospect.installation_date || '',
        router_serial_number: prospect.router_serial_number || '',
        invoice_date: '15th' // Default value
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
    const [selectedReferrerId, setSelectedReferrerId] = useState<string>(prospect.referrer_id || '');
    const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);

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
            fetchCustomers();
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
                router_serial_number: prospect.router_serial_number || '',
                invoice_date: '15th'
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

    // Auto-select Billing Period based on Business Unit
    useEffect(() => {
        if (!formData.business_unit_id || businessUnits.length === 0) return;

        const unit = businessUnits.find(u => u.id === formData.business_unit_id);
        if (unit) {
            const unitName = unit.name.toLowerCase();
            if (unitName.includes('bulihan') || unitName.includes('extension')) {
                setFormData(prev => ({ ...prev, invoice_date: '15th' }));
            } else if (unitName.includes('malanggam')) {
                setFormData(prev => ({ ...prev, invoice_date: '30th' }));
            }
        }
    }, [formData.business_unit_id, businessUnits]);

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

    const fetchCustomers = async () => {
        try {
            const { data, error } = await supabase
                .from('customers')
                .select('id, name')
                .order('name');

            if (error) throw error;
            setCustomers(data || []);
        } catch (error) {
            console.error('Error fetching customers:', error);
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

    // Check if all required fields are filled and valid
    const isFormValid = () => {
        // Validation for Installation Date
        if (formData.installation_date) {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

            if (formData.status === 'Open') {
                // Open: Date must be TOMORROW or later (Future)
                if (formData.installation_date <= todayStr) {
                    return false;
                }
            } else if (formData.status === 'Closed Won') {
                // Closed Won: Date must be TODAY or PAST (Not Future) - service was installed already
                if (formData.installation_date > todayStr) {
                    return false;
                }
            }
        }

        // For Open status, always valid (just editing prospect)
        if (formData.status === 'Open') {
            return true;
        }

        // For Closed Won, we need all fields including invoice_date
        if (formData.status === 'Closed Won') {
            return formData.business_unit_id &&
                formData.business_unit_id !== '' &&
                formData.status &&
                formData.installation_date &&
                formData.router_serial_number &&
                formData.invoice_date;
        }

        // For Closed Lost, we don't need business unit, installation date, or router
        if (formData.status === 'Closed Lost') {
            return true;
        }

        return false;
    };

    const handleApproveClick = async () => {
        // Validation for Mobile Number
        const currentMobile = formData.status === 'Open' ? prospectData.mobile_number : prospect.mobile_number;
        const mobileValidation = validatePhilippineMobileNumber(currentMobile);
        if (!mobileValidation.isValid) {
            alert(mobileValidation.error + (formData.status !== 'Open' ? " Please switch to 'Open' status to correct it." : ""));
            return;
        }

        // For Open status, just update the prospect
        if (formData.status === 'Open') {
            await handleOpenUpdate();
            return;
        }

        // Specific validation messages
        if (formData.installation_date) {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

            if (formData.status === 'Open' && formData.installation_date <= todayStr) {
                alert('For "Open" status, Installation Date must be in the future (Tomorrow or later).');
                return;
            }
            if (formData.status === 'Closed Won' && formData.installation_date > todayStr) {
                alert('For "Closed Won" status, Installation Date cannot be in the future. Please select Today or a Past date.');
                return;
            }
        }

        // For Closed Won, validate required fields
        if (formData.status === 'Closed Won' && !isFormValid()) {
            alert('Please fill in all required fields. Ensure Installation Date is not in the future.');
            return;
        }

        // If status is Closed Lost, show reason modal
        if (formData.status === 'Closed Lost') {
            setShowReasonModal(true);
        } else {
            // Closed Won - show PPP modal to configure MikroTik user
            // Pre-populate PPP form with prospect data
            const mikrotikName = prospect.name.toUpperCase().replace(/\s+/g, '');
            const planName = plans[prospect.plan_id]?.name || '';
            let profile = '50MBPS';
            if (planName.includes('999') || planName.includes('100')) profile = '100MBPS';
            if (planName.includes('1299') || planName.includes('130')) profile = '130MBPS';
            if (planName.includes('1499') || planName.includes('150')) profile = '150MBPS';

            setPppForm({
                name: mikrotikName,
                password: '1111', // Default password to 1111
                service: 'pppoe',
                profile: profile,
                comment: `Converted from prospect: ${prospect.name}`,
                enabled: true
            });
            setShowPppModal(true);
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
            // For Closed Lost, we send null for fields that might be empty/invalid
            const { error } = await supabase
                .from('prospects')
                .update({
                    status: formData.status,
                    business_unit_id: formData.business_unit_id || null,
                    installation_date: formData.installation_date || null,
                    router_serial_number: formData.router_serial_number || null,
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
        setPppError('');

        try {
            // 0. Optionally add PPP secret to MikroTik (only if checkbox is checked)
            if (addToMikrotik) {
                console.log('[PPP] Adding PPP secret to MikroTik router...');
                const pppResult = await addPppSecret({
                    name: pppForm.name,
                    password: pppForm.password,
                    service: pppForm.service,
                    profile: pppForm.profile,
                    comment: pppForm.comment
                });

                if (!pppResult.success) {
                    console.error('[PPP] Failed to create PPP secret in MikroTik:', pppResult.error);
                    // Continue anyway - don't block customer creation
                } else {
                    console.log('[PPP] PPP secret created in MikroTik successfully');
                }
            } else {
                console.log('[PPP] Skipping MikroTik router (checkbox unchecked) - saving to DB only');
            }

            // 1. Check for existing customer or create new
            let customerId: string;

            // Try to find existing customer by name (exact match, case insensitive)
            const { data: existingCustomers } = await supabase
                .from('customers')
                .select('id')
                .ilike('name', prospect.name)
                .limit(1);

            if (existingCustomers && existingCustomers.length > 0) {
                // Use existing customer
                customerId = existingCustomers[0].id;
                console.log(`Using existing customer: ${prospect.name} (${customerId})`);
            } else {
                // Create new customer
                const { data: newCustomer, error: customerError } = await supabase
                    .from('customers')
                    .insert({
                        name: prospect.name,
                        mobile_number: prospect.mobile_number
                    })
                    .select()
                    .single();

                if (customerError) throw customerError;
                customerId = newCustomer.id;
                console.log(`Created new customer: ${prospect.name} (${customerId})`);
            }

            // 2. Create subscription
            const { data: newSubscription, error: subscriptionError } = await supabase
                .from('subscriptions')
                .insert({
                    subscriber_id: customerId,
                    plan_id: prospect.plan_id,
                    business_unit_id: formData.business_unit_id,
                    address: prospect.address,
                    label: prospect.label,
                    landmark: prospect.landmark,
                    barangay: prospect.barangay,
                    invoice_date: formData.invoice_date, // Use selected invoice date
                    date_installed: formData.installation_date, // Map installation date
                    customer_portal: `/portal/${customerId}`, // Set portal link
                    contact_person: selectedReferrerId || null,
                    router_serial_number: formData.router_serial_number,
                    'x-coordinates': coordinates?.lng || null,
                    'y-coordinates': coordinates?.lat || null
                })
                .select()
                .single();

            if (subscriptionError) throw subscriptionError;

            // 2.5. Always save to mikrotik_ppp_secrets table (as backup)
            console.log('[PPP] Saving PPP secret to database...');
            const { error: pppDbError } = await supabase
                .from('mikrotik_ppp_secrets')
                .insert({
                    customer_id: customerId,
                    subscription_id: newSubscription.id,  // Link to subscription
                    name: pppForm.name,
                    password: pppForm.password,
                    service: pppForm.service,
                    profile: pppForm.profile,
                    comment: pppForm.comment,
                    enabled: pppForm.enabled,
                    disabled: !pppForm.enabled,  // Inverse of enabled
                    local_address: formData.router_serial_number,
                    last_synced_at: addToMikrotik ? new Date().toISOString() : null
                });

            if (pppDbError) {
                console.error('[PPP] Failed to save PPP secret to database:', pppDbError);
                // Continue anyway - don't block customer creation
            } else {
                console.log('[PPP] PPP secret saved to database successfully');
            }


            // 3. Referral Logic: If referrer exists, create a 300 payment for the REFERRER's subscription
            if (selectedReferrerId) {
                console.log('Processing referral for:', selectedReferrerId);

                // Find referrer's subscription (Latest one created)
                const { data: referrerSubs, error: subError } = await supabase
                    .from('subscriptions')
                    .select('id, balance')
                    .eq('subscriber_id', selectedReferrerId)
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
                    console.warn('No subscription found for referrer:', selectedReferrerId);
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

                <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-purple-900/50 rounded-2xl shadow-[0_0_60px_rgba(139,92,246,0.15)] w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div className="sticky top-0 bg-gradient-to-r from-[#0f0f0f] to-[#0a0a0a] border-b border-gray-800/50 p-6 flex justify-between items-center">
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 via-violet-600/10 to-fuchsia-600/10 rounded-xl blur-xl" />
                            <div className="relative flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-violet-600 flex items-center justify-center shadow-lg">
                                    <ClipboardCheck className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">Verify Prospect</h2>
                                    <p className="text-gray-400 text-sm">Review and verify prospect information</p>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-6">
                        {/* Editable Fields - Status First */}
                        <div className="grid grid-cols-1 gap-4 p-4 bg-gray-900/50 border border-gray-800 rounded-xl">
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
                            <div className="grid grid-cols-2 gap-4">
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

                                {/* Billing Period - Only show for Closed Won AND when Business Unit is selected */}
                                {formData.status === 'Closed Won' && formData.business_unit_id && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">
                                            <Calendar className="w-4 h-4 inline mr-2" />
                                            Billing Period <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            value={formData.invoice_date}
                                            onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                                        >
                                            {(() => {
                                                const unitName = businessUnits.find(u => u.id === formData.business_unit_id)?.name.toLowerCase() || '';
                                                const isExtension = unitName.includes('extension');
                                                const isMalanggam = unitName.includes('malanggam');
                                                const isBulihan = unitName.includes('bulihan');

                                                // Extension allows both options for edge cases
                                                const disable15th = isMalanggam && !isExtension;
                                                const disable30th = isBulihan && !isExtension;

                                                return (
                                                    <>
                                                        <option value="15th" disabled={disable15th}>
                                                            15th of the Month
                                                        </option>
                                                        <option value="30th" disabled={disable30th}>
                                                            30th of the Month
                                                        </option>
                                                    </>
                                                );
                                            })()}
                                        </select>
                                        {businessUnits.find(u => u.id === formData.business_unit_id)?.name.toLowerCase().includes('extension') && (
                                            <p className="text-xs text-gray-500 mt-1">
                                                Extensions can use either billing period.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Installation Date - Enabled for Open and Closed Won, Disabled for Closed Lost */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        <Calendar className="w-4 h-4 inline mr-2" />
                                        Installation Date {formData.status === 'Closed Won' && <span className="text-red-500">*</span>}
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.installation_date}
                                        onChange={(e) => setFormData({ ...formData, installation_date: e.target.value })}
                                        disabled={formData.status === 'Closed Lost'}
                                        max={formData.status === 'Closed Won' ? (() => {
                                            const today = new Date();
                                            return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                                        })() : undefined}
                                        min={formData.status === 'Open' ? minDate : undefined}
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
                                                <select
                                                    value={prospectData.barangay}
                                                    onChange={(e) => setProspectData({ ...prospectData, barangay: e.target.value })}
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 mt-1"
                                                >
                                                    <option value="">Select Barangay</option>
                                                    {BARANGAY_OPTIONS.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
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
                                    {/* Referrer Lookup - Editable for Closed Won */}
                                    {formData.status === 'Closed Won' ? (
                                        <div className="flex items-start gap-3">
                                            <UserCheck className="w-4 h-4 text-teal-500 mt-0.5" />
                                            <div className="flex-1">
                                                <label className="text-xs text-gray-500 mb-1 block">Referrer (Optional)</label>
                                                <select
                                                    value={selectedReferrerId}
                                                    onChange={(e) => setSelectedReferrerId(e.target.value)}
                                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                                                >
                                                    <option value="">Select Referrer</option>
                                                    {customers.map(customer => (
                                                        <option key={customer.id} value={customer.id}>
                                                            {customer.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="text-xs text-gray-600 mt-1">
                                                    Select a referrer to apply the ₱300 credit.
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Read-only Referrer for other statuses */
                                        prospect.referrer_id && (
                                            <div className="flex items-start gap-3">
                                                <UserCheck className="w-4 h-4 text-teal-500 mt-0.5" />
                                                <div className="flex-1">
                                                    <label className="text-xs text-gray-500">Referrer</label>
                                                    <p className="text-sm text-gray-300 font-medium">{referrerName || 'Loading...'}</p>
                                                    <p className="text-xs text-gray-500 font-mono mt-0.5">{prospect.referrer_id}</p>
                                                </div>
                                            </div>
                                        )
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
                    <div className="sticky bottom-0 bg-gradient-to-r from-[#0f0f0f] to-[#0a0a0a] border-t border-gray-800/50 p-6 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-gray-300 font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleApproveClick}
                            disabled={!isFormValid() || isLoading}
                            className={`px-6 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${isFormValid() && !isLoading
                                ? 'bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white shadow-lg shadow-purple-900/30'
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
                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-amber-900/50 rounded-2xl shadow-[0_0_60px_rgba(245,158,11,0.15)] w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-white mb-4">Reason for Closed Lost</h3>
                        <p className="text-gray-400 text-sm mb-4">Please provide a reason why this prospect is marked as Closed Lost:</p>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={4}
                            placeholder="Enter reason..."
                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 resize-none"
                        />
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowReasonModal(false)}
                                className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-gray-300 font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReasonSubmit}
                                disabled={!reason.trim() || isLoading}
                                className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-all ${reason.trim() && !isLoading
                                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg'
                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    }`}
                            >
                                {isLoading ? 'Saving...' : 'Submit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PPP Secret Modal - Step before Confirmation */}
            {showPppModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowPppModal(false)} />
                    <div className="relative bg-[#0a0a0a] border-2 border-blue-900/50 rounded-xl shadow-[0_0_50px_rgba(0,100,255,0.2)] w-full max-w-md p-6">
                        <button
                            onClick={() => setShowPppModal(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                            <Globe className="w-5 h-5 text-blue-500" />
                            Create MikroTik User
                        </h2>
                        <p className="text-gray-400 text-sm mb-6">
                            Configure the PPP secret that will be created in MikroTik for this customer.
                        </p>

                        {pppError && (
                            <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                {pppError}
                            </div>
                        )}

                        <div className="space-y-4">
                            {/* Enabled Checkbox */}
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="ppp-enabled"
                                    checked={pppForm.enabled}
                                    onChange={(e) => setPppForm({ ...pppForm, enabled: e.target.checked })}
                                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                                />
                                <label htmlFor="ppp-enabled" className="text-sm font-medium text-gray-300">Enabled</label>
                            </div>

                            {/* Name (Username) */}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Name (Username)</label>
                                <input
                                    type="text"
                                    value={pppForm.name}
                                    onChange={(e) => setPppForm({ ...pppForm, name: e.target.value.toUpperCase().replace(/\s+/g, '') })}
                                    className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-800 rounded-lg focus:border-blue-500 focus:outline-none text-white font-mono"
                                    placeholder="CUSTOMERNAME"
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                                <input
                                    type="text"
                                    value={pppForm.password}
                                    readOnly
                                    className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-800 rounded-lg focus:border-blue-500 focus:outline-none text-white font-mono cursor-not-allowed opacity-75"
                                    placeholder="Enter password"
                                />
                            </div>

                            {/* Service */}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Service</label>
                                <select
                                    value={pppForm.service}
                                    disabled
                                    className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-800 rounded-lg focus:border-blue-500 focus:outline-none text-white cursor-not-allowed opacity-75"
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
                                    value={pppForm.profile}
                                    onChange={(e) => setPppForm({ ...pppForm, profile: e.target.value })}
                                    className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-800 rounded-lg focus:border-blue-500 focus:outline-none text-white"
                                >
                                    <option value="default">default</option>
                                    <option value="50MBPS">50MBPS</option>
                                    <option value="50MBPS-2">50MBPS-2</option>
                                    <option value="100MBPS">100MBPS</option>
                                    <option value="100MBPS-2">100MBPS-2</option>
                                    <option value="130MBPS">130MBPS</option>
                                    <option value="150MBPS">150MBPS</option>
                                </select>
                            </div>

                            {/* Comment */}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Comment</label>
                                <input
                                    type="text"
                                    value={pppForm.comment}
                                    onChange={(e) => setPppForm({ ...pppForm, comment: e.target.value })}
                                    className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-800 rounded-lg focus:border-blue-500 focus:outline-none text-white"
                                    placeholder="Optional comment"
                                />
                            </div>

                            {/* Add to MikroTik Checkbox */}
                            <div className="pt-4 border-t border-gray-700">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="add-to-mikrotik"
                                        checked={addToMikrotik}
                                        onChange={(e) => setAddToMikrotik(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-green-600 focus:ring-green-500"
                                    />
                                    <label htmlFor="add-to-mikrotik" className="text-sm font-medium text-gray-300">
                                        Also add to MikroTik Router
                                    </label>
                                </div>
                                <p className={`text-xs mt-1 ${addToMikrotik ? 'text-green-400' : 'text-yellow-400'}`}>
                                    {addToMikrotik
                                        ? '✓ Will create PPP secret in MikroTik router'
                                        : '⚠ Will only save to database (recommended for testing)'}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowPppModal(false)}
                                className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-gray-300 font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (!pppForm.name || !pppForm.password) {
                                        setPppError('Username and password are required');
                                        return;
                                    }
                                    setShowPppModal(false);
                                    setShowConfirmation(true);
                                }}
                                disabled={!pppForm.name || !pppForm.password}
                                className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-all ${pppForm.name && pppForm.password
                                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg'
                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    }`}
                            >
                                Next: Review
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
                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-emerald-900/50 rounded-2xl shadow-[0_0_60px_rgba(16,185,129,0.15)] w-full max-w-2xl p-6">
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
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase">Billing Period</label>
                                        <p className="text-white font-medium">{formData.invoice_date} of the Month</p>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-xs text-gray-500 uppercase">Location + Brgy</label>
                                        <p className="text-white font-medium">{prospect.address}, {prospect.barangay}</p>
                                    </div>
                                </div>

                                {/* MikroTik PPP Details */}
                                <div className="border-t border-gray-700 pt-4 mt-4">
                                    <h4 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                                        <Globe className="w-4 h-4" />
                                        MikroTik PPP Secret
                                    </h4>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase">Username</label>
                                            <p className="text-white font-mono text-sm">{pppForm.name}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase">Profile</label>
                                            <p className="text-white font-medium">{pppForm.profile}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase">Service</label>
                                            <p className="text-white font-medium">{pppForm.service}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowConfirmation(false)}
                                    className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-gray-300 font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmApprove}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-xl font-medium transition-all shadow-lg"
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
