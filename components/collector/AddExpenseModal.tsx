'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Receipt, Loader2, Save, Calendar, FileText, Banknote, User, Wifi, Building2 } from 'lucide-react';

interface AddExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface Customer {
    id: string;
    name: string;
}

interface Subscription {
    id: string;
    subscriber_id: string;
    address: string;
    barangay: string;
    plan_name: string;
    business_unit_name: string;
    business_unit_id: string;
}

export default function AddExpenseModal({ isOpen, onClose, onSuccess }: AddExpenseModalProps) {
    const [isLoading, setIsLoading] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        amount: '',
        reason: '',
        notes: '',
        date: new Date().toISOString().split('T')[0],
        subscription_id: '',
        business_unit_id: ''
    });

    // Data State
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
    const [customerSubscriptions, setCustomerSubscriptions] = useState<Subscription[]>([]);

    // UI State
    const [customerSearch, setCustomerSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

    // Use ref for dropdown click outside
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Initial Data Fetch
    useEffect(() => {
        if (isOpen) {
            fetchCustomers();
            fetchBusinessUnits();
            // Reset form when opened
            setFormData({
                amount: '',
                reason: '',
                notes: '',
                date: new Date().toISOString().split('T')[0],
                subscription_id: '',
                business_unit_id: ''
            });
            setSelectedCustomer(null);
            setCustomerSearch('');
            setCustomerSubscriptions([]);
        }
    }, [isOpen]);

    // Click outside handler for dropdown
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowCustomerDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const fetchCustomers = async () => {
        try {
            const { data } = await supabase.from('customers').select('id, name').order('name');
            setCustomers(data || []);
        } catch (error) {
            console.error('Error fetching customers:', error);
        }
    };

    const fetchBusinessUnits = async () => {
        try {
            const { data } = await supabase.from('business_units').select('id, name').order('name');
            setBusinessUnits(data || []);
        } catch (error) {
            console.error('Error fetching business units:', error);
        }
    };

    const fetchCustomerSubscriptions = async (customerId: string) => {
        try {
            const { data } = await supabase
                .from('subscriptions')
                .select(`
                    id, subscriber_id, address, barangay, business_unit_id,
                    plans(name),
                    business_units(id, name)
                `)
                .eq('subscriber_id', customerId)
                .eq('active', true);

            const subs: Subscription[] = (data || []).map((s: any) => ({
                id: s.id,
                subscriber_id: s.subscriber_id,
                address: s.address || '',
                barangay: s.barangay || '',
                plan_name: Array.isArray(s.plans) ? s.plans[0]?.name : s.plans?.name || 'No Plan',
                business_unit_name: Array.isArray(s.business_units) ? s.business_units[0]?.name : s.business_units?.name || 'Unknown',
                business_unit_id: s.business_unit_id
            }));
            setCustomerSubscriptions(subs);
        } catch (error) {
            console.error('Error fetching subscriptions:', error);
            setCustomerSubscriptions([]);
        }
    };

    const selectCustomer = (customer: Customer) => {
        setSelectedCustomer(customer);
        setCustomerSearch(customer.name);
        setShowCustomerDropdown(false);
        setFormData(prev => ({ ...prev, subscription_id: '' }));
        fetchCustomerSubscriptions(customer.id);
    };

    const clearCustomer = () => {
        setSelectedCustomer(null);
        setCustomerSearch('');
        setFormData(prev => ({ ...prev, subscription_id: '', business_unit_id: '' }));
        setCustomerSubscriptions([]);
    };

    const filteredCustomers = useMemo(() => {
        if (!customerSearch.trim()) return customers.slice(0, 10);
        return customers.filter(c =>
            c.name.toLowerCase().includes(customerSearch.toLowerCase())
        ).slice(0, 10);
    }, [customers, customerSearch]);

    const handleSubmit = async () => {
        if (!formData.amount || !formData.reason || !formData.date || (!selectedCustomer && !formData.business_unit_id)) {
            alert('Please fill in all required fields');
            return;
        }

        setIsLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('expenses')
                .insert({
                    amount: parseFloat(formData.amount),
                    reason: formData.reason,
                    notes: formData.notes,
                    date: formData.date,
                    user_id: user.id,
                    subscription_id: formData.subscription_id || null,
                    business_unit_id: formData.business_unit_id || null
                });

            if (error) throw error;

            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error adding expense:', error);
            alert('Failed to add expense');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-purple-900/50 rounded-2xl shadow-[0_0_60px_rgba(168,85,247,0.15)] w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="relative p-6 border-b border-gray-800/50 flex-shrink-0">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 via-violet-600/10 to-purple-600/10" />
                    <div className="relative flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
                                <Receipt className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Add Expense</h2>
                                <p className="text-sm text-gray-400">Record a business expense</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Form Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">

                    {/* Customer Search */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Customer (Optional)</label>
                        <div className="relative">
                            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                value={customerSearch}
                                onChange={(e) => {
                                    setCustomerSearch(e.target.value);
                                    setShowCustomerDropdown(true);
                                    if (!e.target.value) {
                                        setSelectedCustomer(null);
                                        setCustomerSubscriptions([]);
                                        setFormData(prev => ({ ...prev, subscription_id: '', business_unit_id: '' }));
                                    }
                                }}
                                onFocus={() => setShowCustomerDropdown(true)}
                                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl pl-10 pr-10 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                placeholder="Search customer..."
                            />
                            {selectedCustomer && (
                                <button
                                    onClick={clearCustomer}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}

                            {/* Customer Dropdown */}
                            {showCustomerDropdown && !selectedCustomer && (
                                <div ref={dropdownRef} className="absolute z-10 w-full mt-1 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                                    {filteredCustomers.length > 0 ? (
                                        filteredCustomers.map(customer => (
                                            <button
                                                key={customer.id}
                                                type="button"
                                                onClick={() => selectCustomer(customer)}
                                                className="w-full px-4 py-2.5 text-left text-white hover:bg-purple-900/30 transition-colors flex items-center gap-2"
                                            >
                                                <User className="w-4 h-4 text-gray-500" />
                                                {customer.name}
                                            </button>
                                        ))
                                    ) : (
                                        <div className="px-4 py-3 text-gray-500 text-sm">No customers found</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Subscription Select */}
                    {selectedCustomer && (
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Subscription</label>
                            <div className="space-y-2">
                                {customerSubscriptions.length > 0 ? (
                                    customerSubscriptions.map(sub => (
                                        <label
                                            key={sub.id}
                                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${formData.subscription_id === sub.id
                                                ? 'bg-purple-900/30 border-purple-700/50'
                                                : 'bg-[#1a1a1a] border-gray-700 hover:border-gray-600'
                                                }`}
                                        >
                                            <input
                                                type="radio"
                                                name="subscription"
                                                value={sub.id}
                                                checked={formData.subscription_id === sub.id}
                                                onChange={(e) => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        subscription_id: e.target.value,
                                                        business_unit_id: sub.business_unit_id // Auto-select BU
                                                    }));
                                                }}
                                                className="sr-only"
                                            />
                                            <Wifi className={`w-5 h-5 ${formData.subscription_id === sub.id ? 'text-purple-400' : 'text-gray-500'}`} />
                                            <div className="flex-1">
                                                <div className="text-white font-medium">{sub.plan_name}</div>
                                                <div className="text-xs text-gray-500">{sub.address}, {sub.barangay}</div>
                                            </div>
                                            <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-800 rounded">{sub.business_unit_name}</span>
                                        </label>
                                    ))
                                ) : (
                                    <p className="text-gray-500 text-sm p-3 bg-gray-900/50 rounded-xl">No active subscriptions found</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Business Unit Select */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">
                            Business Unit
                            {!selectedCustomer && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <div className="relative">
                            <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <select
                                value={formData.business_unit_id}
                                onChange={(e) => setFormData(prev => ({ ...prev, business_unit_id: e.target.value }))}
                                disabled={!!formData.subscription_id}
                                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors appearance-none"
                            >
                                <option value="">Select Business Unit...</option>
                                {businessUnits.map(unit => (
                                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                                ))}
                            </select>
                        </div>
                        {formData.subscription_id && (
                            <p className="text-xs text-gray-500 mt-1">Automatically set based on selected subscription</p>
                        )}
                    </div>

                    {/* Date */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Date</label>
                        <input
                            type="date"
                            value={formData.date}
                            onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                        />
                    </div>

                    {/* Reason */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Reason</label>
                        <select
                            value={formData.reason}
                            onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors appearance-none"
                        >
                            <option value="">Select reason...</option>
                            <option value="Maintenance">Maintenance</option>
                            <option value="Materials">Materials</option>
                            <option value="Transportation">Transportation</option>
                            <option value="Others">Others</option>
                        </select>
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Amount (₱)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₱</span>
                            <input
                                type="number"
                                value={formData.amount}
                                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl pl-8 pr-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Notes (Optional)</label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors resize-none h-24"
                            placeholder="Additional details..."
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-800/50 flex justify-end gap-3 flex-shrink-0">
                    <button onClick={onClose} className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium transition-colors">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={
                            isLoading ||
                            !formData.reason ||
                            !formData.amount ||
                            (!selectedCustomer && !formData.business_unit_id)
                        }
                        className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-purple-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                Save Expense
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
