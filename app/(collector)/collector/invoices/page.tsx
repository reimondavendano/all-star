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
    Zap,
    MessageSquare,
    Info,
    Wallet
} from 'lucide-react';
import { BalanceInline } from '@/components/BalanceDisplay';
import { useMultipleRealtimeSubscriptions } from '@/hooks/useRealtimeSubscription';
import QuickCollectModal from '@/components/admin/QuickCollectModal';
import InvoiceNotesModal from '@/components/collector/InvoiceNotesModal';

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
    amount_paid: number;
    payment_status: 'Paid' | 'Unpaid' | 'Partially Paid' | 'Pending Verification';
    is_prorated?: boolean;
    prorated_days?: number;
    original_amount?: number;
    discount_applied?: number;
    credits_applied?: number;
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
        periodInvoices: Invoice[];
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
    const [statusTab, setStatusTab] = useState<'All' | 'Unpaid' | 'Partially Paid' | 'Paid'>('All');
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
    const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<{
        invoice: Invoice;
        subscription: Subscription;
        customer: Customer;
    } | null>(null);

    // Pay All modal
    const [payAllData, setPayAllData] = useState<{
        customer: Customer;
        subscription: Subscription;
        invoices: Invoice[];
        totalAmount: number;
        invoiceSum?: number;
    } | null>(null);
    const [payAllForm, setPayAllForm] = useState({
        amount: '',
        mode: 'Cash' as 'Cash' | 'E-Wallet',
        settlementDate: new Date().toISOString().split('T')[0],
        notes: '',
    });

    // Stats for the selected month
    const [monthlyStats, setMonthlyStats] = useState({
        billed: 0,
        collected: 0,
        unpaidCount: 0
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchBusinessUnits();
    }, []);

    useEffect(() => {
        fetchData();
    }, [selectedBusinessUnit, selectedMonth, statusTab]);

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

    // Helper: determine due_date range for a billing cycle in a given month
    const getDueDateRangeForMonth = (
        businessUnitName: string,
        year: number,
        month: number // 1-12
    ): { rangeStart: Date; rangeEnd: Date } => {
        const buName = (businessUnitName || '').toLowerCase();

        let is15thCycle: boolean;
        if (buName.includes('malanggam')) {
            is15thCycle = false;
        } else {
            is15thCycle = true; // Bulihan, Extension (default 15th for now or strictly defined)
        }

        // NOTE: For extension, we simplified logic here. Admin has more precise check but for display this should suffice
        // If needed, we can fetch 'invoice_date' from subscription to be precise.

        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;

        if (is15thCycle) {
            // 15th cycle: For Feb 2026, show invoices with due_date from Jan 16 to Feb 20
            return {
                rangeStart: new Date(prevYear, prevMonth - 1, 16),
                rangeEnd: new Date(year, month - 1, 20),
            };
        } else {
            // 30th cycle: For Feb 2026, show invoices from Feb 1 - Feb 28/29
            return {
                rangeStart: new Date(year, month - 1, 1),
                rangeEnd: new Date(year, month, 5),
            };
        }
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [year, month] = selectedMonth.split('-');
            const selectedYear = parseInt(year);
            const selectedMonthNum = parseInt(month);

            // Wide range for fetching to cover 15th cycle (prev month 16th)
            const prevMonthDate = new Date(selectedYear, selectedMonthNum - 2, 1);
            const fetchStartDate = prevMonthDate.toISOString().split('T')[0];
            const fetchEndDate = new Date(selectedYear, selectedMonthNum, 0).toISOString().split('T')[0];

            let subscriptionsQuery = supabase
                .from('subscriptions')
                .select(`
                    id, subscriber_id, plan_id, business_unit_id, balance, active, label, address,
                    customers!subscriptions_subscriber_id_fkey (id, name, mobile_number),
                    plans (name, monthly_fee),
                    business_units (name)
                `);
                // Removed .eq('active', true) to show all subscriptions regardless of status

            if (selectedBusinessUnit !== 'all') {
                subscriptionsQuery = subscriptionsQuery.eq('business_unit_id', selectedBusinessUnit);
            }

            const { data: subscriptions } = await subscriptionsQuery;

            if (!subscriptions || subscriptions.length === 0) {
                setGroupedData([]);
                setCashCollected(0);
                setEwalletCollected(0);
                setIsLoading(false);
                return;
            }

            const subIds = subscriptions.map(s => s.id);

            // Fetch ALL unpaid invoices + invoices in the wide date range
            let invoicesQuery = supabase
                .from('invoices')
                .select('*')
                .in('subscription_id', subIds);

            // We fetch ALL unpaid to show history, plus current month's paid ones
            // Logic: status != Paid OR (due_date within wide range)
            invoicesQuery = invoicesQuery.or(`payment_status.neq.Paid,and(due_date.gte.${fetchStartDate},due_date.lte.${fetchEndDate})`);

            const { data: invoices } = await invoicesQuery;

            // Fetch ALL payments for cash tracking
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

            // Calculate Strict Stats for Top Cards
            const statsBilled = (invoices || []).reduce((sum, inv) => {
                if (inv.due_date.startsWith(selectedMonth)) {
                    const effectiveAmount = (inv.original_amount && inv.original_amount > 0)
                        ? Math.max(0, inv.original_amount - (inv.discount_applied || 0) - (inv.credits_applied || 0))
                        : inv.amount_due;
                    return sum + effectiveAmount;
                }
                return sum;
            }, 0);

            const statsCollected = cashTotal + ewalletTotal;

            const statsUnpaidCount = (invoices || []).filter(inv => {
                if (!inv.due_date.startsWith(selectedMonth)) return false;

                const effectiveAmount = (inv.original_amount && inv.original_amount > 0)
                    ? Math.max(0, inv.original_amount - (inv.discount_applied || 0) - (inv.credits_applied || 0))
                    : inv.amount_due;

                const paid = Math.round(inv.amount_paid * 100);
                const due = Math.round(effectiveAmount * 100);

                return !(paid >= due && due > 0);
            }).length;

            setMonthlyStats({ billed: statsBilled, collected: statsCollected, unpaidCount: statsUnpaidCount });

            // Group by customer
            const customerMap = new Map<string, GroupedData>();

            subscriptions.forEach((sub: any) => {
                const customer = sub.customers as Customer;
                if (!customer) return;

                if (!customerMap.has(customer.id)) {
                    customerMap.set(customer.id, { customer, subscriptions: [] });
                }

                const subInvoices = (invoices || []).filter(inv => inv.subscription_id === sub.id)
                    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

                const subPayments = (payments || []).filter(pay => pay.subscription_id === sub.id)
                    .sort((a, b) => new Date(b.settlement_date).getTime() - new Date(a.settlement_date).getTime());

                // Calculate period invoices
                const { rangeStart, rangeEnd } = getDueDateRangeForMonth(
                    sub.business_units?.name || '',
                    selectedYear,
                    selectedMonthNum
                );

                const periodInvoices = subInvoices.filter(inv => {
                    const dueDate = new Date(inv.due_date + 'T00:00:00');
                    // Include if in range OR if status matches filter (handled in render usually, but here we define 'period' view)
                    // The Admin view strictly defines 'periodInvoices' by date range.
                    return dueDate >= rangeStart && dueDate <= rangeEnd;
                });

                // Apply status filter if needed
                let visibleInvoices = subInvoices;
                if (statusTab === 'Paid') {
                    visibleInvoices = subInvoices.filter(inv => inv.payment_status === 'Paid');
                    // Also filter by date for 'Paid' view to strictly show that month's paid? 
                    // Admin logic: fetch wide, filter based on selection.
                } else if (statusTab === 'Unpaid') {
                    visibleInvoices = subInvoices.filter(inv => inv.payment_status === 'Unpaid');
                } else if (statusTab === 'Partially Paid') {
                    visibleInvoices = subInvoices.filter(inv => inv.payment_status === 'Partially Paid');
                }

                // If filter is active, check if subscription has relevant invoices
                if (statusTab !== 'All' && visibleInvoices.length === 0) return;

                // Adjust periodInvoices if filter is active?
                // Actually, Admin logic renders 'periodInvoices' specifically for the table.
                // If filtering by status, we might show valid invoices from history too if Unpaid.

                const totalPaid = subInvoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);

                customerMap.get(customer.id)!.subscriptions.push({
                    subscription: sub as Subscription,
                    invoices: subInvoices, // All related invoices (history + current)
                    periodInvoices: periodInvoices, // Just for this month's view
                    payments: subPayments,
                    totalDue: Number(sub.balance) || 0,
                    totalPaid,
                    balance: sub.balance
                });
            });

            const grouped = Array.from(customerMap.values())
                .filter(g => g.subscriptions.length > 0)
                .sort((a, b) => a.customer.name.localeCompare(b.customer.name));

            setGroupedData(grouped);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const openPayAllModal = (customer: Customer, subscription: Subscription, invoices: Invoice[]) => {
        // Calculate total unpaid amount for the subscription
        // We use subscription.balance as the total due source of truth
        const totalAmount = subscription.balance || 0;

        // Sum of invoice amounts for display breakdown (optional validation)
        const unpaidInvoices = invoices.filter(i => i.payment_status !== 'Paid');
        const invoiceSum = unpaidInvoices.reduce((sum, inv) => sum + (inv.amount_due - (inv.amount_paid || 0)), 0);

        setPayAllData({
            customer,
            subscription,
            invoices,
            totalAmount,
            invoiceSum
        });
        setPayAllForm({
            amount: totalAmount > 0 ? totalAmount.toString() : '0',
            mode: 'Cash',
            settlementDate: new Date().toISOString().split('T')[0],
            notes: ''
        });
    };

    const handlePayAll = async () => {
        if (!payAllData) return;
        setIsSubmitting(true);

        try {
            const amount = parseFloat(payAllForm.amount);
            if (isNaN(amount) || amount <= 0) {
                alert('Please enter a valid amount');
                setIsSubmitting(false);
                return;
            }

            const { subscription, invoices } = payAllData;

            // 1. Distribute payment across oldest unpaid invoices first
            const unpaidInvoices = invoices
                .filter(i => i.payment_status !== 'Paid')
                .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

            let remainingAmount = amount;
            let transactionCount = 0;

            for (const invoice of unpaidInvoices) {
                if (remainingAmount <= 0) break;

                const currentPaid = invoice.amount_paid || 0;
                const balance = invoice.amount_due - currentPaid;
                const paymentForInvoice = Math.min(remainingAmount, balance);

                if (paymentForInvoice > 0) {
                    // Record payment
                    await supabase.from('payments').insert({
                        subscription_id: subscription.id,
                        invoice_id: invoice.id,
                        settlement_date: payAllForm.settlementDate,
                        amount: paymentForInvoice,
                        mode: payAllForm.mode,
                        notes: `Pay All - ${payAllForm.notes || 'Full Settlement'}`
                    });

                    // Update invoice
                    const newPaid = currentPaid + paymentForInvoice;
                    const isFullyPaid = newPaid >= invoice.amount_due;
                    // Floating point safety: if newPaid is very close to amount_due, mark paid
                    // or rely on >= logic.

                    await supabase.from('invoices').update({
                        payment_status: isFullyPaid ? 'Paid' : 'Partially Paid',
                        amount_paid: newPaid
                    }).eq('id', invoice.id);

                    remainingAmount -= paymentForInvoice;
                    transactionCount++;
                }
            }

            // If there's still remaining amount (overpayment or no invoices matches but balance existed),
            // just update the balance. The overpayment effectively reduces balance further?
            // Actually balance is updated below.

            // 2. Update Subscription Balance
            // New balance = Old Balance - Payment Amount
            const newBalance = (subscription.balance || 0) - amount;

            await supabase
                .from('subscriptions')
                .update({ balance: newBalance })
                .eq('id', subscription.id);

            setPayAllData(null);
            fetchData(); // Refresh

        } catch (error) {
            console.error('Error processing Pay All:', error);
            alert('Failed to process payment');
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

    // Dynamically determine effective status based on actual amounts
    const getEffectiveStatus = (invoice: Invoice): Invoice['payment_status'] => {
        // Use the period amount (original_amount) if available, otherwise fall back to amount_due
        const effectiveAmount = (invoice.original_amount && invoice.original_amount > 0)
            ? Math.max(0, invoice.original_amount - (invoice.discount_applied || 0) - (invoice.credits_applied || 0))
            : invoice.amount_due;

        const paid = Math.round(invoice.amount_paid * 100);
        const due = Math.round(effectiveAmount * 100);

        if (paid >= due && due > 0) {
            return 'Paid';
        }
        if (paid > 0 && paid < due) {
            return 'Partially Paid';
        }
        return invoice.payment_status;
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
    // Stats are now in monthlyStats
    // const totalDue = groupedData.reduce((sum, g) => sum + g.subscriptions.reduce((s, sub) => s + sub.totalDue, 0), 0);
    // const totalPaid = groupedData.reduce((sum, g) => sum + g.subscriptions.reduce((s, sub) => s + sub.totalPaid, 0), 0);
    // const unpaidCount = groupedData.reduce((sum, g) => sum + g.subscriptions.reduce((s, sub) => s + sub.invoices.filter(i => i.payment_status === 'Unpaid').length, 0), 0);

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
                            <div className="text-xs text-gray-500">
                                For {new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                {selectedBusinessUnit !== 'all' && businessUnits.find(bu => bu.id === selectedBusinessUnit) && (
                                    <span className="ml-2 px-2 py-0.5 bg-amber-900/40 text-amber-400 rounded">
                                        {businessUnits.find(bu => bu.id === selectedBusinessUnit)?.name}
                                    </span>
                                )}
                            </div>
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
                            <div className="text-lg font-bold text-purple-300">₱{Math.round(monthlyStats.billed).toLocaleString()}</div>
                        </div>
                        <div className="px-4 py-2 bg-emerald-900/30 rounded-xl border border-emerald-700/50">
                            <div className="text-xs text-emerald-400">Collected</div>
                            <div className="text-lg font-bold text-emerald-300">₱{Math.round(monthlyStats.collected).toLocaleString()}</div>
                        </div>
                        <div className="px-4 py-2 bg-red-900/30 rounded-xl border border-red-700/50">
                            <div className="text-xs text-red-400">Unpaid</div>
                            <div className="text-lg font-bold text-red-300">{monthlyStats.unpaidCount}</div>
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
                <div className="space-y-4 mt-4 pt-4 border-t border-gray-800">
                    {/* Status Tabs */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setStatusTab('All'); setCurrentPage(1); }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${statusTab === 'All'
                                ? 'bg-purple-600 text-white shadow-lg'
                                : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-white'
                                }`}
                        >
                            <FileText className="w-4 h-4" />
                            All
                        </button>
                        <button
                            onClick={() => { setStatusTab('Unpaid'); setCurrentPage(1); }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${statusTab === 'Unpaid'
                                ? 'bg-red-600 text-white shadow-lg'
                                : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-white'
                                }`}
                        >
                            <AlertCircle className="w-4 h-4" />
                            Unpaid
                        </button>
                        <button
                            onClick={() => { setStatusTab('Partially Paid'); setCurrentPage(1); }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${statusTab === 'Partially Paid'
                                ? 'bg-amber-600 text-white shadow-lg'
                                : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-white'
                                }`}
                        >
                            <Clock className="w-4 h-4" />
                            Partially Paid
                        </button>
                        <button
                            onClick={() => { setStatusTab('Paid'); setCurrentPage(1); }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${statusTab === 'Paid'
                                ? 'bg-emerald-600 text-white shadow-lg'
                                : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-white'
                                }`}
                        >
                            <CheckCircle className="w-4 h-4" />
                            Paid
                        </button>
                    </div>

                    {/* Search and Filters Row */}
                    <div className="flex flex-wrap items-center gap-3">
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
                        <button onClick={fetchData} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
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

                            if (buName) {
                                return (
                                    <>
                                        <p className="text-gray-400">No <span className="text-white font-medium">{statusTab === 'All' ? '' : statusTab.toLowerCase()}</span> invoices found</p>
                                        <p className="text-sm mt-1">for <span className="text-purple-400">{buName}</span> in <span className="text-purple-400">{monthLabel}</span></p>
                                    </>
                                );
                            } else {
                                return (
                                    <>
                                        <p className="text-gray-400">No <span className="text-white font-medium">{statusTab === 'All' ? '' : statusTab.toLowerCase()}</span> invoices found</p>
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
                                    <div className="bg-[#0a0a0a]">
                                        {group.subscriptions.map(({ subscription, invoices, periodInvoices, payments, totalPaid, totalDue, balance }) => {
                                            // Calculate invoice status summary for this period
                                            const hasInvoices = periodInvoices && periodInvoices.length > 0;

                                            // Determine overall status based on period invoices
                                            let statusText = 'No Invoice';
                                            let statusClass = 'bg-gray-800 text-gray-500 border-gray-700';

                                            if (hasInvoices) {
                                                const paidCount = periodInvoices.filter(i => getEffectiveStatus(i) === 'Paid').length;
                                                const unpaidCount = periodInvoices.filter(i => getEffectiveStatus(i) === 'Unpaid').length;
                                                const partialCount = periodInvoices.filter(i => getEffectiveStatus(i) === 'Partially Paid').length;
                                                const pendingCount = periodInvoices.filter(i => getEffectiveStatus(i) === 'Pending Verification').length;

                                                if (paidCount === periodInvoices.length) {
                                                    statusText = 'Paid';
                                                    statusClass = 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50';
                                                } else if (unpaidCount === periodInvoices.length && periodInvoices.length > 0) {
                                                    statusText = 'Unpaid';
                                                    statusClass = 'bg-red-900/30 text-red-400 border-red-700/50';
                                                } else if (pendingCount > 0) {
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
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {subscription.label || subscription.address || 'No location'}
                                                            </div>
                                                        </div>

                                                        {/* Summary & Pay All */}
                                                        <div className="flex items-center gap-2">
                                                            {totalDue > 0 && (
                                                                <div className="text-right">
                                                                    <div className="text-sm font-medium text-white">₱{Math.round(totalDue).toLocaleString()}</div>
                                                                    <div className="text-xs text-gray-500">{invoices.filter(i => getEffectiveStatus(i) !== 'Paid').length} invoice(s)</div>
                                                                </div>
                                                            )}

                                                            {/* Pay All button */}
                                                            {totalDue > 0 && invoices.some(i => getEffectiveStatus(i) !== 'Paid') && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        openPayAllModal(group.customer, subscription, invoices);
                                                                    }}
                                                                    className="px-2.5 py-1 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs rounded-lg transition-colors flex items-center gap-1"
                                                                >
                                                                    <Wallet className="w-3 h-3" />
                                                                    Pay All
                                                                </button>
                                                            )}
                                                            <span className={`px-2 py-1 rounded text-xs font-medium border ${statusClass}`}>
                                                                {statusText}
                                                            </span>
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
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-800/50">
                                                                    {(() => {
                                                                        // Reminder Row Logic
                                                                        const hiddenUnpaidInvoices = invoices.filter(inv =>
                                                                            getEffectiveStatus(inv) !== 'Paid' &&
                                                                            !periodInvoices?.some(p => p.id === inv.id)
                                                                        );

                                                                        if (hiddenUnpaidInvoices.length > 0) {
                                                                            const hiddenTotal = hiddenUnpaidInvoices.reduce((sum, inv) => {
                                                                                const amount = (inv.original_amount && inv.original_amount > 0)
                                                                                    ? Math.max(0, inv.original_amount - (inv.discount_applied || 0) - (inv.credits_applied || 0))
                                                                                    : inv.amount_due;
                                                                                return sum + (amount - (inv.amount_paid || 0));
                                                                            }, 0);

                                                                            if (hiddenTotal <= 0) return null;

                                                                            return (
                                                                                <tr className="bg-amber-950/20 hover:bg-amber-950/30 transition-colors">
                                                                                    <td colSpan={4} className="p-3 text-center border-b border-gray-800/50">
                                                                                        <div className="flex items-center justify-center gap-2 text-amber-500/90 text-xs">
                                                                                            <AlertCircle className="w-3 h-3" />
                                                                                            <span>
                                                                                                Reminder: You have <span className="font-bold">{hiddenUnpaidInvoices.length} overdue invoice(s)</span> from previous months
                                                                                                totalling <span className="font-bold">₱{Math.round(hiddenTotal).toLocaleString()}</span>.
                                                                                                Use "Pay All" to settle balance.
                                                                                            </span>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        }
                                                                        return null;
                                                                    })()}

                                                                    {(!periodInvoices || periodInvoices.length === 0) ? (
                                                                        <tr>
                                                                            <td colSpan={4} className="p-4 text-center text-gray-500">
                                                                                No invoices for this period
                                                                            </td>
                                                                        </tr>
                                                                    ) : (
                                                                        periodInvoices.map(invoice => (
                                                                            <tr key={invoice.id} className="hover:bg-[#151515]">
                                                                                <td className="p-3 text-white">
                                                                                    {new Date(invoice.due_date).toLocaleDateString()}
                                                                                </td>
                                                                                <td className="p-3 text-gray-400">
                                                                                    {new Date(invoice.from_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(invoice.to_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                                </td>
                                                                                <td className="p-3 text-right text-white font-medium">
                                                                                    ₱{((invoice.original_amount && invoice.original_amount > 0)
                                                                                        ? Math.max(0, invoice.original_amount - (invoice.discount_applied || 0) - (invoice.credits_applied || 0))
                                                                                        : invoice.amount_due
                                                                                    ).toFixed(2)}
                                                                                </td>
                                                                                <td className="p-3 text-center">
                                                                                    <div className="flex items-center justify-end gap-2">
                                                                                        {/* Note Button */}
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                setSelectedInvoice({ invoice, subscription, customer: group.customer });
                                                                                                setIsNotesModalOpen(true);
                                                                                            }}
                                                                                            className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs"
                                                                                            title="Notes"
                                                                                        >
                                                                                            <MessageSquare className="w-3.5 h-3.5" />
                                                                                        </button>

                                                                                        {/* Removed Individual Pay Button as requested */}

                                                                                        <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusStyle(getEffectiveStatus(invoice))}`}>
                                                                                            {getEffectiveStatus(invoice)}
                                                                                        </span>
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        ))
                                                                    )}
                                                                </tbody>
                                                            </table>
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

            {/* Pay All Modal */}
            {payAllData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setPayAllData(null)} />
                    <div className="relative bg-[#0a0a0a] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="p-6 border-b border-gray-800/50 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white">Pay All Balance</h2>
                                <p className="text-sm text-gray-400">{payAllData.customer.name}</p>
                            </div>
                            <button
                                onClick={() => setPayAllData(null)}
                                className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="bg-amber-950/10 rounded-xl p-4 border border-amber-900/20">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-amber-500/80 text-sm">Total Outstanding</span>
                                    <span className="text-xl font-bold text-amber-500">₱{Math.round(payAllData.totalAmount).toLocaleString()}</span>
                                </div>

                                {(() => {
                                    // Calculate breakdown
                                    const subtotal = payAllData.invoiceSum || 0;
                                    const totalToPay = payAllData.totalAmount;
                                    const creditAmount = subtotal - totalToPay;
                                    const penaltyAmount = totalToPay - subtotal;

                                    return (
                                        <div className="space-y-1 text-xs text-gray-400">
                                            <div className="flex justify-between">
                                                <span>Invoice Sum</span>
                                                <span>₱{Math.round(subtotal).toLocaleString()}</span>
                                            </div>
                                            {creditAmount > 0 && Math.abs(creditAmount) > 1 && (
                                                <div className="flex justify-between text-emerald-400">
                                                    <span>Credits / Adjustments</span>
                                                    <span>-₱{Math.round(creditAmount).toLocaleString()}</span>
                                                </div>
                                            )}
                                            {penaltyAmount > 0 && Math.abs(penaltyAmount) > 1 && (
                                                <div className="flex justify-between text-amber-500">
                                                    <span>Other Charges</span>
                                                    <span>+₱{Math.round(penaltyAmount).toLocaleString()}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Amount (₱)</label>
                                <input
                                    type="number"
                                    value={payAllForm.amount}
                                    onChange={(e) => setPayAllForm({ ...payAllForm, amount: e.target.value })}
                                    className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500"
                                    placeholder="0.00"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Payment Mode</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPayAllForm({ ...payAllForm, mode: 'Cash' })}
                                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-colors ${payAllForm.mode === 'Cash'
                                            ? 'bg-amber-900/30 border-amber-700/50 text-amber-400'
                                            : 'bg-gray-900/50 border-gray-700 text-gray-400'
                                            }`}
                                    >
                                        <Banknote className="w-4 h-4" />
                                        Cash
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPayAllForm({ ...payAllForm, mode: 'E-Wallet' })}
                                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-colors ${payAllForm.mode === 'E-Wallet'
                                            ? 'bg-amber-900/30 border-amber-700/50 text-amber-400'
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
                                    value={payAllForm.settlementDate}
                                    onChange={(e) => setPayAllForm({ ...payAllForm, settlementDate: e.target.value })}
                                    className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Notes (optional)</label>
                                <textarea
                                    value={payAllForm.notes}
                                    onChange={(e) => setPayAllForm({ ...payAllForm, notes: e.target.value })}
                                    className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 h-20 resize-none"
                                    placeholder="Add notes..."
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    onClick={() => setPayAllData(null)}
                                    className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium w-full"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handlePayAll}
                                    disabled={isSubmitting || !payAllForm.amount}
                                    className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl font-medium shadow-lg w-full disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Processing...' : 'Pay Now'}
                                </button>
                            </div>
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

            {/* Invoice Notes Modal */}
            {selectedInvoice && (
                <InvoiceNotesModal
                    isOpen={isNotesModalOpen}
                    onClose={() => {
                        setIsNotesModalOpen(false);
                        setSelectedInvoice(null);
                    }}
                    invoiceId={selectedInvoice.invoice.id}
                    customerName={selectedInvoice.customer.name}
                />
            )}
        </div>
    );
}
