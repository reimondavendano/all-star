'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
    Users, DollarSign, AlertCircle, TrendingUp, RefreshCw, Wifi,
    CreditCard, Activity, FileText, Calendar, ChevronRight,
    ArrowUpRight, ArrowDownRight, Building2, Loader2,
    Send, Download, Clock, CheckCircle, XCircle, Zap, Shield, Banknote
} from 'lucide-react';
import { useMultipleRealtimeSubscriptions } from '@/hooks/useRealtimeSubscription';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { getMikrotikData } from '@/app/actions/mikrotik';
import { toggleTunnel } from '@/app/actions/system';
import ConfirmationDialog from '@/components/shared/ConfirmationDialog';

interface DashboardData {
    totalCustomers: number;
    activeSubscriptions: number;
    monthlyRevenue: number;
    outstandingAmount: number;
    collectionRate: number;
    unpaidInvoicesCount: number;
    previousMonthRevenue: number;
    customerGrowth: number;
    businessUnitPerformance: BusinessUnitPerformance[];
    revenueByMonth: MonthlyRevenue[];
    paymentStatusCounts: { paid: number; unpaid: number; partial: number };
    planDistribution: PlanDistribution[];
    recentActivities: RecentActivity[];
    topDelinquents: DelinquentAccount[];
    expensesSummary: ExpensesSummary;
    subscriptionStats: SubscriptionStats;
    paymentMethodsBreakdown: { method: string; total: number; count: number }[];
}

interface BusinessUnitPerformance {
    name: string;
    billed: number;
    collected: number;
    outstanding: number;
    subscribers: number;
    cashRevenue: number;
}

interface MonthlyRevenue {
    month: string;
    billed: number;
    collected: number;
    outstanding: number;
}

interface PlanDistribution {
    name: string;
    count: number;
    revenue: number;
}

interface RecentActivity {
    id: string;
    type: 'payment' | 'invoice' | 'subscriber' | 'overdue';
    customerName: string;
    action: string;
    amount?: number;
    timestamp: string;
}

interface DelinquentAccount {
    customerName: string;
    businessUnit: string;
    balance: number;
    unpaidCount: number;
    lastPayment: string | null;
}

interface ExpensesSummary {
    total: number;
    breakdown: { reason: string; count: number; total: number }[];
}

interface SubscriptionStats {
    active: number;
    inactive: number;
    newThisMonth: number;
}

export default function DashboardPage() {
    const router = useRouter();
    const [data, setData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [mounted, setMounted] = useState(false);
    const [mikrotikStatus, setMikrotikStatus] = useState<'checking' | 'online' | 'offline'>('offline');

    // Tunnel Control State
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<'start' | 'stop' | null>(null);
    const [isLoadingTunnel, setIsLoadingTunnel] = useState(false);

    const [selectedPeriod, setSelectedPeriod] = useState(() => {
        // Default to current month in format "Month Year"
        const now = new Date();
        return `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`;
    });
    const [selectedBusinessUnit, setSelectedBusinessUnit] = useState('all');
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
    const [periodOptions, setPeriodOptions] = useState<string[]>([]);

    // Real-time subscriptions for dashboard data
    useMultipleRealtimeSubscriptions(
        ['customers', 'subscriptions', 'invoices', 'payments', 'expenses'],
        (table, payload) => {
            console.log(`[Dashboard Realtime] ${table} changed:`, payload.eventType);
            // Debounce the refresh to avoid too many calls
            fetchDashboardData();
        }
    );

    useEffect(() => {
        setMounted(true);
        // Check Mikrotik Status
        const checkStatus = async () => {
            try {
                // Just fetch resources to check connectivity
                const result = await getMikrotikData();
                if (result.success) {
                    setMikrotikStatus('online');
                } else {
                    setMikrotikStatus('offline');
                }
            } catch (error) {
                // console.error('Failed to check Mikrotik status:', error);
                setMikrotikStatus('offline');
            }
        };

        checkStatus();

        // Poll every 30 seconds
        const interval = setInterval(checkStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleStatusClick = () => {
        if (mikrotikStatus === 'online') {
            // It's ON, ask to turn OFF
            setConfirmAction('stop');
            setIsConfirmOpen(true);
        } else {
            // It's OFF (or checking), ask to turn ON
            setConfirmAction('start');
            setIsConfirmOpen(true);
        }
    };

    const handleConfirmToggle = async () => {
        if (!confirmAction) return;

        // 1. Close the Confirmation Dialog immediately
        setIsConfirmOpen(false);

        // 2. Start Loading State (Triggers Global Overlay)
        setIsLoadingTunnel(true);

        try {
            const result = await toggleTunnel(confirmAction);

            if (!result.success) {
                alert(`Failed to ${confirmAction} tunnel: ${result.message}`);
                // Stop loading immediately on error
                setIsLoadingTunnel(false);
            } else {
                if (confirmAction === 'start') {
                    // 3. For START: Keep overlay for 8 seconds to allow window to open and connect
                    await new Promise(resolve => setTimeout(resolve, 8000));

                    // 4. Check status after delay
                    const res = await getMikrotikData();
                    setMikrotikStatus(res.success ? 'online' : 'offline');
                } else {
                    // 3. For STOP: Short delay for UX
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    setMikrotikStatus('offline');
                }
            }
        } catch (error) {
            console.error('Tunnel toggle error:', error);
            alert('An unexpected error occurred.');
        } finally {
            // 5. Always clear loading state
            setIsLoadingTunnel(false);
            setConfirmAction(null);
        }
    };

    const fetchDashboardData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Determine date range based on selectedPeriod
            let targetDate = new Date();
            let isSpecificMonth = false;

            if (selectedPeriod && !['This Week', 'This Month', 'This Quarter', 'This Year'].includes(selectedPeriod)) {
                // Parse "Month Year" string
                const parsedDate = new Date(Date.parse(`1 ${selectedPeriod}`));
                if (!isNaN(parsedDate.getTime())) {
                    targetDate = parsedDate;
                    isSpecificMonth = true;
                }
            }
            // Note: For "This Week"/"Quarter"/"Year", we fundamentally currently only support monthly views in the detailed stats
            // Ideally we'd rewrite the whole logic for flexible ranges, but for now we default to Current Month for those
            // or we could implement them. Given the user asked for "Specific Months" to work, we verify that first.

            const year = targetDate.getFullYear();
            const month = String(targetDate.getMonth() + 1).padStart(2, '0');
            const currentMonthISO = `${year}-${month}`; // YYYY-MM
            
            const prevMonthDate = new Date(targetDate.getFullYear(), targetDate.getMonth() - 1, 1);
            const prevMonthYear = prevMonthDate.getFullYear();
            const prevMonthMonth = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
            const prevMonthISO = `${prevMonthYear}-${prevMonthMonth}`;

            const startOfMonth = `${currentMonthISO}-01`;

            const nextMonthDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);
            const nextMonthYear = nextMonthDate.getFullYear();
            const nextMonthMonth = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
            const startOfNextMonth = `${nextMonthYear}-${nextMonthMonth}-01`; // YYYY-MM-DD

            const startOfPrevMonth = `${prevMonthISO}-01`;

            // Helper to add date filters
            const applyDateFilter = (query: any, column: string, start: string, end: string) => {
                return query.gte(column, start).lt(column, end);
            };

            // Fetch all business units
            const { data: buData } = await supabase.from('business_units').select('id, name');
            setBusinessUnits(buData || []);

            let selectedBuIds: string[] = [];
            let malanggamExt30thSubIds: string[] | null = null; // explicit sub IDs for 30th filter

            if (selectedBusinessUnit === 'malanggam_ext_30th') {
                const malanggamBuIds = (buData || [])
                    .filter(bu => bu.name.toLowerCase().includes('malanggam'))
                    .map(bu => bu.id);
                const extensionBuIds = (buData || [])
                    .filter(bu => bu.name.toLowerCase().includes('extension'))
                    .map(bu => bu.id);

                // Get all Malanggam sub IDs
                const { data: malanggamSubs } = await supabase
                    .from('subscriptions').select('id').in('business_unit_id', malanggamBuIds);
                // Get only Extension sub IDs with invoice_date = '30th'
                const { data: ext30thSubs } = await supabase
                    .from('subscriptions').select('id')
                    .in('business_unit_id', extensionBuIds)
                    .eq('invoice_date', '30th');

                malanggamExt30thSubIds = [
                    ...(malanggamSubs || []).map(s => s.id),
                    ...(ext30thSubs || []).map(s => s.id)
                ];
                // selectedBuIds covers both BUs for BU performance table display
                selectedBuIds = [...malanggamBuIds, ...extensionBuIds];
            } else if (selectedBusinessUnit !== 'all') {
                selectedBuIds = [selectedBusinessUnit];
            }

            // 1. Total customers - need to filter if business unit selected
            let totalCustomers = 0;
            if (selectedBusinessUnit === 'all') {
                const { count } = await supabase.from('customers').select('*', { count: 'exact', head: true });
                totalCustomers = count || 0;
            } else {
                // Count distinct customers that have subscriptions in this BU
                const { data: custData } = await supabase
                    .from('subscriptions')
                    .select('subscriber_id')
                    .in('business_unit_id', selectedBuIds);
                const uniqueCustomers = new Set((custData || []).map(s => s.subscriber_id));
                totalCustomers = uniqueCustomers.size;
            }

            // 2. Active subscriptions
            let subsQuery = supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('active', true);
            if (selectedBusinessUnit !== 'all') {
                subsQuery = subsQuery.in('business_unit_id', selectedBuIds);
            }
            const { count: activeSubscriptions } = await subsQuery;

            // 3. Subscription Stats (filtered by BU)
            let inactiveQuery = supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('active', false);
            if (selectedBusinessUnit !== 'all') {
                inactiveQuery = inactiveQuery.in('business_unit_id', selectedBuIds);
            }
            const { count: inactiveSubs } = await inactiveQuery;

            let newThisMonthQuery = supabase.from('subscriptions').select('*', { count: 'exact', head: true });
            newThisMonthQuery = applyDateFilter(newThisMonthQuery, 'created_at', startOfMonth, startOfNextMonth);

            if (selectedBusinessUnit !== 'all') {
                newThisMonthQuery = newThisMonthQuery.in('business_unit_id', selectedBuIds);
            }
            const { count: newThisMonth } = await newThisMonthQuery;

            // 4. Invoice totals for current month - FILTER BY BUSINESS UNIT through subscriptions
            // First get subscription IDs for the selected business unit
            let subscriptionIdsForBU: string[] = [];
            if (malanggamExt30thSubIds !== null) {
                // Already computed specific sub IDs for Malanggam + Ext (30th)
                subscriptionIdsForBU = malanggamExt30thSubIds;
            } else if (selectedBusinessUnit !== 'all') {
                const { data: buSubs } = await supabase
                    .from('subscriptions')
                    .select('id')
                    .in('business_unit_id', selectedBuIds);
                subscriptionIdsForBU = (buSubs || []).map(s => s.id);
            }

            // Fetch invoices with subscription info to filter
            // Fetch invoices with subscription info to filter
            let currentInvoicesQuery = supabase
                .from('invoices')
                .select('id, amount_due, amount_paid, original_amount, discount_applied, credits_applied, payment_status, subscription_id, subscriptions(business_unit_id, balance, business_units(name), customers!subscriptions_subscriber_id_fkey(name), plans(name, monthly_fee))');

            currentInvoicesQuery = applyDateFilter(currentInvoicesQuery, 'due_date', startOfMonth, startOfNextMonth);

            const { data: currentInvoicesRaw } = await currentInvoicesQuery;

            // Filter invoices by business unit if needed
            const currentInvoices = selectedBusinessUnit === 'all'
                ? (currentInvoicesRaw || [])
                : (currentInvoicesRaw || []).filter(inv => subscriptionIdsForBU.includes(inv.subscription_id));

            // Current Month Payments for accurate monthly revenue
            let currentPaymentsQuery = supabase
                .from('payments')
                .select('amount, mode, subscription_id, subscriptions(business_unit_id, business_units(name))');
            currentPaymentsQuery = applyDateFilter(currentPaymentsQuery, 'settlement_date', startOfMonth, startOfNextMonth);
            const { data: currentPaymentsRaw } = await currentPaymentsQuery;
            
            const currentPayments = selectedBusinessUnit === 'all'
                ? (currentPaymentsRaw || [])
                : (currentPaymentsRaw || []).filter(pmt => subscriptionIdsForBU.includes(pmt.subscription_id));
            
            const monthlyRevenue = currentPayments.reduce((sum, pmt) => sum + (pmt.amount || 0), 0);

            const currentMonthOutstanding = currentInvoices.filter(inv => inv.payment_status !== 'Paid').reduce((sum, inv) => {
                const effectiveAmount = (inv.original_amount && inv.original_amount > 0)
                    ? Math.max(0, inv.original_amount - (inv.discount_applied || 0) - (inv.credits_applied || 0))
                    : (inv.amount_due || 0);
                const paid = inv.amount_paid || 0;
                return sum + Math.max(0, effectiveAmount - paid);
            }, 0);
            
            const totalBilled = currentInvoices.reduce((sum, inv) => {
                const effectiveAmount = (inv.original_amount && inv.original_amount > 0)
                    ? Math.max(0, inv.original_amount - (inv.discount_applied || 0) - (inv.credits_applied || 0))
                    : (inv.amount_due || 0);
                return sum + effectiveAmount;
            }, 0);
            const collectionRate = totalBilled > 0 ? (monthlyRevenue / totalBilled) * 100 : 0;

            // 5. Previous month revenue for comparison (filtered by BU)
            let prevPaymentsQuery = supabase
                .from('payments')
                .select('amount, subscription_id');
            prevPaymentsQuery = applyDateFilter(prevPaymentsQuery, 'settlement_date', startOfPrevMonth, startOfMonth);
            const { data: prevPaymentsRaw } = await prevPaymentsQuery;

            const prevPayments = selectedBusinessUnit === 'all'
                ? (prevPaymentsRaw || [])
                : (prevPaymentsRaw || []).filter(pmt => subscriptionIdsForBU.includes(pmt.subscription_id));
            const previousMonthRevenue = prevPayments.reduce((sum, pmt) => sum + (pmt.amount || 0), 0);

            // 6. Unpaid invoices count and TOTAL outstanding amount (filtered by selected month)
            const unpaidInvoicesCount = currentInvoices.filter(inv => inv.payment_status !== 'Paid').length;
            const outstandingAmount = currentMonthOutstanding;

            // 7. Payment status distribution (filtered by selected month and BU)
            const paymentStatusCounts = {
                paid: currentInvoices.filter(i => i.payment_status === 'Paid').length,
                unpaid: currentInvoices.filter(i => i.payment_status === 'Unpaid').length,
                partial: currentInvoices.filter(i => i.payment_status === 'Partially Paid').length
            };

            // 8. Business Unit Performance (filtered by selected month)
            const buPerfMap: { [key: string]: BusinessUnitPerformance } = {};
            (buData || []).forEach(bu => {
                if (selectedBusinessUnit === 'all' || selectedBuIds.includes(bu.id)) {
                    buPerfMap[bu.name] = { name: bu.name, billed: 0, collected: 0, outstanding: 0, subscribers: 0, cashRevenue: 0 };
                }
            });

            // Tally subscribers from active subscriptions for accurate overall subscriber count per BU
            let buSubsQuery = supabase.from('subscriptions').select('business_units(name)').eq('active', true);
            if (selectedBusinessUnit !== 'all') {
                buSubsQuery = buSubsQuery.in('business_unit_id', selectedBuIds);
            }
            const { data: buSubsActive } = await buSubsQuery;

            (buSubsActive || []).forEach((sub: any) => {
                const buName = Array.isArray(sub.business_units) ? sub.business_units[0]?.name : sub.business_units?.name;
                if (buName && buPerfMap[buName]) {
                    buPerfMap[buName].subscribers++;
                }
            });

            // Tally billing data from current month invoices
            currentInvoices.forEach((inv: any) => {
                const sub = inv.subscriptions;
                if (!sub) return;
                const buName = Array.isArray(sub.business_units) ? sub.business_units[0]?.name : sub.business_units?.name;
                if (buName && buPerfMap[buName]) {
                    const effectiveAmount = (inv.original_amount && inv.original_amount > 0)
                        ? Math.max(0, inv.original_amount - (inv.discount_applied || 0) - (inv.credits_applied || 0))
                        : (inv.amount_due || 0);
                    const paid = inv.amount_paid || 0;
                    
                    buPerfMap[buName].billed += effectiveAmount;
                    buPerfMap[buName].collected += paid;
                    buPerfMap[buName].outstanding += Math.max(0, effectiveAmount - paid);
                }
            });

            // Tally cash revenue from payments per BU
            currentPayments.forEach((pmt: any) => {
                const sub = pmt.subscriptions;
                if (!sub) return;
                const buName = Array.isArray(sub.business_units) ? sub.business_units[0]?.name : sub.business_units?.name;
                if (buName && buPerfMap[buName]) {
                    buPerfMap[buName].cashRevenue += (pmt.amount || 0);
                }
            });

            const businessUnitPerformance = Object.values(buPerfMap).sort((a, b) => b.billed - a.billed);

            // 9. Revenue by month (last 6 months) - FILTERED BY BU
            const { data: monthlyDataRaw } = await supabase.from('invoices').select('due_date, amount_due, payment_status, subscription_id');
            const monthlyData = selectedBusinessUnit === 'all'
                ? (monthlyDataRaw || [])
                : (monthlyDataRaw || []).filter(inv => subscriptionIdsForBU.includes(inv.subscription_id));

            // Calculate revenue periods relative to targetDate
            const monthlyMapCorrected: { [key: string]: MonthlyRevenue } = {};
            for (let i = 5; i >= 0; i--) {
                const d = new Date(targetDate.getFullYear(), targetDate.getMonth() - i, 1);
                const key = d.toLocaleDateString('en-US', { month: 'short' });
                monthlyMapCorrected[key] = { month: key, billed: 0, collected: 0, outstanding: 0 };
            }

            (monthlyData || []).forEach((inv: any) => {
                const invDate = new Date(inv.due_date);
                // Difference in months from targetDate
                const monthsDiff = (targetDate.getFullYear() - invDate.getFullYear()) * 12 + (targetDate.getMonth() - invDate.getMonth());
                if (monthsDiff >= 0 && monthsDiff < 6) {
                    const key = invDate.toLocaleDateString('en-US', { month: 'short' });
                    if (monthlyMapCorrected[key]) {
                        monthlyMapCorrected[key].billed += inv.amount_due || 0;
                        if (inv.payment_status === 'Paid') {
                            monthlyMapCorrected[key].collected += inv.amount_due || 0;
                        } else {
                            monthlyMapCorrected[key].outstanding += inv.amount_due || 0;
                        }
                    }
                }
            });
            const revenueByMonthFinal = Object.values(monthlyMapCorrected);

            // 10. Plan distribution (filtered by selected month invoices)
            const planMap: { [key: string]: PlanDistribution } = {};
            currentInvoices.forEach((inv: any) => {
                const plan = Array.isArray(inv.subscriptions?.plans) ? inv.subscriptions?.plans[0] : inv.subscriptions?.plans;
                if (!plan?.name) return;
                if (!planMap[plan.name]) {
                    planMap[plan.name] = { name: plan.name, count: 0, revenue: 0 };
                }
                planMap[plan.name].count++;
                planMap[plan.name].revenue += plan.monthly_fee || 0;
            });
            const planDistribution = Object.values(planMap).sort((a, b) => b.count - a.count);

            // 11. Recent Activities (last 10) - FILTERED BY BU
            const recentActivities: RecentActivity[] = [];

            // Recent payments - filter by BU
            let paymentsQuery = supabase
                .from('payments')
                .select('id, amount, created_at, subscriptions!inner(customers!subscriptions_subscriber_id_fkey(name), business_unit_id)')
                .order('created_at', { ascending: false })
                .limit(10);

            if (selectedBusinessUnit !== 'all') {
                paymentsQuery = paymentsQuery.in('subscriptions.business_unit_id', selectedBuIds);
            }

            const { data: recentPayments } = await paymentsQuery;
            (recentPayments || []).forEach((p: any) => {
                const customerName = p.subscriptions?.customers?.name || 'Unknown';
                recentActivities.push({
                    id: `pay-${p.id}`,
                    type: 'payment',
                    customerName,
                    action: `Paid ₱${p.amount?.toLocaleString()}`,
                    amount: p.amount,
                    timestamp: p.created_at
                });
            });

            // Recent invoices - filter by BU
            let invoicesQuery = supabase
                .from('invoices')
                .select('id, amount_due, created_at, subscriptions!inner(customers!subscriptions_subscriber_id_fkey(name), business_unit_id)')
                .order('created_at', { ascending: false })
                .limit(10);

            if (selectedBusinessUnit !== 'all') {
                invoicesQuery = invoicesQuery.in('subscriptions.business_unit_id', selectedBuIds);
            }

            const { data: recentInvoices } = await invoicesQuery;
            (recentInvoices || []).forEach((inv: any) => {
                const customerName = inv.subscriptions?.customers?.name || 'Unknown';
                recentActivities.push({
                    id: `inv-${inv.id}`,
                    type: 'invoice',
                    customerName,
                    action: `Invoice Generated ₱${inv.amount_due?.toLocaleString()}`,
                    amount: inv.amount_due,
                    timestamp: inv.created_at
                });
            });

            // Recent subscribers (new subscriptions) - filter by BU
            let subscribersQuery = supabase
                .from('subscriptions')
                .select('id, created_at, customers!subscriptions_subscriber_id_fkey(name), business_unit_id')
                .order('created_at', { ascending: false })
                .limit(10);

            if (selectedBusinessUnit !== 'all') {
                subscribersQuery = subscribersQuery.in('business_unit_id', selectedBuIds);
            }

            const { data: recentSubscribers } = await subscribersQuery;
            (recentSubscribers || []).forEach((sub: any) => {
                const customerName = sub.customers?.name || 'Unknown';
                recentActivities.push({
                    id: `sub-${sub.id}`,
                    type: 'subscriber',
                    customerName,
                    action: 'New Subscription',
                    timestamp: sub.created_at
                });
            });

            // Sort by timestamp
            recentActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            // 12. Top Delinquent Accounts (filtered by selected month and BU)
            const delinquentMap: { [key: string]: DelinquentAccount } = {};
            currentInvoices.forEach((inv: any) => {
                if (inv.payment_status !== 'Paid' && inv.amount_due && inv.amount_due > 0) {
                    const sub = inv.subscriptions;
                    if (!sub) return;

                    if (!delinquentMap[inv.subscription_id]) {
                        const customerName = sub.customers?.name || 'Unknown';
                        const buName = Array.isArray(sub.business_units) ? sub.business_units[0]?.name : sub.business_units?.name || 'Unknown';

                        delinquentMap[inv.subscription_id] = {
                            customerName: customerName,
                            businessUnit: buName,
                            balance: 0,
                            unpaidCount: 0,
                            lastPayment: null
                        };
                    }
                    delinquentMap[inv.subscription_id].balance += inv.amount_due;
                    delinquentMap[inv.subscription_id].unpaidCount++;
                }
            });
            const topDelinquents = Object.values(delinquentMap)
                .sort((a, b) => b.balance - a.balance)
                .slice(0, 10);

            // 13. Expenses Summary (filtered by BU)
            let expensesQuery = supabase
                .from('expenses')
                .select('amount, reason, subscription_id, business_unit_id, date, created_at');

            const { data: allExpensesDataRaw } = await expensesQuery;

            const expensesDataRaw = (allExpensesDataRaw || []).filter(exp => {
                const dateStr = exp.date || exp.created_at;
                return dateStr && dateStr.startsWith(currentMonthISO);
            });

            // Filter expenses by business unit if selected
            const expensesData = selectedBusinessUnit === 'all'
                ? (expensesDataRaw || [])
                : (expensesDataRaw || []).filter(exp => {
                    // Include if expense has direct business_unit_id match
                    if (exp.business_unit_id && selectedBuIds.includes(exp.business_unit_id)) {
                        return true;
                    }
                    // Include if expense is linked to subscription in this business unit
                    if (exp.subscription_id && subscriptionIdsForBU.includes(exp.subscription_id)) {
                        return true;
                    }
                    return false;
                });

            const expenseBreakdown: { [key: string]: { count: number; total: number } } = {};
            let totalExpenses = 0;
            expensesData.forEach((exp: any) => {
                totalExpenses += exp.amount || 0;
                const reason = exp.reason || 'Other';
                if (!expenseBreakdown[reason]) {
                    expenseBreakdown[reason] = { count: 0, total: 0 };
                }
                expenseBreakdown[reason].count++;
                expenseBreakdown[reason].total += exp.amount || 0;
            });
            const expensesSummary: ExpensesSummary = {
                total: totalExpenses,
                breakdown: Object.entries(expenseBreakdown).map(([reason, data]) => ({ reason, ...data }))
            };

            // 14. Payment Methods Breakdown (filtered by selected month and BU)
            const paymentMethodsMap: { [key: string]: { count: number; total: number } } = {};
            currentPayments.forEach((pmt: any) => {
                const methodRaw = pmt.mode ? String(pmt.mode).toLowerCase() : 'cash';
                let normalizedMethod = 'Cash';
                if (methodRaw.includes('e-wallet')) normalizedMethod = 'E-Wallet';
                else if (methodRaw.includes('gcash')) normalizedMethod = 'GCash';
                else if (methodRaw.includes('maya') || methodRaw.includes('paymaya')) normalizedMethod = 'Maya';
                else if (methodRaw.includes('bank')) normalizedMethod = 'Bank Transfer';

                if (!paymentMethodsMap[normalizedMethod]) {
                    paymentMethodsMap[normalizedMethod] = { count: 0, total: 0 };
                }
                paymentMethodsMap[normalizedMethod].count++;
                paymentMethodsMap[normalizedMethod].total += pmt.amount || 0;
            });
            const paymentMethodsBreakdown = Object.entries(paymentMethodsMap)
                .map(([method, data]) => ({ method, ...data }))
                .sort((a, b) => b.total - a.total);

            // Customer Growth (vs last month)
            // Customer Growth (vs last month)
            // Need count of customers created BEFORE startOfMonth
            const { count: prevMonthCustomers } = await supabase
                .from('customers')
                .select('*', { count: 'exact', head: true })
                .lt('created_at', startOfMonth);
            const customerGrowth = prevMonthCustomers && prevMonthCustomers > 0
                ? (((totalCustomers || 0) - prevMonthCustomers) / prevMonthCustomers) * 100
                : 0;

            setData({
                totalCustomers: totalCustomers || 0,
                activeSubscriptions: activeSubscriptions || 0,
                monthlyRevenue,
                outstandingAmount,
                collectionRate,
                unpaidInvoicesCount: unpaidInvoicesCount || 0,
                previousMonthRevenue,
                customerGrowth,
                businessUnitPerformance,
                revenueByMonth: revenueByMonthFinal,
                paymentStatusCounts,
                planDistribution,
                recentActivities: recentActivities.slice(0, 10),
                topDelinquents,
                expensesSummary,
                subscriptionStats: {
                    active: activeSubscriptions || 0,
                    inactive: inactiveSubs || 0,
                    newThisMonth: newThisMonth || 0
                },
                paymentMethodsBreakdown
            });
        } catch (error) {
            console.error('Dashboard error:', error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedBusinessUnit, selectedPeriod]);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    const formatCurrency = (amount: number) => `₱${Math.round(amount).toLocaleString()}`;
    const formatPercent = (value: number) => `${value.toFixed(1)}%`;
    const getTimeAgo = (timestamp: string) => {
        const diff = Date.now() - new Date(timestamp).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    };

    const handleExportInvoices = async () => {
        try {
            // Re-fetch or get the data based on selectedPeriod and selectedBusinessUnit
            let targetDate = new Date();
            if (selectedPeriod && !['This Week', 'This Month', 'This Quarter', 'This Year'].includes(selectedPeriod)) {
                const parsedDate = new Date(Date.parse(`1 ${selectedPeriod}`));
                if (!isNaN(parsedDate.getTime())) {
                    targetDate = parsedDate;
                }
            }
            const year = targetDate.getFullYear();
            const month = String(targetDate.getMonth() + 1).padStart(2, '0');
            const currentMonthISO = `${year}-${month}`; // YYYY-MM
            const startOfMonth = `${currentMonthISO}-01`;
            const nextMonthDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);
            const nextMonthYear = nextMonthDate.getFullYear();
            const nextMonthMonth = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
            const startOfNextMonth = `${nextMonthYear}-${nextMonthMonth}-01`; // YYYY-MM-DD

            // Query invoices
            let currentInvoicesQuery = supabase
                .from('invoices')
                .select('id, subscription_id, amount_due, payment_status, due_date, subscriptions(id, business_unit_id, business_units(name), customers!subscriptions_subscriber_id_fkey(name), plans(name))')
                .gte('due_date', startOfMonth)
                .lt('due_date', startOfNextMonth);

            const { data: rawInvoices, error } = await currentInvoicesQuery;
            if (error) throw error;

            // Filter by business unit
            let filterBuIds: string[] = [];
            let filterSubIds: string[] | null = null;

            if (selectedBusinessUnit === 'malanggam_ext_30th') {
                const { data: buData } = await supabase.from('business_units').select('id, name');
                const malanggamBuIds = (buData || []).filter(bu => bu.name.toLowerCase().includes('malanggam')).map(bu => bu.id);
                const extensionBuIds = (buData || []).filter(bu => bu.name.toLowerCase().includes('extension')).map(bu => bu.id);
                const { data: malanggamSubs } = await supabase.from('subscriptions').select('id').in('business_unit_id', malanggamBuIds);
                const { data: ext30Subs } = await supabase.from('subscriptions').select('id').in('business_unit_id', extensionBuIds).eq('invoice_date', '30th');
                filterSubIds = [
                    ...(malanggamSubs || []).map((s: any) => s.id),
                    ...(ext30Subs || []).map((s: any) => s.id)
                ];
            } else if (selectedBusinessUnit !== 'all') {
                filterBuIds = [selectedBusinessUnit];
            }

            const filteredInvoices = selectedBusinessUnit === 'all'
                ? (rawInvoices || [])
                : filterSubIds !== null
                    ? (rawInvoices || []).filter((inv: any) => filterSubIds!.includes(inv.subscriptions?.id ?? inv.subscription_id))
                    : (rawInvoices || []).filter((inv: any) => filterBuIds.includes(inv.subscriptions?.business_unit_id));

            // Build CSV
            const headers = ['Invoice ID', 'Customer Name', 'Business Unit', 'Plan', 'Due Date', 'Amount Due', 'Payment Status'];
            const rows = filteredInvoices.map((inv: any) => {
                const sub = inv.subscriptions || {};
                const customerName = (sub.customers?.name || 'Unknown').replace(/"/g, '""');
                const buName = (Array.isArray(sub.business_units) ? sub.business_units[0]?.name : sub.business_units?.name || 'Unknown').replace(/"/g, '""');
                const planName = (Array.isArray(sub.plans) ? sub.plans[0]?.name : sub.plans?.name || 'Unknown').replace(/"/g, '""');
                return [
                    `"${inv.id}"`,
                    `"${customerName}"`,
                    `"${buName}"`,
                    `"${planName}"`,
                    `"${inv.due_date}"`,
                    `"${inv.amount_due}"`,
                    `"${inv.payment_status}"`
                ].join(',');
            });

            const csvContent = [headers.join(','), ...rows].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `Invoices_${selectedPeriod.replace(/ /g, '_')}_${selectedBusinessUnit}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error('Error exporting invoices', error);
            alert('Failed to export invoices');
        }
    };

    const handleExportDashboardReport = () => {
        if (!data) return;

        try {
            const reportLines: string[] = [];
            // helper for CSV rows
            const addRow = (cols: string[]) => reportLines.push(cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));

            addRow(['Dashboard Report', '']);
            addRow(['Period', selectedPeriod]);
            let businessUnitName = 'All Business Units';
            if (selectedBusinessUnit === 'malanggam_ext_30th') {
                businessUnitName = 'Malanggam + Ext. (30th)';
            } else if (selectedBusinessUnit !== 'all') {
                const found = businessUnits.find(b => b.id === selectedBusinessUnit);
                if (found) businessUnitName = found.name;
            }
            addRow(['Business Unit Filter', businessUnitName]);
            addRow([]);

            addRow(['--- SUMMARY ---', '']);
            addRow(['Total Customers', data.totalCustomers.toString()]);
            addRow(['Active Subscriptions', data.activeSubscriptions.toString()]);
            addRow(['Total Cash Received (PHP)', data.monthlyRevenue.toString()]);
            addRow(['Outstanding Invoice Balance (PHP)', data.outstandingAmount.toString()]);
            addRow(['Collection Rate (%)', data.collectionRate.toFixed(2)]);
            addRow(['Unpaid Invoices Count', data.unpaidInvoicesCount.toString()]);

            addRow([]);
            addRow(['--- SUBSCRIPTION STATS ---', '']);
            addRow(['Active', data.subscriptionStats.active.toString()]);
            addRow(['Inactive', data.subscriptionStats.inactive.toString()]);
            addRow(['New This Month', data.subscriptionStats.newThisMonth.toString()]);

            addRow([]);
            addRow(['--- PAYMENT STATUS ---', '']);
            addRow(['Paid', data.paymentStatusCounts.paid.toString()]);
            addRow(['Unpaid', data.paymentStatusCounts.unpaid.toString()]);
            addRow(['Partially Paid', data.paymentStatusCounts.partial.toString()]);

            addRow([]);
            addRow(['--- PAYMENT METHODS ---', 'Total (PHP)', 'Transaction Count']);
            data.paymentMethodsBreakdown.forEach(pm => {
                addRow([pm.method, pm.total.toString(), pm.count.toString()]);
            });

            addRow([]);
            addRow([`--- BUSINESS UNIT PERFORMANCE (${selectedPeriod}) ---`, 'Subscribers', 'Total Cash Revenue (PHP)', 'Billed for Month (PHP)', 'Paid Towards Invoices (PHP)', 'Outstanding Balance (PHP)']);
            data.businessUnitPerformance.forEach(bu => {
                addRow([bu.name, bu.subscribers.toString(), bu.cashRevenue.toString(), bu.billed.toString(), bu.collected.toString(), bu.outstanding.toString()]);
            });

            addRow([]);
            addRow(['--- EXPENSES SUMMARY ---', 'Total (PHP)']);
            addRow(['Total Expenses', data.expensesSummary.total.toString()]);
            addRow(['Breakdown', 'Count', 'Total (PHP)']);
            data.expensesSummary.breakdown.forEach(exp => {
                addRow([exp.reason, exp.count.toString(), exp.total.toString()]);
            });

            const csvContent = reportLines.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `Dashboard_Report_${selectedPeriod.replace(/ /g, '_')}_${selectedBusinessUnit}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Error exporting report', error);
            alert('Failed to export report');
        }
    };

    if (isLoading || !data) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-900/30">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                    <p className="text-gray-400">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    const revenueChange = data.previousMonthRevenue > 0
        ? ((data.monthlyRevenue - data.previousMonthRevenue) / data.previousMonthRevenue) * 100
        : 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Activity className="w-6 h-6 text-purple-500" />
                            Dashboard Overview
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">Real-time metrics and insights for your ISP business</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleStatusClick}
                            className={`hidden md:inline-flex items-center px-3 py-1 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${mikrotikStatus === 'online'
                                ? 'border-green-500/30 bg-green-900/10 text-green-400'
                                : mikrotikStatus === 'offline' ? 'border-red-500/30 bg-red-900/10 text-red-500'
                                    : 'border-yellow-500/30 bg-yellow-900/10 text-yellow-500'
                                } text-xs font-mono animate-pulse-slow mr-2`}
                        >
                            <span className={`w-2 h-2 rounded-full mr-2 animate-pulse ${mikrotikStatus === 'online' ? 'bg-green-500' :
                                mikrotikStatus === 'offline' ? 'bg-red-500' :
                                    'bg-yellow-500'
                                }`}></span>
                            MIKROTIK: {mikrotikStatus.toUpperCase()}
                        </button>
                        <select
                            value={selectedPeriod}
                            onChange={(e) => setSelectedPeriod(e.target.value)}
                            className="bg-gray-900/50 border border-gray-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-purple-500"
                        >
                            <optgroup label="Quick Select">
                                <option>This Week</option>
                                <option>This Month</option>
                                <option>This Quarter</option>
                                <option>This Year</option>
                            </optgroup>
                            <optgroup label="Specific Months">
                                {(() => {
                                    const options = [];
                                    const now = new Date();
                                    for (let i = 0; i < 12; i++) {
                                        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                                        const label = `${date.toLocaleString('default', { month: 'long' })} ${date.getFullYear()}`;
                                        options.push(<option key={label} value={label}>{label}</option>);
                                    }
                                    return options;
                                })()}
                            </optgroup>
                        </select>
                        <select
                            value={selectedBusinessUnit}
                            onChange={(e) => setSelectedBusinessUnit(e.target.value)}
                            className="bg-gray-900/50 border border-gray-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-purple-500"
                        >
                            <option value="all">All Business Units</option>
                            <option value="malanggam_ext_30th">Malanggam + Ext. (30th)</option>
                            {businessUnits.map(bu => (
                                <option key={bu.id} value={bu.id}>{bu.name}</option>
                            ))}
                        </select>
                        <button
                            onClick={fetchDashboardData}
                            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-colors"
                        >
                            <RefreshCw className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Customers */}
                <div className="glass-card p-5">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Total Customers</p>
                            <p className="text-3xl font-bold text-white">{data.totalCustomers.toLocaleString()}</p>
                            <p className="text-sm text-gray-500 mt-1">{data.activeSubscriptions} active subs</p>
                        </div>
                        <div className="p-3 bg-blue-900/30 rounded-xl">
                            <Users className="w-6 h-6 text-blue-400" />
                        </div>
                    </div>
                    <div className={`flex items-center gap-1 mt-3 text-sm ${data.customerGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {data.customerGrowth >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        {formatPercent(Math.abs(data.customerGrowth))} vs last month
                    </div>
                </div>

                {/* Monthly Revenue */}
                <div className="glass-card p-5">
                    <div className="flex items-start justify-between">
                        <div className="w-full pr-4">
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Monthly Revenue</p>
                            <div className="space-y-1 mb-2">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Cash:</span>
                                    <span className="text-emerald-400 font-medium">{formatCurrency(data.paymentMethodsBreakdown.find(pm => pm.method === 'Cash')?.total || 0)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">E-Payment:</span>
                                    <span className="text-emerald-400 font-medium">{formatCurrency(data.paymentMethodsBreakdown.filter(pm => pm.method !== 'Cash').reduce((sum, pm) => sum + pm.total, 0))}</span>
                                </div>
                                <div className="border-t border-gray-700/50 pt-1 flex justify-between items-center">
                                    <span className="text-gray-300 font-medium text-sm">Total:</span>
                                    <span className="text-2xl font-bold text-white">{formatCurrency(data.monthlyRevenue)}</span>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">Total paid this month</p>
                        </div>
                        <div className="p-3 bg-emerald-900/30 rounded-xl shrink-0">
                            <DollarSign className="w-6 h-6 text-emerald-400" />
                        </div>
                    </div>
                    <div className={`flex items-center gap-1 mt-3 text-sm ${revenueChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {revenueChange >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        {formatPercent(Math.abs(revenueChange))} vs last month
                    </div>
                </div>

                {/* Outstanding Balance */}
                <div className="glass-card p-5">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Outstanding Balance</p>
                            <p className="text-3xl font-bold text-red-400">{formatCurrency(data.outstandingAmount)}</p>
                            <p className="text-sm text-gray-500 mt-1">{data.unpaidInvoicesCount} unpaid invoices</p>
                        </div>
                        <div className="p-3 bg-red-900/30 rounded-xl">
                            <AlertCircle className="w-6 h-6 text-red-400" />
                        </div>
                    </div>
                </div>

                {/* Collection Rate */}
                <div className="glass-card p-5">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Collection Rate</p>
                            <p className="text-3xl font-bold text-purple-400">{formatPercent(data.collectionRate)}</p>
                            <p className="text-sm text-gray-500 mt-1">Payment efficiency</p>
                        </div>
                        <div className="p-3 bg-purple-900/30 rounded-xl">
                            <TrendingUp className="w-6 h-6 text-purple-400" />
                        </div>
                    </div>
                    <div className="mt-3 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-purple-600 to-violet-600 transition-all"
                            style={{ width: `${Math.min(100, data.collectionRate)}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Charts */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Revenue Trends */}
                    <div className="glass-card p-6">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-purple-500" />
                            Revenue Trends (6 Months)
                        </h3>
                        <div className="h-64 flex items-end justify-between gap-2">
                            {data.revenueByMonth.map((month, idx) => {
                                const maxBilled = Math.max(...data.revenueByMonth.map(m => m.billed), 1);
                                const billedHeight = (month.billed / maxBilled) * 100;
                                const collectedHeight = (month.collected / maxBilled) * 100;
                                return (
                                    <div key={idx} className="flex-1 flex flex-col items-center">
                                        <div className="w-full h-48 flex items-end gap-1">
                                            <div
                                                className="flex-1 bg-blue-600/30 rounded-t-lg transition-all hover:bg-blue-600/50"
                                                style={{ height: `${billedHeight}%` }}
                                                title={`Billed: ${formatCurrency(month.billed)}`}
                                            />
                                            <div
                                                className="flex-1 bg-emerald-600/30 rounded-t-lg transition-all hover:bg-emerald-600/50"
                                                style={{ height: `${collectedHeight}%` }}
                                                title={`Collected: ${formatCurrency(month.collected)}`}
                                            />
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">{month.month}</p>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex items-center justify-center gap-6 mt-4 text-xs">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-blue-600 rounded" />
                                <span className="text-gray-400">Billed</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-emerald-600 rounded" />
                                <span className="text-gray-400">Collected</span>
                            </div>
                        </div>
                    </div>

                    {/* Business Unit Performance */}
                    <div className="glass-card p-6">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-purple-500" />
                            Business Unit Performance
                        </h3>
                        <div className="space-y-4">
                            {data.businessUnitPerformance.slice(0, 5).map((bu, idx) => {
                                const collectionRate = bu.billed > 0 ? (bu.collected / bu.billed) * 100 : 0;
                                return (
                                    <div key={idx} className="p-4 bg-[#0a0a0a] rounded-xl border border-gray-800">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-3">
                                                <span className="text-white font-medium">{bu.name}</span>
                                                <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-800 rounded-full">
                                                    {bu.subscribers} subs
                                                </span>
                                            </div>
                                            <span className={`text-sm font-medium ${collectionRate >= 80 ? 'text-emerald-400' : collectionRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                                                {formatPercent(collectionRate)}
                                            </span>
                                        </div>
                                        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all ${collectionRate >= 80 ? 'bg-emerald-600' : collectionRate >= 50 ? 'bg-amber-600' : 'bg-red-600'}`}
                                                style={{ width: `${Math.min(100, collectionRate)}%` }}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                                            <span>{formatCurrency(bu.collected)} collected</span>
                                            <span>{formatCurrency(bu.billed)} billed</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Plan Distribution & Payment Status */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Plan Distribution */}
                        <div className="glass-card p-6">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Wifi className="w-5 h-5 text-purple-500" />
                                Plan Distribution
                            </h3>
                            <div className="space-y-3">
                                {data.planDistribution.slice(0, 5).map((plan, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded-lg border border-gray-800">
                                        <div>
                                            <p className="text-white font-medium">{plan.name}</p>
                                            <p className="text-xs text-gray-500">{plan.count} subscribers</p>
                                        </div>
                                        <p className="text-purple-400 font-medium">{formatCurrency(plan.revenue)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Payment Status */}
                        <div className="glass-card p-6">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-purple-500" />
                                Payment Status
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-3 bg-emerald-900/20 rounded-xl border border-emerald-700/50">
                                    <div className="flex items-center gap-3">
                                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                                        <span className="text-white">Paid</span>
                                    </div>
                                    <span className="text-2xl font-bold text-emerald-400">{data.paymentStatusCounts.paid}</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-red-900/20 rounded-xl border border-red-700/50">
                                    <div className="flex items-center gap-3">
                                        <XCircle className="w-5 h-5 text-red-400" />
                                        <span className="text-white">Unpaid</span>
                                    </div>
                                    <span className="text-2xl font-bold text-red-400">{data.paymentStatusCounts.unpaid}</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-amber-900/20 rounded-xl border border-amber-700/50">
                                    <div className="flex items-center gap-3">
                                        <Clock className="w-5 h-5 text-amber-400" />
                                        <span className="text-white">Partial</span>
                                    </div>
                                    <span className="text-2xl font-bold text-amber-400">{data.paymentStatusCounts.partial}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column - Activity & Stats */}
                <div className="space-y-6">
                    {/* Quick Actions */}
                    <div className="glass-card p-5">
                        <h3 className="text-sm text-gray-400 uppercase mb-4">Quick Actions</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={handleExportInvoices}
                                className="p-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30"
                            >
                                <FileText className="w-4 h-4" />
                                Export Invoices
                            </button>
                            <button
                                onClick={handleExportDashboardReport}
                                className="p-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                <Download className="w-4 h-4" />
                                Export Dashboard Report
                            </button>
                        </div>
                    </div>

                    {/* Subscription Stats */}
                    <div className="glass-card p-5">
                        <h3 className="text-sm text-gray-400 uppercase mb-4">Subscription Stats</h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded-lg">
                                <span className="text-gray-400 text-sm">Active</span>
                                <span className="text-emerald-400 font-bold">{data.subscriptionStats.active}</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded-lg">
                                <span className="text-gray-400 text-sm">Inactive</span>
                                <span className="text-red-400 font-bold">{data.subscriptionStats.inactive}</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded-lg">
                                <span className="text-gray-400 text-sm">New This Month</span>
                                <span className="text-blue-400 font-bold">{data.subscriptionStats.newThisMonth}</span>
                            </div>
                        </div>
                    </div>

                    {/* Recent Activity */}
                    <div className="glass-card p-5">
                        <h3 className="text-sm text-gray-400 uppercase mb-4">Recent Activity</h3>
                        <div className="space-y-3 max-h-[400px] overflow-y-auto">
                            {data.recentActivities.map((activity) => (
                                <div key={activity.id} className="flex items-start gap-3 p-3 bg-[#0a0a0a] rounded-lg border border-gray-800">
                                    <div className={`p-2 rounded-lg ${activity.type === 'payment' ? 'bg-emerald-900/30' :
                                        activity.type === 'invoice' ? 'bg-blue-900/30' :
                                            activity.type === 'subscriber' ? 'bg-purple-900/30' :
                                                'bg-amber-900/30'
                                        }`}>
                                        {activity.type === 'payment' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> :
                                            activity.type === 'invoice' ? <FileText className="w-4 h-4 text-blue-400" /> :
                                                activity.type === 'subscriber' ? <Users className="w-4 h-4 text-purple-400" /> :
                                                    <AlertCircle className="w-4 h-4 text-amber-400" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-sm font-medium truncate">{activity.customerName}</p>
                                        <p className="text-xs text-gray-500">{activity.action}</p>
                                    </div>
                                    <span className="text-xs text-gray-600 whitespace-nowrap">{getTimeAgo(activity.timestamp)}</span>
                                </div>
                            ))}
                            {data.recentActivities.length === 0 && (
                                <p className="text-gray-500 text-center py-4 text-sm">No recent activity</p>
                            )}
                        </div>
                    </div>

                    {/* Expenses Summary */}
                    <div className="glass-card p-5">
                        <h3 className="text-sm text-gray-400 uppercase mb-4">Expenses This Month</h3>
                        <p className="text-2xl font-bold text-white mb-4">{formatCurrency(data.expensesSummary.total)}</p>
                        <div className="space-y-2">
                            {data.expensesSummary.breakdown.slice(0, 4).map((exp, idx) => (
                                <div key={idx} className="flex items-center justify-between text-sm">
                                    <span className="text-gray-400">{exp.reason}</span>
                                    <span className="text-white">{formatCurrency(exp.total)}</span>
                                </div>
                            ))}
                        </div>
                        {data.monthlyRevenue > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-800">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-400">Net Profit</span>
                                    <span className={`text-lg font-bold ${(data.monthlyRevenue - data.expensesSummary.total) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {formatCurrency(data.monthlyRevenue - data.expensesSummary.total)}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Payment Methods Breakdown */}
                    <div className="glass-card p-5">
                        <h3 className="text-sm text-gray-400 uppercase mb-4">Payment Methods</h3>
                        <div className="space-y-3">
                            {data.paymentMethodsBreakdown.map((pm, idx) => (
                                <div key={idx} className="flex flex-col p-3 bg-[#0a0a0a] rounded-lg border border-gray-800">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-white font-medium flex items-center gap-2">
                                            {pm.method === 'GCash' ? (
                                                <div className="w-5 h-5 rounded-md bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white">G</div>
                                            ) : pm.method === 'Maya' ? (
                                                <div className="w-5 h-5 rounded-md bg-green-500 flex items-center justify-center text-[10px] font-bold text-black">M</div>
                                            ) : (
                                                <Banknote className="w-4 h-4 text-emerald-500" />
                                            )}
                                            {pm.method}
                                        </span>
                                        <span className="text-emerald-400 font-bold">{formatCurrency(pm.total)}</span>
                                    </div>
                                    <span className="text-xs text-gray-500">{pm.count} transaction(s)</span>
                                </div>
                            ))}
                            {data.paymentMethodsBreakdown.length === 0 && (
                                <p className="text-gray-500 text-center py-2 text-sm">No payments recorded</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Top Delinquent Accounts */}
            {data.topDelinquents.length > 0 && (
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-red-500" />
                        Top Delinquent Accounts
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-800">
                                    <th className="text-left text-xs text-gray-500 uppercase py-3 px-4">Customer</th>
                                    <th className="text-left text-xs text-gray-500 uppercase py-3 px-4">Business Unit</th>
                                    <th className="text-right text-xs text-gray-500 uppercase py-3 px-4">Balance</th>
                                    <th className="text-center text-xs text-gray-500 uppercase py-3 px-4">Unpaid</th>
                                    <th className="text-right text-xs text-gray-500 uppercase py-3 px-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.topDelinquents.slice(0, 5).map((account, idx) => (
                                    <tr key={idx} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                                        <td className="py-3 px-4">
                                            <span className="text-white font-medium">{account.customerName}</span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="text-gray-400">{account.businessUnit}</span>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <span className="text-red-400 font-bold">{formatCurrency(account.balance)}</span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <span className="px-2 py-1 bg-red-900/30 text-red-400 rounded-full text-xs">
                                                {account.unpaidCount}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <button className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1 ml-auto">
                                                View <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <ConfirmationDialog
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={handleConfirmToggle}
                title={confirmAction === 'start' ? 'Start Remote Connection?' : 'Stop Remote Connection?'}
                message={confirmAction === 'start'
                    ? 'Are you sure you want to open the MikroTik remote connection tunnel? A separate window will open to handle the connection process. This window is normal and necessary for the tunnel to function.'
                    : 'Are you sure you want to close the MikroTik remote connection tunnel? Use this only if you are done managing the router.'}
                confirmText={confirmAction === 'start' ? 'Start Connection' : 'Stop Connection'}
                type={confirmAction === 'start' ? 'info' : 'warning'}
                isLoading={isLoadingTunnel}
            />

            {/* Global Loading Overlay */}
            {/* Global Loading Overlay (Portal to cover Sidebar) */}
            {isLoadingTunnel && !isConfirmOpen && mounted && createPortal(
                <div className="fixed inset-0 z-[99999] bg-black/95 backdrop-blur-md flex items-center justify-center flex-col animate-in fade-in duration-200">
                    <div className="relative">
                        <div className="absolute -inset-4 bg-purple-500/20 blur-xl rounded-full animate-pulse"></div>
                        <Loader2 className="w-16 h-16 text-purple-500 animate-spin relative z-10" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mt-8 animate-pulse">
                        {confirmAction === 'start' ? 'Starting Tunnel...' : 'Stopping Tunnel...'}
                    </h2>
                    <p className="text-gray-400 mt-2 max-w-md text-center px-4">
                        {confirmAction === 'start'
                            ? 'Please wait while we initialize the connection. Do not close the terminal window that appears.'
                            : 'Please wait while we safely close the connection...'}
                    </p>
                    <div className="mt-8 w-64 h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-500 to-violet-500 w-1/2 animate-[shimmer_1s_infinite_linear]"></div>
                    </div>

                    {/* Manual Refresh Option */}
                    <button
                        onClick={(e) => {
                            // Immediate Router Push (Triggers shell as per user)
                            router.push('/admin/dashboard');

                            const btn = e.currentTarget;
                            // Visual Feedback
                            btn.innerText = 'Reloading in 5s...';
                            btn.disabled = true;
                            btn.classList.add('opacity-50', 'cursor-not-allowed');

                            // Delayed Hard Refresh
                            setTimeout(() => {
                                window.location.href = '/admin/dashboard';
                            }, 5000);
                        }}
                        className="mt-8 flex items-center gap-2 px-4 py-2 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-xl text-gray-400 hover:text-white transition-all text-xs uppercase tracking-wider"
                    >
                        <RefreshCw className="w-6 h-6" />
                        Refresh Tunnel if still loading
                    </button>
                </div>,
                document.body
            )}
        </div>
    );
}
