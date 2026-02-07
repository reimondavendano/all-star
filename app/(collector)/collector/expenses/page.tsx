'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, ChevronLeft, ChevronRight, Plus, RefreshCw, ChevronDown, Calendar, FileText, Receipt, User, Building2 } from 'lucide-react';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

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

export default function CollectorExpensesPage() {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    const itemsPerPage = 10;

    useEffect(() => {
        fetchExpenses();
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

    const toggleRow = (id: string) => {
        const newSet = new Set(expandedRows);
        newSet.has(id) ? newSet.delete(id) : newSet.add(id);
        setExpandedRows(newSet);
    };

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
                        <p className="text-sm text-gray-400 mt-1">View business expenses</p>
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
        </div>
    );
}
