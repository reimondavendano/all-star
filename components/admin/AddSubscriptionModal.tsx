'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
    X, Search, Navigation, User, MapPin, Wifi, FileText,
    ChevronLeft, ChevronRight, Check
} from 'lucide-react';
import dynamic from 'next/dynamic';

const MapPicker = dynamic(() => import('@/components/admin/MapPicker'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-64 flex items-center justify-center bg-[#1a1a1a] text-gray-400 rounded-lg border border-gray-800">
            Loading map...
        </div>
    )
});

interface Customer {
    id: string;
    name: string;
    mobile_number: string;
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

const BARANGAY_OPTIONS = ['Bulihan', 'San Agustin', 'San Gabriel', 'Liang', 'Catmon'] as const;

interface AddSubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialCustomer?: Customer | null;
}

const steps = [
    { id: 'information', label: 'Information', subLabel: 'Personal details', icon: User },
    { id: 'location', label: 'Location', subLabel: 'Service area', icon: MapPin },
    { id: 'plan', label: 'Plan', subLabel: 'Choose package', icon: Wifi },
    { id: 'others', label: 'Others', subLabel: 'Additional info', icon: FileText }
] as const;

export default function AddSubscriptionModal({ isOpen, onClose, onSuccess, initialCustomer }: AddSubscriptionModalProps) {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeStep, setActiveStep] = useState(0);

    // Customer Lookup
    const [showCustomerLookup, setShowCustomerLookup] = useState(false);
    const [customerSearchQuery, setCustomerSearchQuery] = useState('');

    const [formData, setFormData] = useState({
        subscriber_id: '',
        business_unit_id: '',
        plan_id: '',
        active: true,
        date_installed: new Date().toISOString().split('T')[0],
        address: '',
        barangay: '',
        landmark: '',
        label: '',
        contact_person: '', // This acts as Referrer ID
        customer_portal: '',
        invoice_date: '',
        referral_credit_applied: false
    });

    const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchData();
            setActiveStep(0); // Reset to first step
            if (initialCustomer) {
                handleCustomerSelect(initialCustomer);
            }
        }
    }, [isOpen, initialCustomer]);

    useEffect(() => {
        // Auto-set invoice date based on business unit
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

    const fetchData = async () => {
        try {
            const [customersRes, businessUnitsRes, plansRes] = await Promise.all([
                supabase.from('customers').select('*').order('name'),
                supabase.from('business_units').select('*').order('name'),
                supabase.from('plans').select('*').order('name')
            ]);

            if (customersRes.data) setCustomers(customersRes.data);
            if (businessUnitsRes.data) setBusinessUnits(businessUnitsRes.data);
            if (plansRes.data) setPlans(plansRes.data);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    const handleCustomerSelect = (customer: Customer) => {
        setSelectedCustomer(customer);
        setFormData(prev => ({
            ...prev,
            subscriber_id: customer.id,
            customer_portal: `/portal/${customer.id}`
        }));
        setShowCustomerLookup(false);
        setCustomerSearchQuery('');
    };

    const fetchAddress = async (lat: number, lng: number) => {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
                { headers: { 'User-Agent': 'AllStarISP/1.0' } }
            );
            const data = await response.json();

            if (data && data.address) {
                setFormData(prev => ({
                    ...prev,
                    address: data.address.road || data.address.street || data.display_name || ''
                }));
            }
        } catch (error) {
            console.error('Error fetching address:', error);
        }
    };

    const handleLocationSelect = (lat: number, lng: number) => {
        setCoordinates({ lat, lng });
        fetchAddress(lat, lng);
    };

    const handleGetCurrentLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                setCoordinates({ lat: latitude, lng: longitude });
                await fetchAddress(latitude, longitude);
            },
            (error) => {
                console.error('Geolocation error:', error);
                alert('Unable to retrieve your location.');
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    };

    const handleSubmit = async () => {
        if (!formData.subscriber_id || !formData.business_unit_id || !formData.plan_id) {
            alert('Please fill in all required fields');
            return;
        }

        setIsLoading(true);
        try {
            const { error } = await supabase.from('subscriptions').insert({
                subscriber_id: formData.subscriber_id,
                business_unit_id: formData.business_unit_id,
                plan_id: formData.plan_id,
                active: formData.active,
                date_installed: formData.date_installed,
                address: formData.address,
                barangay: formData.barangay,
                landmark: formData.landmark,
                label: formData.label,
                contact_person: formData.contact_person,
                customer_portal: formData.customer_portal,
                invoice_date: formData.invoice_date,
                referral_credit_applied: formData.referral_credit_applied,
                'x-coordinates': coordinates?.lng || null,
                'y-coordinates': coordinates?.lat || null
            });

            if (error) throw error;

            onSuccess();
            handleClose();
        } catch (error) {
            console.error('Error creating subscription:', error);
            alert('Failed to create subscription');
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        setFormData({
            subscriber_id: '',
            business_unit_id: '',
            plan_id: '',
            active: true,
            date_installed: new Date().toISOString().split('T')[0],
            address: '',
            barangay: '',
            landmark: '',
            label: '',
            contact_person: '',
            customer_portal: '',
            invoice_date: '',
            referral_credit_applied: false
        });
        setCoordinates(null);
        setSelectedCustomer(null);
        setCustomerSearchQuery('');
        setActiveStep(0);
        onClose();
    };

    const handleNext = () => {
        if (activeStep < steps.length - 1) {
            setActiveStep(prev => prev + 1);
        } else {
            handleSubmit();
        }
    };

    const handleBack = () => {
        if (activeStep > 0) {
            setActiveStep(prev => prev - 1);
        }
    };

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
        c.mobile_number.includes(customerSearchQuery)
    );

    // Filter out selected customer from referrer options
    const availableReferrers = customers.filter(c => c.id !== formData.subscriber_id);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={handleClose} />

            <div className="relative bg-[#0a0a0a] border border-purple-900/30 rounded-2xl shadow-[0_0_60px_rgba(147,51,234,0.1)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

                {/* Header Section */}
                <div className="p-8 pb-0">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h2 className="text-3xl font-bold text-white mb-2">New Subscription</h2>
                            <p className="text-gray-400">Complete the form to apply for service</p>
                        </div>
                        <button
                            onClick={handleClose}
                            className="text-gray-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center justify-between relative px-4">
                        {/* Connecting Line */}
                        <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-gray-800 -z-10" />

                        {steps.map((step, index) => {
                            const isActive = index === activeStep;
                            const isCompleted = index < activeStep;
                            const Icon = step.icon;

                            return (
                                <div key={step.id} className="flex flex-col items-center bg-[#0a0a0a] px-4">
                                    <div
                                        className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-300 mb-3
                                            ${isActive
                                                ? 'border-purple-500 bg-purple-500/10 text-purple-500 shadow-[0_0_20px_rgba(147,51,234,0.3)]'
                                                : isCompleted
                                                    ? 'border-green-500 bg-green-500/10 text-green-500'
                                                    : 'border-gray-800 bg-[#151515] text-gray-600'
                                            }`}
                                    >
                                        {isCompleted ? <Check className="w-6 h-6" /> : <Icon className="w-5 h-5" />}
                                    </div>
                                    <div className="text-center">
                                        <p className={`text-sm font-medium mb-0.5 ${isActive ? 'text-white' : 'text-gray-500'}`}>
                                            {step.label}
                                        </p>
                                        <p className="text-xs text-gray-600 hidden sm:block">{step.subLabel}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-3xl mx-auto">

                        {/* Step 1: Information */}
                        {activeStep === 0 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center gap-3 text-purple-400 mb-6 border-b border-gray-800 pb-4">
                                    <User className="w-5 h-5" />
                                    <h3 className="text-lg font-medium">Personal Information</h3>
                                </div>

                                <div className="space-y-6">
                                    {!selectedCustomer ? (
                                        // Customer Lookup Mode
                                        <div>
                                            <label className="block text-sm font-medium text-purple-400 mb-2">
                                                Select Customer <span className="text-red-500">*</span>
                                            </label>
                                            <div className="relative">
                                                <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                                <input
                                                    type="text"
                                                    value={customerSearchQuery}
                                                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                                                    placeholder="Search existing customers..."
                                                    className="w-full bg-[#151515] border border-gray-800 rounded-xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                                />
                                                {customerSearchQuery && (
                                                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-gray-800 rounded-xl shadow-2xl z-20 max-h-64 overflow-y-auto">
                                                        {filteredCustomers.length > 0 ? (
                                                            filteredCustomers.map(customer => (
                                                                <button
                                                                    key={customer.id}
                                                                    onClick={() => handleCustomerSelect(customer)}
                                                                    className="w-full text-left px-6 py-4 hover:bg-[#202020] transition-colors border-b border-gray-800/50 last:border-0"
                                                                >
                                                                    <p className="text-white font-medium">{customer.name}</p>
                                                                    <p className="text-gray-500 text-sm mt-1">{customer.mobile_number}</p>
                                                                </button>
                                                            ))
                                                        ) : (
                                                            <div className="p-4 text-center text-gray-500">No customers found</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        // Selected Customer View (Read-Only)
                                        <div className="space-y-6">
                                            <div className="p-4 bg-purple-900/10 border border-purple-500/20 rounded-xl flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                                        {selectedCustomer.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-white font-medium">{selectedCustomer.name}</h4>
                                                        <p className="text-gray-400 text-sm">{selectedCustomer.mobile_number}</p>
                                                    </div>
                                                </div>
                                                {!initialCustomer && (
                                                    <button
                                                        onClick={() => setSelectedCustomer(null)}
                                                        className="text-sm text-gray-500 hover:text-white underline"
                                                    >
                                                        Change
                                                    </button>
                                                )}
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-400 mb-2">Full Name</label>
                                                <input
                                                    type="text"
                                                    value={selectedCustomer.name}
                                                    readOnly
                                                    className="w-full bg-[#151515] border border-gray-800 rounded-xl px-4 py-3 text-gray-500 focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-400 mb-2">Mobile Number</label>
                                                <input
                                                    type="text"
                                                    value={selectedCustomer.mobile_number}
                                                    readOnly
                                                    className="w-full bg-[#151515] border border-gray-800 rounded-xl px-4 py-3 text-gray-500 focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Step 2: Location */}
                        {activeStep === 1 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center gap-3 text-purple-400 mb-6 border-b border-gray-800 pb-4">
                                    <MapPin className="w-5 h-5" />
                                    <h3 className="text-lg font-medium">Installation Address</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">Location Type</label>
                                            <input
                                                type="text"
                                                value={formData.label}
                                                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                                                placeholder="e.g. Home, Office"
                                                className="w-full bg-[#151515] border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">Barangay</label>
                                            <select
                                                value={formData.barangay}
                                                onChange={(e) => setFormData({ ...formData, barangay: e.target.value })}
                                                className="w-full bg-[#151515] border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                            >
                                                <option value="">Select Barangay</option>
                                                {BARANGAY_OPTIONS.map(barangay => (
                                                    <option key={barangay} value={barangay}>{barangay}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">Detailed Address</label>
                                            <input
                                                type="text"
                                                value={formData.address}
                                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                                className="w-full bg-[#151515] border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">Landmark</label>
                                            <input
                                                type="text"
                                                value={formData.landmark}
                                                onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                                                className="w-full bg-[#151515] border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm font-medium text-gray-400">Pin Location</label>
                                            <button
                                                onClick={handleGetCurrentLocation}
                                                type="button"
                                                className="text-xs flex items-center gap-1 text-blue-400 hover:text-blue-300"
                                            >
                                                <Navigation className="w-3 h-3" />
                                                Use Current
                                            </button>
                                        </div>
                                        <div className="h-[280px] rounded-xl overflow-hidden border border-gray-800 relative z-0">
                                            <MapPicker
                                                center={coordinates ? [coordinates.lat, coordinates.lng] : [14.8430, 120.8120]}
                                                value={coordinates}
                                                onChange={(val) => handleLocationSelect(val.lat, val.lng)}
                                            />
                                        </div>
                                        {coordinates && (
                                            <div className="text-xs text-center text-gray-500 font-mono bg-[#151515] p-2 rounded-lg">
                                                {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Plan */}
                        {activeStep === 2 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center gap-3 text-purple-400 mb-6 border-b border-gray-800 pb-4">
                                    <Wifi className="w-5 h-5" />
                                    <h3 className="text-lg font-medium">Plan Information</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Business Unit</label>
                                        <div className="space-y-2">
                                            {businessUnits.map(unit => (
                                                <label
                                                    key={unit.id}
                                                    className={`flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.business_unit_id === unit.id
                                                        ? 'border-purple-500 bg-purple-500/10'
                                                        : 'border-gray-800 bg-[#151515] hover:border-gray-700'
                                                        }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="business_unit"
                                                        value={unit.id}
                                                        checked={formData.business_unit_id === unit.id}
                                                        onChange={(e) => setFormData({ ...formData, business_unit_id: e.target.value })}
                                                        className="hidden"
                                                    />
                                                    <span className={`font-medium ${formData.business_unit_id === unit.id ? 'text-white' : 'text-gray-400'}`}>
                                                        {unit.name}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Select Plan</label>
                                        <select
                                            value={formData.plan_id}
                                            onChange={(e) => setFormData({ ...formData, plan_id: e.target.value })}
                                            className="w-full bg-[#151515] border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors mb-4"
                                            size={4}
                                        >
                                            {plans.map(plan => (
                                                <option key={plan.id} value={plan.id} className="py-2">
                                                    {plan.name} - ₱{plan.monthly_fee.toLocaleString()}/mo
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Installation Date</label>
                                        <input
                                            type="date"
                                            value={formData.date_installed}
                                            onChange={(e) => setFormData({ ...formData, date_installed: e.target.value })}
                                            className="w-full bg-[#151515] border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Billing Period</label>
                                        <select
                                            value={formData.invoice_date}
                                            onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                                            className="w-full bg-[#151515] border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                        >
                                            <option value="">Select Billing Period</option>
                                            <option value="15th">15th of the Month</option>
                                            <option value="30th">30th of the Month</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Others */}
                        {activeStep === 3 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center gap-3 text-purple-400 mb-6 border-b border-gray-800 pb-4">
                                    <FileText className="w-5 h-5" />
                                    <h3 className="text-lg font-medium">Additional Information</h3>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Referrer (Optional)</label>
                                    <select
                                        value={formData.contact_person}
                                        onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                                        className="w-full bg-[#151515] border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                    >
                                        <option value="">No Referrer</option>
                                        {availableReferrers.map(customer => (
                                            <option key={customer.id} value={customer.id}>{customer.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Active/Connection Toggle */}
                                    <div
                                        onClick={() => setFormData({ ...formData, active: !formData.active })}
                                        className={`p-4 rounded-xl border cursor-pointer transition-all ${formData.active ? 'border-green-500/50 bg-green-500/10' : 'border-gray-800 bg-[#151515]'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={`font-medium ${formData.active ? 'text-green-400' : 'text-gray-400'}`}>Connection Status</span>
                                            <div className={`w-10 h-6 rounded-full relative transition-colors ${formData.active ? 'bg-green-500' : 'bg-gray-700'}`}>
                                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.active ? 'left-5' : 'left-1'}`} />
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-500">
                                            {formData.active ? 'Service will be active immediately' : 'Service will be installed but inactive'}
                                        </p>
                                    </div>

                                    {/* Referral Credit Toggle */}
                                    <div
                                        onClick={() => setFormData({ ...formData, referral_credit_applied: !formData.referral_credit_applied })}
                                        className={`p-4 rounded-xl border cursor-pointer transition-all ${formData.referral_credit_applied ? 'border-blue-500/50 bg-blue-500/10' : 'border-gray-800 bg-[#151515]'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={`font-medium ${formData.referral_credit_applied ? 'text-blue-400' : 'text-gray-400'}`}>Referral Credit</span>
                                            <div className={`w-10 h-6 rounded-full relative transition-colors ${formData.referral_credit_applied ? 'bg-blue-500' : 'bg-gray-700'}`}>
                                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.referral_credit_applied ? 'left-5' : 'left-1'}`} />
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-500">
                                            {formData.referral_credit_applied ? 'Credit already applied to referrer' : 'Mark if credit needs to be applied'}
                                        </p>
                                    </div>
                                </div>

                                <div className="p-4 bg-gray-900 rounded-xl mt-6">
                                    <h4 className="text-gray-400 text-sm font-medium mb-2 uppercase tracking-wide">Summary</h4>
                                    <ul className="space-y-2 text-sm">
                                        <li className="flex justify-between">
                                            <span className="text-gray-500">Customer:</span>
                                            <span className="text-white">{selectedCustomer?.name || '-'}</span>
                                        </li>
                                        <li className="flex justify-between">
                                            <span className="text-gray-500">Plan:</span>
                                            <span className="text-white">
                                                {plans.find(p => p.id === formData.plan_id)?.name || '-'}
                                                <span className="text-gray-600 ml-1">
                                                    (₱{plans.find(p => p.id === formData.plan_id)?.monthly_fee.toLocaleString() || '0'}/mo)
                                                </span>
                                            </span>
                                        </li>
                                        <li className="flex justify-between">
                                            <span className="text-gray-500">Location:</span>
                                            <span className="text-white truncate max-w-[200px]">{formData.barangay}, {formData.address}</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-6 border-t border-gray-800 bg-[#0a0a0a] flex justify-between items-center z-10">
                    <button
                        onClick={handleBack}
                        disabled={activeStep === 0}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${activeStep === 0
                            ? 'text-gray-600 cursor-not-allowed'
                            : 'text-gray-300 hover:text-white hover:bg-gray-800'
                            }`}
                    >
                        <ChevronLeft className="w-5 h-5" /> Back
                    </button>

                    <button
                        onClick={handleNext}
                        disabled={isLoading || (activeStep === 0 && !selectedCustomer)}
                        className={`flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl font-medium shadow-lg shadow-purple-900/30 transition-all ${(isLoading || (activeStep === 0 && !selectedCustomer)) ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : activeStep === steps.length - 1 ? (
                            <>Confirm Subscription <Check className="w-5 h-5" /></>
                        ) : (
                            <>Next Step <ChevronRight className="w-5 h-5" /></>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
