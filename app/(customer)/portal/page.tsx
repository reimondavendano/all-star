'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CreditCard, Calendar, Wifi, AlertCircle, Loader2, Share2, FileText, TrendingUp, DollarSign } from 'lucide-react';

interface PortalData {
    customer: {
        id: string;
        name: string;
    };
    subscription: {
        id: string;
        plan_name: string;
        monthly_fee: number;
        invoice_date: string;
        status: boolean;
        balance: number;
    };
    invoices: {
        id: string;
        due_date: string;
        amount_due: number;
        payment_status: string;
        created_at: string;
    }[];
}

export default function CustomerDashboard() {
    const [data, setData] = useState<PortalData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showPayModal, setShowPayModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);

    useEffect(() => {
        fetchPortalData();
    }, []);

    const fetchPortalData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from('profiles')
                .select('customer_id')
                .eq('id', user.id)
                .single();

            if (!profile?.customer_id) return;

            const { data: subscriptionData } = await supabase
                .from('subscriptions')
                .select(`
                    id,
                    active,
                    invoice_date,
                    balance,
                    plans (name, monthly_fee),
                    customers!subscriptions_subscriber_id_fkey (id, name)
                `)
                .eq('subscriber_id', profile.customer_id)
                .eq('active', true)
                .single();

            if (!subscriptionData) return;

            const subscription = subscriptionData as any;
            const customer = Array.isArray(subscription.customers) ? subscription.customers[0] : subscription.customers;
            const plan = Array.isArray(subscription.plans) ? subscription.plans[0] : subscription.plans;

            const { data: invoices } = await supabase
                .from('invoices')
                .select('*')
                .eq('subscription_id', subscription.id)
                .order('created_at', { ascending: false })
                .limit(5);

            setData({
                customer: {
                    id: customer?.id || '',
                    name: customer?.name || 'Unknown'
                },
                subscription: {
                    id: subscription.id,
                    plan_name: plan?.name || 'Unknown Plan',
                    monthly_fee: plan?.monthly_fee || 0,
                    invoice_date: subscription.invoice_date,
                    status: subscription.active,
                    balance: subscription.balance || 0
                },
                invoices: invoices || []
            });

        } catch (error) {
            console.error('Error fetching portal data:', error);
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

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-900/30">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                    <p className="text-gray-400">Loading your dashboard...</p>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="glass-card p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-amber-600 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-900/30">
                        <AlertCircle className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">No Active Subscription</h2>
                    <p className="text-gray-400">Contact support to activate your service.</p>
                </div>
            </div>
        );
    }

    const nextBilling = getNextBillingDate(data.subscription.invoice_date);
    const balance = data.subscription.balance;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">My Dashboard</h1>
                    <p className="text-sm text-gray-500 mt-1">Welcome back, {data.customer.name}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowShareModal(true)}
                        className="px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl transition-all flex items-center gap-2 text-sm font-medium shadow-lg shadow-purple-900/30"
                    >
                        <Share2 className="w-4 h-4" />
                        Refer a Friend
                    </button>
                    <span className="px-3 py-1.5 rounded-full bg-emerald-900/30 text-emerald-400 text-sm flex items-center border border-emerald-700/50">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
                        ACTIVE
                    </span>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Current Plan */}
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-gray-400 text-xs uppercase tracking-wider">Current Plan</h3>
                        <div className="p-2 bg-purple-900/30 rounded-lg">
                            <Wifi className="w-5 h-5 text-purple-400" />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-white">{data.subscription.plan_name}</p>
                    <p className="text-sm text-gray-500 mt-1">₱{data.subscription.monthly_fee.toLocaleString()} / month</p>
                </div>

                {/* Balance / Credits */}
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-gray-400 text-xs uppercase tracking-wider">{getBalanceLabel(balance)}</h3>
                        <div className={`p-2 rounded-lg ${balance > 0 ? 'bg-red-900/30' : balance < 0 ? 'bg-emerald-900/30' : 'bg-gray-800'}`}>
                            <DollarSign className={`w-5 h-5 ${getBalanceColor(balance)}`} />
                        </div>
                    </div>
                    <p className={`text-2xl font-bold ${getBalanceColor(balance)}`}>
                        ₱{Math.abs(balance).toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                        {balance > 0 ? 'Payment Due' : balance < 0 ? 'Advance Payment' : 'All paid up!'}
                    </p>

                    {balance > 0 && (
                        <button
                            onClick={() => setShowPayModal(true)}
                            className="mt-4 w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-medium py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-900/30"
                        >
                            <CreditCard className="w-4 h-4" />
                            Pay Now
                        </button>
                    )}
                </div>

                {/* Next Billing */}
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-gray-400 text-xs uppercase tracking-wider">Next Billing</h3>
                        <div className="p-2 bg-blue-900/30 rounded-lg">
                            <Calendar className="w-5 h-5 text-blue-400" />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-white">
                        {nextBilling.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">Billing Day: {data.subscription.invoice_date}</p>
                </div>
            </div>

            {/* Recent Invoices */}
            <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <FileText className="w-5 h-5 text-purple-500" />
                        Recent Invoices
                    </h3>
                    <span className="text-xs text-gray-500">Last 5 invoices</span>
                </div>
                <div className="space-y-3">
                    {data.invoices.length > 0 ? (
                        data.invoices.map((invoice) => (
                            <div key={invoice.id} className="flex items-center justify-between p-4 bg-[#0a0a0a] border border-gray-800 rounded-xl hover:border-gray-700 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-gray-800 rounded-lg">
                                        <CreditCard className="w-5 h-5 text-gray-400" />
                                    </div>
                                    <div>
                                        <p className="text-white font-medium text-sm">Invoice #{invoice.id.slice(0, 8)}</p>
                                        <p className="text-xs text-gray-500">
                                            Due: {new Date(invoice.due_date).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-white font-medium">₱{invoice.amount_due.toLocaleString()}</p>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${invoice.payment_status === 'Paid'
                                            ? 'bg-emerald-900/40 text-emerald-400'
                                            : invoice.payment_status === 'Partially Paid'
                                                ? 'bg-amber-900/40 text-amber-400'
                                                : 'bg-red-900/40 text-red-400'
                                        }`}>
                                        {invoice.payment_status || 'Unpaid'}
                                    </span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p>No invoices yet</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Pay Modal */}
            {showPayModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowPayModal(false)} />
                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-purple-900/50 rounded-2xl p-6 max-w-sm w-full text-center shadow-[0_0_60px_rgba(139,92,246,0.15)]">
                        <div className="w-14 h-14 bg-gradient-to-br from-violet-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-900/30">
                            <CreditCard className="w-7 h-7 text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Payment Options</h3>
                        <p className="text-gray-400 mb-6 text-sm">
                            Online payment via E-Wallet (PayMongo) is coming soon!
                            <br /><br />
                            For now, please pay via Cash to our collector or visit our office.
                        </p>
                        <button
                            onClick={() => setShowPayModal(false)}
                            className="w-full bg-gray-800 hover:bg-gray-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors"
                        >
                            Close
                        </button>
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
