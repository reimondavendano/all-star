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
    Banknote,
    Smartphone,
    Zap
} from 'lucide-react';
import GenerateInvoiceModal from '@/components/admin/GenerateInvoiceModal';
import QuickCollectModal from '@/components/admin/QuickCollectModal';
import { useMultipleRealtimeSubscriptions } from '@/hooks/useRealtimeSubscription';

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
    mikrotik_ppp_secrets?: Array<{
        name: string;
        profile: string;
    }>;
}

interface Invoice {
    id: string;
    subscription_id: string;
    from_date: string;
    to_date: string;
    due_date: string;
    amount_due: number;
    payment_status: 'Paid' | 'Unpaid' | 'Partially Paid' | 'Pending Verification';
    is_prorated?: boolean;
    prorated_days?: number;
}

interface Payment {
    id: string;
    subscription_id: string;
    settlement_date: string;
    amount: number;
    mode: 'Cash' | 'E-Wallet';
    notes?: string;
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

export default function InvoicesPaymentsPage() {
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
    const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<string>('all');
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [statusFilter, setStatusFilter] = useState<'all' | 'Paid' | 'Unpaid' | 'Partially Paid'>('all');
    const [groupedData, setGroupedData] = useState<GroupedData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
    const [expandedSubscriptions, setExpandedSubscriptions] = useState<Set<string>>(new Set());

    // Search and Pagination
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20; // Optimized for 500+ records

    // Modals
    const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
    const [isQuickCollectOpen, setIsQuickCollectOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<{
        invoice: Invoice;
        subscription: Subscription;
        customer: Customer;
    } | null>(null);

    // Payment form
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
        ['invoices', 'payments', 'subscriptions'],
        (table, payload) => {
            console.log(`[Realtime] ${table} changed:`, payload.eventType);
            // Refetch data on any change
            fetchData();
        }
    );

    const fetchBusinessUnits = async () => {
        const { data } = await supabase
            .from('business_units')
            .select('id, name')
            .order('name');
        setBusinessUnits(data || []);
    };

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [year, month] = selectedMonth.split('-');
            const startDate = `${year}-${month}-01`;
            const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

            // Fetch subscriptions with related data
            let subscriptionsQuery = supabase
                .from('subscriptions')
                .select(`
                    id,
                    subscriber_id,
                    plan_id,
                    business_unit_id,
                    balance,
                    active,
                    label,
                    address,
                    customers!subscriptions_subscriber_id_fkey (
                        id,
                        name,
                        mobile_number
                    ),
                    plans (
                        name,
                        monthly_fee
                    ),
                    mikrotik_ppp_secrets (
                        name,
                        profile
                    )
                `)
                .eq('active', true);

            if (selectedBusinessUnit !== 'all') {
                subscriptionsQuery = subscriptionsQuery.eq('business_unit_id', selectedBusinessUnit);
            }

            const { data: subscriptions, error: subError } = await subscriptionsQuery;

            if (subError) throw subError;

            if (!subscriptions || subscriptions.length === 0) {
                setGroupedData([]);
                setIsLoading(false);
                return;
            }

            const subIds = subscriptions.map(s => s.id);

            // Fetch invoices for the selected month
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

            // Fetch all payments for these subscriptions in this period
            const { data: payments } = await supabase
                .from('payments')
                .select('*')
                .in('subscription_id', subIds)
                .gte('settlement_date', startDate)
                .lte('settlement_date', endDate);

            // Group by customer
            const customerMap = new Map<string, GroupedData>();

            for (const sub of subscriptions) {
                const customerData = sub.customers as any;
                const customer: Customer = Array.isArray(customerData) ? customerData[0] : customerData;
                if (!customer) continue;

                const subInvoices = (invoices || []).filter(inv => inv.subscription_id === sub.id);
                const subPayments = (payments || []).filter(pay => pay.subscription_id === sub.id);

                // ONLY include subscriptions that have invoices for this period
                if (subInvoices.length === 0) continue;

                const totalPaid = subPayments.reduce((sum, p) => sum + Number(p.amount), 0);
                const totalDue = subInvoices.reduce((sum, inv) => sum + Number(inv.amount_due), 0);

                if (!customerMap.has(customer.id)) {
                    customerMap.set(customer.id, {
                        customer,
                        subscriptions: [],
                    });
                }

                customerMap.get(customer.id)!.subscriptions.push({
                    subscription: sub as any,
                    invoices: subInvoices,
                    payments: subPayments,
                    totalPaid,
                    totalDue,
                    balance: Number(sub.balance) || 0,
                });
            }

            // Convert to array and sort - only include customers with subscriptions that have invoices
            const grouped = Array.from(customerMap.values())
                .filter(g => g.subscriptions.length > 0)
                .sort((a, b) => a.customer.name.localeCompare(b.customer.name));

            setGroupedData(grouped);

            // Auto-expand if few customers
            if (grouped.length <= 5) {
                setExpandedCustomers(new Set(grouped.map(g => g.customer.id)));
            }

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedBusinessUnit, selectedMonth, statusFilter]);

    const toggleCustomer = (customerId: string) => {
        const newSet = new Set(expandedCustomers);
        if (newSet.has(customerId)) {
            newSet.delete(customerId);
        } else {
            newSet.add(customerId);
        }
        setExpandedCustomers(newSet);
    };

    const toggleSubscription = (subId: string) => {
        const newSet = new Set(expandedSubscriptions);
        if (newSet.has(subId)) {
            newSet.delete(subId);
        } else {
            newSet.add(subId);
        }
        setExpandedSubscriptions(newSet);
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
                notes: paymentForm.notes || null
            });

            if (paymentError) throw paymentError;

            // Update invoice status
            const remainingBalance = selectedInvoice.invoice.amount_due - amount;
            const newStatus = remainingBalance <= 0 ? 'Paid' : 'Partially Paid';

            await supabase
                .from('invoices')
                .update({ payment_status: newStatus })
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

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'Paid':
                return <CheckCircle className="w-4 h-4 text-emerald-400" />;
            case 'Partially Paid':
                return <Clock className="w-4 h-4 text-amber-400" />;
            case 'Pending Verification':
                return <Clock className="w-4 h-4 text-violet-400" />;
            default:
                return <AlertCircle className="w-4 h-4 text-red-400" />;
        }
    };

    const getStatusBadgeClass = (status: string) => {
        switch (status) {
            case 'Paid':
                return 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50';
            case 'Partially Paid':
                return 'bg-amber-900/30 text-amber-400 border-amber-700/50';
            case 'Pending Verification':
                return 'bg-violet-900/30 text-violet-400 border-violet-700/50';
            default:
                return 'bg-red-900/30 text-red-400 border-red-700/50';
        }
    };

    // Month options for filter
    const currentYear = new Date().getFullYear();
    const months: { value: string; label: string }[] = [];
    for (let y = currentYear; y >= currentYear - 1; y--) {
        for (let m = 12; m >= 1; m--) {
            const monthStr = `${y}-${m.toString().padStart(2, '0')}`;
            const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            months.push({ value: monthStr, label });
        }
    }

    // Filter and paginate
    const filteredData = groupedData.filter(group =>
        group.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        group.customer.mobile_number?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

    // Stats
    const totalDue = groupedData.reduce((sum, g) => sum + g.subscriptions.reduce((s, sub) => s + sub.totalDue, 0), 0);
    const totalPaid = groupedData.reduce((sum, g) => sum + g.subscriptions.reduce((s, sub) => s + sub.totalPaid, 0), 0);
    const unpaidCount = groupedData.reduce((sum, g) => sum + g.subscriptions.reduce((s, sub) => s + sub.invoices.filter(i => i.payment_status === 'Unpaid').length, 0), 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <FileText className="w-6 h-6 text-purple-500" />
                            Invoices & Payments
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">Manage billing, view invoices, and record payments</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Stats */}
                        <div className="px-4 py-2 bg-purple-900/30 rounded-xl border border-purple-700/50">
                            <div className="text-xs text-purple-400">Total Billed</div>
                            <div className="text-lg font-bold text-purple-300">₱{Math.round(totalDue).toLocaleString()}</div>
                        </div>
                        <div className="px-4 py-2 bg-emerald-900/30 rounded-xl border border-emerald-700/50">
                            <div className="text-xs text-emerald-400">Collected</div>
                            <div className="text-lg font-bold text-emerald-300">₱{Math.round(totalPaid).toLocaleString()}</div>
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

                        <button
                            onClick={() => setIsGenerateModalOpen(true)}
                            className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl transition-colors flex items-center gap-2 font-medium"
                        >
                            <Plus className="w-4 h-4" />
                            Generate Invoices
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-800">
                    <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-500" />
                        <select
                            value={selectedBusinessUnit}
                            onChange={(e) => setSelectedBusinessUnit(e.target.value)}
                            className="bg-[#1a1a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                        >
                            <option value="all">All Business Units</option>
                            {businessUnits.map(bu => (
                                <option key={bu.id} value={bu.id}>{bu.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="bg-[#1a1a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                        >
                            {months.slice(0, 24).map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Status:</span>
                        <div className="flex gap-1">
                            {(['all', 'Unpaid', 'Partially Paid', 'Paid'] as const).map(status => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === status
                                        ? status === 'Paid' ? 'bg-emerald-600 text-white'
                                            : status === 'Partially Paid' ? 'bg-amber-600 text-white'
                                                : status === 'Unpaid' ? 'bg-red-600 text-white'
                                                    : 'bg-purple-600 text-white'
                                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                        }`}
                                >
                                    {status === 'all' ? 'All' : status}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search customer..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="bg-[#1a1a1a] border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:border-purple-500 w-48"
                            />
                        </div>
                        <button
                            onClick={fetchData}
                            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="glass-card overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-gray-500">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                        Loading...
                    </div>
                ) : paginatedData.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        {/* Contextual empty state message */}
                        {(() => {
                            const monthLabel = new Date(selectedMonth + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
                            const buName = selectedBusinessUnit !== 'all'
                                ? businessUnits.find(b => b.id === selectedBusinessUnit)?.name
                                : null;

                            // Different messages based on active filters
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

                        {/* Only show Generate button when viewing 'all' status and current/recent month */}
                        {statusFilter === 'all' && (
                            <p className="text-xs text-gray-600 mt-4">Use the "Generate Invoices" button above to create invoices for this period</p>
                        )}
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {paginatedData.map((group) => (
                            <div key={group.customer.id}>
                                {/* Customer Header */}
                                <div
                                    className="p-4 hover:bg-[#1a1a1a] cursor-pointer flex items-center gap-3 transition-colors"
                                    onClick={() => toggleCustomer(group.customer.id)}
                                >
                                    {expandedCustomers.has(group.customer.id) ? (
                                        <ChevronDown className="w-5 h-5 text-gray-500" />
                                    ) : (
                                        <ChevronRight className="w-5 h-5 text-gray-500" />
                                    )}
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-violet-600 to-purple-600 flex items-center justify-center">
                                        <User className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-medium text-white">{group.customer.name}</div>
                                        <div className="text-xs text-gray-500">
                                            {group.subscriptions.length} subscription(s) • {group.customer.mobile_number || 'No phone'}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm text-gray-400">
                                            Total Due: <span className="text-white font-medium">
                                                ₱{Math.round(group.subscriptions.reduce((sum, s) => sum + s.totalDue, 0)).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Subscriptions */}
                                {expandedCustomers.has(group.customer.id) && (
                                    <div className="bg-[#0a0a0a]">
                                        {group.subscriptions.map(({ subscription, invoices, payments, totalPaid, totalDue, balance }) => {
                                            // Calculate invoice status summary
                                            const hasInvoices = invoices.length > 0;
                                            const paidInvoices = invoices.filter(i => i.payment_status === 'Paid').length;
                                            const unpaidInvoices = invoices.filter(i => i.payment_status === 'Unpaid').length;
                                            const pendingInvoices = invoices.filter(i => i.payment_status === 'Pending Verification').length;

                                            // Determine overall status
                                            let statusText = 'No Invoice';
                                            let statusClass = 'bg-gray-800 text-gray-500 border-gray-700';
                                            if (hasInvoices) {
                                                if (paidInvoices === invoices.length) {
                                                    statusText = 'Paid';
                                                    statusClass = 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50';
                                                } else if (unpaidInvoices === invoices.length) {
                                                    statusText = 'Unpaid';
                                                    statusClass = 'bg-red-900/30 text-red-400 border-red-700/50';
                                                } else if (pendingInvoices > 0) {
                                                    statusText = 'Pending';
                                                    statusClass = 'bg-violet-900/30 text-violet-400 border-violet-700/50';
                                                } else {
                                                    statusText = 'Partial';
                                                    statusClass = 'bg-amber-900/30 text-amber-400 border-amber-700/50';
                                                }
                                            }

                                            return (
                                                <div key={subscription.id} className="border-l-2 border-gray-800 ml-6">
                                                    {/* Subscription Header */}
                                                    <div
                                                        className="p-3 hover:bg-[#151515] cursor-pointer flex items-center gap-3 transition-colors"
                                                        onClick={() => toggleSubscription(subscription.id)}
                                                    >
                                                        {expandedSubscriptions.has(subscription.id) ? (
                                                            <ChevronDown className="w-4 h-4 text-gray-500" />
                                                        ) : (
                                                            <ChevronRight className="w-4 h-4 text-gray-500" />
                                                        )}
                                                        <Wifi className="w-4 h-4 text-purple-500" />
                                                        <div className="flex-1">
                                                            <div className="text-sm text-white">
                                                                {subscription.plans?.name || 'Unknown Plan'}
                                                                {subscription.mikrotik_ppp_secrets?.[0]?.name && (
                                                                    <span className="ml-2 px-2 py-0.5 bg-purple-900/30 text-purple-400 text-xs rounded">
                                                                        {subscription.mikrotik_ppp_secrets[0].name}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {subscription.label || subscription.address || 'No location'}
                                                            </div>
                                                        </div>

                                                        {/* Invoice Summary with Status */}
                                                        <div className="flex items-center gap-3">
                                                            {hasInvoices ? (
                                                                <>
                                                                    <div className="text-right">
                                                                        <div className="text-sm font-medium text-white">₱{Math.round(totalDue).toLocaleString()}</div>
                                                                        <div className="text-xs text-gray-500">{invoices.length} invoice(s)</div>
                                                                    </div>
                                                                    <span className={`px-2 py-1 rounded text-xs font-medium border ${statusClass}`}>
                                                                        {statusText}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <span className={`px-2 py-1 rounded text-xs font-medium border ${statusClass}`}>
                                                                    {statusText}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Invoices Table */}
                                                    {expandedSubscriptions.has(subscription.id) && (
                                                        <div className="mx-4 mb-4 rounded-lg overflow-hidden border border-gray-800">
                                                            <table className="w-full text-sm">
                                                                <thead className="bg-[#1a1a1a]">
                                                                    <tr className="text-gray-400 text-xs">
                                                                        <th className="text-left p-3">Due Date</th>
                                                                        <th className="text-left p-3">Period</th>
                                                                        <th className="text-right p-3">Amount</th>
                                                                        <th className="text-center p-3">Status</th>
                                                                        <th className="text-right p-3">Action</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-800/50">
                                                                    {invoices.length === 0 ? (
                                                                        <tr>
                                                                            <td colSpan={5} className="p-4 text-center text-gray-500">
                                                                                No invoices for this period
                                                                            </td>
                                                                        </tr>
                                                                    ) : (
                                                                        invoices.map(invoice => (
                                                                            <tr key={invoice.id} className="hover:bg-[#151515]">
                                                                                <td className="p-3 text-white">
                                                                                    {new Date(invoice.due_date).toLocaleDateString()}
                                                                                </td>
                                                                                <td className="p-3 text-gray-400">
                                                                                    {new Date(invoice.from_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(invoice.to_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                                                    {invoice.is_prorated && (
                                                                                        <span className="ml-1 text-xs text-blue-400">(Pro-rated)</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="p-3 text-right text-white font-medium">
                                                                                    ₱{Math.round(invoice.amount_due).toLocaleString()}
                                                                                </td>
                                                                                <td className="p-3 text-center">
                                                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${getStatusBadgeClass(invoice.payment_status)}`}>
                                                                                        {getStatusIcon(invoice.payment_status)}
                                                                                        {invoice.payment_status}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="p-3 text-right">
                                                                                    {invoice.payment_status !== 'Paid' ? (
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                openPaymentModal(invoice, subscription, group.customer);
                                                                                            }}
                                                                                            className="px-3 py-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white text-xs rounded transition-colors"
                                                                                        >
                                                                                            <CreditCard className="w-3 h-3 inline mr-1" />
                                                                                            Pay
                                                                                        </button>
                                                                                    ) : (
                                                                                        <span className="text-xs text-emerald-500">✓ Paid</span>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        ))
                                                                    )}
                                                                </tbody>
                                                            </table>

                                                            {/* Payments for this subscription */}
                                                            {payments.length > 0 && (
                                                                <div className="bg-[#0f0f0f] p-3 border-t border-gray-800">
                                                                    <div className="text-xs text-gray-500 mb-2">Payment History</div>
                                                                    <div className="space-y-1">
                                                                        {payments.map(payment => {
                                                                            const isPending = payment.notes?.toLowerCase().includes('pending verification');
                                                                            return (
                                                                                <div key={payment.id} className="flex items-center justify-between text-xs">
                                                                                    <span className="text-gray-400 flex items-center gap-2">
                                                                                        {new Date(payment.settlement_date).toLocaleDateString()} • {payment.mode}
                                                                                        {isPending && (
                                                                                            <span className="text-[10px] bg-violet-900/30 text-violet-400 px-1.5 py-0.5 rounded border border-violet-800 flex items-center gap-1">
                                                                                                Pending
                                                                                            </span>
                                                                                        )}
                                                                                    </span>
                                                                                    <span className={isPending ? 'text-violet-400' : 'text-emerald-400'}>
                                                                                        +₱{Math.round(payment.amount).toLocaleString()}
                                                                                    </span>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
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
                            Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredData.length)} of {filteredData.length} customers
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
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
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

            {/* Generate Invoice Modal */}
            <GenerateInvoiceModal
                isOpen={isGenerateModalOpen}
                onClose={() => setIsGenerateModalOpen(false)}
                onSuccess={() => {
                    setIsGenerateModalOpen(false);
                    fetchData();
                }}
            />

            {/* Quick Collect Modal */}
            <QuickCollectModal
                isOpen={isQuickCollectOpen}
                onClose={() => setIsQuickCollectOpen(false)}
                onSuccess={() => {
                    setIsQuickCollectOpen(false);
                    fetchData();
                }}
            />

            {/* Payment Modal */}
            {isPaymentModalOpen && selectedInvoice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsPaymentModalOpen(false)} />

                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-emerald-900/50 rounded-2xl shadow-[0_0_60px_rgba(16,185,129,0.15)] w-full max-w-md overflow-hidden">
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
                                <div className="flex justify-between items-center mt-1 text-sm">
                                    <span className="text-gray-500">Due Date</span>
                                    <span className="text-gray-300">
                                        {new Date(selectedInvoice.invoice.due_date).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Amount (₱)</label>
                                <input
                                    type="number"
                                    value={paymentForm.amount}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                    className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                                    placeholder="0.00"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Payment Mode</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentForm({ ...paymentForm, mode: 'Cash' })}
                                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-colors ${paymentForm.mode === 'Cash'
                                            ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-400'
                                            : 'bg-gray-900/50 border-gray-700 text-gray-400'
                                            }`}
                                    >
                                        <Banknote className="w-4 h-4" />
                                        Cash
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentForm({ ...paymentForm, mode: 'E-Wallet' })}
                                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-colors ${paymentForm.mode === 'E-Wallet'
                                            ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-400'
                                            : 'bg-gray-900/50 border-gray-700 text-gray-400'
                                            }`}
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
                                    className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Notes (optional)</label>
                                <textarea
                                    value={paymentForm.notes}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                                    className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 h-20 resize-none"
                                    placeholder="Add notes..."
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-800/50 flex justify-end gap-3">
                            <button
                                onClick={() => setIsPaymentModalOpen(false)}
                                className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitPayment}
                                disabled={isSubmitting || !paymentForm.amount}
                                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-xl font-medium shadow-lg disabled:opacity-50"
                            >
                                {isSubmitting ? 'Processing...' : 'Confirm Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
