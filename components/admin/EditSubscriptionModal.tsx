'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, User, MapPin, Wifi, Calendar, Building2, FileText, CheckCircle, AlertCircle, Loader2, CreditCard, ExternalLink, Search, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import dynamic from 'next/dynamic';

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

interface EditSubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    subscription: Subscription;
    onUpdate: () => void;
}

const BARANGAY_OPTIONS = ['Bulihan', 'San Agustin', 'San Gabriel', 'Liang', 'Catmon'] as const;

export default function EditSubscriptionModal({ isOpen, onClose, subscription, onUpdate }: EditSubscriptionModalProps) {
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const [formData, setFormData] = useState({
        active: subscription.active,
        invoice_date: subscription.invoice_date || '',
        plan_id: subscription.plan_id,
        business_unit_id: subscription.business_unit_id,
        date_installed: subscription.date_installed ? new Date(subscription.date_installed).toISOString().split('T')[0] : '',
        address: subscription.address,
        barangay: subscription.barangay,
        landmark: subscription.landmark,
        label: subscription.label || '',
        contact_person: subscription.contact_person, // referrer ID
        referral_credit_applied: subscription.referral_credit_applied
    });

    const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchBusinessUnits();
            fetchPlans();
            fetchCustomers();
            // Initialize form data when modal opens or subscription changes
            setFormData({
                active: subscription.active,
                invoice_date: subscription.invoice_date || '',
                plan_id: subscription.plan_id,
                business_unit_id: subscription.business_unit_id,
                date_installed: subscription.date_installed ? new Date(subscription.date_installed).toISOString().split('T')[0] : '',
                address: subscription.address,
                barangay: subscription.barangay,
                landmark: subscription.landmark,
                label: subscription.label || '',
                contact_person: subscription.contact_person,
                referral_credit_applied: subscription.referral_credit_applied
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
    }, [isOpen, subscription]);

    // Auto-set invoice date based on business unit
    useEffect(() => {
        if (formData.business_unit_id) {
            const unit = businessUnits.find(u => u.id === formData.business_unit_id);
            if (unit) {
                const unitName = unit.name.toLowerCase();
                if (unitName.includes('malanggam')) {
                    setFormData(prev => ({ ...prev, invoice_date: '30th' }));
                } else if (unitName.includes('bulihan') || unitName.includes('extension')) {
                    setFormData(prev => ({ ...prev, invoice_date: '15th' }));
                }
            }
        }
    }, [formData.business_unit_id, businessUnits]);

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
                // Don't auto-set barangay here to respect dropdown
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

        // Always focus on Malolos when changing barangay
        setCoordinates({ lat: 14.8437, lng: 120.8113 });
    };

    const handleUpdateClick = () => {
        setShowConfirmation(true);
    };

    const handleConfirmUpdate = async () => {
        setIsLoading(true);
        setShowConfirmation(false);

        try {
            const { error } = await supabase
                .from('subscriptions')
                .update({
                    active: formData.active,
                    invoice_date: formData.invoice_date || null,
                    plan_id: formData.plan_id,
                    business_unit_id: formData.business_unit_id,
                    date_installed: formData.date_installed,
                    address: formData.address,
                    barangay: formData.barangay,
                    landmark: formData.landmark,
                    label: formData.label,
                    contact_person: formData.contact_person || null,
                    referral_credit_applied: formData.referral_credit_applied,
                    'x-coordinates': coordinates?.lng || null,
                    'y-coordinates': coordinates?.lat || null
                })
                .eq('id', subscription.id);

            if (error) throw error;

            setShowSuccess(true);
        } catch (error) {
            console.error('Error updating subscription:', error);
            alert('Failed to update subscription');
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

    // Calculate min date for installation (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = tomorrow.toISOString().split('T')[0];

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

                <div className="relative bg-[#0a0a0a] border-2 border-red-900/50 rounded-xl shadow-[0_0_50px_rgba(255,0,0,0.3)] w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div className="sticky top-0 bg-[#0a0a0a] border-b border-red-900/30 p-6 flex justify-between items-center z-10">
                        <div>
                            <h2 className="text-2xl font-bold text-white neon-text">Edit Subscription</h2>
                            <p className="text-gray-400 text-sm mt-1">Update subscription details</p>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-8">
                        {/* Top Section: Customer & Status */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-400">Customer Name</label>
                                <div className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-gray-500 cursor-not-allowed flex items-center gap-2">
                                    <User className="w-4 h-4" />
                                    {subscription.customer_name}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-400">Connection Status</label>
                                <div className="flex items-center gap-3 p-2 bg-[#1a1a1a] border border-gray-800 rounded">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={formData.active}
                                            onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                        />
                                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                                        <span className={`ml-3 text-sm font-medium ${formData.active ? 'text-green-500' : 'text-red-500'}`}>
                                            {formData.active ? 'Active' : 'Disconnected'}
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </div>


                        {/* Customer Portal Link */}
                        <div>
                            <label className="text-sm font-medium text-gray-400 mb-2 block">Customer Portal Link</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={subscription.customer_portal ? `${typeof window !== 'undefined' ? window.location.origin : ''}${subscription.customer_portal}` : 'Not generated'}
                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-gray-500 cursor-not-allowed font-mono text-sm"
                                />
                                <button
                                    onClick={() => {
                                        if (subscription.customer_portal) {
                                            const url = `${window.location.origin}${subscription.customer_portal}`;
                                            navigator.clipboard.writeText(url);
                                            // Optional: Add a toast notification here
                                        }
                                    }}
                                    disabled={!subscription.customer_portal}
                                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded border border-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Copy Link"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                                <a
                                    href={subscription.customer_portal ? `${typeof window !== 'undefined' ? window.location.origin : ''}${subscription.customer_portal}` : '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded border border-gray-700 transition-colors flex items-center justify-center ${!subscription.customer_portal ? 'opacity-50 pointer-events-none' : ''}`}
                                    title="Open Link"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            </div>
                        </div>

                        {/* Billing & Plan Details */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase border-b border-gray-800 pb-2">Billing & Plan Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        <CreditCard className="w-4 h-4 inline mr-2" />
                                        Invoice Date
                                    </label>
                                    <select
                                        value={formData.invoice_date}
                                        onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                                    >
                                        <option value="">Select Date</option>
                                        <option value="15th">15th of the Month</option>
                                        <option value="30th">30th of the Month</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        <Wifi className="w-4 h-4 inline mr-2" />
                                        Plan
                                    </label>
                                    <select
                                        value={formData.plan_id}
                                        onChange={(e) => setFormData({ ...formData, plan_id: e.target.value })}
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                                    >
                                        {plans.map(plan => (
                                            <option key={plan.id} value={plan.id}>
                                                {plan.name} - ₱{plan.monthly_fee}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        <Building2 className="w-4 h-4 inline mr-2" />
                                        Business Unit
                                    </label>
                                    <select
                                        value={formData.business_unit_id}
                                        onChange={(e) => setFormData({ ...formData, business_unit_id: e.target.value })}
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                                    >
                                        {businessUnits.map(unit => (
                                            <option key={unit.id} value={unit.id}>
                                                {unit.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Installation & Referral */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    <Calendar className="w-4 h-4 inline mr-2" />
                                    Installation Date
                                </label>
                                <input
                                    type="date"
                                    value={formData.date_installed}
                                    min={minDate}
                                    onChange={(e) => setFormData({ ...formData, date_installed: e.target.value })}
                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                                />
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        <User className="w-4 h-4 inline mr-2" />
                                        Referrer (Optional)
                                    </label>
                                    <select
                                        value={formData.contact_person || ''}
                                        onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                                    >
                                        <option value="">No Referrer</option>
                                        {customers
                                            .filter(c => c.id !== subscription.subscriber_id)
                                            .map(customer => (
                                                <option key={customer.id} value={customer.id}>
                                                    {customer.name}
                                                </option>
                                            ))
                                        }
                                    </select>
                                </div>

                                <div className="flex items-center gap-3 p-3 bg-[#1a1a1a] border border-gray-800 rounded">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={formData.referral_credit_applied}
                                            onChange={(e) => setFormData({ ...formData, referral_credit_applied: e.target.checked })}
                                        />
                                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                        <span className="ml-3 text-sm font-medium text-gray-300">
                                            Referral Credit Applied
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Location Details */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase border-b border-gray-800 pb-2">Location Details</h3>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Map */}
                                <div className="h-64 rounded-lg overflow-hidden border border-gray-800 relative z-0">
                                    <MapPicker
                                        onChange={(val) => handleLocationSelect(val.lat, val.lng)}
                                        center={coordinates ? [coordinates.lat, coordinates.lng] : [14.8437, 120.8113]}
                                        value={coordinates}
                                    />
                                </div>

                                {/* Coordinates Inputs */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Latitude (Y)</label>
                                        <input
                                            type="text"
                                            value={coordinates?.lat || ''}
                                            disabled
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-gray-500 cursor-not-allowed"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Longitude (X)</label>
                                        <input
                                            type="text"
                                            value={coordinates?.lng || ''}
                                            disabled
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-gray-500 cursor-not-allowed"
                                        />
                                    </div>
                                </div>

                                {/* Address Fields */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Barangay</label>
                                        <select
                                            value={formData.barangay}
                                            onChange={handleBarangayChange}
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                                        >
                                            <option value="">Select Barangay</option>
                                            {BARANGAY_OPTIONS.map(opt => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Complete Address (House No/Street/Subd/Sitio)</label>
                                        <textarea
                                            value={formData.address}
                                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                            rows={2}
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500 resize-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Location Type</label>
                                        <input
                                            type="text"
                                            value={formData.label}
                                            onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                                            placeholder="e.g. Home, Office, Work"
                                            title="Type of location (e.g. Home, Office, Work)"
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Landmark</label>
                                        <input
                                            type="text"
                                            value={formData.landmark}
                                            onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="sticky bottom-0 bg-[#0a0a0a] border-t border-red-900/30 p-6 flex justify-end gap-3 z-10">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleUpdateClick}
                            disabled={isLoading}
                            className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Updating...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4" />
                                    Update Subscription
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div >


            {/* Confirmation Modal */}
            {
                showConfirmation && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
                        <div className="relative bg-[#0a0a0a] border-2 border-yellow-500/50 rounded-xl shadow-[0_0_50px_rgba(255,255,0,0.3)] w-full max-w-md p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <AlertCircle className="w-8 h-8 text-yellow-500" />
                                <h3 className="text-xl font-bold text-white">Confirm Update</h3>
                            </div>
                            <p className="text-gray-300 mb-6">
                                Are you sure you want to update this subscription?
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowConfirmation(false)}
                                    className="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmUpdate}
                                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                                >
                                    Confirm
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Success Modal */}
            {
                showSuccess && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
                        <div className="relative bg-[#0a0a0a] border-2 border-green-500/50 rounded-xl shadow-[0_0_50px_rgba(0,255,0,0.3)] w-full max-w-md p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <CheckCircle className="w-8 h-8 text-green-500" />
                                <h3 className="text-xl font-bold text-white">Success!</h3>
                            </div>
                            <p className="text-gray-300 mb-6">
                                Subscription updated successfully!
                            </p>
                            <button
                                onClick={handleSuccessClose}
                                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                )
            }
        </>
    );
}
