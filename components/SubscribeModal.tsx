'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Check, MapPin, User, Wifi, FileText, ChevronRight, ChevronLeft, Loader2, MoreHorizontal, AlertCircle, CheckCircle, Trash2, Search } from 'lucide-react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { Plan } from '@/types/plan';
import CustomerLookupModal from './CustomerLookupModal';

// Dynamically import MapPicker to avoid SSR issues with Leaflet
const MapPicker = dynamic(() => import('@/components/admin/MapPicker'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin" />
        </div>
    )
});

interface SubscribeModalProps {
    isOpen: boolean;
    onClose: () => void;
    isAdmin?: boolean;
}

const STEPS = [
    { id: 1, name: 'Information', icon: User, description: 'Personal details' },
    { id: 2, name: 'Location', icon: MapPin, description: 'Service area' },
    { id: 3, name: 'Plan', icon: Wifi, description: 'Choose package' },
    { id: 4, name: 'Others', icon: FileText, description: 'Additional info' },
];

const BARANGAY_OPTIONS = ['Bulihan', 'San Agustin', 'San Gabriel', 'Liang', 'Catmon'] as const;

export default function SubscribeModal({ isOpen, onClose, isAdmin = false }: SubscribeModalProps) {
    const [currentStep, setCurrentStep] = useState(1);
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [locationError, setLocationError] = useState('');
    const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
    const [plans, setPlans] = useState<Plan[]>([]);

    // Lookup state
    const [isLookupOpen, setIsLookupOpen] = useState(false);
    const [referrerName, setReferrerName] = useState('');

    // Confirmation & Success Modal States
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isSuccessOpen, setIsSuccessOpen] = useState(false);
    const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
    const [duplicateMessage, setDuplicateMessage] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        mobileNumber: '',
        barangay: '',
        address: '',
        landmark: '',
        businessUnitId: '', // Kept in state for compatibility but removed from UI as requested
        installationDate: '',
        planId: '',
        referrerId: '',

        details: '',
        label: '',
    });

    // Initialize installation date to tomorrow and check for referrer in session
    useEffect(() => {
        if (isOpen) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const year = tomorrow.getFullYear();
            const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
            const day = String(tomorrow.getDate()).padStart(2, '0');

            // Check for referrer ID in sessionStorage
            const storedReferrerId = sessionStorage.getItem('referrer_id');

            setFormData(prev => ({
                ...prev,
                installationDate: `${year}-${month}-${day}`,
                referrerId: storedReferrerId || prev.referrerId
            }));

            // Fetch referrer name if ID exists
            if (storedReferrerId) {
                fetchReferrerName(storedReferrerId);
            }
        }
    }, [isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;

        if (name === 'mobileNumber') {
            // Only allow numbers
            if (!/^\d*$/.test(value)) return;
            // Limit to 11 digits
            if (value.length > 11) return;
        }

        setFormData({
            ...formData,
            [name]: value,
        });
    };

    const handleBarangayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedBarangay = e.target.value;
        setFormData(prev => ({ ...prev, barangay: selectedBarangay }));

        // Always focus on Malolos when changing barangay
        setCoordinates({ lat: 14.8437, lng: 120.8113 });
    };

    const handleReferrerSelect = (customer: { id: string; name: string }) => {
        setFormData(prev => ({
            ...prev,
            referrerId: customer.id
        }));
        setReferrerName(customer.name);
        setIsLookupOpen(false);
    };

    const clearReferrer = () => {
        setFormData(prev => ({
            ...prev,
            referrerId: ''
        }));
        setReferrerName('');
    };

    const fetchReferrerName = async (customerId: string) => {
        try {
            const { data, error } = await supabase
                .from('customers')
                .select('name')
                .eq('id', customerId)
                .single();

            if (!error && data) {
                setReferrerName(data.name);
            }
        } catch (error) {
            console.error('Error fetching referrer name:', error);
        }
    };

    const validateStep = (step: number) => {
        switch (step) {
            case 1:
                const isMobileValid = formData.mobileNumber.startsWith('09') && formData.mobileNumber.length === 11;
                return formData.name.trim() !== '' && isMobileValid;
            case 2:
                return formData.barangay.trim() !== '' && formData.address.trim() !== '' && formData.landmark.trim() !== '';
            case 3:
                return formData.planId !== '' && formData.installationDate !== '';
            default:
                return true;
        }
    };

    const checkDuplicateNumber = async () => {
        setIsSubmitting(true);
        try {
            // Check prospects (Open status)
            const { data: prospectData, error: prospectError } = await supabase
                .from('prospects')
                .select('id')
                .eq('mobile_number', formData.mobileNumber)
                .eq('status', 'Open')
                .single();

            if (prospectData) {
                setDuplicateMessage('There is already a pending application under this mobile number.');
                setIsDuplicateModalOpen(true);
                return true;
            }

            // Check customers
            const { data: customerData, error: customerError } = await supabase
                .from('customers')
                .select('id')
                .eq('mobile_number', formData.mobileNumber)
                .single();

            if (customerData) {
                setDuplicateMessage('This mobile number is already registered to an existing customer.');
                setIsDuplicateModalOpen(true);
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error checking duplicate:', error);
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleNext = async () => {
        if (currentStep === 1) {
            const isDuplicate = await checkDuplicateNumber();
            if (isDuplicate) return;
        }

        if (currentStep < STEPS.length) {
            setCurrentStep(prev => prev + 1);
        } else {
            // Instead of submitting directly, open confirmation modal
            setIsConfirmOpen(true);
        }
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(prev => prev - 1);
        }
    };

    const fetchAddress = useCallback(async (lat: number, lng: number) => {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
                {
                    headers: {
                        'User-Agent': 'AllStarISP/1.0'
                    }
                }
            );
            const data = await response.json();

            if (data && data.address) {
                // We don't auto-set barangay from reverse geocoding anymore if it's strictly enum based,
                // or we could try to match it. For now, let's just set address parts.
                const street = data.address.road || '';
                const houseNumber = data.address.house_number || '';
                const city = data.address.city || data.address.town || '';

                setFormData(prev => ({
                    ...prev,
                    // barangay: barangay, // Don't overwrite barangay as it's a strict dropdown now
                    address: `${houseNumber} ${street}, ${city}`.trim(),
                }));
            }
        } catch (error) {
            console.error('Error fetching address:', error);
            // We don't set a hard error here to avoid disrupting the UI during drag
        }
    }, []);

    // Fetch plans from Supabase
    useEffect(() => {
        const fetchPlans = async () => {
            const { data, error } = await supabase
                .from('plans')
                .select('*')
                .order('monthly_fee', { ascending: true });

            if (error) {
                console.error('Error fetching plans:', error);
            } else if (data) {
                const mappedPlans: Plan[] = data.map((item: any) => ({
                    id: item.id,
                    name: item.name,
                    monthlyFee: item.monthly_fee,
                    description: item.details || item.name // Fallback to name if details is empty
                }));
                setPlans(mappedPlans);
            }
        };

        if (isOpen) {
            fetchPlans();
        }
    }, [isOpen]);

    const handleLocationSelect = (lat: number, lng: number) => {
        setCoordinates({ lat, lng });
        fetchAddress(lat, lng);
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            // Map form data to database schema (snake_case)
            const newProspect = {
                name: formData.name,
                plan_id: formData.planId,
                business_unit_id: formData.businessUnitId || null, // Handle empty string as null
                landmark: formData.landmark,
                barangay: formData.barangay,
                address: formData.address,
                mobile_number: formData.mobileNumber,
                installation_date: formData.installationDate,
                referrer_id: formData.referrerId || null,

                details: formData.details,
                label: formData.label,
                'x-coordinates': coordinates?.lng || null,
                'y-coordinates': coordinates?.lat || null
            };

            // Check for existing prospect with same mobile number (Open status)
            const { data: existingProspect, error: checkError } = await supabase
                .from('prospects')
                .select('id')
                .eq('mobile_number', formData.mobileNumber)
                .eq('status', 'Open')
                .single();

            if (existingProspect) {
                alert('There is already a pending application under this mobile number.');
                setIsSubmitting(false);
                setIsConfirmOpen(false);
                return;
            }

            const { error } = await supabase
                .from('prospects') // Use plural table name as per schema
                .insert([newProspect]);

            if (error) throw error;

            // Clear referrer from session after successful submission
            sessionStorage.removeItem('referrer_id');

            // Close confirmation and open success modal
            setIsConfirmOpen(false);
            setIsSuccessOpen(true);

        } catch (error) {
            console.error('Error creating prospect:', error);
            alert('Failed to create subscription. Please try again.');
            setIsConfirmOpen(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCloseSuccess = () => {
        setIsSuccessOpen(false);
        onClose();
        // Reset form
        setCurrentStep(1);
        setCoordinates(null);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setFormData({
            name: '',
            mobileNumber: '',
            barangay: '',
            address: '',
            landmark: '',
            businessUnitId: '',
            installationDate: tomorrow.toISOString().split('T')[0],
            planId: '',
            referrerId: '',

            details: '',
            label: '',
        });
        setReferrerName('');
    };

    // Helper to format date for display (MM-DD-YYYY)
    const formatDateDisplay = (dateString: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}-${day}-${year}`;
    };

    if (!isOpen) return null;

    // Default coordinates (Malolos) if none set
    const mapCenter = coordinates || { lat: 14.8437, lng: 120.8113 };

    // Calculate min date for installation (tomorrow)
    // Calculate min date for installation (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const minDate = `${year}-${month}-${day}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Dark backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose} />

            <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-purple-900/50 rounded-2xl shadow-[0_0_60px_rgba(139,92,246,0.15)] max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header with Stepper */}
                <div className="relative border-b border-gray-800/50 p-6">
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-600/10 via-purple-600/10 to-fuchsia-600/10" />
                    <div className="relative flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-2xl font-bold text-white">New Subscription</h2>
                            <p className="text-sm text-gray-400">Complete the form to apply for service</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-full"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Stepper */}
                    <div className="relative flex items-center justify-between px-4">
                        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-gray-700 -z-10" />
                        <div
                            className="absolute left-0 top-1/2 transform -translate-y-1/2 h-1 bg-gradient-to-r from-violet-600 to-purple-600 -z-10 transition-all duration-500 ease-in-out"
                            style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
                        />

                        {STEPS.map((step) => {
                            const isCompleted = currentStep > step.id;
                            const isCurrent = currentStep === step.id;

                            return (
                                <div key={step.id} className="flex flex-col items-center bg-transparent px-2">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${isCompleted || isCurrent
                                            ? 'bg-gradient-to-r from-violet-600 to-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/30'
                                            : 'bg-[#0a0a0a] border-gray-600 text-gray-500'
                                            }`}
                                    >
                                        {isCompleted ? <Check className="w-5 h-5" /> : <step.icon className="w-5 h-5" />}
                                    </div>
                                    <div className="mt-2 text-center hidden sm:block">
                                        <p className={`text-sm font-semibold ${isCompleted || isCurrent ? 'text-white' : 'text-gray-500'}`}>
                                            {step.name}
                                        </p>
                                        <p className="text-xs text-gray-500">{step.description}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Form Content */}
                <div className="flex-1 overflow-y-auto p-8 bg-[#0a0a0a]">
                    <div className="max-w-2xl mx-auto">
                        {currentStep === 1 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
                                    <User className="w-5 h-5 mr-2 text-purple-500" />
                                    Personal Information
                                </h3>
                                <div className="grid gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Full Name <span className="text-purple-500">*</span></label>
                                        <input
                                            type="text"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 rounded-xl bg-gray-900/50 border border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none text-white placeholder-gray-500"
                                            placeholder="e.g. Juan Dela Cruz"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Mobile Number <span className="text-purple-500">*</span></label>
                                        <input
                                            type="tel"
                                            name="mobileNumber"
                                            value={formData.mobileNumber}
                                            onChange={handleChange}
                                            maxLength={11}
                                            className="w-full px-4 py-3 rounded-xl bg-gray-900/50 border border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none text-white placeholder-gray-500"
                                            placeholder="09xxxxxxxxx"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Must start with 09 and contain 11 digits</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-semibold text-white flex items-center">
                                        <MapPin className="w-5 h-5 mr-2 text-purple-500" />
                                        Installation Location
                                    </h3>
                                </div>

                                {locationError && (
                                    <div className="p-3 bg-red-900/30 text-red-400 text-sm rounded-xl border border-red-700/50">
                                        {locationError}
                                    </div>
                                )}

                                <div className="w-full h-64 rounded-xl overflow-hidden border border-gray-700 mb-6 relative bg-gray-900 z-0">
                                    <MapPicker
                                        center={[mapCenter.lat, mapCenter.lng]}
                                        value={coordinates}
                                        onChange={(val) => handleLocationSelect(val.lat, val.lng)}
                                    />
                                </div>

                                <div className="grid gap-6">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1">Location Type</label>
                                            <input
                                                type="text"
                                                name="label"
                                                value={formData.label}
                                                onChange={handleChange}
                                                className="w-full px-4 py-3 rounded-xl bg-gray-900/50 border border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none text-white placeholder-gray-500"
                                                placeholder="e.g. Home, Office"
                                                title="Type of location (e.g. Home, Office, Work)"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1">Barangay <span className="text-purple-500">*</span></label>
                                            <select
                                                name="barangay"
                                                value={formData.barangay}
                                                onChange={handleBarangayChange}
                                                className="w-full px-4 py-3 rounded-xl bg-gray-900/50 border border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none text-white"
                                            >
                                                <option value="">Select Barangay</option>
                                                {BARANGAY_OPTIONS.map(opt => (
                                                    <option key={opt} value={opt}>{opt}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1">Landmark <span className="text-purple-500">*</span></label>
                                            <input
                                                type="text"
                                                name="landmark"
                                                value={formData.landmark}
                                                onChange={handleChange}
                                                className="w-full px-4 py-3 rounded-xl bg-gray-900/50 border border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none text-white placeholder-gray-500"
                                                placeholder="e.g. Near the Chapel"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Complete Address (House No/Street/Subd/Sitio) <span className="text-purple-500">*</span></label>
                                        <textarea
                                            name="address"
                                            value={formData.address}
                                            onChange={handleChange}
                                            rows={2}
                                            className="w-full px-4 py-3 rounded-xl bg-gray-900/50 border border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none resize-none text-white placeholder-gray-500"
                                            placeholder="House No., Street Name, Subdivision"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
                                    <Wifi className="w-5 h-5 mr-2 text-purple-500" />
                                    Plan Selection
                                </h3>
                                <div className="grid gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Preferred Installation Date <span className="text-purple-500">*</span></label>
                                        <input
                                            type="date"
                                            name="installationDate"
                                            value={formData.installationDate}
                                            min={minDate}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 rounded-xl bg-gray-900/50 border border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Preferred Plan <span className="text-purple-500">*</span></label>
                                        <div className="grid grid-cols-1 gap-4">
                                            {plans.map(plan => (
                                                <label
                                                    key={plan.id}
                                                    className={`relative flex items-center p-4 border rounded-xl cursor-pointer transition-all hover:border-purple-500/50 ${formData.planId === plan.id
                                                        ? 'border-purple-500 bg-purple-900/20 ring-1 ring-purple-500'
                                                        : 'border-gray-700 hover:bg-gray-800/50'
                                                        }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="planId"
                                                        value={plan.id}
                                                        checked={formData.planId === plan.id}
                                                        onChange={handleChange}
                                                        className="w-4 h-4 text-purple-600 border-gray-600 focus:ring-purple-500 bg-gray-800"
                                                    />
                                                    <div className="ml-4 flex-1">
                                                        <span className="block text-sm font-medium text-white">{plan.name}</span>
                                                        <span className="block text-sm text-gray-500">{plan.description}</span>
                                                    </div>
                                                    <span className="text-lg font-bold text-purple-400">₱{plan.monthlyFee.toLocaleString()}</span>
                                                </label>
                                            ))}
                                            {plans.length === 0 && (
                                                <div className="text-center p-4 text-gray-500">
                                                    Loading plans...
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                </div>
                            </div>
                        )}

                        {currentStep === 4 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
                                    <FileText className="w-5 h-5 mr-2 text-purple-500" />
                                    Additional Details
                                </h3>
                                <div className="grid gap-6">
                                    {/* Referred By section - Only for Admin */}
                                    {isAdmin && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1">Referred By (Optional)</label>
                                            <div className="flex items-center gap-2">
                                                <div
                                                    onClick={() => setIsLookupOpen(true)}
                                                    className="flex-1 px-4 py-3 rounded-xl bg-gray-900/50 border border-gray-700 cursor-pointer hover:border-purple-500 transition-colors flex items-center justify-between"
                                                >
                                                    <span className={referrerName ? 'text-white' : 'text-gray-500'}>
                                                        {referrerName || 'Select Referrer'}
                                                    </span>
                                                    <Search className="w-4 h-4 text-gray-500" />
                                                </div>
                                                {referrerName && (
                                                    <button
                                                        onClick={clearReferrer}
                                                        className="p-3 text-red-400 hover:bg-red-900/30 rounded-xl transition-colors"
                                                        title="Clear Referrer"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Inquiries / Notes (Optional)</label>
                                        <textarea
                                            name="details"
                                            value={formData.details}
                                            onChange={handleChange}
                                            rows={4}
                                            className="w-full px-4 py-3 rounded-xl bg-gray-900/50 border border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none resize-none text-white placeholder-gray-500"
                                            placeholder="Any questions or specific instructions?"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="bg-[#080808] p-6 border-t border-gray-800 flex justify-between items-center">
                    <button
                        onClick={handleBack}
                        disabled={currentStep === 1}
                        className={`flex items-center px-6 py-2.5 rounded-lg font-medium transition-colors ${currentStep === 1
                            ? 'text-gray-600 cursor-not-allowed'
                            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                            }`}
                    >
                        <ChevronLeft className="w-4 h-4 mr-2" />
                        Back
                    </button>

                    <button
                        onClick={handleNext}
                        disabled={!validateStep(currentStep) || isSubmitting}
                        className={`flex items-center px-8 py-3 rounded-xl font-semibold shadow-lg transition-all transform ${!validateStep(currentStep) || isSubmitting
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed shadow-none'
                            : 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-purple-900/30 hover:-translate-y-0.5'
                            }`}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Submitting...
                            </>
                        ) : (
                            <>
                                {currentStep === STEPS.length ? 'Submit Application' : 'Next Step'}
                                {currentStep !== STEPS.length && <ChevronRight className="w-4 h-4 ml-2" />}
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Customer Lookup Modal */}
            <CustomerLookupModal
                isOpen={isLookupOpen}
                onClose={() => setIsLookupOpen(false)}
                onSelect={handleReferrerSelect}
            />

            {/* Confirmation Modal */}
            {isConfirmOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsConfirmOpen(false)} />
                    <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                                <AlertCircle className="w-6 h-6 text-red-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Subscription</h3>
                            <p className="text-gray-500 mb-6">
                                Are you sure you want to create this subscription? Please review the details below.
                            </p>

                            <div className="w-full bg-gray-50 rounded-lg p-4 mb-6 text-left space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Plan:</span>
                                    <span className="font-medium text-gray-900">{plans.find(p => p.id === formData.planId)?.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Installation:</span>
                                    <span className="font-medium text-gray-900">{formatDateDisplay(formData.installationDate)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Location:</span>
                                    <span className="font-medium text-gray-900 truncate max-w-[200px]">{formData.barangay}</span>
                                </div>
                            </div>

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setIsConfirmOpen(false)}
                                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={isSubmitting}
                                    className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center justify-center"
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Apply'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {isSuccessOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-emerald-900/50 rounded-2xl shadow-[0_0_60px_rgba(16,185,129,0.15)] w-full max-w-md p-6">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-green-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-emerald-900/30">
                                <CheckCircle className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">Success!</h3>
                            <p className="text-gray-400 mb-6">
                                Subscription has been successfully added. Please wait for an admin to verify your application.
                            </p>

                            <button
                                onClick={handleCloseSuccess}
                                className="w-full px-4 py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl font-medium hover:from-emerald-500 hover:to-green-500 transition-all shadow-lg shadow-emerald-900/30"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Duplicate Error Modal */}
            {isDuplicateModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsDuplicateModalOpen(false)} />
                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-red-900/50 rounded-2xl shadow-[0_0_60px_rgba(239,68,68,0.15)] w-full max-w-md p-6">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-rose-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-red-900/30">
                                <AlertCircle className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Duplicate Number</h3>
                            <p className="text-gray-400 mb-6">
                                {duplicateMessage}
                            </p>

                            <button
                                onClick={() => setIsDuplicateModalOpen(false)}
                                className="w-full px-4 py-3 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl font-medium hover:from-red-500 hover:to-rose-500 transition-all shadow-lg shadow-red-900/30"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
