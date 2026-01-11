'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Zap, User, Loader2, CreditCard, CheckCircle, Search, Building2, RefreshCw, ChevronLeft, ChevronRight, Users, Banknote, TrendingUp } from 'lucide-react';

interface UnpaidInvoice {
    id: string;
    subscription_id: string;
    from_date: string;
    to_date: string;
    due_date: string;
    amount_due: number;
    payment_status: string;
    customer_name: string;
    mobile_number: string;
    plan_name: string;
    business_unit_name: string;
    label?: string;
}

interface QuickCollectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const ITEMS_PER_PAGE = 15;

export default function QuickCollectModal({ isOpen, onClose, onSuccess }: QuickCollectModalProps) {
    const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [processingBatch, setProcessingBatch] = useState(false);
    const [successIds, setSuccessIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<string>('all');
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCollectedAmount, setTotalCollectedAmount] = useState(0);

    useEffect(() => {
        if (isOpen) {
            fetchBusinessUnits();
            fetchUnpaidInvoices();
            setSuccessIds(new Set());
            setCurrentPage(1);
            setTotalCollectedAmount(0);
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            fetchUnpaidInvoices();
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

    const fetchUnpaidInvoices = async () => {
        setIsLoading(true);
        try {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

            let query = supabase
                .from('invoices')
                .select(`
                    id,
                    subscription_id,
                    from_date,
                    to_date,
                    due_date,
                    amount_due,
                    payment_status,
                    subscriptions!inner (
                        id,
                        label,
                        business_unit_id,
                        customers!subscriptions_subscriber_id_fkey (
                            name,
                            mobile_number
                        ),
                        plans (
                            name
                        ),
                        business_units (
                            id,
                            name
                        )
                    )
                `)
                .in('payment_status', ['Unpaid', 'Partially Paid'])
                .gte('due_date', startOfMonth)
                .lte('due_date', endOfMonth)
                .order('due_date', { ascending: true });

            const { data, error } = await query;

            if (error) throw error;

            const invoices: UnpaidInvoice[] = (data || [])
                .filter((inv: any) => {
                    if (selectedBusinessUnit !== 'all') {
                        return inv.subscriptions?.business_units?.id === selectedBusinessUnit;
                    }
                    return true;
                })
                .map((inv: any) => ({
                    id: inv.id,
                    subscription_id: inv.subscription_id,
                    from_date: inv.from_date,
                    to_date: inv.to_date,
                    due_date: inv.due_date,
                    amount_due: inv.amount_due,
                    payment_status: inv.payment_status,
                    customer_name: inv.subscriptions?.customers?.name || 'Unknown',
                    mobile_number: inv.subscriptions?.customers?.mobile_number || '',
                    plan_name: inv.subscriptions?.plans?.name || 'Unknown Plan',
                    business_unit_name: inv.subscriptions?.business_units?.name || '',
                    label: inv.subscriptions?.label || ''
                }));

            setUnpaidInvoices(invoices);
        } catch (error) {
            console.error('Error fetching unpaid invoices:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleQuickCollect = async (invoice: UnpaidInvoice) => {
        setProcessingId(invoice.id);

        try {
            const now = new Date();
            const settlementDate = now.toISOString().split('T')[0];
            const amount = invoice.amount_due;

            const { error: paymentError } = await supabase.from('payments').insert({
                subscription_id: invoice.subscription_id,
                invoice_id: invoice.id,
                settlement_date: settlementDate,
                amount: amount,
                mode: 'Cash',
                notes: 'Quick Collect'
            });

            if (paymentError) throw paymentError;

            const { error: invoiceError } = await supabase
                .from('invoices')
                .update({ payment_status: 'Paid' })
                .eq('id', invoice.id);

            if (invoiceError) throw invoiceError;

            const { data: subData } = await supabase
                .from('subscriptions')
                .select('balance')
                .eq('id', invoice.subscription_id)
                .single();

            const currentBalance = subData?.balance || 0;
            await supabase
                .from('subscriptions')
                .update({ balance: currentBalance - amount })
                .eq('id', invoice.subscription_id);

            setSuccessIds(prev => new Set(prev).add(invoice.id));
            setTotalCollectedAmount(prev => prev + amount);

            setTimeout(() => {
                setUnpaidInvoices(prev => prev.filter(inv => inv.id !== invoice.id));
            }, 800);

        } catch (error) {
            console.error('Error processing payment:', error);
            alert('Failed to process payment');
        } finally {
            setProcessingId(null);
        }
    };

    const handleCollectAllOnPage = async () => {
        const pageInvoices = paginatedInvoices.filter(inv => !successIds.has(inv.id));
        if (pageInvoices.length === 0) return;

        setProcessingBatch(true);

        for (const invoice of pageInvoices) {
            await handleQuickCollect(invoice);
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        setProcessingBatch(false);
    };

    // Filter by search
    const filteredInvoices = unpaidInvoices.filter(inv =>
        inv.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.mobile_number.includes(searchQuery) ||
        inv.plan_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Pagination
    const totalPages = Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedInvoices = filteredInvoices.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const handleClose = () => {
        if (successIds.size > 0) {
            onSuccess();
        }
        onClose();
    };

    const totalAmount = filteredInvoices.reduce((sum, inv) => sum + inv.amount_due, 0);
    const pageAmount = paginatedInvoices.reduce((sum, inv) => sum + inv.amount_due, 0);

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
                                <p className="text-xs text-gray-400">One-tap payment collection</p>
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
                        {/* Total Unpaid */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-900/20 rounded-lg border border-red-800/30">
                            <Users className="w-4 h-4 text-red-400" />
                            <div>
                                <div className="text-[10px] text-red-400 uppercase tracking-wider">Total Unpaid</div>
                                <div className="text-sm font-bold text-red-300">{filteredInvoices.length} invoices</div>
                            </div>
                        </div>

                        {/* Total Amount */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/20 rounded-lg border border-amber-800/30">
                            <Banknote className="w-4 h-4 text-amber-400" />
                            <div>
                                <div className="text-[10px] text-amber-400 uppercase tracking-wider">To Collect</div>
                                <div className="text-sm font-bold text-amber-300">₱{Math.round(totalAmount).toLocaleString()}</div>
                            </div>
                        </div>

                        {/* Session Collected */}
                        {successIds.size > 0 && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-900/20 rounded-lg border border-emerald-800/30">
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                <div>
                                    <div className="text-[10px] text-emerald-400 uppercase tracking-wider">Collected Today</div>
                                    <div className="text-sm font-bold text-emerald-300">₱{Math.round(totalCollectedAmount).toLocaleString()} ({successIds.size})</div>
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
                                {businessUnits.map(bu => (
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
                                />
                            </div>

                            <button
                                onClick={fetchUnpaidInvoices}
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
                            <span className="text-sm">Loading unpaid invoices...</span>
                        </div>
                    ) : filteredInvoices.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="w-16 h-16 rounded-full bg-emerald-900/30 flex items-center justify-center mb-4">
                                <CheckCircle className="w-8 h-8 text-emerald-500" />
                            </div>
                            <span className="text-lg font-semibold text-white">All Caught Up!</span>
                            <span className="text-sm text-gray-500 mt-1">No unpaid invoices for this period</span>
                        </div>
                    ) : (
                        <>
                            {/* Page Header with Collect All */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-xs text-gray-500">
                                    Showing {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredInvoices.length)} of {filteredInvoices.length}
                                    <span className="mx-2 text-gray-700">|</span>
                                    <span className="text-amber-400">Page total: ₱{Math.round(pageAmount).toLocaleString()}</span>
                                </div>

                                <button
                                    onClick={handleCollectAllOnPage}
                                    disabled={processingBatch || paginatedInvoices.filter(inv => !successIds.has(inv.id)).length === 0}
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
                                            Collect All on Page ({paginatedInvoices.filter(inv => !successIds.has(inv.id)).length})
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Invoice List */}
                            <div className="space-y-2">
                                {paginatedInvoices.map((invoice) => {
                                    const isProcessing = processingId === invoice.id;
                                    const isSuccess = successIds.has(invoice.id);

                                    return (
                                        <div
                                            key={invoice.id}
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
                                                        <span className="font-medium text-white text-sm truncate">{invoice.customer_name}</span>
                                                        {invoice.label && (
                                                            <span className="px-1.5 py-0.5 bg-purple-900/30 text-purple-400 text-[10px] rounded">
                                                                {invoice.label}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                                                        <span>{invoice.plan_name}</span>
                                                        <span className="text-gray-700">•</span>
                                                        <span>{invoice.business_unit_name}</span>
                                                    </div>
                                                </div>

                                                {/* Amount */}
                                                <div className="text-right flex-shrink-0 mr-2">
                                                    <div className="text-base font-bold text-white">
                                                        ₱{Math.round(invoice.amount_due).toLocaleString()}
                                                    </div>
                                                    <div className="text-[10px] text-gray-500">
                                                        Due {new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                    </div>
                                                </div>

                                                {/* Action Button */}
                                                <div className="flex-shrink-0">
                                                    {isSuccess ? (
                                                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg">
                                                            <CheckCircle className="w-3.5 h-3.5" />
                                                            <span className="text-xs font-medium">Done</span>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleQuickCollect(invoice)}
                                                            disabled={isProcessing || processingBatch}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-lg font-medium shadow-lg shadow-amber-900/20 transition-all disabled:opacity-50 text-xs"
                                                        >
                                                            {isProcessing ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            ) : (
                                                                <CreditCard className="w-3.5 h-3.5" />
                                                            )}
                                                            <span>{isProcessing ? 'Wait...' : 'Collect'}</span>
                                                        </button>
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
                                    ✓ {successIds.size} payment(s) • ₱{Math.round(totalCollectedAmount).toLocaleString()} collected
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
