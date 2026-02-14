'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Zap, User, Loader2, CreditCard, CheckCircle, Search, Building2, RefreshCw, ChevronLeft, ChevronRight, Users, Banknote, TrendingUp, Minus, MessageSquare } from 'lucide-react';
import InvoiceNotesModal from '@/components/collector/InvoiceNotesModal';

interface DebtorSubscription {
    id: string; // subscription_id
    customer_id: string;
    customer_name: string;
    mobile_number: string;
    plan_name: string;
    business_unit_name: string;
    label?: string;
    total_due: number;
    billing_period_start?: string; // Latest invoice period for display context
    billing_period_end?: string;
    latest_due_date?: string;
    unpaid_invoice_count: number;
}

interface QuickCollectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const ITEMS_PER_PAGE = 15;

export default function QuickCollectModal({ isOpen, onClose, onSuccess }: QuickCollectModalProps) {
    const [debtors, setDebtors] = useState<DebtorSubscription[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [processingBatch, setProcessingBatch] = useState(false);
    const [successIds, setSuccessIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<string>('all');
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCollectedAmount, setTotalCollectedAmount] = useState(0);

    // Partial Payment State
    const [partialPaymentId, setPartialPaymentId] = useState<string | null>(null);
    const [partialAmount, setPartialAmount] = useState<string>('');

    useEffect(() => {
        if (isOpen) {
            fetchBusinessUnits();
            fetchDebtors();
            setSuccessIds(new Set());
            setCurrentPage(1);
            setTotalCollectedAmount(0);
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            fetchDebtors();
            setCurrentPage(1);
        }
    }, [selectedBusinessUnit]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    const fetchBusinessUnits = async () => {
        const { data } = await supabase
            .from('business_units')
            .select('id, name')
            .order('name');
        setBusinessUnits(data || []);
    };

    const fetchDebtors = async () => {
        setIsLoading(true);
        try {
            // Fetch subscriptions with positive balance
            let query = supabase
                .from('subscriptions')
                .select(`
                    id,
                    balance,
                    label,
                    business_units (
                        id,
                        name
                    ),
                    customers:customers!subscriptions_subscriber_id_fkey (
                        id,
                        name,
                        mobile_number
                    ),
                    plans (
                        name
                    ),
                    invoices (
                        id,
                        due_date,
                        from_date,
                        to_date,
                        payment_status
                    )
                `)
                .gt('balance', 0); // Only those who owe money

            if (selectedBusinessUnit !== 'all') {
                query = query.eq('business_unit_id', selectedBusinessUnit);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Data fetch error:', error);
                throw error;
            }

            const mappedDebtors: DebtorSubscription[] = (data || [])
                .filter((sub: any) => sub.customers && sub.business_units) // Ensure relations exist
                .map((sub: any) => {
                    // Get unpaid invoices info for display context
                    const unpaidInvoices = sub.invoices?.filter((inv: any) => inv.payment_status !== 'Paid') || [];
                    const latestInvoice = unpaidInvoices.sort((a: any, b: any) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())[0];

                    return {
                        id: sub.id,
                        customer_id: sub.customers?.id,
                        customer_name: sub.customers?.name || 'Unknown',
                        mobile_number: sub.customers?.mobile_number || '',
                        plan_name: sub.plans?.name || 'Unknown Plan',
                        business_unit_name: sub.business_units?.name || '',
                        label: sub.label,
                        total_due: sub.balance,
                        billing_period_start: latestInvoice?.from_date,
                        billing_period_end: latestInvoice?.to_date,
                        latest_due_date: latestInvoice?.due_date,
                        unpaid_invoice_count: unpaidInvoices.length
                    };
                })
                // Sort by due date (if available) or balance descending
                .sort((a, b) => {
                    if (a.latest_due_date && b.latest_due_date) {
                        return new Date(a.latest_due_date).getTime() - new Date(b.latest_due_date).getTime();
                    }
                    return b.total_due - a.total_due;
                });

            setDebtors(mappedDebtors);
        } catch (error) {
            console.error('Error fetching debtors:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleQuickCollect = async (debtor: DebtorSubscription, isPartial: boolean = false) => {
        setProcessingId(debtor.id);

        try {
            let amount: number;
            
            if (isPartial) {
                amount = parseFloat(partialAmount);
                if (isNaN(amount) || amount <= 0) {
                    alert('Please enter a valid amount');
                    setProcessingId(null);
                    return;
                }
                if (amount > debtor.total_due) {
                    alert(`Amount cannot exceed total due (₱${debtor.total_due.toLocaleString()})`);
                    setProcessingId(null);
                    return;
                }
            } else {
                amount = debtor.total_due; // Pay full balance
            }

            // We need to fetch unpaid invoices first to distribute payment appropriately
            const { data: invoices, error: invError } = await supabase
                .from('invoices')
                .select('*')
                .eq('subscription_id', debtor.id)
                .neq('payment_status', 'Paid')
                .order('due_date', { ascending: true }); // Oldest first

            if (invError) throw invError;

            // Distribute payment
            const now = new Date();
            const settlementDate = now.toISOString().split('T')[0];
            let remainingAmount = amount;

            // Process payments for each invoice
            if (invoices && invoices.length > 0) {
                for (const invoice of invoices) {
                    if (remainingAmount <= 0) break;

                    const currentPaid = invoice.amount_paid || 0;
                    const remaining = invoice.amount_due - currentPaid;
                    const paymentForInvoice = Math.min(remainingAmount, remaining);

                    if (paymentForInvoice > 0) {
                        // Insert payment record
                        await supabase.from('payments').insert({
                            subscription_id: debtor.id,
                            invoice_id: invoice.id,
                            settlement_date: settlementDate,
                            amount: paymentForInvoice,
                            mode: 'Cash',
                            notes: isPartial 
                                ? `Quick Collect - Partial Payment (₱${amount.toLocaleString()} of ₱${debtor.total_due.toLocaleString()})`
                                : 'Quick Collect - Full Balance'
                        });

                        // Update invoice
                        const newPaid = currentPaid + paymentForInvoice;
                        const isFullyPaid = newPaid >= invoice.amount_due;

                        await supabase.from('invoices').update({
                            payment_status: isFullyPaid ? 'Paid' : 'Partially Paid',
                            amount_paid: newPaid
                        }).eq('id', invoice.id);

                        remainingAmount -= paymentForInvoice;
                    }
                }
            }

            // Update subscription balance
            const newBalance = Math.max(0, debtor.total_due - amount);
            await supabase
                .from('subscriptions')
                .update({ balance: newBalance })
                .eq('id', debtor.id);

            setSuccessIds(prev => new Set(prev).add(debtor.id));
            setTotalCollectedAmount(prev => prev + amount);

            // Reset partial payment state
            setPartialPaymentId(null);
            setPartialAmount('');

            if (newBalance === 0) {
                // Fully paid - remove from list after animation
                setTimeout(() => {
                    setDebtors(prev => prev.filter(d => d.id !== debtor.id));
                }, 800);
            } else {
                // Partially paid - update the debtor in the list
                setDebtors(prev => prev.map(d => 
                    d.id === debtor.id 
                        ? { ...d, total_due: newBalance }
                        : d
                ));
            }

        } catch (error) {
            console.error('Error processing payment:', error);
            alert('Failed to process payment');
        } finally {
            setProcessingId(null);
        }
    };

    // Filter by search
    const filteredDebtors = debtors.filter(d =>
        d.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.mobile_number.includes(searchQuery) ||
        d.plan_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.business_unit_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Pagination
    const totalPages = Math.ceil(filteredDebtors.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedDebtors = filteredDebtors.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const handleClose = () => {
        if (successIds.size > 0) {
            onSuccess();
        }
        onClose();
    };

    const handleCollectAllOnPage = async () => {
        const pageDebtors = paginatedDebtors.filter(d => !successIds.has(d.id));
        if (pageDebtors.length === 0) return;

        setProcessingBatch(true);

        for (const debtor of pageDebtors) {
            await handleQuickCollect(debtor);
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        setProcessingBatch(false);
    };

    // Calculate total amount
    const totalAmount = filteredDebtors.reduce((sum, d) => sum + d.total_due, 0);
    const pageAmount = paginatedDebtors.reduce((sum, d) => sum + d.total_due, 0);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />

            <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-amber-900/50 rounded-2xl shadow-[0_0_60px_rgba(245,158,11,0.15)] w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="relative p-5 border-b border-gray-800/50">
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-600/10 via-orange-600/10 to-yellow-600/10" />
                    <div className="relative flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-900/30">
                                <Zap className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Quick Collect</h2>
                                <p className="text-xs text-gray-400">One-tap payment collection (Full or Partial)</p>
                            </div>
                        </div>
                        <button onClick={handleClose} className="text-gray-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Stats Bar */}
                <div className="relative px-5 py-3 bg-[#0d0d0d] border-b border-gray-800/50">
                    <div className="flex items-center gap-4 flex-wrap">
                        {/* Total Debtors */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-900/20 rounded-lg border border-red-800/30">
                            <Users className="w-4 h-4 text-red-400" />
                            <div>
                                <div className="text-[10px] text-red-400 uppercase tracking-wider">Total Debtors</div>
                                <div className="text-sm font-bold text-red-300">{filteredDebtors.length} accounts</div>
                            </div>
                        </div>

                        {/* Total Amount */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/20 rounded-lg border border-amber-800/30">
                            <Banknote className="w-4 h-4 text-amber-400" />
                            <div>
                                <div className="text-[10px] text-amber-400 uppercase tracking-wider">To Collect</div>
                                <div className="text-sm font-bold text-amber-300">₱{totalAmount.toLocaleString()}</div>
                            </div>
                        </div>

                        {/* Session Collected */}
                        {successIds.size > 0 && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-900/20 rounded-lg border border-emerald-800/30">
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                <div>
                                    <div className="text-[10px] text-emerald-400 uppercase tracking-wider">Collected Today</div>
                                    <div className="text-sm font-bold text-emerald-300">₱{totalCollectedAmount.toLocaleString()} ({successIds.size})</div>
                                </div>
                            </div>
                        )}

                        {/* Filters - Right Side */}
                        <div className="ml-auto flex items-center gap-2">
                            <select
                                value={selectedBusinessUnit}
                                onChange={(e) => setSelectedBusinessUnit(e.target.value)}
                                className="bg-[#1a1a1a] border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-amber-500"
                            >
                                <option value="all">All Units</option>
                                {/* Sort and map business units */}
                                {[...businessUnits]
                                    .sort((a, b) => {
                                        const priorities = ['Malanggam', 'Bulihan', 'Extension'];
                                        const idxA = priorities.findIndex(p => a.name.includes(p));
                                        const idxB = priorities.findIndex(p => b.name.includes(p));
                                        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                                        if (idxA !== -1) return -1;
                                        if (idxB !== -1) return 1;
                                        return a.name.localeCompare(b.name);
                                    })
                                    .map(bu => (
                                        <option key={bu.id} value={bu.id}>{bu.name}</option>
                                    ))}
                            </select>

                            <div className="relative">
                                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-40 bg-[#1a1a1a] border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-white text-xs focus:outline-none focus:border-amber-500"
                                    autoFocus
                                />
                            </div>

                            <button
                                onClick={fetchDebtors}
                                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                            >
                                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                            <Loader2 className="w-10 h-10 animate-spin mb-3 text-amber-500" />
                            <span className="text-sm">Loading debtors...</span>
                        </div>
                    ) : filteredDebtors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="w-16 h-16 rounded-full bg-emerald-900/30 flex items-center justify-center mb-4">
                                <CheckCircle className="w-8 h-8 text-emerald-500" />
                            </div>
                            <span className="text-lg font-semibold text-white">All Caught Up!</span>
                            <span className="text-sm text-gray-500 mt-1">No outstanding balances found</span>
                        </div>
                    ) : (
                        <>
                            {/* Page Header with Collect All */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-xs text-gray-500">
                                    Showing {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredDebtors.length)} of {filteredDebtors.length}
                                    <span className="mx-2 text-gray-700">|</span>
                                    <span className="text-amber-400">Page total: ₱{pageAmount.toLocaleString()}</span>
                                </div>

                                <button
                                    onClick={handleCollectAllOnPage}
                                    disabled={processingBatch || paginatedDebtors.filter(d => !successIds.has(d.id)).length === 0}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-xs rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {processingBatch ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            Collecting...
                                        </>
                                    ) : (
                                        <>
                                            <Zap className="w-3.5 h-3.5" />
                                            Collect All on Page ({paginatedDebtors.filter(d => !successIds.has(d.id)).length})
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* List */}
                            <div className="space-y-2">
                                {paginatedDebtors.map((debtor) => {
                                    const isProcessing = processingId === debtor.id;
                                    const isSuccess = successIds.has(debtor.id);

                                    return (
                                        <div
                                            key={debtor.id}
                                            className={`bg-gray-900/50 border rounded-lg p-3 transition-all duration-300 ${isSuccess
                                                ? 'border-emerald-500/50 bg-emerald-900/20 opacity-60'
                                                : 'border-gray-800 hover:border-gray-700'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                {/* Customer Avatar */}
                                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-violet-600 flex items-center justify-center flex-shrink-0">
                                                    <User className="w-4 h-4 text-white" />
                                                </div>

                                                {/* Customer Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-white text-sm truncate">{debtor.customer_name}</span>
                                                        {debtor.label && (
                                                            <span className="px-1.5 py-0.5 bg-purple-900/30 text-purple-400 text-[10px] rounded">
                                                                {debtor.label}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                                                        <span>{debtor.plan_name}</span>
                                                        <span className="text-gray-700">•</span>
                                                        <span>{debtor.business_unit_name}</span>
                                                        <span className="text-gray-700">•</span>
                                                        <span>{debtor.unpaid_invoice_count} unpaid invoices</span>
                                                    </div>
                                                </div>

                                                {/* Amount */}
                                                <div className="text-right flex-shrink-0 mr-2">
                                                    <div className="text-base font-bold text-white">
                                                        ₱{debtor.total_due.toLocaleString()}
                                                    </div>
                                                    <div className="text-[10px] text-gray-500">
                                                        Total Due
                                                    </div>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="flex-shrink-0 flex items-center gap-1.5">
                                                    {isSuccess ? (
                                                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg">
                                                            <CheckCircle className="w-3.5 h-3.5" />
                                                            <span className="text-xs font-medium">Done</span>
                                                        </div>
                                                    ) : partialPaymentId === debtor.id ? (
                                                        // Partial Payment Input Mode
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="relative">
                                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">₱</span>
                                                                <input
                                                                    type="number"
                                                                    value={partialAmount}
                                                                    onChange={(e) => setPartialAmount(e.target.value)}
                                                                    placeholder="Amount"
                                                                    className="w-24 bg-[#1a1a1a] border border-gray-700 rounded-lg pl-5 pr-2 py-1.5 text-white text-xs focus:outline-none focus:border-amber-500"
                                                                    autoFocus
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            handleQuickCollect(debtor, true);
                                                                        } else if (e.key === 'Escape') {
                                                                            setPartialPaymentId(null);
                                                                            setPartialAmount('');
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => handleQuickCollect(debtor, true)}
                                                                disabled={isProcessing || !partialAmount}
                                                                className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white rounded-lg font-medium text-xs disabled:opacity-50"
                                                            >
                                                                {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Pay'}
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setPartialPaymentId(null);
                                                                    setPartialAmount('');
                                                                }}
                                                                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        // Normal Mode - Full and Partial buttons
                                                        <>
                                                            <button
                                                                onClick={() => handleQuickCollect(debtor, false)}
                                                                disabled={isProcessing || processingBatch}
                                                                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-lg font-medium shadow-lg shadow-amber-900/20 transition-all disabled:opacity-50 text-xs"
                                                            >
                                                                {isProcessing ? (
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                ) : (
                                                                    <CreditCard className="w-3.5 h-3.5" />
                                                                )}
                                                                <span>{isProcessing ? 'Wait...' : 'Full'}</span>
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setPartialPaymentId(debtor.id);
                                                                    setPartialAmount('');
                                                                }}
                                                                disabled={isProcessing || processingBatch}
                                                                className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white rounded-lg font-medium transition-all disabled:opacity-50 text-xs"
                                                            >
                                                                <Minus className="w-3.5 h-3.5" />
                                                                <span>Partial</span>
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer with Pagination */}
                <div className="p-4 border-t border-gray-800/50 bg-[#0a0a0a]">
                    <div className="flex items-center justify-between">
                        {/* Session Info */}
                        <div className="text-sm text-gray-500">
                            {successIds.size > 0 ? (
                                <span className="text-emerald-400 font-medium">
                                    ✓ {successIds.size} payment(s) • ₱{totalCollectedAmount.toFixed(2)} collected
                                </span>
                            ) : (
                                <span className="text-gray-600">Ready to collect</span>
                            )}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>

                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        let pageNum: number;
                                        if (totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (currentPage <= 3) {
                                            pageNum = i + 1;
                                        } else if (currentPage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i;
                                        } else {
                                            pageNum = currentPage - 2 + i;
                                        }

                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={`w-7 h-7 text-xs rounded transition-colors ${currentPage === pageNum
                                                    ? 'bg-amber-600 text-white font-bold'
                                                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                                    }`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>

                                <span className="text-xs text-gray-500 ml-2">
                                    of {totalPages}
                                </span>
                            </div>
                        )}

                        {/* Close Button */}
                        <button
                            onClick={handleClose}
                            className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-colors text-sm"
                        >
                            Close
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
