'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { CreditCard, Calendar, Wifi, AlertCircle, Loader2, Share2, MapPin, Router, Phone, Download, ChevronDown, FileText, Clock, CheckCircle, XCircle, TrendingUp, Zap, DollarSign } from 'lucide-react';
import axios from 'axios';

interface Subscription {
    id: string;
    active: boolean;
    invoice_date: string;
    date_installed: string;
    address: string;
    barangay: string;
    router_serial_number: string;
    balance: number;
    plan: {
        name: string;
        monthly_fee: number;
        details: string;
    };
    invoices: {
        id: string;
        due_date: string;
        amount_due: number;
        payment_status: string;
        created_at: string;
        from_date: string;
        to_date: string;
    }[];
    payments: {
        id: string;
        amount: number;
        mode: string;
        settlement_date: string;
        created_at: string;
    }[];
}

interface PortalData {
    customer: {
        id: string;
        name: string;
        mobile_number: string;
    };
    subscriptions: Subscription[];
    totalBalance: number;
    totalCredits: number;
}

export default function CustomerPortalPage() {
    const params = useParams();
    const [data, setData] = useState<PortalData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [showPayModal, setShowPayModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [showInvoiceModal, setShowInvoiceModal] = useState(false);
    const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
    const [selectedMonth, setSelectedMonth] = useState('');
    const [selectedYear, setSelectedYear] = useState('');
    const [paymentType, setPaymentType] = useState<'all' | 'single'>('all');
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);

    useEffect(() => {
        if (params.id) {
            fetchPortalData();
        }
    }, [params.id]);

    useEffect(() => {
        const now = new Date();
        setSelectedMonth(String(now.getMonth() + 1).padStart(2, '0'));
        setSelectedYear(String(now.getFullYear()));
    }, []);

    const fetchPortalData = async () => {
        try {
            const customerId = params.id as string;

            const { data: customerData, error: customerError } = await supabase
                .from('customers')
                .select('id, name, mobile_number')
                .eq('id', customerId)
                .single();

            if (customerError) throw customerError;
            if (!customerData) throw new Error('Customer not found');

            const { data: subscriptionsData, error: subsError } = await supabase
                .from('subscriptions')
                .select(`
                    id,
                    active,
                    invoice_date,
                    date_installed,
                    address,
                    barangay,
                    router_serial_number,
                    balance,
                    plans (name, monthly_fee, details)
                `)
                .eq('subscriber_id', customerId)
                .order('created_at', { ascending: false });

            if (subsError) throw subsError;

            const subscriptionsWithDetails = await Promise.all(
                (subscriptionsData || []).map(async (sub: any) => {
                    const { data: allInvoices } = await supabase
                        .from('invoices')
                        .select('*')
                        .eq('subscription_id', sub.id)
                        .order('created_at', { ascending: false });

                    const { data: allPayments } = await supabase
                        .from('payments')
                        .select('*')
                        .eq('subscription_id', sub.id)
                        .order('created_at', { ascending: false })
                        .limit(5);

                    const recentInvoices = (allInvoices || []).slice(0, 5);
                    const plan = Array.isArray(sub.plans) ? sub.plans[0] : sub.plans;

                    return {
                        id: sub.id,
                        active: sub.active,
                        invoice_date: sub.invoice_date,
                        date_installed: sub.date_installed,
                        address: sub.address,
                        barangay: sub.barangay,
                        router_serial_number: sub.router_serial_number,
                        balance: sub.balance || 0,
                        plan: {
                            name: plan?.name || 'Unknown Plan',
                            monthly_fee: plan?.monthly_fee || 0,
                            details: plan?.details || ''
                        },
                        invoices: recentInvoices,
                        payments: allPayments || []
                    };
                })
            );

            // Calculate total balance and credits separately
            let totalBalance = 0;
            let totalCredits = 0;
            subscriptionsWithDetails.forEach(sub => {
                if (sub.balance > 0) {
                    totalBalance += sub.balance;
                } else if (sub.balance < 0) {
                    totalCredits += Math.abs(sub.balance);
                }
            });

            setData({
                customer: {
                    id: customerData.id,
                    name: customerData.name,
                    mobile_number: customerData.mobile_number
                },
                subscriptions: subscriptionsWithDetails,
                totalBalance,
                totalCredits
            });

        } catch (err: any) {
            console.error('Error fetching data:', err);
            setError(err.message || 'Unable to load portal. Please check your link.');
        } finally {
            setIsLoading(false);
        }
    };

    const getNextBillingDate = (invoiceDateEnum: string) => {
        const today = new Date();
        const day = parseInt(invoiceDateEnum);
        let nextDate = new Date(today.getFullYear(), today.getMonth(), day);
        if (nextDate < today) {
            nextDate = new Date(today.getFullYear(), today.getMonth() + 1, day);
        }
        return nextDate;
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatShortDate = (dateString: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
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

    const handleShareToFacebook = () => {
        if (!data?.customer.id) return;
        const baseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost'
            ? 'http://localhost:3000'
            : 'https://all-star-three.vercel.app';
        const referralUrl = `${baseUrl}/ref/${data.customer.id}`;
        const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralUrl)}`;
        window.open(facebookShareUrl, '_blank', 'width=600,height=400');
        setShowShareModal(false);
    };

    const copyReferralLink = () => {
        if (!data?.customer.id) return;
        const baseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost'
            ? 'http://localhost:3000'
            : 'https://all-star-three.vercel.app';
        const referralUrl = `${baseUrl}/ref/${data.customer.id}`;
        navigator.clipboard.writeText(referralUrl);
        alert('Referral link copied to clipboard!');
    };

    const handlePayBills = (subscription?: Subscription) => {
        if (subscription) {
            setSelectedSubscription(subscription);
            setPaymentType('single');
        } else {
            setSelectedSubscription(null);
            setPaymentType('all');
        }
        setShowPayModal(true);
    };

    const handleDownloadInvoice = (subscription: Subscription) => {
        setSelectedSubscription(subscription);
        setShowInvoiceModal(true);
    };

    const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);

    const handleGenerateInvoice = async () => {
        if (!selectedSubscription || !data) return;
        setIsGeneratingInvoice(true);

        try {
            const startDate = `${selectedYear}-${selectedMonth}-01`;
            const lastDay = new Date(parseInt(selectedYear), parseInt(selectedMonth), 0).getDate();
            const endDate = `${selectedYear}-${selectedMonth}-${lastDay}`;

            const { data: existingInvoices } = await supabase
                .from('invoices')
                .select('*')
                .eq('subscription_id', selectedSubscription.id)
                .gte('due_date', startDate)
                .lte('due_date', endDate)
                .maybeSingle();

            let invoiceData;

            if (existingInvoices) {
                invoiceData = {
                    invoiceNumber: existingInvoices.id.split('-')[0].toUpperCase(),
                    date: existingInvoices.created_at.split('T')[0],
                    dueDate: existingInvoices.due_date,
                    customerName: data.customer.name,
                    customerAddress: `${selectedSubscription.address}, ${selectedSubscription.barangay}`,
                    accountNumber: data.customer.id.split('-')[0].toUpperCase(),
                    billingPeriod: `${formatDate(existingInvoices.from_date)} - ${formatDate(existingInvoices.to_date)}`,
                    items: [
                        { description: `${selectedSubscription.plan.name} - Monthly Fee`, amount: existingInvoices.amount_due }
                    ],
                    totalAmount: existingInvoices.amount_due,
                    status: existingInvoices.payment_status
                };
            } else {
                const dueDate = `${selectedYear}-${selectedMonth}-${selectedSubscription.invoice_date === '15th' ? '15' : '30'}`;
                const invoiceNum = `INV-${selectedYear}${selectedMonth}${selectedSubscription.invoice_date === '15th' ? '15' : '30'}-${selectedSubscription.id.slice(0, 4).toUpperCase()}`;

                invoiceData = {
                    invoiceNumber: invoiceNum,
                    date: new Date().toISOString().split('T')[0],
                    dueDate: dueDate,
                    customerName: data.customer.name,
                    customerAddress: `${selectedSubscription.address}, ${selectedSubscription.barangay}`,
                    accountNumber: data.customer.id.split('-')[0].toUpperCase(),
                    billingPeriod: `${selectedMonth}/01/${selectedYear} - ${selectedMonth}/${lastDay}/${selectedYear}`,
                    items: [
                        { description: `${selectedSubscription.plan.name} - Monthly Fee`, amount: selectedSubscription.plan.monthly_fee }
                    ],
                    totalAmount: selectedSubscription.plan.monthly_fee,
                    status: 'Unpaid'
                };
            }

            if (invoiceData) {
                const { generateInvoicePDF } = await import('@/utils/generateInvoice');
                await generateInvoicePDF(invoiceData);
            }

            setShowInvoiceModal(false);

        } catch (err) {
            console.error('Error generating invoice:', err);
            alert('Failed to generate invoice. Please try again.');
        } finally {
            setIsGeneratingInvoice(false);
        }
    };

    const handlePayment = async (method: 'gcash' | 'grab_pay' | 'paymaya' | 'dob' | 'dob_ubp') => {
        if (!data) return;
        setIsProcessingPayment(true);

        try {
            const amount = paymentType === 'single' && selectedSubscription
                ? Math.max(0, selectedSubscription.balance)
                : data.totalBalance;

            const subscriptionId = paymentType === 'single' && selectedSubscription
                ? selectedSubscription.id
                : data.subscriptions[0]?.id;

            if (!subscriptionId || amount <= 0) {
                alert('No balance to pay.');
                setIsProcessingPayment(false);
                return;
            }

            const response = await axios.post('/api/paymongo/create-source', {
                amount: amount,
                type: method,
                redirect_success: `${window.location.origin}/payment/success`,
                redirect_failed: `${window.location.origin}/portal/${data.customer.id}`
            });

            const { data: sourceData } = response.data;
            const checkoutUrl = sourceData.attributes.redirect.checkout_url;

            sessionStorage.setItem('pending_payment_source_id', sourceData.id);
            sessionStorage.setItem('pending_payment_amount', amount.toString());
            sessionStorage.setItem('pending_payment_sub_id', subscriptionId);
            sessionStorage.setItem('pending_payment_customer_id', data.customer.id);

            window.location.href = checkoutUrl;

        } catch (error: any) {
            console.error('Payment Error:', error);
            alert(error.response?.data?.error || 'Payment initialization failed. Please check your connection.');
            setIsProcessingPayment(false);
        }
    };

    const months = [
        { value: '01', label: 'January' }, { value: '02', label: 'February' },
        { value: '03', label: 'March' }, { value: '04', label: 'April' },
        { value: '05', label: 'May' }, { value: '06', label: 'June' },
        { value: '07', label: 'July' }, { value: '08', label: 'August' },
        { value: '09', label: 'September' }, { value: '10', label: 'October' },
        { value: '11', label: 'November' }, { value: '12', label: 'December' },
    ];

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 3 }, (_, i) => currentYear - 1 + i);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-900/30">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                    <p className="text-gray-400">Loading your portal...</p>
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
                    <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
                    <p className="text-gray-400">{error || 'Invalid portal link'}</p>
                </div>
            </div>
        );
    }

    const netBalance = data.totalBalance - data.totalCredits;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Welcome, {data.customer.name}</h1>
                    <div className="flex items-center gap-4 mt-2">
                        <p className="text-sm text-gray-500 flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            {data.customer.mobile_number}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowShareModal(true)}
                    className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl transition-all flex items-center gap-2 text-sm font-medium shadow-lg shadow-purple-900/30"
                >
                    <Share2 className="w-4 h-4" />
                    Refer a Friend
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Total Balance/Credits Card */}
                <div className="glass-card p-6 md:col-span-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-gray-400 text-xs font-medium uppercase mb-2 tracking-wider">
                                {netBalance > 0 ? 'Total Balance (All Subscriptions)' : netBalance < 0 ? 'Total Credits (All Subscriptions)' : 'Account Status'}
                            </h3>
                            <p className={`text-4xl font-bold ${netBalance > 0 ? 'text-red-400' : netBalance < 0 ? 'text-emerald-400' : 'text-white'}`}>
                                ₱{Math.abs(netBalance).toLocaleString()}
                            </p>
                            <p className={`text-sm mt-2 ${netBalance > 0 ? 'text-red-400' : netBalance < 0 ? 'text-emerald-400' : 'text-gray-400'}`}>
                                {netBalance > 0 ? 'Payment Due' : netBalance < 0 ? 'You have advance credits!' : 'All Paid Up!'}
                            </p>
                        </div>
                        {netBalance > 0 && (
                            <button
                                onClick={() => handlePayBills()}
                                className="px-6 py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-red-900/30"
                            >
                                <CreditCard className="w-5 h-5" />
                                Pay All Bills
                            </button>
                        )}
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="glass-card p-6">
                    <h3 className="text-gray-400 text-xs font-medium uppercase mb-4 tracking-wider">Quick Stats</h3>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400 text-sm flex items-center gap-2">
                                <Wifi className="w-4 h-4 text-purple-500" />
                                Active Plans
                            </span>
                            <span className="text-white font-semibold">{data.subscriptions.filter(s => s.active).length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400 text-sm flex items-center gap-2">
                                <FileText className="w-4 h-4 text-blue-500" />
                                Pending Invoices
                            </span>
                            <span className="text-white font-semibold">
                                {data.subscriptions.reduce((count, sub) =>
                                    count + sub.invoices.filter(inv => inv.payment_status !== 'Paid').length, 0)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400 text-sm flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-emerald-500" />
                                Recent Payments
                            </span>
                            <span className="text-white font-semibold">
                                {data.subscriptions.reduce((count, sub) => count + sub.payments.length, 0)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Subscriptions List */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <Wifi className="w-5 h-5 text-purple-500" />
                    Your Subscriptions
                </h2>

                {data.subscriptions.map((sub) => {
                    const nextBilling = getNextBillingDate(sub.invoice_date);

                    return (
                        <div key={sub.id} className="glass-card overflow-hidden">
                            {/* Subscription Header */}
                            <div className="p-6 border-b border-gray-800/50">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${sub.active
                                            ? 'bg-gradient-to-br from-emerald-600 to-green-600 shadow-emerald-900/30'
                                            : 'bg-gradient-to-br from-gray-600 to-gray-700 shadow-gray-900/30'}`}>
                                            <Wifi className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <h3 className="text-xl font-bold text-white">{sub.plan.name}</h3>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sub.active
                                                    ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50'
                                                    : 'bg-red-900/40 text-red-400 border border-red-700/50'
                                                    }`}>
                                                    {sub.active ? 'ACTIVE' : 'INACTIVE'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-500">{sub.plan.details || `₱${sub.plan.monthly_fee.toLocaleString()}/month`}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Subscription Details Grid */}
                            <div className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-purple-900/30 rounded-lg">
                                            <MapPin className="w-4 h-4 text-purple-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 uppercase mb-1">Service Address</p>
                                            <p className="text-sm text-gray-300">{sub.address}</p>
                                            <p className="text-sm text-gray-400">{sub.barangay}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-blue-900/30 rounded-lg">
                                            <Router className="w-4 h-4 text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 uppercase mb-1">Equipment</p>
                                            <p className="text-sm text-gray-300">Router SN: {sub.router_serial_number || 'N/A'}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-amber-900/30 rounded-lg">
                                            <Calendar className="w-4 h-4 text-amber-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 uppercase mb-1">Next Billing</p>
                                            <p className="text-sm text-gray-300">{nextBilling.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Balance & Actions */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {/* Balance Card */}
                                    <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-sm text-gray-400 uppercase">{getBalanceLabel(sub.balance)}</h4>
                                            <DollarSign className={`w-4 h-4 ${getBalanceColor(sub.balance)}`} />
                                        </div>
                                        <p className={`text-2xl font-bold mb-1 ${getBalanceColor(sub.balance)}`}>
                                            ₱{Math.abs(sub.balance).toLocaleString()}
                                        </p>
                                        <p className="text-xs text-gray-500 mb-4">
                                            {sub.balance > 0 ? 'Amount due for this subscription' : sub.balance < 0 ? 'Advance payment on account' : 'No outstanding balance'}
                                        </p>
                                        <div className="flex gap-2">
                                            {sub.balance > 0 && (
                                                <button
                                                    onClick={() => handlePayBills(sub)}
                                                    className="flex-1 py-2.5 px-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-sm rounded-lg transition-all flex items-center justify-center gap-2 font-medium"
                                                >
                                                    <CreditCard className="w-4 h-4" />
                                                    Pay Bill
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDownloadInvoice(sub)}
                                                className="flex-1 py-2.5 px-3 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Download className="w-4 h-4" />
                                                Invoice
                                            </button>
                                        </div>
                                    </div>

                                    {/* Recent Invoices */}
                                    <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl p-4">
                                        <h4 className="text-sm text-gray-400 uppercase mb-3">Recent Invoices</h4>
                                        <div className="space-y-2">
                                            {sub.invoices.slice(0, 3).map((invoice) => (
                                                <div key={invoice.id} className="flex items-center justify-between text-xs p-2 bg-gray-900/50 rounded-lg">
                                                    <span className="text-gray-400">
                                                        {formatShortDate(invoice.due_date)}
                                                    </span>
                                                    <span className="text-white font-medium">
                                                        ₱{invoice.amount_due.toLocaleString()}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded-full text-xs ${invoice.payment_status === 'Paid'
                                                            ? 'bg-emerald-900/40 text-emerald-400'
                                                            : invoice.payment_status === 'Partially Paid'
                                                                ? 'bg-amber-900/40 text-amber-400'
                                                                : 'bg-red-900/40 text-red-400'
                                                        }`}>
                                                        {invoice.payment_status || 'Unpaid'}
                                                    </span>
                                                </div>
                                            ))}
                                            {sub.invoices.length === 0 && (
                                                <p className="text-gray-500 text-xs text-center py-2">No invoices yet</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Recent Payments */}
                                {sub.payments.length > 0 && (
                                    <div className="mt-4 bg-[#0a0a0a] border border-gray-800 rounded-xl p-4">
                                        <h4 className="text-sm text-gray-400 uppercase mb-3">Recent Payments</h4>
                                        <div className="space-y-2">
                                            {sub.payments.slice(0, 3).map((payment) => (
                                                <div key={payment.id} className="flex items-center justify-between text-xs p-2 bg-gray-900/50 rounded-lg">
                                                    <div className="flex items-center gap-2">
                                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                                        <span className="text-gray-400">
                                                            {formatShortDate(payment.settlement_date || payment.created_at)}
                                                        </span>
                                                    </div>
                                                    <span className="text-emerald-400 font-medium">
                                                        +₱{payment.amount.toLocaleString()}
                                                    </span>
                                                    <span className="text-gray-500 uppercase text-xs">
                                                        {payment.mode || 'Cash'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {data.subscriptions.length === 0 && (
                    <div className="glass-card p-12 text-center">
                        <Wifi className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-400">No Subscriptions Found</h3>
                        <p className="text-gray-600 text-sm mt-1">Contact support to set up a new connection.</p>
                    </div>
                )}
            </div>

            {/* Payment Modal */}
            {showPayModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowPayModal(false)} />
                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-purple-900/50 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-[0_0_60px_rgba(139,92,246,0.15)]">
                        <div className="w-14 h-14 bg-gradient-to-br from-violet-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-900/30">
                            <CreditCard className="w-7 h-7 text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2 text-center">Payment Options</h3>
                        <p className="text-gray-400 text-center text-sm mb-6">
                            {paymentType === 'all'
                                ? `Total Amount: ₱${data.totalBalance.toLocaleString()}`
                                : `Amount: ₱${Math.max(0, selectedSubscription?.balance || 0).toLocaleString()}`
                            }
                        </p>

                        <div className="space-y-3 mb-6">
                            <p className="text-xs font-medium text-gray-500 uppercase mb-2">E-Wallets</p>

                            <button
                                onClick={() => handlePayment('gcash')}
                                disabled={isProcessingPayment}
                                className="w-full p-4 bg-[#007DFE]/10 border border-[#007DFE]/30 hover:bg-[#007DFE]/20 text-white rounded-xl transition-all flex items-center justify-between group disabled:opacity-50"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-[#007DFE] rounded-lg flex items-center justify-center text-white font-bold text-xs">
                                        GC
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold">GCash</p>
                                        <p className="text-xs text-gray-400">Pay via GCash App</p>
                                    </div>
                                </div>
                                {isProcessingPayment && <Loader2 className="w-4 h-4 animate-spin" />}
                            </button>

                            <button
                                onClick={() => handlePayment('paymaya')}
                                disabled={isProcessingPayment}
                                className="w-full p-4 bg-white/5 border border-white/20 hover:bg-white/10 text-white rounded-xl transition-all flex items-center justify-between group disabled:opacity-50"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                                        <span className="text-black font-bold text-xs">Maya</span>
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold">Maya</p>
                                        <p className="text-xs text-gray-400">Pay via Maya App</p>
                                    </div>
                                </div>
                                {isProcessingPayment && <Loader2 className="w-4 h-4 animate-spin" />}
                            </button>

                            <button
                                onClick={() => handlePayment('grab_pay')}
                                disabled={isProcessingPayment}
                                className="w-full p-4 bg-[#00B14F]/10 border border-[#00B14F]/30 hover:bg-[#00B14F]/20 text-white rounded-xl transition-all flex items-center justify-between group disabled:opacity-50"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-[#00B14F] rounded-lg flex items-center justify-center text-white font-bold text-xs">
                                        GP
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold">GrabPay</p>
                                        <p className="text-xs text-gray-400">Pay via GrabPay</p>
                                    </div>
                                </div>
                                {isProcessingPayment && <Loader2 className="w-4 h-4 animate-spin" />}
                            </button>

                            <p className="text-xs font-medium text-gray-500 uppercase mt-4 mb-2">Online Banking</p>

                            <button
                                onClick={() => handlePayment('dob')}
                                disabled={isProcessingPayment}
                                className="w-full p-4 bg-[#B10025]/10 border border-[#B10025]/30 hover:bg-[#B10025]/20 text-white rounded-xl transition-all flex items-center justify-between group disabled:opacity-50"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-[#B10025] rounded-lg flex items-center justify-center text-white font-bold text-xs">
                                        BPI
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold">BPI Online</p>
                                        <p className="text-xs text-gray-400">Direct Online Banking</p>
                                    </div>
                                </div>
                                {isProcessingPayment && <Loader2 className="w-4 h-4 animate-spin" />}
                            </button>

                            <button
                                onClick={() => handlePayment('dob_ubp')}
                                disabled={isProcessingPayment}
                                className="w-full p-4 bg-[#F68E1E]/10 border border-[#F68E1E]/30 hover:bg-[#F68E1E]/20 text-white rounded-xl transition-all flex items-center justify-between group disabled:opacity-50"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-[#F68E1E] rounded-lg flex items-center justify-center text-white font-bold text-xs">
                                        UBP
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold">UnionBank</p>
                                        <p className="text-xs text-gray-400">Direct Online Banking</p>
                                    </div>
                                </div>
                                {isProcessingPayment && <Loader2 className="w-4 h-4 animate-spin" />}
                            </button>
                        </div>

                        <p className="text-gray-500 text-xs text-center mb-4">
                            Secure payment processing via PayMongo
                        </p>

                        <button
                            onClick={() => setShowPayModal(false)}
                            className="w-full bg-gray-800 hover:bg-gray-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Invoice Download Modal */}
            {showInvoiceModal && selectedSubscription && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowInvoiceModal(false)} />
                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-blue-900/50 rounded-2xl p-6 max-w-md w-full shadow-[0_0_60px_rgba(59,130,246,0.15)]">
                        <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-900/30">
                            <Download className="w-7 h-7 text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2 text-center">Download Invoice</h3>
                        <p className="text-gray-400 text-center text-sm mb-6">
                            Select month and year to generate invoice
                        </p>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="text-sm text-gray-400 mb-2 block">Month</label>
                                <div className="relative">
                                    <select
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white appearance-none focus:border-blue-500 focus:outline-none"
                                    >
                                        {months.map(m => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-3.5 w-5 h-5 text-gray-500 pointer-events-none" />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm text-gray-400 mb-2 block">Year</label>
                                <div className="relative">
                                    <select
                                        value={selectedYear}
                                        onChange={(e) => setSelectedYear(e.target.value)}
                                        className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white appearance-none focus:border-blue-500 focus:outline-none"
                                    >
                                        {years.map(y => (
                                            <option key={y} value={y}>{y}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-3.5 w-5 h-5 text-gray-500 pointer-events-none" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={handleGenerateInvoice}
                                disabled={isGeneratingInvoice}
                                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/30"
                            >
                                {isGeneratingInvoice ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-5 h-5" />
                                        Generate & Download
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => setShowInvoiceModal(false)}
                                className="w-full bg-gray-800 hover:bg-gray-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Share Modal */}
            {showShareModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowShareModal(false)} />
                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-purple-900/50 rounded-2xl p-6 max-w-md w-full shadow-[0_0_60px_rgba(139,92,246,0.15)]">
                        <div className="w-14 h-14 bg-gradient-to-br from-violet-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-900/30">
                            <Share2 className="w-7 h-7 text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2 text-center">Refer a Friend</h3>
                        <p className="text-gray-400 mb-6 text-center text-sm">
                            Share ALLSTAR with your friends and get ₱300 credit when they subscribe!
                        </p>
                        <div className="space-y-3">
                            <button
                                onClick={handleShareToFacebook}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                            >
                                <Share2 className="w-5 h-5" />
                                Share to Facebook
                            </button>
                            <button
                                onClick={copyReferralLink}
                                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-xl transition-colors"
                            >
                                Copy Referral Link
                            </button>
                            <button
                                onClick={() => setShowShareModal(false)}
                                className="w-full bg-gray-800 hover:bg-gray-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
