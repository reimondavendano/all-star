'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2, FileText, Wifi, MapPin, AlertCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, CheckCircle, DollarSign, CreditCard, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface Payment {
    id: string;
    settlement_date: string;
    amount: number;
    mode: string;
    notes: string;
    created_at: string;
}

interface Invoice {
    id: string;
    from_date: string;
    to_date: string;
    due_date: string;
    amount_due: number;
    payment_status: string;
    created_at: string;
    payments: Payment[];
    total_paid: number;
}

interface Subscription {
    id: string;
    plan: {
        name: string;
        monthly_fee: number;
    };
    address: string;
    barangay: string;
    active: boolean;
    balance: number;
    invoices: Invoice[];
}

interface CustomerData {
    id: string;
    name: string;
    mobile_number: string;
    subscriptions: Subscription[];
}

export default function CustomerPaymentsPage() {
    const params = useParams();
    const [data, setData] = useState<CustomerData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedSub, setExpandedSub] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState<{ [key: string]: number }>({});
    const itemsPerPage = 10;

    useEffect(() => {
        if (params.id) {
            fetchData();
        }
    }, [params.id]);

    const fetchData = async () => {
        try {
            const customerId = params.id as string;

            const { data: customer, error: customerError } = await supabase
                .from('customers')
                .select('id, name, mobile_number')
                .eq('id', customerId)
                .single();

            if (customerError) throw customerError;
            if (!customer) throw new Error('Customer not found');

            const { data: subscriptions, error: subsError } = await supabase
                .from('subscriptions')
                .select(`
                    id,
                    address,
                    barangay,
                    active,
                    balance,
                    plans (name, monthly_fee)
                `)
                .eq('subscriber_id', customerId);

            if (subsError) throw subsError;

            const subscriptionsWithHistory = await Promise.all(
                (subscriptions || []).map(async (sub: any) => {
                    const { data: invoices } = await supabase
                        .from('invoices')
                        .select('*')
                        .eq('subscription_id', sub.id)
                        .order('due_date', { ascending: false });

                    const { data: allPayments } = await supabase
                        .from('payments')
                        .select('*')
                        .eq('subscription_id', sub.id);

                    const invoicesWithPayments = (invoices || []).map((invoice: any) => {
                        const [year, month] = invoice.due_date.split('-');
                        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
                        const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

                        const invoicePayments = (allPayments || []).filter((payment: any) => {
                            return payment.settlement_date >= startDate && payment.settlement_date <= endDate;
                        });

                        const totalPaid = invoicePayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

                        return {
                            ...invoice,
                            payments: invoicePayments,
                            total_paid: totalPaid
                        };
                    });

                    return {
                        id: sub.id,
                        plan: Array.isArray(sub.plans) ? sub.plans[0] : sub.plans,
                        address: sub.address,
                        barangay: sub.barangay,
                        active: sub.active,
                        balance: sub.balance || 0,
                        invoices: invoicesWithPayments
                    };
                })
            );

            setData({
                ...customer,
                subscriptions: subscriptionsWithHistory
            });

            if (subscriptionsWithHistory.length > 0) {
                setExpandedSub(subscriptionsWithHistory[0].id);
                setCurrentPage({ [subscriptionsWithHistory[0].id]: 1 });
            }

        } catch (err: any) {
            console.error('Error fetching payment history:', err);
            setError(err.message || 'Failed to load payment history');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleSubscription = (subId: string) => {
        const newExpanded = expandedSub === subId ? null : subId;
        setExpandedSub(newExpanded);
        if (newExpanded && !currentPage[subId]) {
            setCurrentPage({ ...currentPage, [subId]: 1 });
        }
    };

    // Balance display helper
    const getBalanceLabel = (balance: number) => {
        if (balance > 0) return 'Balance';
        if (balance < 0) return 'Credits';
        return 'Paid Up';
    };

    const getBalanceColor = (balance: number) => {
        if (balance > 0) return 'text-red-400';
        if (balance < 0) return 'text-emerald-400';
        return 'text-gray-400';
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-900/30">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                    <p className="text-gray-400">Loading payment history...</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="glass-card p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-900/30">
                        <AlertCircle className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Unable to Load History</h2>
                    <p className="text-gray-400">{error}</p>
                </div>
            </div>
        );
    }

    // Calculate totals
    const totalBalance = data.subscriptions.reduce((sum, sub) => sum + Math.max(0, sub.balance), 0);
    const totalCredits = data.subscriptions.reduce((sum, sub) => sum + Math.abs(Math.min(0, sub.balance)), 0);
    const totalInvoices = data.subscriptions.reduce((sum, sub) => sum + sub.invoices.length, 0);
    const totalPayments = data.subscriptions.reduce((sum, sub) =>
        sum + sub.invoices.reduce((s, inv) => s + inv.payments.length, 0), 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <FileText className="w-6 h-6 text-purple-500" />
                            Payment History
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">
                            View all transactions and invoices for <span className="text-white font-medium">{data.name}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-xs text-gray-500 uppercase">Net {totalBalance > totalCredits ? 'Balance' : totalCredits > totalBalance ? 'Credits' : 'Status'}</p>
                            <p className={`text-xl font-bold ${totalBalance > totalCredits ? 'text-red-400' : totalCredits > totalBalance ? 'text-emerald-400' : 'text-gray-400'}`}>
                                ₱{Math.abs(totalBalance - totalCredits).toLocaleString()}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-900/30 rounded-lg">
                            <Wifi className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase">Subscriptions</p>
                            <p className="text-xl font-bold text-white">{data.subscriptions.length}</p>
                        </div>
                    </div>
                </div>
                <div className="glass-card p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-900/30 rounded-lg">
                            <FileText className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase">Total Invoices</p>
                            <p className="text-xl font-bold text-white">{totalInvoices}</p>
                        </div>
                    </div>
                </div>
                <div className="glass-card p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-900/30 rounded-lg">
                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase">Payments Made</p>
                            <p className="text-xl font-bold text-white">{totalPayments}</p>
                        </div>
                    </div>
                </div>
                <div className="glass-card p-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${totalBalance > 0 ? 'bg-red-900/30' : 'bg-emerald-900/30'}`}>
                            <DollarSign className={`w-5 h-5 ${totalBalance > 0 ? 'text-red-400' : 'text-emerald-400'}`} />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase">{totalBalance > 0 ? 'Balance' : 'Credits'}</p>
                            <p className={`text-xl font-bold ${totalBalance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                ₱{(totalBalance > 0 ? totalBalance : totalCredits).toLocaleString()}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Subscriptions List */}
            <div className="space-y-4">
                {data.subscriptions.map((sub) => {
                    const page = currentPage[sub.id] || 1;
                    const totalPages = Math.ceil(sub.invoices.length / itemsPerPage);
                    const startIndex = (page - 1) * itemsPerPage;
                    const endIndex = startIndex + itemsPerPage;
                    const paginatedInvoices = sub.invoices.slice(startIndex, endIndex);

                    return (
                        <div key={sub.id} className="glass-card overflow-hidden">
                            {/* Subscription Header */}
                            <div
                                onClick={() => toggleSubscription(sub.id)}
                                className="p-5 cursor-pointer hover:bg-white/5 transition-colors flex items-center justify-between"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${sub.active
                                        ? 'bg-gradient-to-br from-emerald-600 to-green-600 shadow-emerald-900/30'
                                        : 'bg-gradient-to-br from-gray-600 to-gray-700 shadow-gray-900/30'}`}>
                                        <Wifi className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white flex items-center gap-3">
                                            {sub.plan.name}
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${sub.active
                                                ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50'
                                                : 'bg-red-900/40 text-red-400 border border-red-700/50'
                                                }`}>
                                                {sub.active ? 'ACTIVE' : 'INACTIVE'}
                                            </span>
                                        </h3>
                                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                                            <span className="flex items-center gap-1">
                                                <MapPin className="w-3 h-3" />
                                                {sub.address}, {sub.barangay}
                                            </span>
                                            <span className="text-gray-600">•</span>
                                            <span>₱{sub.plan.monthly_fee.toLocaleString()}/mo</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right hidden sm:block">
                                        <p className="text-xs text-gray-500">{getBalanceLabel(sub.balance)}</p>
                                        <p className={`text-lg font-bold ${getBalanceColor(sub.balance)}`}>
                                            ₱{Math.abs(sub.balance).toLocaleString()}
                                        </p>
                                    </div>
                                    {expandedSub === sub.id ? (
                                        <ChevronUp className="w-5 h-5 text-gray-500" />
                                    ) : (
                                        <ChevronDown className="w-5 h-5 text-gray-500" />
                                    )}
                                </div>
                            </div>

                            {/* Expanded Content */}
                            {expandedSub === sub.id && (
                                <div className="border-t border-gray-800 p-5 bg-[#080808]">
                                    <h4 className="text-sm text-gray-400 uppercase mb-4 flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-blue-500" />
                                        Transaction History
                                        {sub.invoices.length > 0 && (
                                            <span className="text-xs text-gray-500 ml-2">
                                                ({sub.invoices.length} invoice{sub.invoices.length !== 1 ? 's' : ''})
                                            </span>
                                        )}
                                    </h4>
                                    <div className="space-y-3">
                                        {paginatedInvoices.length > 0 ? (
                                            <>
                                                {paginatedInvoices.map((invoice) => (
                                                    <div key={invoice.id} className="bg-[#0f0f0f] border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <p className="text-white font-bold text-lg">
                                                                    ₱{invoice.amount_due.toLocaleString()}
                                                                </p>
                                                                <p className="text-xs text-gray-500 mt-1">
                                                                    Due: {invoice.due_date ? format(new Date(invoice.due_date), 'MMM dd, yyyy') : '-'}
                                                                </p>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${invoice.payment_status === 'Paid'
                                                                    ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50'
                                                                    : invoice.payment_status === 'Partially Paid'
                                                                        ? 'bg-amber-900/40 text-amber-400 border border-amber-700/50'
                                                                        : 'bg-red-900/40 text-red-400 border border-red-700/50'
                                                                    }`}>
                                                                    {invoice.payment_status}
                                                                </span>
                                                                <p className="text-xs text-gray-500 mt-2">
                                                                    {invoice.from_date && invoice.to_date
                                                                        ? `${format(new Date(invoice.from_date), 'MMM dd')} - ${format(new Date(invoice.to_date), 'MMM dd')}`
                                                                        : 'Billing Period'}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Show payments if any */}
                                                        {invoice.payments && invoice.payments.length > 0 && (
                                                            <div className="mt-3 pt-3 border-t border-gray-800">
                                                                <p className="text-xs text-gray-500 mb-2">Payments:</p>
                                                                <div className="space-y-2">
                                                                    {invoice.payments.map((payment) => (
                                                                        <div key={payment.id} className="flex items-center justify-between text-sm bg-gray-900/50 rounded-lg p-2">
                                                                            <div className="flex items-center gap-2">
                                                                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                                                                <span className="px-2 py-0.5 rounded text-xs bg-blue-900/30 text-blue-400 border border-blue-700/50">
                                                                                    {payment.mode}
                                                                                </span>
                                                                                <span className="text-gray-400 text-xs">
                                                                                    {format(new Date(payment.settlement_date), 'MMM dd, yyyy')}
                                                                                </span>
                                                                            </div>
                                                                            <span className="text-emerald-400 font-bold">
                                                                                +₱{payment.amount.toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}

                                                {/* Pagination */}
                                                {totalPages > 1 && (
                                                    <div className="flex items-center justify-center gap-2 pt-4 border-t border-gray-800/50">
                                                        <button
                                                            onClick={() => setCurrentPage({ ...currentPage, [sub.id]: Math.max(1, page - 1) })}
                                                            disabled={page === 1}
                                                            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-lg hover:bg-gray-800 transition-colors"
                                                        >
                                                            <ChevronLeft className="w-4 h-4" />
                                                        </button>
                                                        <span className="text-sm text-gray-500">
                                                            Page {page} of {totalPages}
                                                        </span>
                                                        <button
                                                            onClick={() => setCurrentPage({ ...currentPage, [sub.id]: Math.min(totalPages, page + 1) })}
                                                            disabled={page === totalPages}
                                                            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-lg hover:bg-gray-800 transition-colors"
                                                        >
                                                            <ChevronRight className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="text-center py-8 border border-dashed border-gray-800 rounded-xl">
                                                <FileText className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                                                <p className="text-gray-500 text-sm">No transaction history</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {data.subscriptions.length === 0 && (
                    <div className="glass-card p-12 text-center">
                        <Wifi className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400">No subscriptions found for this customer.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
