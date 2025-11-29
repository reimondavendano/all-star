'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { CreditCard, Calendar, Wifi, AlertCircle, Loader2, Share2, MapPin, Router, Phone, Download, ChevronDown } from 'lucide-react';

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
}

interface PortalData {
    customer: {
        id: string;
        name: string;
        mobile_number: string;
    };
    subscriptions: Subscription[];
    totalBalance: number;
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

    useEffect(() => {
        if (params.id) {
            fetchPortalData();
        }
    }, [params.id]);

    useEffect(() => {
        // Initialize to current month/year
        const now = new Date();
        setSelectedMonth(String(now.getMonth() + 1).padStart(2, '0'));
        setSelectedYear(String(now.getFullYear()));
    }, []);

    const fetchPortalData = async () => {
        try {
            const customerId = params.id as string;

            // 1. Fetch Customer Details
            const { data: customerData, error: customerError } = await supabase
                .from('customers')
                .select('id, name, mobile_number')
                .eq('id', customerId)
                .single();

            if (customerError) throw customerError;
            if (!customerData) throw new Error('Customer not found');

            // 2. Get ALL Subscriptions for this Customer
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
                    plans (name, monthly_fee, details)
                `)
                .eq('subscriber_id', customerId)
                .order('created_at', { ascending: false });

            if (subsError) throw subsError;

            // 3. For each subscription, get balance and recent invoices
            const subscriptionsWithDetails = await Promise.all(
                (subscriptionsData || []).map(async (sub: any) => {
                    // Get balance
                    const { data: balanceData } = await supabase
                        .from('subscription_balance_view')
                        .select('balance')
                        .eq('subscription_id', sub.id)
                        .single();

                    // Get recent invoices
                    const { data: invoices } = await supabase
                        .from('invoices')
                        .select('*')
                        .eq('subscription_id', sub.id)
                        .order('created_at', { ascending: false })
                        .limit(3);

                    const plan = Array.isArray(sub.plans) ? sub.plans[0] : sub.plans;

                    return {
                        id: sub.id,
                        active: sub.active,
                        invoice_date: sub.invoice_date,
                        date_installed: sub.date_installed,
                        address: sub.address,
                        barangay: sub.barangay,
                        router_serial_number: sub.router_serial_number,
                        balance: balanceData?.balance || 0,
                        plan: {
                            name: plan?.name || 'Unknown Plan',
                            monthly_fee: plan?.monthly_fee || 0,
                            details: plan?.details || ''
                        },
                        invoices: invoices || []
                    };
                })
            );

            // Calculate total balance across all subscriptions
            const totalBalance = subscriptionsWithDetails.reduce((sum, sub) => sum + sub.balance, 0);

            setData({
                customer: {
                    id: customerData.id,
                    name: customerData.name,
                    mobile_number: customerData.mobile_number
                },
                subscriptions: subscriptionsWithDetails,
                totalBalance
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

    const handleGenerateInvoice = () => {
        // Placeholder for invoice generation
        alert(`Generating invoice for ${selectedMonth}/${selectedYear}...\nThis feature will be implemented soon!`);
        setShowInvoiceModal(false);
    };

    const handlePaymentSubmit = () => {
        // Placeholder for payment processing
        alert('Payment processing will be integrated with PayMongo/Xendit soon!');
        setShowPayModal(false);
    };

    const months = [
        { value: '01', label: 'January' },
        { value: '02', label: 'February' },
        { value: '03', label: 'March' },
        { value: '04', label: 'April' },
        { value: '05', label: 'May' },
        { value: '06', label: 'June' },
        { value: '07', label: 'July' },
        { value: '08', label: 'August' },
        { value: '09', label: 'September' },
        { value: '10', label: 'October' },
        { value: '11', label: 'November' },
        { value: '12', label: 'December' },
    ];

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 3 }, (_, i) => currentYear - 1 + i);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="tech-card p-8 max-w-md w-full text-center rounded-xl">
                    <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2 neon-text">Access Denied</h1>
                    <p className="text-gray-400 font-mono text-sm">{error || 'Invalid portal link'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white neon-text">Welcome, {data.customer.name}</h1>
                    <div className="flex items-center gap-4 mt-2">
                        <p className="text-sm text-gray-500 font-mono flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            {data.customer.mobile_number}
                        </p>
                        <p className="text-sm text-gray-500 font-mono flex items-center gap-2">
                            <Wifi className="w-4 h-4" />
                            {data.subscriptions.length} Subscription{data.subscriptions.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowShareModal(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                        <Share2 className="w-4 h-4" />
                        Refer a Friend
                    </button>
                </div>
            </div>

            {/* Total Balance Card */}
            <div className="tech-card p-6 rounded-xl bg-gradient-to-br from-red-900/20 to-black border-red-500/30">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-gray-400 text-xs font-mono uppercase mb-2">Total Balance (All Subscriptions)</h3>
                        <p className="text-4xl font-bold text-white neon-text">₱{data.totalBalance.toLocaleString()}</p>
                        <p className="text-sm text-red-500 mt-2 font-mono">
                            {data.totalBalance > 0 ? 'Payment Due' : 'All Paid Up!'}
                        </p>
                    </div>
                    {data.totalBalance > 0 && (
                        <button
                            onClick={() => handlePayBills()}
                            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors flex items-center gap-2"
                        >
                            <CreditCard className="w-5 h-5" />
                            Pay All Bills
                        </button>
                    )}
                </div>
            </div>

            {/* Subscriptions List */}
            <div className="space-y-6">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <Wifi className="w-5 h-5 text-red-500" />
                    Your Subscriptions
                </h2>

                {data.subscriptions.map((sub) => {
                    const nextBilling = getNextBillingDate(sub.invoice_date);

                    return (
                        <div key={sub.id} className="tech-card p-6 rounded-xl group hover:border-red-500/30 transition-all">
                            {/* Subscription Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-800">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-2xl font-bold text-white neon-text">{sub.plan.name}</h3>
                                        <span className={`px-2 py-0.5 rounded text-xs font-mono border ${sub.active
                                                ? 'border-green-500/30 bg-green-900/10 text-green-400'
                                                : 'border-red-500/30 bg-red-900/10 text-red-400'
                                            }`}>
                                            {sub.active ? 'ACTIVE' : 'INACTIVE'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-500 font-mono">{sub.plan.details || 'High-speed internet'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-3xl font-bold text-white">₱{sub.plan.monthly_fee.toLocaleString()}</p>
                                    <p className="text-xs text-red-400 font-mono">Due on {sub.invoice_date || '30th'}</p>
                                </div>
                            </div>

                            {/* Subscription Details Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                                <div className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-white/5 rounded-lg mt-1">
                                            <MapPin className="w-4 h-4 text-red-500" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 font-mono uppercase mb-1">Service Address</p>
                                            <p className="text-sm text-gray-300">{sub.address}</p>
                                            <p className="text-sm text-gray-400">{sub.barangay}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-white/5 rounded-lg mt-1">
                                            <Router className="w-4 h-4 text-red-500" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 font-mono uppercase mb-1">Equipment</p>
                                            <p className="text-sm text-gray-300">Router SN: {sub.router_serial_number || 'N/A'}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-white/5 rounded-lg mt-1">
                                            <Calendar className="w-4 h-4 text-red-500" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 font-mono uppercase mb-1">Installation</p>
                                            <p className="text-sm text-gray-300">{formatDate(sub.date_installed)}</p>
                                            <p className="text-xs text-gray-500 mt-1">Next: {nextBilling.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Balance & Actions */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Balance Card */}
                                <div className="bg-black/40 border border-gray-800 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-mono text-gray-400 uppercase">Current Balance</h4>
                                        <CreditCard className="w-4 h-4 text-red-500" />
                                    </div>
                                    <p className="text-2xl font-bold text-white">₱{sub.balance.toLocaleString()}</p>
                                    <p className="text-xs text-gray-500 mt-1 mb-3">
                                        {sub.balance > 0 ? 'Payment Required' : 'Paid Up'}
                                    </p>
                                    <div className="flex gap-2">
                                        {sub.balance > 0 && (
                                            <button
                                                onClick={() => handlePayBills(sub)}
                                                className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors flex items-center justify-center gap-2"
                                            >
                                                <CreditCard className="w-4 h-4" />
                                                Pay Bill
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDownloadInvoice(sub)}
                                            className="flex-1 py-2 px-3 bg-white/5 hover:bg-white/10 text-gray-300 text-sm rounded transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Download className="w-4 h-4" />
                                            Invoice
                                        </button>
                                    </div>
                                </div>

                                {/* Recent Invoices */}
                                <div className="bg-black/40 border border-gray-800 rounded-lg p-4">
                                    <h4 className="text-sm font-mono text-gray-400 uppercase mb-3">Recent Invoices</h4>
                                    <div className="space-y-2">
                                        {sub.invoices.slice(0, 2).map((invoice) => (
                                            <div key={invoice.id} className="flex items-center justify-between text-xs">
                                                <span className="text-gray-400 font-mono">
                                                    {new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </span>
                                                <span className="text-white font-mono">₱{invoice.amount_due.toLocaleString()}</span>
                                                <span className={`px-2 py-0.5 rounded font-mono ${invoice.payment_status === 'Paid'
                                                        ? 'bg-green-900/20 text-green-400'
                                                        : 'bg-yellow-900/20 text-yellow-400'
                                                    }`}>
                                                    {invoice.payment_status || 'UNPAID'}
                                                </span>
                                            </div>
                                        ))}
                                        {sub.invoices.length === 0 && (
                                            <p className="text-gray-500 text-xs">No invoices yet</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {data.subscriptions.length === 0 && (
                    <div className="text-center py-12 bg-[#0f0f0f] rounded-xl border border-dashed border-gray-800">
                        <Wifi className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-400">No Subscriptions Found</h3>
                        <p className="text-gray-600 text-sm mt-1">Contact support to set up a new connection.</p>
                    </div>
                )}
            </div>

            {/* Payment Modal */}
            {showPayModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowPayModal(false)} />
                    <div className="relative bg-[#0a0a0a] border border-red-500/30 rounded-xl p-6 max-w-md w-full">
                        <div className="w-12 h-12 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CreditCard className="w-6 h-6 text-red-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2 text-center">Payment Options</h3>
                        <p className="text-gray-400 text-center text-sm mb-6">
                            {paymentType === 'all'
                                ? `Total Amount: ₱${data.totalBalance.toLocaleString()}`
                                : `Amount: ₱${selectedSubscription?.balance.toLocaleString()}`
                            }
                        </p>

                        <div className="space-y-3 mb-6">
                            <button className="w-full p-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg transition-all flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                                        <CreditCard className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold">GCash</p>
                                        <p className="text-xs text-blue-100">Pay via GCash wallet</p>
                                    </div>
                                </div>
                                <span className="text-xs bg-yellow-500 text-black px-2 py-1 rounded font-bold">SOON</span>
                            </button>

                            <button className="w-full p-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg transition-all flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                                        <CreditCard className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold">PayMaya</p>
                                        <p className="text-xs text-purple-100">Pay via PayMaya wallet</p>
                                    </div>
                                </div>
                                <span className="text-xs bg-yellow-500 text-black px-2 py-1 rounded font-bold">SOON</span>
                            </button>

                            <button className="w-full p-4 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg transition-all flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                                        <CreditCard className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold">Credit/Debit Card</p>
                                        <p className="text-xs text-green-100">Visa, Mastercard, etc.</p>
                                    </div>
                                </div>
                                <span className="text-xs bg-yellow-500 text-black px-2 py-1 rounded font-bold">SOON</span>
                            </button>
                        </div>

                        <p className="text-gray-500 text-xs text-center mb-4">
                            Online payment integration coming soon via PayMongo/Xendit
                        </p>

                        <button
                            onClick={() => setShowPayModal(false)}
                            className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* Invoice Download Modal */}
            {showInvoiceModal && selectedSubscription && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowInvoiceModal(false)} />
                    <div className="relative bg-[#0a0a0a] border border-blue-500/30 rounded-xl p-6 max-w-md w-full">
                        <div className="w-12 h-12 bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Download className="w-6 h-6 text-blue-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2 text-center">Download Invoice</h3>
                        <p className="text-gray-400 text-center text-sm mb-6">
                            Select month and year to generate invoice
                        </p>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="text-sm text-gray-400 font-mono mb-2 block">MONTH</label>
                                <div className="relative">
                                    <select
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-3 text-white appearance-none focus:border-blue-500 focus:outline-none"
                                    >
                                        {months.map(m => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-3.5 w-5 h-5 text-gray-500 pointer-events-none" />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm text-gray-400 font-mono mb-2 block">YEAR</label>
                                <div className="relative">
                                    <select
                                        value={selectedYear}
                                        onChange={(e) => setSelectedYear(e.target.value)}
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-3 text-white appearance-none focus:border-blue-500 focus:outline-none"
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
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition-colors flex items-center justify-center gap-2"
                            >
                                <Download className="w-5 h-5" />
                                Generate & Download
                            </button>
                            <button
                                onClick={() => setShowInvoiceModal(false)}
                                className="w-full bg-gray-800 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded transition-colors"
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
                    <div className="relative bg-[#0a0a0a] border border-blue-500/30 rounded-xl p-6 max-w-md w-full">
                        <div className="w-12 h-12 bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Share2 className="w-6 h-6 text-blue-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2 text-center">Refer a Friend</h3>
                        <p className="text-gray-400 mb-6 text-center text-sm">
                            Share ALLSTAR with your friends and get ₱300 credit when they subscribe!
                        </p>
                        <div className="space-y-3">
                            <button
                                onClick={handleShareToFacebook}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition-colors flex items-center justify-center gap-2"
                            >
                                <Share2 className="w-5 h-5" />
                                Share to Facebook
                            </button>
                            <button
                                onClick={copyReferralLink}
                                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded transition-colors"
                            >
                                Copy Referral Link
                            </button>
                            <button
                                onClick={() => setShowShareModal(false)}
                                className="w-full bg-gray-800 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded transition-colors"
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
