'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Search, Navigation } from 'lucide-react';
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

interface AddSubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function AddSubscriptionModal({ isOpen, onClose, onSuccess }: AddSubscriptionModalProps) {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [isLoading, setIsLoading] = useState(false);
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
        contact_person: '',
        customer_portal: '',
        invoice_date: '',
        referral_credit_applied: false
    });

    const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen]);

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
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        setSelectedCustomer(customer);
        setFormData(prev => ({
            ...prev,
            subscriber_id: customer.id,
            customer_portal: `${baseUrl}/portal/${customer.id}`
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
                    barangay: data.address.suburb || data.address.neighbourhood || data.address.village || '',
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
        onClose();
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
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />

            <div className="relative bg-[#0a0a0a] border-2 border-red-900/50 rounded-xl shadow-[0_0_50px_rgba(255,0,0,0.3)] w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-[#0a0a0a] border-b border-red-900/30 p-6 flex justify-between items-center z-10">
                    <div>
                        <h2 className="text-2xl font-bold text-white neon-text">Add Subscription</h2>
                        <p className="text-gray-400 text-sm mt-1">Create a new subscription for an existing customer</p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Customer Lookup */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            Customer <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={selectedCustomer?.name || ''}
                                onClick={() => setShowCustomerLookup(true)}
                                readOnly
                                placeholder="Click to select customer"
                                className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white cursor-pointer focus:outline-none focus:border-red-500"
                            />
                            {showCustomerLookup && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-gray-800 rounded-lg shadow-xl z-20 max-h-64 overflow-hidden">
                                    <div className="p-3 border-b border-gray-800">
                                        <div className="relative">
                                            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                                            <input
                                                type="text"
                                                value={customerSearchQuery}
                                                onChange={(e) => setCustomerSearchQuery(e.target.value)}
                                                placeholder="Search customers..."
                                                className="w-full bg-[#0a0a0a] border border-gray-700 rounded pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                        {filteredCustomers.map(customer => (
                                            <button
                                                key={customer.id}
                                                onClick={() => handleCustomerSelect(customer)}
                                                className="w-full text-left px-4 py-2 hover:bg-[#0f0f0f] transition-colors"
                                            >
                                                <p className="text-white font-medium">{customer.name}</p>
                                                <p className="text-gray-500 text-sm">{customer.mobile_number}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Customer Portal (Auto-generated) */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Customer Portal</label>
                        <input
                            type="text"
                            value={formData.customer_portal}
                            disabled
                            className="w-full bg-[#0f0f0f] border border-gray-800 rounded px-4 py-2 text-gray-500 cursor-not-allowed"
                        />
                    </div>

                    {/* Connection Status & Referral Credit Toggles */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Active/Connection Toggle */}
                        <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
                            <label className="block text-sm font-medium text-gray-400 mb-3">Connection</label>
                            <button
                                onClick={() => setFormData({ ...formData, active: !formData.active })}
                                className="relative inline-flex items-center cursor-pointer group"
                            >
                                <div className={`w-14 h-7 rounded-full transition-colors ${formData.active ? 'bg-green-600' : 'bg-gray-700'
                                    }`}>
                                    <div className={`absolute top-0.5 left-0.5 bg-white w-6 h-6 rounded-full transition-transform ${formData.active ? 'translate-x-7' : 'translate-x-0'
                                        }`} />
                                </div>
                                <span className={`ml-3 text-sm font-medium ${formData.active ? 'text-green-500' : 'text-gray-500'
                                    }`}>
                                    {formData.active ? 'Active' : 'Disconnected'}
                                </span>
                            </button>
                        </div>

                        {/* Referral Credit Toggle */}
                        <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
                            <label className="block text-sm font-medium text-gray-400 mb-3">Referral Credit</label>
                            <button
                                onClick={() => setFormData({ ...formData, referral_credit_applied: !formData.referral_credit_applied })}
                                className="relative inline-flex items-center cursor-pointer group"
                            >
                                <div className={`w-14 h-7 rounded-full transition-colors ${formData.referral_credit_applied ? 'bg-blue-600' : 'bg-gray-700'
                                    }`}>
                                    <div className={`absolute top-0.5 left-0.5 bg-white w-6 h-6 rounded-full transition-transform ${formData.referral_credit_applied ? 'translate-x-7' : 'translate-x-0'
                                        }`} />
                                </div>
                                <span className={`ml-3 text-sm font-medium ${formData.referral_credit_applied ? 'text-blue-500' : 'text-gray-500'
                                    }`}>
                                    {formData.referral_credit_applied ? 'Applied' : 'Not Applied'}
                                </span>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Business Unit */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Business Unit <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={formData.business_unit_id}
                                onChange={(e) => setFormData({ ...formData, business_unit_id: e.target.value })}
                                className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                            >
                                <option value="">Select Business Unit</option>
                                {businessUnits.map(unit => (
                                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Plan */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Plan <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={formData.plan_id}
                                onChange={(e) => setFormData({ ...formData, plan_id: e.target.value })}
                                className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                            >
                                <option value="">Select Plan</option>
                                {plans.map(plan => (
                                    <option key={plan.id} value={plan.id}>
                                        {plan.name} - ₱{plan.monthly_fee.toLocaleString()}/mo
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Installation Date */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Installation Date</label>
                            <input
                                type="date"
                                value={formData.date_installed}
                                onChange={(e) => setFormData({ ...formData, date_installed: e.target.value })}
                                className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                            />
                        </div>

                        {/* Invoice Date */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Invoice Date (Day of Month)</label>
                            <input
                                type="text"
                                value={formData.invoice_date}
                                disabled
                                className="w-full bg-[#0f0f0f] border border-gray-800 rounded px-4 py-2 text-gray-500 cursor-not-allowed"
                            />
                        </div>
                    </div>

                    {/* Map Location with Current Location Button */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-400">Location</label>
                            <button
                                onClick={handleGetCurrentLocation}
                                type="button"
                                className="flex items-center gap-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                            >
                                <Navigation className="w-4 h-4" />
                                Update to Current Location
                            </button>
                        </div>
                        <div className="h-64 rounded-lg overflow-hidden border border-gray-800 relative z-0">
                            <MapPicker
                                center={coordinates ? [coordinates.lat, coordinates.lng] : [14.8430, 120.8120]}
                                value={coordinates}
                                onChange={(val) => handleLocationSelect(val.lat, val.lng)}
                            />
                        </div>
                    </div>

                    {/* Coordinates Display */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Latitude (Y-Coordinates)</label>
                            <input
                                type="text"
                                value={coordinates?.lat.toFixed(6) || ''}
                                disabled
                                placeholder="Not set"
                                className="w-full bg-[#0f0f0f] border border-gray-800 rounded px-4 py-2 text-gray-500 cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Longitude (X-Coordinates)</label>
                            <input
                                type="text"
                                value={coordinates?.lng.toFixed(6) || ''}
                                disabled
                                placeholder="Not set"
                                className="w-full bg-[#0f0f0f] border border-gray-800 rounded px-4 py-2 text-gray-500 cursor-not-allowed"
                            />
                        </div>
                    </div>

                    {/* Address Fields */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Barangay</label>
                            <input
                                type="text"
                                value={formData.barangay}
                                onChange={(e) => setFormData({ ...formData, barangay: e.target.value })}
                                className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Address</label>
                            <input
                                type="text"
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Location Type</label>
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
                            <label className="block text-sm font-medium text-gray-400 mb-2">Landmark</label>
                            <input
                                type="text"
                                value={formData.landmark}
                                onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                                className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                    </div>

                    {/* Referrer */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Referrer (Optional)</label>
                        <select
                            value={formData.contact_person}
                            onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-red-500"
                        >
                            <option value="">No Referrer</option>
                            {availableReferrers.map(customer => (
                                <option key={customer.id} value={customer.id}>{customer.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-[#0a0a0a] border-t border-red-900/30 p-6 flex justify-end gap-3">
                    <button
                        onClick={handleClose}
                        className="px-6 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Creating...' : 'Create Subscription'}
                    </button>
                </div>
            </div>
        </div>
    );
}
