'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, FileText, AlertCircle, CheckCircle, Loader2, Calendar, DollarSign, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ManualInvoiceMigrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function ManualInvoiceMigrationModal({
    isOpen,
    onClose,
    onSuccess
}: ManualInvoiceMigrationModalProps) {
    const [subscriptions, setSubscriptions] = useState<any[]>([]);
    const [selectedSubscription, setSelectedSubscription] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    
    // Form fields
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [amountDue, setAmountDue] = useState('');
    const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Unpaid' | 'Partially Paid'>('Unpaid');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchSubscriptions();
        }
    }, [isOpen]);

    // Filter subscriptions based on search query
    const filteredSubscriptions = useMemo(() => {
        if (!searchQuery.trim()) return subscriptions;
        
        const query = searchQuery.toLowerCase();
        return subscriptions.filter(sub => 
            sub.customerName?.toLowerCase().includes(query) ||
            sub.address?.toLowerCase().includes(query) ||
            sub.mobileNumber?.includes(query) ||
            sub.planName?.toLowerCase().includes(query)
        );
    }, [subscriptions, searchQuery]);

    useEffect(() => {
        if (isOpen) {
            fetchSubscriptions();
        }
    }, [isOpen]);

    const fetchSubscriptions = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('subscriptions')
                .select(`
                    id,
                    address,
                    customers!subscriptions_subscriber_id_fkey (
                        name,
                        mobile_number
                    ),
                    plans (
                        name,
                        monthly_fee
                    ),
                    business_units (
                        name
                    )
                `)
                .eq('active', true)
                .order('address');

            if (error) throw error;

            const formatted = (data || []).map((sub: any) => ({
                id: sub.id,
                address: sub.address,
                customerName: Array.isArray(sub.customers) ? sub.customers[0]?.name : sub.customers?.name,
                mobileNumber: Array.isArray(sub.customers) ? sub.customers[0]?.mobile_number : sub.customers?.mobile_number,
                planName: Array.isArray(sub.plans) ? sub.plans[0]?.name : sub.plans?.name,
                monthlyFee: Array.isArray(sub.plans) ? sub.plans[0]?.monthly_fee : sub.plans?.monthly_fee,
                businessUnit: Array.isArray(sub.business_units) ? sub.business_units[0]?.name : sub.business_units?.name,
            }));

            setSubscriptions(formatted);
        } catch (error) {
            console.error('Error fetching subscriptions:', error);
            alert('Failed to load subscriptions');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubscriptionChange = (subId: string) => {
        setSelectedSubscription(subId);
        const sub = subscriptions.find(s => s.id === subId);
        if (sub) {
            // Pre-fill amount with monthly fee
            setAmountDue(sub.monthlyFee.toString());
            // Close dropdown after selection
            setShowDropdown(false);
            setSearchQuery('');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!selectedSubscription || !fromDate || !toDate || !dueDate || !amountDue) {
            alert('Please fill in all required fields');
            return;
        }

        if (!confirm('Are you sure you want to create this manual invoice? This is for migration purposes only.')) {
            return;
        }

        setIsSubmitting(true);

        try {
            // Create manual invoice
            const { data: invoice, error: invoiceError } = await supabase
                .from('invoices')
                .insert({
                    subscription_id: selectedSubscription,
                    from_date: fromDate,
                    to_date: toDate,
                    due_date: dueDate,
                    amount_due: parseFloat(amountDue),
                    payment_status: paymentStatus,
                    notes: notes || 'Migrated from legacy system',
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (invoiceError) throw invoiceError;

            // If status is Paid or Partially Paid, update subscription balance
            if (paymentStatus === 'Paid') {
                // No balance change needed for fully paid
            } else if (paymentStatus === 'Partially Paid') {
                // You might want to add logic here for partial payments
            } else {
                // Unpaid - add to balance
                const { error: balanceError } = await supabase.rpc('update_subscription_balance', {
                    p_subscription_id: selectedSubscription,
                    p_amount: parseFloat(amountDue)
                });

                if (balanceError) {
                    console.error('Balance update error:', balanceError);
                    // Continue anyway - invoice is created
                }
            }

            alert('Manual invoice created successfully!');
            onSuccess();
            resetForm();
            onClose();

        } catch (error) {
            console.error('Error creating manual invoice:', error);
            alert('Failed to create invoice: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setSelectedSubscription('');
        setSearchQuery('');
        setShowDropdown(false);
        setFromDate('');
        setToDate('');
        setDueDate('');
        setAmountDue('');
        setPaymentStatus('Unpaid');
        setNotes('');
    };

    if (!isOpen) return null;

    const selectedSub = subscriptions.find(s => s.id === selectedSubscription);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="relative bg-[#0a0a0a] border-2 border-amber-900/50 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-[0_0_60px_rgba(251,191,36,0.15)]">
                {/* Header */}
                <div className="sticky top-0 bg-[#0a0a0a] border-b border-amber-900/30 p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-900/20 rounded-lg flex items-center justify-center">
                            <FileText className="w-5 h-5 text-amber-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Manual Invoice Migration</h2>
                            <p className="text-xs text-amber-500">⚠️ Temporary - For legacy data migration only</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Warning Banner */}
                <div className="mx-6 mt-6 p-4 bg-amber-900/20 border border-amber-500/30 rounded-xl">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="text-amber-200 font-medium mb-1">Migration Tool</p>
                            <p className="text-amber-300/80 text-xs">
                                This tool is for manually adding old invoices from the legacy PHP system. 
                                Use only for historical data migration. This button will be removed once migration is complete.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Subscription Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Select Subscription <span className="text-red-500">*</span>
                        </label>
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {/* Search Input */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => {
                                            setSearchQuery(e.target.value);
                                            setShowDropdown(true);
                                        }}
                                        onFocus={() => setShowDropdown(true)}
                                        placeholder={selectedSub ? `${selectedSub.customerName} - ${selectedSub.address}` : "Search by name, address, mobile, or plan..."}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-10 py-3 text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none"
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearchQuery('');
                                                setShowDropdown(false);
                                            }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                {/* Filtered Results - Only show when dropdown is open */}
                                {showDropdown && (
                                    <div className="max-h-64 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-lg">
                                        {filteredSubscriptions.length === 0 ? (
                                            <div className="p-4 text-center text-gray-500 text-sm">
                                                {searchQuery ? 'No subscriptions found' : 'Start typing to search...'}
                                            </div>
                                        ) : filteredSubscriptions.length > 100 ? (
                                            /* Show message if too many results - encourage more specific search */
                                            <div className="p-4 text-center text-amber-400 text-sm">
                                                <AlertCircle className="w-5 h-5 mx-auto mb-2" />
                                                <p className="font-medium">Too many results ({filteredSubscriptions.length})</p>
                                                <p className="text-xs text-gray-400 mt-1">Please type more characters to narrow down the search</p>
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-gray-800">
                                                {filteredSubscriptions.map(sub => (
                                                    <button
                                                        key={sub.id}
                                                        type="button"
                                                        onClick={() => handleSubscriptionChange(sub.id)}
                                                        className={`w-full text-left p-3 hover:bg-gray-800 transition-colors ${
                                                            selectedSubscription === sub.id 
                                                                ? 'bg-amber-900/20 border-l-4 border-amber-500' 
                                                                : ''
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-medium text-white truncate">
                                                                    {sub.customerName}
                                                                </div>
                                                                <div className="text-sm text-gray-400 truncate">
                                                                    {sub.address}
                                                                </div>
                                                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                                                    <span>{sub.mobileNumber}</span>
                                                                    <span>•</span>
                                                                    <span>{sub.planName}</span>
                                                                </div>
                                                            </div>
                                                            {selectedSubscription === sub.id && (
                                                                <CheckCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                                            )}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Show count only when dropdown is open */}
                                {showDropdown && filteredSubscriptions.length > 0 && filteredSubscriptions.length <= 100 && (
                                    <div className="text-xs text-gray-500 text-right">
                                        Showing {filteredSubscriptions.length} of {subscriptions.length} subscriptions
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* Selected subscription info - Always visible when selected */}
                        {selectedSub && !showDropdown && (
                            <div className="mt-3 p-3 bg-gray-900/50 border border-gray-800 rounded-lg text-sm">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="grid grid-cols-2 gap-2 text-xs flex-1">
                                        <div>
                                            <span className="text-gray-500">Customer:</span>
                                            <span className="text-white ml-2">{selectedSub.customerName}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Mobile:</span>
                                            <span className="text-white ml-2">{selectedSub.mobileNumber}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Plan:</span>
                                            <span className="text-white ml-2">{selectedSub.planName}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Monthly Fee:</span>
                                            <span className="text-white ml-2">₱{selectedSub.monthlyFee.toLocaleString()}</span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedSubscription('');
                                            setSearchQuery('');
                                            setShowDropdown(true);
                                        }}
                                        className="text-gray-500 hover:text-amber-500 transition-colors"
                                        title="Change subscription"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Date Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                <Calendar className="w-4 h-4 inline mr-1" />
                                From Date <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-amber-500 focus:outline-none"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                <Calendar className="w-4 h-4 inline mr-1" />
                                To Date <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-amber-500 focus:outline-none"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                <Calendar className="w-4 h-4 inline mr-1" />
                                Due Date <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-amber-500 focus:outline-none"
                                required
                            />
                        </div>
                    </div>

                    {/* Amount and Status */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                <DollarSign className="w-4 h-4 inline mr-1" />
                                Amount Due <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={amountDue}
                                onChange={(e) => setAmountDue(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-amber-500 focus:outline-none"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Payment Status <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={paymentStatus}
                                onChange={(e) => setPaymentStatus(e.target.value as any)}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-amber-500 focus:outline-none"
                                required
                            >
                                <option value="Unpaid">Unpaid</option>
                                <option value="Partially Paid">Partially Paid</option>
                                <option value="Paid">Paid</option>
                            </select>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Notes (Optional)
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="e.g., Migrated from legacy system - Invoice #12345"
                            rows={3}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-amber-500 focus:outline-none resize-none"
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4 border-t border-gray-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors font-medium"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !selectedSubscription}
                            className="flex-1 py-3 px-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl transition-all font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-amber-900/30"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-5 h-5" />
                                    Create Manual Invoice
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
