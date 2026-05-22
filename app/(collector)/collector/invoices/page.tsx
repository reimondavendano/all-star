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
    promised_date?: string | null;
    label?: string;
    address?: string;
    invoice_date?: string;
    customers: Customer;
    plans: {
        name: string;
        monthly_fee: number;
    };
    business_units?: {
        name: string;
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
    mode: 'Cash' | 'E-Wallet' | 'Referral Credit';
    notes?: string;
    invoice_id?: string;
}

type PaymentExtensionFilter = 'all' | 'extension' | 'non-extension';
type ReportFilterMode = 'month' | 'billing-date-range' | 'date-range';
type InvoiceSortBy = 'name' | 'payment_date' | 'business_unit' | 'total_due' | 'invoice_status' | 'payment_arrangement';
type SortDirection = 'asc' | 'desc';

const BUSINESS_UNIT_CYCLE_FILTERS = {
    malanggam_extension_30th: 'Malanggam + Extension (30th)',
    extension_15th: 'Extension (15th)'
} as const;

type BusinessUnitCycleFilter = keyof typeof BUSINESS_UNIT_CYCLE_FILTERS;

const isBusinessUnitCycleFilter = (value: string): value is BusinessUnitCycleFilter =>
    value in BUSINESS_UNIT_CYCLE_FILTERS;

const getSubscriptionBusinessUnitName = (subscription?: { business_units?: any }) => {
    const unit = subscription?.business_units as any;
    return Array.isArray(unit) ? unit[0]?.name || '' : unit?.name || '';
};

const isExtension15thCycle = (invoiceDate: string | null | undefined) =>
    !invoiceDate || invoiceDate === '15th';

const matchesBusinessUnitFilter = (subscription: { business_units?: any; invoice_date?: string | null }, selectedFilter: string) => {
    if (!isBusinessUnitCycleFilter(selectedFilter)) return true;

    const businessUnitName = getSubscriptionBusinessUnitName(subscription).toLowerCase();
    if (selectedFilter === 'malanggam_extension_30th') {
        return businessUnitName.includes('malanggam') ||
            (businessUnitName.includes('extension') && subscription.invoice_date === '30th');
    }

    return businessUnitName.includes('extension') && isExtension15thCycle(subscription.invoice_date);
};

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
    const [reportFilterMode, setReportFilterMode] = useState<ReportFilterMode>('month');
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [statusTab, setStatusTab] = useState<'All' | 'Unpaid' | 'Partially Paid' | 'Paid'>('All');
    const [paymentExtensionFilter, setPaymentExtensionFilter] = useState<PaymentExtensionFilter>('all');
    const [billingDateFrom, setBillingDateFrom] = useState('');
    const [billingDateTo, setBillingDateTo] = useState('');
    const [paymentDateFrom, setPaymentDateFrom] = useState('');
    const [paymentDateTo, setPaymentDateTo] = useState('');
    const [sortBy, setSortBy] = useState<InvoiceSortBy>('payment_date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [groupedData, setGroupedData] = useState<GroupedData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
    const [expandedSubscriptions, setExpandedSubscriptions] = useState<Set<string>>(new Set());
    const [showReportPreview, setShowReportPreview] = useState(false);
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
        unpaidCount: 0,
        extensionToCollect: 0,
        extensionCollected: 0
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPayAllConfirm, setShowPayAllConfirm] = useState(false);

    useEffect(() => {
        fetchBusinessUnits();
    }, []);

    useEffect(() => {
        fetchData();
    }, [selectedBusinessUnit, reportFilterMode, selectedMonth, statusTab, paymentExtensionFilter, billingDateFrom, billingDateTo, paymentDateFrom, paymentDateTo]);

    useEffect(() => {
        if (reportFilterMode === 'date-range') {
            if (statusTab !== 'All') setStatusTab('All');
            if (sortBy === 'invoice_status') setSortBy('payment_date');
        }
    }, [reportFilterMode, statusTab, sortBy]);

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
            const hasPaymentDateFilter = reportFilterMode === 'date-range';
            const hasBillingDateRangeFilter = reportFilterMode === 'billing-date-range';

            // Wide range for fetching to cover 15th cycle (prev month 16th)
            const prevMonthDate = new Date(selectedYear, selectedMonthNum - 2, 1);
            const fetchStartDate = prevMonthDate.toISOString().split('T')[0];
            const fetchEndDate = new Date(selectedYear, selectedMonthNum, 0).toISOString().split('T')[0];

            let subscriptionsQuery = supabase
                .from('subscriptions')
                .select(`
                    id, subscriber_id, plan_id, business_unit_id, balance, active, promised_date, label, address, invoice_date,
                    customers!subscriptions_subscriber_id_fkey (id, name, mobile_number),
                    plans (name, monthly_fee),
                    business_units (name)
                `);
                // Removed .eq('active', true) to show all subscriptions regardless of status

            if (selectedBusinessUnit !== 'all' && !isBusinessUnitCycleFilter(selectedBusinessUnit)) {
                subscriptionsQuery = subscriptionsQuery.eq('business_unit_id', selectedBusinessUnit);
            }

            const { data: subscriptions } = await subscriptionsQuery;

            const filteredSubscriptions = (subscriptions || []).filter(sub => {
                if (isBusinessUnitCycleFilter(selectedBusinessUnit) && !matchesBusinessUnitFilter(sub, selectedBusinessUnit)) return false;
                const hasPaymentExtension = Boolean(sub.promised_date);
                if (paymentExtensionFilter === 'extension') return hasPaymentExtension;
                if (paymentExtensionFilter === 'non-extension') return !hasPaymentExtension;
                return true;
            });

            if (filteredSubscriptions.length === 0) {
                setGroupedData([]);
                setCashCollected(0);
                setEwalletCollected(0);
                setMonthlyStats({ billed: 0, collected: 0, unpaidCount: 0, extensionToCollect: 0, extensionCollected: 0 });
                setIsLoading(false);
                return;
            }

            const subIds = filteredSubscriptions.map(s => s.id);

            // Fetch ALL unpaid invoices + invoices in the wide date range
            let invoicesQuery = supabase
                .from('invoices')
                .select('*')
                .in('subscription_id', subIds);

            // We fetch ALL unpaid to show history, plus current month's paid ones.
            // For payment-date filtering, keep invoices broad and narrow visible rows by payments.
            if (hasBillingDateRangeFilter) {
                if (billingDateFrom) invoicesQuery = invoicesQuery.gte('due_date', billingDateFrom);
                if (billingDateTo) invoicesQuery = invoicesQuery.lte('due_date', billingDateTo);
                if (statusTab !== 'All') invoicesQuery = invoicesQuery.eq('payment_status', statusTab);
            } else if (!hasPaymentDateFilter) {
                invoicesQuery = invoicesQuery.or(`payment_status.neq.Paid,and(due_date.gte.${fetchStartDate},due_date.lte.${fetchEndDate})`);
            }

            const { data: invoices } = await invoicesQuery;

            // Fetch payments for cash tracking and payment-date filtering.
            let paymentsQuery = supabase
                .from('payments')
                .select('*')
                .in('subscription_id', subIds);

            if (hasPaymentDateFilter) {
                if (paymentDateFrom) paymentsQuery = paymentsQuery.gte('settlement_date', paymentDateFrom);
                if (paymentDateTo) paymentsQuery = paymentsQuery.lte('settlement_date', paymentDateTo);
            }

            const { data: payments } = await paymentsQuery;
            const paidInvoiceIdsForStats = new Set((payments || []).map(payment => payment.invoice_id).filter(Boolean));
            const invoiceIdsForStats = new Set((invoices || [])
                .filter(inv => {
                    if (hasPaymentDateFilter) return paidInvoiceIdsForStats.has(inv.id);
                    if (hasBillingDateRangeFilter) {
                        return (!billingDateFrom || inv.due_date >= billingDateFrom) &&
                            (!billingDateTo || inv.due_date <= billingDateTo);
                    }
                    return inv.due_date.startsWith(selectedMonth);
                })
                .map(inv => inv.id));

            // Calculate Cash vs E-Wallet totals for the selected month
            const monthPayments = (payments || []).filter(pay => {
                if (!pay.settlement_date) return false;
                if (hasPaymentDateFilter) {
                    return (!paymentDateFrom || pay.settlement_date >= paymentDateFrom) &&
                        (!paymentDateTo || pay.settlement_date <= paymentDateTo);
                }
                if (hasBillingDateRangeFilter) {
                    return Boolean(pay.invoice_id && invoiceIdsForStats.has(pay.invoice_id));
                }
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
                const isInReport = invoiceIdsForStats.has(inv.id);

                if (isInReport) {
                    const effectiveAmount = (inv.original_amount && inv.original_amount > 0)
                        ? Math.max(0, inv.original_amount - (inv.discount_applied || 0) - (inv.credits_applied || 0))
                        : inv.amount_due;
                    return sum + effectiveAmount;
                }
                return sum;
            }, 0);

            const statsCollected = cashTotal + ewalletTotal;

            const statsUnpaidCount = (invoices || []).filter(inv => {
                const isInReport = invoiceIdsForStats.has(inv.id);
                if (!isInReport) return false;

                const effectiveAmount = (inv.original_amount && inv.original_amount > 0)
                    ? Math.max(0, inv.original_amount - (inv.discount_applied || 0) - (inv.credits_applied || 0))
                    : inv.amount_due;

                const paid = Math.round(inv.amount_paid * 100);
                const due = Math.round(effectiveAmount * 100);

                return !(paid >= due && due > 0);
            }).length;

            // Group by customer
            const customerMap = new Map<string, GroupedData>();
            let extensionToCollect = 0;
            let extensionCollected = 0;

            filteredSubscriptions.forEach((sub: any) => {
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

                const periodInvoicesBase = hasBillingDateRangeFilter
                    ? subInvoices.filter(inv =>
                        (!billingDateFrom || inv.due_date >= billingDateFrom) &&
                        (!billingDateTo || inv.due_date <= billingDateTo)
                    )
                    : subInvoices.filter(inv => {
                        const dueDate = new Date(inv.due_date + 'T00:00:00');
                        return dueDate >= rangeStart && dueDate <= rangeEnd;
                    });
                const paidInvoiceIdsInRange = new Set(subPayments.map(payment => payment.invoice_id).filter(Boolean));
                let periodInvoices = hasPaymentDateFilter
                    ? subInvoices.filter(inv => paidInvoiceIdsInRange.has(inv.id))
                    : periodInvoicesBase;

                if (hasPaymentDateFilter && periodInvoices.length === 0 && subPayments.length > 0) {
                    periodInvoices = periodInvoicesBase.length > 0
                        ? periodInvoicesBase
                        : subInvoices.filter(inv => (inv.amount_paid || 0) > 0 || inv.payment_status === 'Paid');
                }

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

                if (statusTab !== 'All') {
                    periodInvoices = periodInvoices.filter(inv => getEffectiveStatus(inv) === statusTab);
                }

                periodInvoices = periodInvoices.sort((a, b) => {
                    const latestA = subPayments.find(payment => payment.invoice_id === a.id)?.settlement_date;
                    const latestB = subPayments.find(payment => payment.invoice_id === b.id)?.settlement_date;
                    if (latestA || latestB) {
                        return new Date(latestB || '1900-01-01').getTime() - new Date(latestA || '1900-01-01').getTime();
                    }
                    return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
                });

                if (periodInvoices.length === 0) return;

                // Adjust periodInvoices if filter is active?
                // Actually, Admin logic renders 'periodInvoices' specifically for the table.
                // If filtering by status, we might show valid invoices from history too if Unpaid.

                const totalPaid = subInvoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
                if (sub.promised_date && periodInvoices.length > 0) {
                    extensionToCollect += Number(sub.balance) || 0;
                    extensionCollected += subPayments.reduce((sum, payment) => {
                        const inSelectedRange = hasPaymentDateFilter
                            ? (!paymentDateFrom || payment.settlement_date >= paymentDateFrom) && (!paymentDateTo || payment.settlement_date <= paymentDateTo)
                            : hasBillingDateRangeFilter
                                ? Boolean(payment.invoice_id && invoiceIdsForStats.has(payment.invoice_id))
                                : payment.settlement_date?.startsWith(selectedMonth);
                        if (!inSelectedRange) return sum;
                        if (payment.mode === 'Referral Credit') return sum;
                        return sum + (Number(payment.amount) || 0);
                    }, 0);
                }

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
                .sort((a, b) => {
                    const latestA = Math.max(
                        0,
                        ...a.subscriptions.flatMap(sub => sub.payments.map(payment => new Date(payment.settlement_date).getTime()))
                    );
                    const latestB = Math.max(
                        0,
                        ...b.subscriptions.flatMap(sub => sub.payments.map(payment => new Date(payment.settlement_date).getTime()))
                    );

                    if (latestA !== latestB) return latestB - latestA;
                    return a.customer.name.localeCompare(b.customer.name);
                });

            setGroupedData(grouped);
            setMonthlyStats({
                billed: statsBilled,
                collected: statsCollected,
                unpaidCount: statsUnpaidCount,
                extensionToCollect,
                extensionCollected
            });
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
        setShowPayAllConfirm(false);
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
            setShowPayAllConfirm(false);
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

    const getLatestInvoicePayment = (payments: Payment[], invoice: Invoice) => {
        return payments
            .filter(payment =>
                payment.invoice_id === invoice.id ||
                (!payment.invoice_id && payment.settlement_date >= invoice.from_date)
            )
            .sort((a, b) => new Date(b.settlement_date).getTime() - new Date(a.settlement_date).getTime())[0];
    };

    const selectedBusinessUnitLabel = selectedBusinessUnit === 'all'
        ? 'All Business Units'
        : isBusinessUnitCycleFilter(selectedBusinessUnit)
            ? BUSINESS_UNIT_CYCLE_FILTERS[selectedBusinessUnit]
        : businessUnits.find(bu => bu.id === selectedBusinessUnit)?.name || 'Selected Business Unit';
    const selectedPeriodLabel = reportFilterMode === 'month'
        ? new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : reportFilterMode === 'billing-date-range'
            ? `${billingDateFrom || 'Start'} to ${billingDateTo || 'Today'}`
            : `${paymentDateFrom || 'Start'} to ${paymentDateTo || 'Today'}`;
    const selectedArrangementLabel = paymentExtensionFilter === 'extension'
        ? 'Customers with payment extension'
        : paymentExtensionFilter === 'non-extension'
            ? 'Regular billing customers'
            : 'All payment arrangements';
    const selectedStatusLabel = statusTab === 'All' ? 'All statuses' : statusTab;
    const sortByLabel = {
        name: 'Customer Name',
        payment_date: 'Payment Date',
        business_unit: 'Business Unit',
        total_due: 'Total Due',
        invoice_status: 'Invoice Status',
        payment_arrangement: 'Payment Arrangement'
    }[sortBy];

    const getGroupLatestPaymentTime = (group: GroupedData) => Math.max(
        0,
        ...group.subscriptions.flatMap(sub => sub.payments.map(payment => new Date(payment.settlement_date).getTime()))
    );

    const getGroupBusinessUnitName = (group: GroupedData) => {
        return getSubscriptionBusinessUnitName(group.subscriptions[0]?.subscription);
    };

    const getGroupTotalDue = (group: GroupedData) =>
        group.subscriptions.reduce((sum, sub) => sum + (Number(sub.totalDue) || 0), 0);

    const getGroupStatusText = (group: GroupedData) => {
        const statuses = group.subscriptions.flatMap(sub => sub.periodInvoices.map(inv => getEffectiveStatus(inv)));
        if (statuses.includes('Unpaid')) return 'Unpaid';
        if (statuses.includes('Partially Paid')) return 'Partially Paid';
        if (statuses.includes('Pending Verification')) return 'Pending Verification';
        if (statuses.includes('Paid')) return 'Paid';
        return 'No Invoice';
    };

    const getSortValue = (group: GroupedData) => {
        switch (sortBy) {
            case 'payment_date':
                return getGroupLatestPaymentTime(group);
            case 'business_unit':
                return getGroupBusinessUnitName(group).toLowerCase();
            case 'total_due':
                return getGroupTotalDue(group);
            case 'invoice_status':
                return getGroupStatusText(group);
            case 'payment_arrangement':
                return group.subscriptions.some(sub => Boolean(sub.subscription.promised_date)) ? 'With extension' : 'No extension';
            case 'name':
            default:
                return group.customer.name.toLowerCase();
        }
    };

    // Filter and paginate
    const filtered = groupedData
        .filter(g =>
            g.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            g.customer.mobile_number?.includes(searchQuery)
        )
        .sort((a, b) => {
            const aValue = getSortValue(a);
            const bValue = getSortValue(b);
            const direction = sortDirection === 'asc' ? 1 : -1;

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return (aValue - bValue) * direction;
            }

            return String(aValue).localeCompare(String(bValue)) * direction;
        });
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const escapeReportHtml = (value: unknown) =>
        String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[char] || char));

    const downloadReport = () => {
        const rows = filtered.flatMap(group =>
            group.subscriptions.map(({ subscription, payments, periodInvoices, totalDue }) => {
                const latestPayment = payments[0];
                const unit = subscription.business_units as any;
                const businessUnitName = Array.isArray(unit) ? unit[0]?.name || '' : unit?.name || '';
                return {
                    customer: group.customer.name,
                    phone: group.customer.mobile_number || '',
                    businessUnit: businessUnitName || '-',
                    plan: subscription.plans?.name || 'Unknown Plan',
                    location: subscription.label || subscription.address || 'No location',
                    latestPayment: latestPayment
                        ? `${new Date(latestPayment.settlement_date).toLocaleDateString()} - ${latestPayment.mode} - PHP ${Math.round(latestPayment.amount).toLocaleString()}`
                        : 'No payment',
                    balance: `PHP ${Math.round(totalDue).toLocaleString()}`,
                    status: periodInvoices.length ? periodInvoices.map(inv => getEffectiveStatus(inv)).join(', ') : 'No invoice',
                    arrangement: subscription.promised_date ? `With extension (${new Date(subscription.promised_date).toLocaleDateString()})` : 'No extension'
                };
            })
        );

        const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Invoices & Payments Report</title>
<style>
body{font-family:Arial,sans-serif;margin:32px;color:#111}
h1{margin:0 0 4px;font-size:22px}
.muted{color:#555;font-size:12px}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}
.box{border:1px solid #ddd;border-radius:8px;padding:10px}
.label{font-size:11px;color:#666;text-transform:uppercase}
.value{font-weight:700;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}
th{background:#f3f4f6;text-transform:uppercase;font-size:11px}
@media print{body{margin:16px}.no-print{display:none}}
</style>
</head>
<body>
<button class="no-print" onclick="window.print()">Print / Save PDF</button>
<h1>Invoices & Payments Report</h1>
<div class="muted">Generated ${new Date().toLocaleString()}</div>
<div class="summary">
<div class="box"><div class="label">Period</div><div class="value">${escapeReportHtml(selectedPeriodLabel)}</div></div>
<div class="box"><div class="label">Business Unit</div><div class="value">${escapeReportHtml(selectedBusinessUnitLabel)}</div></div>
<div class="box"><div class="label">Arrangement</div><div class="value">${escapeReportHtml(selectedArrangementLabel)}</div></div>
<div class="box"><div class="label">Order</div><div class="value">${escapeReportHtml(`${sortByLabel} ${sortDirection.toUpperCase()}`)}</div></div>
</div>
<div class="summary">
<div class="box"><div class="label">Cash</div><div class="value">PHP ${Math.round(cashCollected).toLocaleString()}</div></div>
<div class="box"><div class="label">E-Wallet</div><div class="value">PHP ${Math.round(ewalletCollected).toLocaleString()}</div></div>
<div class="box"><div class="label">Unpaid</div><div class="value">${monthlyStats.unpaidCount}</div></div>
<div class="box"><div class="label">Customers Shown</div><div class="value">${filtered.length}</div></div>
</div>
<table>
<thead><tr><th>Customer</th><th>Business Unit</th><th>Plan / Location</th><th>Latest Payment</th><th>Balance</th><th>Status</th><th>Arrangement</th></tr></thead>
<tbody>
${rows.map(row => `<tr>
<td><strong>${escapeReportHtml(row.customer)}</strong><br><span class="muted">${escapeReportHtml(row.phone)}</span></td>
<td>${escapeReportHtml(row.businessUnit)}</td>
<td>${escapeReportHtml(row.plan)}<br><span class="muted">${escapeReportHtml(row.location)}</span></td>
<td>${escapeReportHtml(row.latestPayment)}</td>
<td>${escapeReportHtml(row.balance)}</td>
<td>${escapeReportHtml(row.status)}</td>
<td>${escapeReportHtml(row.arrangement)}</td>
</tr>`).join('')}
</tbody>
</table>
</body>
</html>`;

        const reportFileName = `invoices-payments-report-${selectedPeriodLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`;
        const openPrintableReport = () => {
            const reportWindow = window.open('', '_blank');
            if (!reportWindow) return false;
            reportWindow.document.open();
            reportWindow.document.write(html);
            reportWindow.document.close();
            reportWindow.document.title = reportFileName;
            return true;
        };
        const isIosLike = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (isIosLike && openPrintableReport()) {
            return;
        }

        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = reportFileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

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
                                For {selectedPeriodLabel}
                                {selectedBusinessUnit !== 'all' && (
                                    <span className="ml-2 px-2 py-0.5 bg-amber-900/40 text-amber-400 rounded">
                                        {selectedBusinessUnitLabel}
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

                    {/* Stats & Actions Container */}
                    <div className="flex flex-col xl:flex-row xl:items-start gap-4 w-full lg:w-auto mt-4 lg:mt-0">
                        {/* Stats */}
                        <div className="flex flex-wrap justify-start xl:justify-end gap-2 w-full xl:w-auto">
                            <div className="w-full sm:w-[190px] px-3 sm:px-4 py-2 bg-sky-950/30 rounded-xl border border-sky-700/50">
                                <div className="text-[10px] sm:text-xs text-sky-300 whitespace-nowrap">Payment Extension</div>
                                <div className="mt-1 flex items-end justify-between gap-3">
                                    <div>
                                        <div className="text-[10px] text-gray-500 whitespace-nowrap">To Collect</div>
                                        <div className="text-sm sm:text-base font-bold text-sky-200">₱{Math.round(monthlyStats.extensionToCollect).toLocaleString()}</div>
                                    </div>
                                    <div className="h-8 border-l border-sky-700/40" />
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-500 whitespace-nowrap">Collected</div>
                                        <div className="text-sm sm:text-base font-bold text-emerald-300">₱{Math.round(monthlyStats.extensionCollected).toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="w-full sm:w-[360px] px-3 sm:px-4 py-2 bg-[#111018] rounded-xl border border-gray-700/70">
                                <div className="grid grid-cols-3 divide-x divide-gray-700/70">
                                    <div className="pr-3">
                                        <div className="text-[10px] sm:text-xs text-purple-400 whitespace-nowrap">Total Billed</div>
                                        <div className="text-sm sm:text-lg font-bold text-purple-300">₱{Math.round(monthlyStats.billed).toLocaleString()}</div>
                                    </div>
                                    <div className="px-3">
                                        <div className="text-[10px] sm:text-xs text-emerald-400 whitespace-nowrap">Collected</div>
                                        <div className="text-sm sm:text-lg font-bold text-emerald-300">₱{Math.round(monthlyStats.collected).toLocaleString()}</div>
                                    </div>
                                    <div className="pl-3">
                                        <div className="text-[10px] sm:text-xs text-red-400 whitespace-nowrap">Unpaid</div>
                                        <div className="text-sm sm:text-lg font-bold text-red-300">{monthlyStats.unpaidCount}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex shrink-0 w-full xl:w-auto gap-2 mt-2 xl:mt-0">
                            <button
                                onClick={() => setIsQuickCollectOpen(true)}
                                className="flex-1 xl:flex-none justify-center px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl transition-colors flex items-center gap-1.5 sm:gap-2 text-sm font-medium shadow-lg shadow-amber-900/20 whitespace-nowrap"
                            >
                                <Zap className="w-4 h-4" />
                                Quick Collect
                            </button>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="mt-4 space-y-4 border-t border-gray-800 pt-4">
                    <div className="flex flex-wrap items-end gap-2">
                        <label className="w-full space-y-1 sm:w-40">
                            <span className="text-xs text-gray-500">Business Unit</span>
                            <select
                                value={selectedBusinessUnit}
                                onChange={(e) => {
                                    setSelectedBusinessUnit(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                            >
                                <option value="all">All Business Units</option>
                                {businessUnits.map(bu => (
                                    <option key={bu.id} value={bu.id}>{bu.name}</option>
                                ))}
                                <option value="malanggam_extension_30th">Malanggam + Extension (30th)</option>
                                <option value="extension_15th">Extension (15th)</option>
                            </select>
                        </label>

                        <label className="w-full space-y-1 sm:w-36">
                            <span className="text-xs text-gray-500">Filter By</span>
                            <select
                                value={reportFilterMode}
                                onChange={(e) => {
                                    const mode = e.target.value as ReportFilterMode;
                                    setReportFilterMode(mode);
                                    setCurrentPage(1);
                                    if (mode === 'billing-date-range' && !billingDateFrom && !billingDateTo) {
                                        const [year, month] = selectedMonth.split('-').map(Number);
                                        const lastDay = new Date(year, month, 0).getDate();
                                        setBillingDateFrom(`${year}-${String(month).padStart(2, '0')}-01`);
                                        setBillingDateTo(`${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
                                    }
                                    if (mode === 'date-range' && !paymentDateFrom && !paymentDateTo) {
                                        const [year, month] = selectedMonth.split('-').map(Number);
                                        const lastDay = new Date(year, month, 0).getDate();
                                        setPaymentDateFrom(`${year}-${String(month).padStart(2, '0')}-01`);
                                        setPaymentDateTo(`${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
                                    }
                                }}
                                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                            >
                                <option value="month">Billing Month</option>
                                <option value="billing-date-range">Billing Date Range</option>
                                <option value="date-range">Payment Date Range</option>
                            </select>
                        </label>

                        {reportFilterMode === 'month' ? (
                            <label className="w-full space-y-1 sm:w-36">
                                <span className="text-xs text-gray-500">Billing Month</span>
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => {
                                        setSelectedMonth(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                                />
                            </label>
                        ) : (
                            <div className="w-full space-y-1 sm:w-[260px]">
                                <span className="text-xs text-gray-500">{reportFilterMode === 'billing-date-range' ? 'Billing Date Range' : 'Payment Date Range'}</span>
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="date"
                                        value={reportFilterMode === 'billing-date-range' ? billingDateFrom : paymentDateFrom}
                                        onChange={(e) => {
                                            if (reportFilterMode === 'billing-date-range') {
                                                setBillingDateFrom(e.target.value);
                                            } else {
                                                setPaymentDateFrom(e.target.value);
                                            }
                                            setCurrentPage(1);
                                        }}
                                        className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                                    />
                                    <input
                                        type="date"
                                        value={reportFilterMode === 'billing-date-range' ? billingDateTo : paymentDateTo}
                                        min={(reportFilterMode === 'billing-date-range' ? billingDateFrom : paymentDateFrom) || undefined}
                                        onChange={(e) => {
                                            if (reportFilterMode === 'billing-date-range') {
                                                setBillingDateTo(e.target.value);
                                            } else {
                                                setPaymentDateTo(e.target.value);
                                            }
                                            setCurrentPage(1);
                                        }}
                                        className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                                    />
                                </div>
                            </div>
                        )}

                        <label className="w-full space-y-1 sm:w-44">
                            <span className="text-xs text-gray-500">Payment Arrangement</span>
                            <select
                                value={paymentExtensionFilter}
                                onChange={(e) => {
                                    setPaymentExtensionFilter(e.target.value as PaymentExtensionFilter);
                                    setCurrentPage(1);
                                }}
                                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                            >
                                <option value="all">All customers</option>
                                <option value="extension">With extension</option>
                                <option value="non-extension">No extension</option>
                            </select>
                        </label>

                        {reportFilterMode !== 'date-range' && (
                            <label className="w-full space-y-1 sm:w-36">
                                <span className="text-xs text-gray-500">Invoice Status</span>
                                <select
                                    value={statusTab}
                                    onChange={(e) => {
                                        setStatusTab(e.target.value as typeof statusTab);
                                        setCurrentPage(1);
                                    }}
                                    className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                                >
                                    <option value="All">All statuses</option>
                                    <option value="Unpaid">Unpaid</option>
                                    <option value="Partially Paid">Partially Paid</option>
                                    <option value="Paid">Paid</option>
                                </select>
                            </label>
                        )}

                        <label className="w-full space-y-1 sm:w-40">
                            <span className="text-xs text-gray-500">Order By</span>
                            <select
                                value={sortBy}
                                onChange={(e) => {
                                    setSortBy(e.target.value as InvoiceSortBy);
                                    setCurrentPage(1);
                                }}
                                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                            >
                                <option value="payment_date">Payment Date</option>
                                <option value="name">Customer Name</option>
                                <option value="business_unit">Business Unit</option>
                                <option value="total_due">Total Due</option>
                                {reportFilterMode !== 'date-range' && <option value="invoice_status">Invoice Status</option>}
                                <option value="payment_arrangement">Payment Arrangement</option>
                            </select>
                        </label>

                        <label className="w-full space-y-1 sm:w-24">
                            <span className="text-xs text-gray-500">Direction</span>
                            <select
                                value={sortDirection}
                                onChange={(e) => {
                                    setSortDirection(e.target.value as SortDirection);
                                    setCurrentPage(1);
                                }}
                                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                            >
                                <option value="desc">DESC</option>
                                <option value="asc">ASC</option>
                            </select>
                        </label>

                        <label className="w-full flex-1 space-y-1 sm:min-w-44">
                            <span className="text-xs text-gray-500">Search</span>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={searchQuery}
                                        onChange={(e) => {
                                            setSearchQuery(e.target.value);
                                            setCurrentPage(1);
                                        }}
                                        className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                                    />
                                </div>
                                <button
                                    onClick={fetchData}
                                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                                    title="Refresh report"
                                >
                                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </label>

                        <button
                            onClick={() => setShowReportPreview(true)}
                            className="w-full rounded-xl border border-blue-700/50 bg-blue-900/30 px-4 py-2 text-sm font-medium text-blue-100 transition-colors hover:bg-blue-800/40 sm:w-auto"
                        >
                            Preview Report
                        </button>
                    </div>

                    <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-blue-200">Report View</span>
                            <span className="rounded-full bg-blue-900/40 px-2.5 py-1 text-blue-100">{selectedPeriodLabel}</span>
                            <span className="rounded-full bg-gray-800 px-2.5 py-1 text-gray-200">{selectedBusinessUnitLabel}</span>
                            <span className="rounded-full bg-gray-800 px-2.5 py-1 text-gray-200">{selectedArrangementLabel}</span>
                            <span className="rounded-full bg-gray-800 px-2.5 py-1 text-gray-200">{selectedStatusLabel}</span>
                            <span className="rounded-full bg-gray-800 px-2.5 py-1 text-gray-200">Order: {sortByLabel} {sortDirection.toUpperCase()}</span>
                        </div>
                        <p className="mt-2 text-xs text-blue-200/70">
                            Payment arrangement means customers with a promised payment date. Use "With extension" to track accounts that were allowed to pay later.
                        </p>
                    </div>
                </div>
            </div>

            {showReportPreview && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowReportPreview(false)} />
                    <div className="relative w-full max-w-6xl max-h-[88vh] overflow-hidden rounded-2xl border border-gray-800 bg-[#0a0a0a] shadow-2xl">
                        <div className="flex items-start justify-between border-b border-gray-800 p-5">
                            <div>
                                <h2 className="text-xl font-bold text-white">Invoices & Payments Report Preview</h2>
                                <p className="mt-1 text-sm text-gray-400">Review the filtered list before collection or remittance.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={downloadReport}
                                    className="rounded-lg border border-emerald-700/50 bg-emerald-900/30 px-4 py-2 text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-800/40"
                                >
                                    Download Report
                                </button>
                                <button
                                    onClick={() => setShowReportPreview(false)}
                                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[calc(88vh-88px)] overflow-auto p-5">
                            <div className="rounded-xl border border-gray-800 bg-[#111111] p-4">
                                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                                    <div>
                                        <div className="text-xs uppercase text-gray-500">Period</div>
                                        <div className="font-semibold text-white">{selectedPeriodLabel}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs uppercase text-gray-500">Business Unit</div>
                                        <div className="font-semibold text-white">{selectedBusinessUnitLabel}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs uppercase text-gray-500">Arrangement</div>
                                        <div className="font-semibold text-white">{selectedArrangementLabel}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs uppercase text-gray-500">Order</div>
                                        <div className="font-semibold text-white">{sortByLabel} {sortDirection.toUpperCase()}</div>
                                    </div>
                                </div>
                                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                                    <div className="rounded-lg bg-amber-950/30 p-3">
                                        <div className="text-xs text-amber-300">Cash</div>
                                        <div className="text-lg font-bold text-amber-100">₱{Math.round(cashCollected).toLocaleString()}</div>
                                    </div>
                                    <div className="rounded-lg bg-violet-950/30 p-3">
                                        <div className="text-xs text-violet-300">E-Wallet</div>
                                        <div className="text-lg font-bold text-violet-100">₱{Math.round(ewalletCollected).toLocaleString()}</div>
                                    </div>
                                    <div className="rounded-lg bg-red-950/30 p-3">
                                        <div className="text-xs text-red-300">Unpaid</div>
                                        <div className="text-lg font-bold text-red-100">{monthlyStats.unpaidCount}</div>
                                    </div>
                                    <div className="rounded-lg bg-sky-950/30 p-3">
                                        <div className="text-xs text-sky-300">Customers Shown</div>
                                        <div className="text-lg font-bold text-sky-100">{filtered.length}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 overflow-hidden rounded-xl border border-gray-800">
                                <table className="w-full min-w-[980px] text-sm">
                                    <thead className="bg-[#1a1a1a] text-xs uppercase text-gray-500">
                                        <tr>
                                            <th className="p-3 text-left">Customer</th>
                                            <th className="p-3 text-left">Business Unit</th>
                                            <th className="p-3 text-left">Plan / Location</th>
                                            <th className="p-3 text-left">Latest Payment</th>
                                            <th className="p-3 text-right">Balance</th>
                                            <th className="p-3 text-left">Status</th>
                                            <th className="p-3 text-left">Arrangement</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {filtered.flatMap(group =>
                                            group.subscriptions.map(({ subscription, payments, periodInvoices, totalDue }) => {
                                                const latestPayment = payments[0];
                                                return (
                                                    <tr key={`${group.customer.id}-${subscription.id}`} className="text-gray-300">
                                                        <td className="p-3">
                                                            <div className="font-medium text-white">{group.customer.name}</div>
                                                            <div className="text-xs text-gray-500">{group.customer.mobile_number || 'No phone'}</div>
                                                        </td>
                                                        <td className="p-3">{getGroupBusinessUnitName({ customer: group.customer, subscriptions: [{ subscription, invoices: [], periodInvoices, payments, totalPaid: 0, totalDue, balance: totalDue }] }) || '-'}</td>
                                                        <td className="p-3">
                                                            <div>{subscription.plans?.name || 'Unknown Plan'}</div>
                                                            <div className="text-xs text-gray-500">{subscription.label || subscription.address || 'No location'}</div>
                                                        </td>
                                                        <td className="p-3">
                                                            {latestPayment ? (
                                                                <div>
                                                                    <div className="text-emerald-300">{new Date(latestPayment.settlement_date).toLocaleDateString()}</div>
                                                                    <div className="text-xs text-gray-500">{latestPayment.mode} • ₱{Math.round(latestPayment.amount).toLocaleString()}</div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-600">No payment</span>
                                                            )}
                                                        </td>
                                                        <td className="p-3 text-right font-semibold text-white">₱{Math.round(totalDue).toLocaleString()}</td>
                                                        <td className="p-3">{periodInvoices.length ? periodInvoices.map(inv => getEffectiveStatus(inv)).join(', ') : 'No invoice'}</td>
                                                        <td className="p-3">{subscription.promised_date ? `With extension (${new Date(subscription.promised_date).toLocaleDateString()})` : 'No extension'}</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                                ? selectedBusinessUnitLabel
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
                                                                        <th className="text-left p-3">Payment Date</th>
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
                                                                                    <td colSpan={5} className="p-3 text-center border-b border-gray-800/50">
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
                                                                            <td colSpan={5} className="p-4 text-center text-gray-500">
                                                                                No invoices for this period
                                                                            </td>
                                                                        </tr>
                                                                    ) : (
                                                                        periodInvoices.map(invoice => (
                                                                            <tr key={invoice.id} className="hover:bg-[#151515]">
                                                                                <td className="p-3 text-white">
                                                                                    {new Date(invoice.due_date).toLocaleDateString()}
                                                                                </td>
                                                                                <td className="p-3">
                                                                                    {(() => {
                                                                                        const latestPayment = getLatestInvoicePayment(payments, invoice);
                                                                                        return latestPayment ? (
                                                                                            <div>
                                                                                                <div className="text-emerald-300">{new Date(latestPayment.settlement_date).toLocaleDateString()}</div>
                                                                                                <div className="text-[10px] text-gray-500">{latestPayment.mode} • ₱{Math.round(latestPayment.amount).toLocaleString()}</div>
                                                                                            </div>
                                                                                        ) : (
                                                                                            <span className="text-gray-600">-</span>
                                                                                        );
                                                                                    })()}
                                                                                </td>
                                                                                <td className="p-3 text-gray-400">
                                                                                    {new Date(invoice.from_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(invoice.to_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                                </td>
                                                                                <td className="p-3 text-right text-white font-medium">
                                                                                    ₱{Math.round((invoice.original_amount && invoice.original_amount > 0)
                                                                                        ? Math.max(0, invoice.original_amount - (invoice.discount_applied || 0) - (invoice.credits_applied || 0))
                                                                                        : invoice.amount_due
                                                                                    ).toLocaleString()}
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
            {payAllData && (() => {
                const totalDue = payAllData.totalAmount;
                const enteredAmount = parseFloat(payAllForm.amount) || 0;
                const remainingBalance = totalDue - enteredAmount;
                const isOverpaid = enteredAmount > totalDue;

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setPayAllData(null)} />

                        <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-amber-900/50 rounded-2xl shadow-[0_0_60px_rgba(245,158,11,0.15)] w-full max-w-md overflow-hidden">
                            <div className="relative p-6 border-b border-gray-800/50">
                                <div className="absolute inset-0 bg-gradient-to-r from-amber-600/10 via-orange-600/10 to-yellow-600/10" />
                                <div className="relative flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center shadow-lg">
                                        <Wallet className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Pay All Invoices</h2>
                                        <p className="text-sm text-gray-400">{payAllData.customer.name}</p>
                                    </div>
                                </div>
                                <button onClick={() => setPayAllData(null)} className="absolute top-4 right-4 text-gray-500 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {showPayAllConfirm ? (
                                <div className="p-6 space-y-6">
                                    <div className="text-center space-y-2">
                                        <div className="w-16 h-16 mx-auto rounded-full bg-amber-950/80 border border-amber-500/50 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)] animate-pulse">
                                            <Info className="w-8 h-8 text-amber-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-white">Confirm Settle All</h3>
                                        <p className="text-sm text-gray-400">Are you sure you want to settle all outstanding invoices for this subscriber?</p>
                                    </div>

                                    <div className="bg-gray-950/80 border border-gray-800/50 rounded-xl p-4 space-y-3">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-400">Customer</span>
                                            <span className="text-white font-medium">{payAllData.customer.name}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-400">Invoices Settle</span>
                                            <span className="text-amber-400 font-semibold">{payAllData.invoices.length} unpaid invoice(s)</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-400">Payment Mode</span>
                                            <span className="text-amber-400 font-semibold">{payAllForm.mode}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-400">Settlement Date</span>
                                            <span className="text-white font-medium">{payAllForm.settlementDate}</span>
                                        </div>
                                        {payAllForm.notes && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-400">Notes</span>
                                                <span className="text-white font-medium truncate max-w-[200px]">{payAllForm.notes}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-sm border-t border-gray-900 pt-3">
                                            <span className="text-gray-300 font-semibold">Total Outstanding</span>
                                            <span className="text-gray-300">₱{Math.round(totalDue).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-amber-400 font-semibold">Total Payment Amount</span>
                                            <span className="text-amber-400 text-lg font-bold">₱{Math.round(enteredAmount).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-sm border-t border-gray-900 pt-3">
                                            <span className="text-gray-400">New Balance</span>
                                            <span className={`font-bold ${remainingBalance <= 0 ? 'text-green-400' : 'text-amber-500'}`}>
                                                ₱{Math.round(Math.max(0, remainingBalance)).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            onClick={handlePayAll}
                                            disabled={isSubmitting}
                                            className="w-full py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl font-semibold shadow-lg shadow-amber-955/30 flex items-center justify-center gap-2 transition-all"
                                        >
                                            {isSubmitting ? 'Recording Settle...' : 'Yes, Settle All Invoices'}
                                        </button>
                                        <button
                                            onClick={() => setShowPayAllConfirm(false)}
                                            disabled={isSubmitting}
                                            className="w-full py-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 rounded-xl font-medium transition-all"
                                        >
                                            Cancel / Edit
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="p-6 space-y-4">
                                        {/* Invoices summary */}
                                        <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/50 space-y-2">
                                            <div className="text-xs text-gray-500 mb-2">{payAllData.invoices.length} unpaid invoice(s)</div>
                                            {payAllData.invoices
                                                .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
                                                .map(inv => (
                                                    <div key={inv.id} className="flex justify-between text-xs">
                                                        <span className="text-gray-400">
                                                            {new Date(inv.from_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(inv.to_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                        </span>
                                                        <span className="text-white">₱{Math.round(inv.amount_due - (inv.amount_paid || 0)).toLocaleString()}</span>
                                                    </div>
                                                ))}

                                            {(() => {
                                                const subtotal = payAllData.invoiceSum || 0;
                                                const totalToPay = payAllData.totalAmount;
                                                const creditAmount = subtotal - totalToPay;
                                                const penaltyAmount = totalToPay - subtotal;

                                                return (
                                                    <>
                                                        <div className="border-t border-gray-700/50 pt-2 mt-2 space-y-1">
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-gray-400">Subtotal</span>
                                                                <span className="text-white">₱{Math.round(subtotal).toLocaleString()}</span>
                                                            </div>

                                                            {creditAmount > 0 && Math.abs(creditAmount) > 1 && (
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-emerald-400">Credits / Adjustments</span>
                                                                    <span className="text-emerald-400">-₱{Math.round(creditAmount).toLocaleString()}</span>
                                                                </div>
                                                            )}

                                                            {penaltyAmount > 0 && Math.abs(penaltyAmount) > 1 && (
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-amber-400">Other Charges / Penalties</span>
                                                                    <span className="text-amber-400">+₱{Math.round(penaltyAmount).toLocaleString()}</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="border-t border-gray-700/50 pt-2 mt-2 flex justify-between">
                                                            <span className="text-sm font-medium text-gray-300">Total Outstanding</span>
                                                            <span className="text-sm font-bold text-white">₱{Math.round(totalToPay).toLocaleString()}</span>
                                                        </div>
                                                    </>
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

                                        {/* Live Balance Preview Block */}
                                        <div className="bg-gray-950/80 rounded-xl p-4 border border-amber-950/20 space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-400">Total Outstanding:</span>
                                                <span className="text-white font-medium">₱{Math.round(totalDue).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-sm border-t border-gray-900 pt-2">
                                                <span className="text-gray-400">Entered Payment:</span>
                                                <span className="text-amber-400 font-semibold">₱{Math.round(enteredAmount).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-sm border-t border-gray-900 pt-2">
                                                <span className="text-gray-400">Remaining Balance:</span>
                                                <span className={`font-bold ${remainingBalance <= 0 ? 'text-green-400' : 'text-amber-500'}`}>
                                                    ₱{Math.round(Math.max(0, remainingBalance)).toLocaleString()}
                                                </span>
                                            </div>
                                            {isOverpaid && (
                                                <div className="flex items-center gap-2 mt-2 p-2.5 bg-red-950/30 border border-red-900/50 rounded-lg text-xs text-red-400 animate-pulse">
                                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                                    <span>Amount exceeds total outstanding balance.</span>
                                                </div>
                                            )}
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
                                    </div>

                                    <div className="p-6 border-t border-gray-800/50 flex justify-end gap-3">
                                        <button
                                            onClick={() => setPayAllData(null)}
                                            className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => setShowPayAllConfirm(true)}
                                            disabled={!payAllForm.amount || isOverpaid || parseFloat(payAllForm.amount) <= 0}
                                            className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl font-medium shadow-lg disabled:opacity-50"
                                        >
                                            Continue
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                );
            })()}

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
