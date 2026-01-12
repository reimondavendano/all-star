'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
    FileText,
    CreditCard,
    Building2,
    Search,
    ChevronDown,
    ChevronRight,
    ChevronLeft,
    User,
    Wifi,
    Calendar,
    CheckCircle,
    Clock,
    AlertCircle,
    X,
    RefreshCw,
    Plus,
    DollarSign,
    Banknote,
    Smartphone,
    Zap
} from 'lucide-react';
import { BalanceInline } from '@/components/BalanceDisplay';
import { useMultipleRealtimeSubscriptions } from '@/hooks/useRealtimeSubscription';
import QuickCollectModal from '@/components/admin/QuickCollectModal';

interface Customer {
    id: string;
    name: string;
    mobile_number: string;
}

interface Subscription {
    id: string;
    subscriber_id: string;
    plan_id: string;
    business_unit_id: string;
    balance: number;
    active: boolean;
    label?: string;
    address?: string;
    customers: Customer;
    plans: {
        name: string;
        monthly_fee: number;
    };
}

interface Invoice {
    id: string;
    subscription_id: string;
    from_date: string;
    to_date: string;
    due_date: string;
    amount_due: number;
    payment_status: 'Paid' | 'Unpaid' | 'Partially Paid' | 'Pending Verification';
}

interface Payment {
    id: string;
    subscription_id: string;
    settlement_date: string;
    amount: number;
    mode: 'Cash' | 'E-Wallet';
    notes?: string;
    invoice_id?: string;
}

interface GroupedData {
    customer: Customer;
    subscriptions: Array<{
        subscription: Subscription;
        invoices: Invoice[];
        payments: Payment[];
        totalPaid: number;
        totalDue: number;
        balance: number;
    }>;
}

export default function CollectorInvoicesPage() {
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
    const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<string>('all');
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [statusFilter, setStatusFilter] = useState<'all' | 'Paid' | 'Unpaid' | 'Partially Paid' | 'Pending Verification'>('all');
    const [groupedData, setGroupedData] = useState<GroupedData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
    const [expandedSubscriptions, setExpandedSubscriptions] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20; // Optimized for 500+ records

    // Cash Tracking for Remittance
    const [cashCollected, setCashCollected] = useState(0);
    const [ewalletCollected, setEwalletCollected] = useState(0);

    // Modals
    const [isQuickCollectOpen, setIsQuickCollectOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<{
        invoice: Invoice;
        subscription: Subscription;
        customer: Customer;
    } | null>(null);
    const [paymentForm, setPaymentForm] = useState({
        amount: '',
        mode: 'Cash' as 'Cash' | 'E-Wallet',
        settlementDate: new Date().toISOString().split('T')[0],
        notes: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchBusinessUnits();
    }, []);

    useEffect(() => {
        fetchData();
    }, [selectedBusinessUnit, selectedMonth, statusFilter]);

    // Real-time subscription for invoices and payments
    useMultipleRealtimeSubscriptions(
        ['invoices', 'payments'],
        (table, payload) => {
            console.log(`[Collector Realtime] ${table} changed:`, payload.eventType);
            fetchData();
        }
    );

    const fetchBusinessUnits = async () => {
        const { data } = await supabase.from('business_units').select('id, name').order('name');
        setBusinessUnits(data || []);
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [year, month] = selectedMonth.split('-');
            const startDate = `${year}-${month}-01`;
            const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

            let subscriptionsQuery = supabase
                .from('subscriptions')
                .select(`
                    id, subscriber_id, plan_id, business_unit_id, balance, active, label, address,
                    customers!subscriptions_subscriber_id_fkey (id, name, mobile_number),
                    plans (name, monthly_fee)
                `)
                .eq('active', true);

            if (selectedBusinessUnit !== 'all') {
                subscriptionsQuery = subscriptionsQuery.eq('business_unit_id', selectedBusinessUnit);
            }

            const { data: subscriptions } = await subscriptionsQuery;

            if (!subscriptions || subscriptions.length === 0) {
                setGroupedData([]);
                setIsLoading(false);
                return;
            }

            const subIds = subscriptions.map(s => s.id);

            let invoicesQuery = supabase
                .from('invoices')
                .select('*')
                .in('subscription_id', subIds)
                .gte('due_date', startDate)
                .lte('due_date', endDate);

            if (statusFilter !== 'all') {
                invoicesQuery = invoicesQuery.eq('payment_status', statusFilter);
            }

            const { data: invoices } = await invoicesQuery;

            // Fetch ALL payments for cash tracking (not just by subIds, but for the month)
            const { data: payments } = await supabase
                .from('payments')
                .select('*')
                .in('subscription_id', subIds);

            // Calculate Cash vs E-Wallet totals for the selected month
            const monthPayments = (payments || []).filter(pay => {
                if (!pay.settlement_date) return false;
                return pay.settlement_date.startsWith(selectedMonth);
            });

            const cashTotal = monthPayments
                .filter(pay => pay.mode === 'Cash')
                .reduce((sum, pay) => sum + (pay.amount || 0), 0);

            const ewalletTotal = monthPayments
                .filter(pay => pay.mode === 'E-Wallet')
                .reduce((sum, pay) => sum + (pay.amount || 0), 0);

            setCashCollected(cashTotal);
            setEwalletCollected(ewalletTotal);

            // Group by customer
            const customerMap = new Map<string, GroupedData>();

            subscriptions.forEach((sub: any) => {
                const customer = sub.customers as Customer;
                if (!customer) return;

                if (!customerMap.has(customer.id)) {
                    customerMap.set(customer.id, { customer, subscriptions: [] });
                }

                const subInvoices = (invoices || []).filter(inv => inv.subscription_id === sub.id);
                const subPayments = (payments || []).filter(pay => pay.subscription_id === sub.id);
                const totalDue = subInvoices.reduce((sum, inv) => sum + (inv.amount_due || 0), 0);
                const totalPaid = subPayments.reduce((sum, pay) => sum + (pay.amount || 0), 0);

                if (subInvoices.length > 0) {
                    customerMap.get(customer.id)!.subscriptions.push({
                        subscription: sub as Subscription,
                        invoices: subInvoices,
                        payments: subPayments,
                        totalDue,
                        totalPaid,
                        balance: sub.balance
                    });
                }
            });

            const grouped = Array.from(customerMap.values()).filter(g => g.subscriptions.length > 0);
            setGroupedData(grouped);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const openPaymentModal = (invoice: Invoice, subscription: Subscription, customer: Customer) => {
        setSelectedInvoice({ invoice, subscription, customer });
        setPaymentForm({
            amount: invoice.amount_due.toString(),
            mode: 'Cash',
            settlementDate: new Date().toISOString().split('T')[0],
            notes: '',
        });
        setIsPaymentModalOpen(true);
    };

    const handleSubmitPayment = async () => {
        if (!selectedInvoice) return;
        setIsSubmitting(true);

        try {
            const amount = parseFloat(paymentForm.amount);
            if (isNaN(amount) || amount <= 0) {
                alert('Please enter a valid amount');
                setIsSubmitting(false);
                return;
            }

            // Insert payment
            const { error: paymentError } = await supabase.from('payments').insert({
                subscription_id: selectedInvoice.subscription.id,
                invoice_id: selectedInvoice.invoice.id,
                settlement_date: paymentForm.settlementDate,
                amount: amount,
                mode: paymentForm.mode,
                notes: paymentForm.notes
            });

            if (paymentError) throw paymentError;

            // Get current amount_paid from invoice (if tracking partial payments)
            const { data: invoiceData } = await supabase
                .from('invoices')
                .select('amount_paid')
                .eq('id', selectedInvoice.invoice.id)
                .single();

            const currentAmountPaid = invoiceData?.amount_paid || 0;
            const newAmountPaid = currentAmountPaid + amount;
            const isFullyPaid = newAmountPaid >= selectedInvoice.invoice.amount_due;

            // Update invoice status and amount_paid
            await supabase
                .from('invoices')
                .update({
                    payment_status: isFullyPaid ? 'Paid' : 'Partially Paid',
                    amount_paid: newAmountPaid
                })
                .eq('id', selectedInvoice.invoice.id);

            // Update subscription balance
            const newBalance = (selectedInvoice.subscription.balance || 0) - amount;
            await supabase
                .from('subscriptions')
                .update({ balance: newBalance })
                .eq('id', selectedInvoice.subscription.id);

            setIsPaymentModalOpen(false);
            setSelectedInvoice(null);
            fetchData();
        } catch (error) {
            console.error('Error submitting payment:', error);
            alert('Failed to submit payment');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleCustomer = (id: string) => {
        const newSet = new Set(expandedCustomers);
        newSet.has(id) ? newSet.delete(id) : newSet.add(id);
        setExpandedCustomers(newSet);
    };

    const toggleSubscription = (id: string) => {
        const newSet = new Set(expandedSubscriptions);
        newSet.has(id) ? newSet.delete(id) : newSet.add(id);
        setExpandedSubscriptions(newSet);
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'Paid': return <CheckCircle className="w-4 h-4 text-emerald-400" />;
            case 'Partially Paid': return <Clock className="w-4 h-4 text-amber-400" />;
            case 'Pending Verification': return <Clock className="w-4 h-4 text-violet-400" />;
            default: return <AlertCircle className="w-4 h-4 text-red-400" />;
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'Paid': return 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50';
            case 'Partially Paid': return 'bg-amber-900/30 text-amber-400 border-amber-700/50';
            case 'Pending Verification': return 'bg-violet-900/30 text-violet-400 border-violet-700/50';
            default: return 'bg-red-900/30 text-red-400 border-red-700/50';
        }
    };

    // Filter and paginate
    const filtered = groupedData.filter(g =>
        g.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.customer.mobile_number?.includes(searchQuery)
    );
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Stats
    const totalDue = groupedData.reduce((sum, g) => sum + g.subscriptions.reduce((s, sub) => s + sub.totalDue, 0), 0);
    const totalPaid = groupedData.reduce((sum, g) => sum + g.subscriptions.reduce((s, sub) => s + sub.totalPaid, 0), 0);
    const unpaidCount = groupedData.reduce((sum, g) => sum + g.subscriptions.reduce((s, sub) => s + sub.invoices.filter(i => i.payment_status === 'Unpaid').length, 0), 0);

    return (
        <div className="space-y-6">
            {/* Cash Remittance Card - Prominent Display */}
            <div className="glass-card p-4 bg-gradient-to-r from-amber-900/20 via-yellow-900/20 to-orange-900/20 border-amber-700/50">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-900/30">
                            <Banknote className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="text-sm text-amber-400 font-medium">Cash to Remit to Admin</div>
                            <div className="text-xs text-gray-500">For {new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="text-center">
                            <div className="text-3xl font-bold text-amber-400">₱{Math.round(cashCollected).toLocaleString()}</div>
                            <div className="text-xs text-amber-500/80">Cash Payments</div>
                        </div>
                        <div className="h-10 w-px bg-gray-700"></div>
                        <div className="text-center opacity-60">
                            <div className="text-lg font-semibold text-violet-400">₱{Math.round(ewalletCollected).toLocaleString()}</div>
                            <div className="text-xs text-violet-500/80">E-Wallet (Direct)</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <FileText className="w-6 h-6 text-purple-500" />
                            Invoices & Payments
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">Record payments and track invoice status</p>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="px-4 py-2 bg-purple-900/30 rounded-xl border border-purple-700/50">
                            <div className="text-xs text-purple-400">Total Billed</div>
                            <div className="text-lg font-bold text-purple-300">₱{totalDue.toLocaleString()}</div>
                        </div>
                        <div className="px-4 py-2 bg-emerald-900/30 rounded-xl border border-emerald-700/50">
                            <div className="text-xs text-emerald-400">Collected</div>
                            <div className="text-lg font-bold text-emerald-300">₱{totalPaid.toLocaleString()}</div>
                        </div>
                        <div className="px-4 py-2 bg-red-900/30 rounded-xl border border-red-700/50">
                            <div className="text-xs text-red-400">Unpaid</div>
                            <div className="text-lg font-bold text-red-300">{unpaidCount}</div>
                        </div>

                        <button
                            onClick={() => setIsQuickCollectOpen(true)}
                            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl transition-colors flex items-center gap-2 font-medium shadow-lg shadow-amber-900/20"
                        >
                            <Zap className="w-4 h-4" />
                            Quick Collect
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-800">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search customer..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        />
                    </div>
                    <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                    />
                    <select
                        value={selectedBusinessUnit}
                        onChange={(e) => setSelectedBusinessUnit(e.target.value)}
                        className="bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                    >
                        <option value="all">All Business Units</option>
                        {businessUnits.map(bu => (
                            <option key={bu.id} value={bu.id}>{bu.name}</option>
                        ))}
                    </select>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                    >
                        <option value="all">All Status</option>
                        <option value="Paid">Paid</option>
                        <option value="Unpaid">Unpaid</option>
                        <option value="Partially Paid">Partially Paid</option>
                        <option value="Pending Verification">Pending Verification</option>
                    </select>
                    <button onClick={fetchData} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Data List */}
            <div className="glass-card overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-gray-500">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                        Loading...
                    </div>
                ) : paginated.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        {/* Contextual empty state message */}
                        {(() => {
                            const monthLabel = new Date(selectedMonth + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
                            const buName = selectedBusinessUnit !== 'all'
                                ? businessUnits.find(b => b.id === selectedBusinessUnit)?.name
                                : null;

                            if (statusFilter !== 'all' && buName) {
                                return (
                                    <>
                                        <p className="text-gray-400">No <span className="text-white font-medium">{statusFilter.toLowerCase()}</span> invoices found</p>
                                        <p className="text-sm mt-1">for <span className="text-purple-400">{buName}</span> in <span className="text-purple-400">{monthLabel}</span></p>
                                    </>
                                );
                            } else if (statusFilter !== 'all') {
                                return (
                                    <>
                                        <p className="text-gray-400">No <span className="text-white font-medium">{statusFilter.toLowerCase()}</span> invoices found</p>
                                        <p className="text-sm mt-1">for <span className="text-purple-400">{monthLabel}</span></p>
                                    </>
                                );
                            } else if (buName) {
                                return (
                                    <>
                                        <p className="text-gray-400">No invoices generated yet</p>
                                        <p className="text-sm mt-1">for <span className="text-purple-400">{buName}</span> in <span className="text-purple-400">{monthLabel}</span></p>
                                    </>
                                );
                            } else {
                                return (
                                    <>
                                        <p className="text-gray-400">No invoices generated yet</p>
                                        <p className="text-sm mt-1">for <span className="text-purple-400">{monthLabel}</span></p>
                                    </>
                                );
                            }
                        })()}
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {paginated.map((group) => (
                            <div key={group.customer.id}>
                                {/* Customer Row */}
                                <div
                                    className="p-4 hover:bg-[#1a1a1a] cursor-pointer flex items-center gap-3 transition-colors"
                                    onClick={() => toggleCustomer(group.customer.id)}
                                >
                                    {expandedCustomers.has(group.customer.id) ? (
                                        <ChevronDown className="w-5 h-5 text-gray-500" />
                                    ) : (
                                        <ChevronRight className="w-5 h-5 text-gray-500" />
                                    )}
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center">
                                        <User className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-semibold text-white">{group.customer.name}</div>
                                        <div className="text-xs text-gray-500">{group.customer.mobile_number}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm text-gray-400">{group.subscriptions.length} subscription(s)</div>
                                        <BalanceInline balance={group.subscriptions.reduce((sum, s) => sum + s.balance, 0)} />
                                    </div>
                                </div>

                                {/* Expanded Subscriptions */}
                                {expandedCustomers.has(group.customer.id) && (
                                    <div className="bg-[#080808] border-t border-gray-800/50">
                                        {group.subscriptions.map(({ subscription, invoices, payments, balance }) => (
                                            <div key={subscription.id} className="border-b border-gray-800/50 last:border-b-0">
                                                {/* Subscription Header */}
                                                <div
                                                    className="p-4 pl-12 hover:bg-[#0d0d0d] cursor-pointer flex items-center gap-3 transition-colors"
                                                    onClick={() => toggleSubscription(subscription.id)}
                                                >
                                                    {expandedSubscriptions.has(subscription.id) ? (
                                                        <ChevronDown className="w-4 h-4 text-gray-500" />
                                                    ) : (
                                                        <ChevronRight className="w-4 h-4 text-gray-500" />
                                                    )}
                                                    <Wifi className="w-4 h-4 text-purple-400" />
                                                    <div className="flex-1">
                                                        <span className="text-white font-medium">{subscription.plans?.name}</span>
                                                        <span className="text-gray-500 ml-2 text-sm">{subscription.address}</span>
                                                    </div>
                                                    <BalanceInline balance={balance} />
                                                </div>

                                                {/* Invoices for this subscription */}
                                                {expandedSubscriptions.has(subscription.id) && (
                                                    <div className="pl-20 pr-4 pb-4 space-y-2">
                                                        {invoices.map((invoice) => (
                                                            <div key={invoice.id} className="bg-[#0f0f0f] rounded-xl p-4 border border-gray-800">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className={`px-2 py-1 rounded-lg text-xs font-medium border ${getStatusStyle(invoice.payment_status)}`}>
                                                                            {getStatusIcon(invoice.payment_status)}
                                                                            <span className="ml-1">{invoice.payment_status}</span>
                                                                        </div>
                                                                        <div className="text-sm text-gray-400">
                                                                            {new Date(invoice.from_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(invoice.to_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="text-right">
                                                                            <div className="text-lg font-bold text-white">₱{invoice.amount_due.toLocaleString()}</div>
                                                                            <div className="text-xs text-gray-500">Due: {new Date(invoice.due_date).toLocaleDateString()}</div>
                                                                        </div>
                                                                        {invoice.payment_status !== 'Paid' && (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    openPaymentModal(invoice, subscription, group.customer);
                                                                                }}
                                                                                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-lg text-sm font-medium transition-colors"
                                                                            >
                                                                                <CreditCard className="w-4 h-4 inline mr-1" />
                                                                                Pay
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}

                                                        {/* Recent Payments for this subscription */}
                                                        {payments.length > 0 && (
                                                            <div className="mt-3 pt-3 border-t border-gray-800/50">
                                                                <div className="text-xs text-gray-500 uppercase mb-2">Recent Payments</div>
                                                                <div className="space-y-1">
                                                                    {payments.slice(0, 3).map(pay => (
                                                                        <div key={pay.id} className="flex items-center justify-between text-sm">
                                                                            <span className="text-gray-400">
                                                                                {new Date(pay.settlement_date).toLocaleDateString()} - {pay.mode}
                                                                            </span>
                                                                            <span className="text-emerald-400 font-medium">+₱{pay.amount.toLocaleString()}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t border-gray-800">
                        <div className="text-sm text-gray-500">
                            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length}
                        </div>
                        <div className="flex items-center gap-2">
                            {/* First Page */}
                            {currentPage > 3 && (
                                <button
                                    onClick={() => setCurrentPage(1)}
                                    className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
                                >
                                    1
                                </button>
                            )}
                            {currentPage > 4 && (
                                <span className="text-gray-600">...</span>
                            )}

                            {/* Page Numbers */}
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(page => {
                                    if (totalPages <= 7) return true;
                                    if (page === 1 || page === totalPages) return false;
                                    return Math.abs(page - currentPage) <= 2;
                                })
                                .map(page => (
                                    <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={`w-8 h-8 text-sm rounded transition-colors ${currentPage === page
                                            ? 'bg-purple-600 text-white font-bold'
                                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                            }`}
                                    >
                                        {page}
                                    </button>
                                ))}

                            {currentPage < totalPages - 3 && (
                                <span className="text-gray-600">...</span>
                            )}
                            {/* Last Page */}
                            {currentPage < totalPages - 2 && totalPages > 5 && (
                                <button
                                    onClick={() => setCurrentPage(totalPages)}
                                    className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
                                >
                                    {totalPages}
                                </button>
                            )}

                            {/* Prev/Next Buttons */}
                            <div className="flex items-center gap-1 ml-2 border-l border-gray-800 pl-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Jump to Page */}
                            {totalPages > 10 && (
                                <div className="flex items-center gap-1 ml-2 border-l border-gray-800 pl-2">
                                    <span className="text-xs text-gray-500">Go to</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={totalPages}
                                        placeholder="#"
                                        className="w-12 bg-[#1a1a1a] border border-gray-700 rounded px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-purple-500"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                const val = parseInt((e.target as HTMLInputElement).value);
                                                if (val >= 1 && val <= totalPages) {
                                                    setCurrentPage(val);
                                                    (e.target as HTMLInputElement).value = '';
                                                }
                                            }
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Payment Modal */}
            {isPaymentModalOpen && selectedInvoice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsPaymentModalOpen(false)} />
                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-purple-900/50 rounded-2xl shadow-[0_0_60px_rgba(139,92,246,0.15)] w-full max-w-md overflow-hidden">
                        <div className="relative p-6 border-b border-gray-800/50">
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/10 via-green-600/10 to-teal-600/10" />
                            <div className="relative flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-green-600 flex items-center justify-center shadow-lg">
                                    <CreditCard className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">Record Payment</h2>
                                    <p className="text-sm text-gray-400">{selectedInvoice.customer.name}</p>
                                </div>
                            </div>
                            <button onClick={() => setIsPaymentModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Invoice Details */}
                            <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/50">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Invoice Amount</span>
                                    <span className="text-xl font-bold text-white">₱{selectedInvoice.invoice.amount_due.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center mt-2 text-sm">
                                    <span className="text-gray-500">Period</span>
                                    <span className="text-gray-300">
                                        {new Date(selectedInvoice.invoice.from_date).toLocaleDateString()} - {new Date(selectedInvoice.invoice.to_date).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Amount (₱)</label>
                                <div className="relative">
                                    <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type="number"
                                        value={paymentForm.amount}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                        className="w-full bg-gray-900/50 border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-purple-500"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Payment Mode</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentForm({ ...paymentForm, mode: 'Cash' })}
                                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-colors ${paymentForm.mode === 'Cash' ? 'bg-purple-900/30 border-purple-700/50 text-purple-400' : 'bg-gray-900/50 border-gray-700 text-gray-400'}`}
                                    >
                                        <Banknote className="w-4 h-4" />
                                        Cash
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentForm({ ...paymentForm, mode: 'E-Wallet' })}
                                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-colors ${paymentForm.mode === 'E-Wallet' ? 'bg-purple-900/30 border-purple-700/50 text-purple-400' : 'bg-gray-900/50 border-gray-700 text-gray-400'}`}
                                    >
                                        <Smartphone className="w-4 h-4" />
                                        E-Wallet
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Settlement Date</label>
                                <input
                                    type="date"
                                    value={paymentForm.settlementDate}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, settlementDate: e.target.value })}
                                    className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Notes (optional)</label>
                                <textarea
                                    value={paymentForm.notes}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                                    className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 h-20 resize-none"
                                    placeholder="Add notes..."
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-800/50 flex justify-end gap-3">
                            <button onClick={() => setIsPaymentModalOpen(false)} className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium">
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitPayment}
                                disabled={isSubmitting || !paymentForm.amount}
                                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl font-medium shadow-lg disabled:opacity-50"
                            >
                                {isSubmitting ? 'Processing...' : 'Confirm Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Collect Modal */}
            <QuickCollectModal
                isOpen={isQuickCollectOpen}
                onClose={() => setIsQuickCollectOpen(false)}
                onSuccess={() => {
                    setIsQuickCollectOpen(false);
                    fetchData();
                }}
            />
        </div>
    );
}
