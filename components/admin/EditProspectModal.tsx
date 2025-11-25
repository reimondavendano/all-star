'use client';

import { useState, useEffect } from 'react';
import { X, User, Phone, MapPin, Home, Landmark as LandmarkIcon, Wifi, Calendar, Building2, FileText, CheckCircle, AlertCircle, Save, Loader2 } from 'lucide-react';
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
    const [showSuccess, setShowSuccess] = useState(false);

    const [formData, setFormData] = useState({
        business_unit_id: prospect.business_unit_id || '',
        status: prospect.status || 'Closed Won'
    });
    const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);

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
        }
    }, [isOpen]);

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

    const handleApproveClick = () => {
        if (!formData.business_unit_id) {
            alert('Please select a Business Unit');
            return;
        }
        setShowConfirmation(true);
    };

    const handleConfirmApprove = async () => {
        setIsLoading(true);
        setShowConfirmation(false);

        try {
            // Determine invoice_date based on business unit
            const selectedBusinessUnit = businessUnits.find(unit => unit.id === formData.business_unit_id);
            let invoiceDate = null;

            if (selectedBusinessUnit) {
                const unitName = selectedBusinessUnit.name.toLowerCase();
                // Check if business unit is Bulihan & Extension
                if (unitName.includes('bulihan') || unitName.includes('extension')) {
                    invoiceDate = '15th';
                }
                // Check if business unit is Malanggam
                else if (unitName.includes('malanggam')) {
                    invoiceDate = '30th';
                }
            }

            // 1. Create customer record
            const { data: customerData, error: customerError } = await supabase
                .from('customers')
                .insert({
                    name: prospect.name,
                    mobile_number: prospect.mobile_number
                })
                .select()
                .single();

            if (customerError) throw customerError;

            // 2. Create subscription record with customer_portal
            const { error: subscriptionError } = await supabase
                .from('subscriptions')
                .insert({
                    subscriber_id: customerData.id,
                    business_unit_id: formData.business_unit_id,
                    plan_id: prospect.plan_id,
                    active: true,
                    date_installed: prospect.installation_date,
                    contact_person: prospect.referrer_id, // referrer_id maps to contact_person
                    address: prospect.address,
                    barangay: prospect.barangay,
                    landmark: prospect.landmark,
                    label: prospect.label, // Copy label from prospect
                    customer_portal: `/portal/${customerData.id}`, // Set customer_portal in subscriptions
                    invoice_date: invoiceDate, // Automatically set based on business unit
                    referral_credit_applied: false,
                    'x-coordinates': coordinates?.lng || null,
                    'y-coordinates': coordinates?.lat || null
                });

            if (subscriptionError) throw subscriptionError;

            // 3. Delete the prospect from prospects table (conversion complete)
            const { error: prospectError } = await supabase
                .from('prospects')
                .delete()
                .eq('id', prospect.id);

            if (prospectError) throw prospectError;

            // Show success modal
            setShowSuccess(true);
        } catch (error) {
            console.error('Error approving prospect:', error);
            alert('Failed to approve prospect and create customer/subscription');
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
                            <h2 className="text-2xl font-bold text-white neon-text">Edit Prospect</h2>
                            <p className="text-gray-400 text-sm mt-1">Update prospect information and status</p>
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
                        {/* Editable Fields */}
                        <div className="grid grid-cols-2 gap-4 p-4 bg-[#0f0f0f] border border-red-900/20 rounded-lg">
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
                                    <option value="">Select Business Unit</option>
                                    {businessUnits.map(unit => (
                                        <option key={unit.id} value={unit.id}>
                                            {unit.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    <FileText className="w-4 h-4 inline mr-2" />
                                    Status
                                </label>
                                <select
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                                >
                                    <option value="Closed Won">Closed Won</option>
                                    <option value="Closed Lost">Closed Lost</option>
                                </select>
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
                                        <User className="w-5 h-5 text-blue-500 mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-xs text-gray-500">Name</label>
                                            <p className="text-sm text-white font-medium">{prospect.name}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <Phone className="w-5 h-5 text-green-500 mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-xs text-gray-500">Mobile Number</label>
                                            <p className="text-sm text-gray-300">{prospect.mobile_number || '-'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <FileText className="w-5 h-5 text-purple-500 mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-xs text-gray-500">Current Status</label>
                                            <p className={`text-sm font-medium ${prospect.status === 'Open'
                                                ? 'text-green-500'
                                                : prospect.status === 'Converted'
                                                    ? 'text-blue-500'
                                                    : 'text-red-500'
                                                }`}>
                                                {prospect.status}
                                            </p>
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
                                        <MapPin className="w-5 h-5 text-red-500 mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-xs text-gray-500">Barangay</label>
                                            <p className="text-sm text-gray-300">{prospect.barangay || '-'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <Home className="w-5 h-5 text-orange-500 mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-xs text-gray-500">Address</label>
                                            <p className="text-sm text-gray-300">{prospect.address || '-'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <LandmarkIcon className="w-5 h-5 text-yellow-500 mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-xs text-gray-500">Landmark</label>
                                            <p className="text-sm text-gray-300">{prospect.landmark || '-'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <Building2 className="w-5 h-5 text-indigo-500 mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-xs text-gray-500">Location Type</label>
                                            <p className="text-sm text-gray-300">{prospect.label || '-'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Map Location */}
                        <div className="col-span-2">
                            <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase border-b border-gray-800 pb-2">
                                Map Location
                            </h3>
                            <div className="h-[300px] w-full rounded-lg overflow-hidden border border-red-900/30 relative bg-[#0f0f0f]">
                                <MapPicker
                                    center={coordinates ? [coordinates.lat, coordinates.lng] : [14.3150, 121.0100]}
                                    value={coordinates}
                                    onChange={setCoordinates}
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                Click or drag the marker to set the exact location.
                            </p>
                        </div>

                        {/* Service Information */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase border-b border-gray-800 pb-2">
                                Service Information
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <Wifi className="w-5 h-5 text-cyan-500 mt-0.5" />
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500">Plan</label>
                                        <p className="text-sm text-gray-300">{getPlanDisplay(prospect.plan_id)}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Calendar className="w-5 h-5 text-pink-500 mt-0.5" />
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500">Installation Date</label>
                                        <p className="text-sm text-gray-300">{formatDate(prospect.installation_date)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Additional Details */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase border-b border-gray-800 pb-2">
                                Additional Details
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <FileText className="w-5 h-5 text-amber-500 mt-0.5" />
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500">Details / Notes</label>
                                        <p className="text-sm text-gray-300">{prospect.details || '-'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
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
                            disabled={isLoading}
                            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4" />
                                    Approve
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Confirmation Modal */}
            {
                showConfirmation && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
                        <div className="relative bg-[#0a0a0a] border-2 border-yellow-500/50 rounded-xl shadow-[0_0_50px_rgba(255,255,0,0.3)] w-full max-w-md p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <AlertCircle className="w-8 h-8 text-yellow-500" />
                                <h3 className="text-xl font-bold text-white">Confirm Approval</h3>
                            </div>
                            <p className="text-gray-300 mb-6">
                                This will create a customer and subscription record. Are you sure you want to proceed?
                            </p>
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
                                Customer and subscription have been created successfully!
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
