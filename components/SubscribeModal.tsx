'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Check, MapPin, User, Wifi, FileText, ChevronRight, ChevronLeft, Loader2, MoreHorizontal, AlertCircle, CheckCircle, Trash2 } from 'lucide-react';
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
}

const STEPS = [
    { id: 1, name: 'Information', icon: User, description: 'Personal details' },
    { id: 2, name: 'Location', icon: MapPin, description: 'Service area' },
    { id: 3, name: 'Plan', icon: Wifi, description: 'Choose package' },
    { id: 4, name: 'Others', icon: FileText, description: 'Additional info' },
];

export default function SubscribeModal({ isOpen, onClose }: SubscribeModalProps) {
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

    const [formData, setFormData] = useState({
        name: '',
        mobileNumber: '',
        barangay: '',
        address: '',
        landmark: '',
        businessUnitId: '', // Kept in state for compatibility but removed from UI as requested
        installationDate: new Date().toISOString().split('T')[0],
        planId: '',
        referrerId: '',

        details: '',
        label: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleReferrerSelect = (customer: { id: string; name: string }) => {
        setFormData(prev => ({
            ...prev,
            referrerId: customer.id
        }));
        setReferrerName(customer.name);
        setIsLookupOpen(false);
    };

    const validateStep = (step: number) => {
        switch (step) {
            case 1:
                return formData.name.trim() !== '' && formData.mobileNumber.trim() !== '';
            case 2:
                return formData.barangay.trim() !== '' && formData.address.trim() !== '' && formData.landmark.trim() !== '';
            case 3:
                return formData.planId !== '' && formData.installationDate !== '';
            default:
                return true;
        }
    };

    const handleNext = () => {
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
                const barangay = data.address.quarter || data.address.neighbourhood || data.address.suburb || '';
                const street = data.address.road || '';
                const houseNumber = data.address.house_number || '';
                const city = data.address.city || data.address.town || '';

                setFormData(prev => ({
                    ...prev,
                    barangay: barangay,
                    address: `${houseNumber} ${street}, ${city}`.trim(),
                }));
            }
        } catch (error) {
            console.error('Error fetching address:', error);
            // We don't set a hard error here to avoid disrupting the UI during drag
        }
    }, []);

    const handleGetLocation = useCallback(() => {
        setIsLoadingLocation(true);
        setLocationError('');

        if (!navigator.geolocation) {
            setLocationError('Geolocation is not supported by your browser');
            setIsLoadingLocation(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                setCoordinates({ lat: latitude, lng: longitude });
                await fetchAddress(latitude, longitude);
                setIsLoadingLocation(false);
            },
            (error) => {
                console.error('Geolocation error:', error);
                setLocationError('Unable to retrieve your location.');
                setIsLoadingLocation(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    }, [fetchAddress]);

    // Auto-get location when entering Step 2 if not already set
    useEffect(() => {
        if (isOpen && currentStep === 2 && !coordinates) {
            handleGetLocation();
        }
    }, [isOpen, currentStep, coordinates, handleGetLocation]);

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

            console.log('Submitting Prospect:', newProspect);

            const { error } = await supabase
                .from('prospects') // Use plural table name as per schema
                .insert([newProspect]);

            if (error) throw error;

            console.log('Prospect Created Successfully');

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
        setFormData({
            name: '',
            mobileNumber: '',
            barangay: '',
            address: '',
            landmark: '',
            businessUnitId: '',
            installationDate: new Date().toISOString().split('T')[0],
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

    // Default coordinates (Manila) if none set
    const mapCenter = coordinates || { lat: 14.5995, lng: 120.9842 };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Lighter backdrop */}
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity" onClick={onClose} />

            <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header with Stepper */}
                <div className="bg-gray-50 border-b border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">New Subscription</h2>
                            <p className="text-sm text-gray-500">Complete the form to apply for service</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Stepper */}
                    <div className="relative flex items-center justify-between px-4">
                        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-gray-200 -z-10" />
                        <div
                            className="absolute left-0 top-1/2 transform -translate-y-1/2 h-1 bg-red-600 -z-10 transition-all duration-500 ease-in-out"
                            style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
                        />

                        {STEPS.map((step) => {
                            const isCompleted = currentStep > step.id;
                            const isCurrent = currentStep === step.id;

                            return (
                                <div key={step.id} className="flex flex-col items-center bg-gray-50 px-2">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${isCompleted || isCurrent
                                            ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-200'
                                            : 'bg-white border-gray-300 text-gray-400'
                                            }`}
                                    >
                                        {isCompleted ? <Check className="w-5 h-5" /> : <step.icon className="w-5 h-5" />}
                                    </div>
                                    <div className="mt-2 text-center hidden sm:block">
                                        <p className={`text-sm font-semibold ${isCompleted || isCurrent ? 'text-gray-900' : 'text-gray-500'}`}>
                                            {step.name}
                                        </p>
                                        <p className="text-xs text-gray-400">{step.description}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Form Content */}
                <div className="flex-1 overflow-y-auto p-8 bg-white">
                    <div className="max-w-2xl mx-auto">
                        {currentStep === 1 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                                    <User className="w-5 h-5 mr-2 text-red-600" />
                                    Personal Information
                                </h3>
                                <div className="grid gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none text-gray-900"
                                            placeholder="e.g. Juan Dela Cruz"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number <span className="text-red-500">*</span></label>
                                        <input
                                            type="tel"
                                            name="mobileNumber"
                                            value={formData.mobileNumber}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none text-gray-900"
                                            placeholder="e.g. 0917 123 4567"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                                        <MapPin className="w-5 h-5 mr-2 text-red-600" />
                                        Installation Location
                                    </h3>
                                    <button
                                        onClick={handleGetLocation}
                                        disabled={isLoadingLocation}
                                        className="flex items-center px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                                    >
                                        {isLoadingLocation ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <MapPin className="w-4 h-4 mr-2" />
                                        )}
                                        Use My Current Location
                                    </button>
                                </div>

                                {locationError && (
                                    <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                                        {locationError}
                                    </div>
                                )}

                                <div className="w-full h-64 rounded-lg overflow-hidden border border-gray-200 mb-6 relative bg-gray-100 z-0">
                                    <MapPicker
                                        center={[mapCenter.lat, mapCenter.lng]}
                                        value={coordinates}
                                        onChange={(val) => handleLocationSelect(val.lat, val.lng)}
                                    />
                                </div>

                                <div className="grid gap-6">
                                    {/* Business Unit field removed as requested */}

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Location Type</label>
                                            <input
                                                type="text"
                                                name="label"
                                                value={formData.label}
                                                onChange={handleChange}
                                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none text-gray-900"
                                                placeholder="e.g. Home, Office"
                                                title="Type of location (e.g. Home, Office, Work)"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Barangay <span className="text-red-500">*</span></label>
                                            <input
                                                type="text"
                                                name="barangay"
                                                value={formData.barangay}
                                                onChange={handleChange}
                                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none text-gray-900"
                                                placeholder="e.g. Brgy. San Isidro"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Landmark <span className="text-red-500">*</span></label>
                                            <input
                                                type="text"
                                                name="landmark"
                                                value={formData.landmark}
                                                onChange={handleChange}
                                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none text-gray-900"
                                                placeholder="e.g. Near the Chapel"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Street Address <span className="text-red-500">*</span></label>
                                        <textarea
                                            name="address"
                                            value={formData.address}
                                            onChange={handleChange}
                                            rows={2}
                                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none resize-none text-gray-900"
                                            placeholder="House No., Street Name, Subdivision"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                                    <Wifi className="w-5 h-5 mr-2 text-red-600" />
                                    Plan Selection
                                </h3>
                                <div className="grid gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Installation Date <span className="text-red-500">*</span></label>
                                        <input
                                            type="date"
                                            name="installationDate"
                                            value={formData.installationDate}
                                            min={new Date().toISOString().split('T')[0]}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none text-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Plan <span className="text-red-500">*</span></label>
                                        <div className="grid grid-cols-1 gap-4">
                                            {plans.map(plan => (
                                                <label
                                                    key={plan.id}
                                                    className={`relative flex items-center p-4 border rounded-xl cursor-pointer transition-all hover:shadow-md ${formData.planId === plan.id
                                                        ? 'border-red-500 bg-red-50 ring-1 ring-red-500'
                                                        : 'border-gray-200 hover:border-red-300'
                                                        }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="planId"
                                                        value={plan.id}
                                                        checked={formData.planId === plan.id}
                                                        onChange={handleChange}
                                                        className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500"
                                                    />
                                                    <div className="ml-4 flex-1">
                                                        <span className="block text-sm font-medium text-gray-900">{plan.name}</span>
                                                        <span className="block text-sm text-gray-500">{plan.description}</span>
                                                    </div>
                                                    <span className="text-lg font-bold text-gray-900">₱{plan.monthlyFee.toLocaleString()}</span>
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
                                <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                                    <FileText className="w-5 h-5 mr-2 text-red-600" />
                                    Additional Details
                                </h3>
                                <div className="grid gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Referred By (Optional)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={referrerName}
                                                readOnly
                                                placeholder="Select a referrer..."
                                                className="flex-1 px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-900 focus:outline-none cursor-default"
                                                onClick={() => setIsLookupOpen(true)}
                                            />
                                            <button
                                                onClick={() => setIsLookupOpen(true)}
                                                className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors text-gray-600"
                                                title="Select referrer"
                                            >
                                                <MoreHorizontal className="w-5 h-5" />
                                            </button>
                                            {formData.referrerId && (
                                                <button
                                                    onClick={() => {
                                                        setFormData({ ...formData, referrerId: '' });
                                                        setReferrerName('');
                                                    }}
                                                    className="px-4 py-2 bg-red-50 border border-red-300 rounded-lg hover:bg-red-100 transition-colors text-red-600"
                                                    title="Clear referrer"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            )}
                                        </div>
                                        <p className="mt-1 text-xs text-gray-500">
                                            This is lookup table for customer to make it referrer
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Inquiries / Notes (Optional)</label>
                                        <textarea
                                            name="details"
                                            value={formData.details}
                                            onChange={handleChange}
                                            rows={4}
                                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none resize-none text-gray-900"
                                            placeholder="Any questions or specific instructions?"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="bg-gray-50 p-6 border-t border-gray-200 flex justify-between items-center">
                    <button
                        onClick={handleBack}
                        disabled={currentStep === 1}
                        className={`flex items-center px-6 py-2.5 rounded-lg font-medium transition-colors ${currentStep === 1
                            ? 'text-gray-300 cursor-not-allowed'
                            : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                            }`}
                    >
                        <ChevronLeft className="w-4 h-4 mr-2" />
                        Back
                    </button>

                    <button
                        onClick={handleNext}
                        disabled={!validateStep(currentStep) || isSubmitting}
                        className={`flex items-center px-8 py-3 rounded-lg font-semibold shadow-lg transition-all transform ${!validateStep(currentStep) || isSubmitting
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                            : 'bg-red-600 hover:bg-red-700 text-white shadow-red-200 hover:-translate-y-0.5'
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
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Create'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {isSuccessOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                    <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                <CheckCircle className="w-8 h-8 text-green-600" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-2">Success!</h3>
                            <p className="text-gray-600 mb-6">
                                Subscription has been successfully added. Please wait for an admin to verify your application.
                            </p>

                            <button
                                onClick={handleCloseSuccess}
                                className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
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
