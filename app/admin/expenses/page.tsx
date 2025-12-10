'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, ChevronLeft, ChevronRight, Edit, Trash2, Plus, RefreshCw, ChevronDown, Calendar, FileText, Receipt, User, Wifi, X, Building2 } from 'lucide-react';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

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
}

interface Expense {
    id: string;
    date: string;
    reason: string;
    amount: number;
    notes: string;
    subscription_id: string | null;
    created_at: string;
    subscription?: {
        id: string;
        address: string;
        barangay: string;
        business_unit: { name: string } | null;
        customer: { name: string } | null;
        plan: { name: string } | null;
    };
}

export default function ExpensesPage() {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        date: '',
        reason: '',
        amount: '',
        notes: '',
        subscription_id: ''
    });

    // Customer search for modal
    const [customerSearch, setCustomerSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customerSubscriptions, setCustomerSubscriptions] = useState<Subscription[]>([]);
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

    const itemsPerPage = 10;

    useEffect(() => {
        fetchExpenses();
        fetchCustomers();
    }, []);

    // Real-time subscription for expenses
    useRealtimeSubscription({
        table: 'expenses',
        onAny: () => fetchExpenses()
    });

    const fetchExpenses = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('expenses')
                .select(`
                    *,
                    subscription:subscriptions(
                        id, address, barangay,
                        business_unit:business_units(name),
                        customer:customers!subscriptions_subscriber_id_fkey(name),
                        plan:plans(name)
                    )
                `)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setExpenses(data || []);
        } catch (error) {
            console.error('Error:', error);
            setExpenses([]);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchCustomers = async () => {
        try {
            const { data } = await supabase.from('customers').select('id, name').order('name');
            setCustomers(data || []);
        } catch (error) {
            console.error('Error fetching customers:', error);
        }
    };

    const fetchCustomerSubscriptions = async (customerId: string) => {
        try {
            const { data } = await supabase
                .from('subscriptions')
                .select(`
                    id, subscriber_id, address, barangay,
                    plans(name),
                    business_units(name)
                `)
                .eq('subscriber_id', customerId)
                .eq('active', true);

            const subs: Subscription[] = (data || []).map((s: any) => ({
                id: s.id,
                subscriber_id: s.subscriber_id,
                address: s.address || '',
                barangay: s.barangay || '',
                plan_name: Array.isArray(s.plans) ? s.plans[0]?.name : s.plans?.name || 'No Plan',
                business_unit_name: Array.isArray(s.business_units) ? s.business_units[0]?.name : s.business_units?.name || 'Unknown'
            }));
            setCustomerSubscriptions(subs);
        } catch (error) {
            console.error('Error fetching subscriptions:', error);
            setCustomerSubscriptions([]);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await supabase.from('expenses').delete().eq('id', id);
            fetchExpenses();
            setDeleteConfirm(null);
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const handleSave = async () => {
        try {
            const payload: any = {
                reason: formData.reason,
                amount: parseFloat(formData.amount) || 0,
                notes: formData.notes,
                subscription_id: formData.subscription_id || null
            };

            // Add date if the column exists
            if (formData.date) {
                payload.date = formData.date;
            }

            if (selectedExpense) {
                await supabase.from('expenses').update(payload).eq('id', selectedExpense.id);
            } else {
                await supabase.from('expenses').insert(payload);
            }

            closeModal();
            fetchExpenses();
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const closeModal = () => {
        setIsAddModalOpen(false);
        setIsEditModalOpen(false);
        setSelectedExpense(null);
        setFormData({ date: '', reason: '', amount: '', notes: '', subscription_id: '' });
        setSelectedCustomer(null);
        setCustomerSubscriptions([]);
        setCustomerSearch('');
    };

    const openEdit = (expense: Expense, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedExpense(expense);
        setFormData({
            date: expense.date || new Date().toISOString().split('T')[0],
            reason: expense.reason,
            amount: expense.amount.toString(),
            notes: expense.notes || '',
            subscription_id: expense.subscription_id || ''
        });

        // If expense has subscription, set the customer
        if (expense.subscription?.customer) {
            const customerName = Array.isArray(expense.subscription.customer)
                ? expense.subscription.customer[0]?.name
                : expense.subscription.customer?.name;
            if (customerName) {
                setCustomerSearch(customerName);
                // Find and set the customer
                const customer = customers.find(c => c.name === customerName);
                if (customer) {
                    setSelectedCustomer(customer);
                    fetchCustomerSubscriptions(customer.id);
                }
            }
        }

        setIsEditModalOpen(true);
    };

    const openAdd = () => {
        setSelectedExpense(null);
        setFormData({
            date: new Date().toISOString().split('T')[0],
            reason: '',
            amount: '',
            notes: '',
            subscription_id: ''
        });
        setSelectedCustomer(null);
        setCustomerSubscriptions([]);
        setCustomerSearch('');
        setIsAddModalOpen(true);
    };

    const toggleRow = (id: string) => {
        const newSet = new Set(expandedRows);
        newSet.has(id) ? newSet.delete(id) : newSet.add(id);
        setExpandedRows(newSet);
    };

    const selectCustomer = (customer: Customer) => {
        setSelectedCustomer(customer);
        setCustomerSearch(customer.name);
        setShowCustomerDropdown(false);
        setFormData({ ...formData, subscription_id: '' });
        fetchCustomerSubscriptions(customer.id);
    };

    const clearCustomer = () => {
        setSelectedCustomer(null);
        setCustomerSearch('');
        setFormData({ ...formData, subscription_id: '' });
        setCustomerSubscriptions([]);
    };

    // Filter customers based on search
    const filteredCustomers = useMemo(() => {
        if (!customerSearch.trim()) return customers.slice(0, 10);
        return customers.filter(c =>
            c.name.toLowerCase().includes(customerSearch.toLowerCase())
        ).slice(0, 10);
    }, [customers, customerSearch]);

    const filteredExpenses = expenses.filter(e =>
        e.reason?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.subscription?.customer?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentExpenses = filteredExpenses.slice(startIndex, startIndex + itemsPerPage);
    const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // Helper to get display info
    const getSubscriptionInfo = (expense: Expense) => {
        if (!expense.subscription) return null;
        const sub = expense.subscription;
        const customerName = Array.isArray(sub.customer) ? sub.customer[0]?.name : sub.customer?.name;
        const buName = Array.isArray(sub.business_unit) ? sub.business_unit[0]?.name : sub.business_unit?.name;
        const planName = Array.isArray(sub.plan) ? sub.plan[0]?.name : sub.plan?.name;
        return { customerName, buName, planName, address: sub.address, barangay: sub.barangay };
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Receipt className="w-6 h-6 text-purple-500" />
                            Expenses
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">Track and manage business expenses</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="px-4 py-2 bg-purple-900/30 rounded-xl border border-purple-700/50">
                            <div className="text-xs text-purple-400">Total Expenses</div>
                            <div className="text-lg font-bold text-purple-300">₱{totalAmount.toLocaleString()}</div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={searchQuery}
                                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                    className="bg-[#1a1a1a] border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500 w-48"
                                />
                            </div>
                            <button onClick={fetchExpenses} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                                onClick={openAdd}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-lg transition-all font-medium shadow-lg shadow-purple-900/30"
                            >
                                <Plus className="w-4 h-4" />
                                Add Expense
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="glass-card overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-gray-500">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                        Loading...
                    </div>
                ) : currentExpenses.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <Receipt className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>{searchQuery ? `No expenses found matching "${searchQuery}"` : 'No expenses recorded yet'}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {currentExpenses.map((expense) => {
                            const subInfo = getSubscriptionInfo(expense);
                            return (
                                <div key={expense.id}>
                                    <div className="p-4 hover:bg-[#1a1a1a] cursor-pointer flex items-center gap-3 transition-colors" onClick={() => toggleRow(expense.id)}>
                                        {expandedRows.has(expense.id) ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />}
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
                                            <Receipt className="w-5 h-5 text-white" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-semibold text-white">{expense.reason}</div>
                                            <div className="text-xs text-gray-500 flex items-center gap-2">
                                                <Calendar className="w-3 h-3" />
                                                {expense.date ? new Date(expense.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : new Date(expense.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                                {subInfo && (
                                                    <>
                                                        <span className="text-gray-600">•</span>
                                                        <User className="w-3 h-3" />
                                                        <span className="text-purple-400">{subInfo.customerName}</span>
                                                        <span className="text-gray-600">•</span>
                                                        <Building2 className="w-3 h-3" />
                                                        <span>{subInfo.buName}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <span className="px-4 py-2 rounded-xl text-lg font-bold text-red-400">
                                            -₱{expense.amount.toLocaleString()}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <button onClick={(e) => openEdit(expense, e)} className="p-2 text-blue-400 hover:text-blue-300 rounded-lg transition-colors">
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(expense.id); }} className="p-2 text-red-400 hover:text-red-300 rounded-lg transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {expandedRows.has(expense.id) && (
                                        <div className="bg-[#080808] border-t border-gray-800/50 p-4 pl-16">
                                            {subInfo && (
                                                <div className="mb-3 p-3 bg-purple-900/20 rounded-lg border border-purple-700/30">
                                                    <div className="text-xs text-gray-500 uppercase mb-2 flex items-center gap-2"><User className="w-3 h-3" /> Customer & Subscription</div>
                                                    <p className="text-purple-300 font-medium">{subInfo.customerName}</p>
                                                    <p className="text-gray-400 text-sm">{subInfo.planName} • {subInfo.address}, {subInfo.barangay}</p>
                                                    <p className="text-gray-500 text-xs mt-1">Business Unit: {subInfo.buName}</p>
                                                </div>
                                            )}
                                            {expense.notes && (
                                                <div>
                                                    <div className="text-xs text-gray-500 uppercase mb-2 flex items-center gap-2"><FileText className="w-3 h-3" /> Notes</div>
                                                    <p className="text-gray-300 text-sm">{expense.notes}</p>
                                                </div>
                                            )}
                                            {!subInfo && !expense.notes && (
                                                <p className="text-gray-500 text-sm italic">No additional details</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {filteredExpenses.length > itemsPerPage && (
                    <div className="flex items-center justify-between p-4 border-t border-gray-800">
                        <div className="text-sm text-gray-500">Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredExpenses.length)} of {filteredExpenses.length}</div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 text-gray-400 hover:text-white disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                            <span className="text-sm text-gray-400">Page {currentPage} of {totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 text-gray-400 hover:text-white disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                )}
            </div>

            {/* Delete Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-red-900/50 rounded-2xl shadow-[0_0_60px_rgba(239,68,68,0.15)] w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-white mb-2">Confirm Delete</h3>
                        <p className="text-gray-400 mb-6">Are you sure you want to delete this expense?</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium">Cancel</button>
                            <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl font-medium">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Modal */}
            {(isAddModalOpen || isEditModalOpen) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeModal} />
                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-purple-900/50 rounded-2xl shadow-[0_0_60px_rgba(139,92,246,0.15)] w-full max-w-lg overflow-hidden">
                        <div className="relative p-6 border-b border-gray-800/50">
                            <div className="absolute inset-0 bg-gradient-to-r from-violet-600/10 via-purple-600/10 to-fuchsia-600/10" />
                            <div className="relative flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
                                    <Receipt className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">{selectedExpense ? 'Edit Expense' : 'Add Expense'}</h2>
                                    <p className="text-sm text-gray-400">Record a business expense</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
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
                                            }
                                        }}
                                        onFocus={() => setShowCustomerDropdown(true)}
                                        className="w-full bg-gray-900/50 border border-gray-700 rounded-xl pl-10 pr-10 py-3 text-white focus:outline-none focus:border-purple-500"
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
                                        <div className="absolute z-10 w-full mt-1 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
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

                            {/* Subscription Select (shows after customer selected) */}
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
                                                        : 'bg-gray-900/50 border-gray-700 hover:border-gray-600'
                                                        }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="subscription"
                                                        value={sub.id}
                                                        checked={formData.subscription_id === sub.id}
                                                        onChange={(e) => setFormData({ ...formData, subscription_id: e.target.value })}
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

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Date</label>
                                <input
                                    type="date"
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Reason</label>
                                <select
                                    value={formData.reason}
                                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                                    className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                                >
                                    <option value="">Select reason...</option>
                                    <option value="Maintenance">Maintenance</option>
                                    <option value="Materials">Materials</option>
                                    <option value="Transportation">Transportation</option>
                                    <option value="Others">Others</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Amount (₱)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₱</span>
                                    <input
                                        type="number"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        className="w-full bg-gray-900/50 border border-gray-700 rounded-xl pl-8 pr-4 py-3 text-white focus:outline-none focus:border-purple-500"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Notes (optional)</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 h-24 resize-none"
                                    placeholder="Additional notes..."
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-800/50 flex justify-end gap-3">
                            <button onClick={closeModal} className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium">Cancel</button>
                            <button
                                onClick={handleSave}
                                disabled={!formData.reason || !formData.amount}
                                className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl font-medium shadow-lg shadow-purple-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Save Expense
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
