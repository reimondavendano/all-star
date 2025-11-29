'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CreditCard, Calendar, Wifi, AlertCircle, Loader2, Share2 } from 'lucide-react';

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
    };
    balance: number;
    invoices: {
        id: string;
        due_date: string;
        amount_due: number;
        paid: boolean;
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

            // 1. Get Profile -> Customer ID
            const { data: profile } = await supabase
                .from('profiles')
                .select('customer_id')
                .eq('id', user.id)
                .single();

            if (!profile?.customer_id) return;

            // 2. Get Customer & Subscription
            const { data: subscriptionData } = await supabase
                .from('subscriptions')
                .select(`
                    id,
                    active,
                    invoice_date,
                    plans (name, monthly_fee),
                    customers (id, name)
                `)
                .eq('subscriber_id', profile.customer_id)
                .eq('active', true)
                .single();

            if (!subscriptionData) return;

            // Handle potential array returns from Supabase joins
            const subscription = subscriptionData as any;
            const customer = Array.isArray(subscription.customers) ? subscription.customers[0] : subscription.customers;
            const plan = Array.isArray(subscription.plans) ? subscription.plans[0] : subscription.plans;

            // 3. Get Balance
            const { data: balanceData } = await supabase
                .from('subscription_balance_view')
                .select('balance')
                .eq('subscription_id', subscription.id)
                .single();

            // 4. Get Recent Invoices
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
                    status: subscription.active
                },
                balance: balanceData?.balance || 0,
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
        const day = parseInt(invoiceDateEnum); // '15th' -> 15, '30th' -> 30

        let nextDate = new Date(today.getFullYear(), today.getMonth(), day);
        if (nextDate < today) {
            nextDate = new Date(today.getFullYear(), today.getMonth() + 1, day);
        }
        return nextDate;
    };

    const handleShareToFacebook = () => {
        if (!data?.customer.id) return;

        // Determine the base URL
        const baseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost'
            ? 'http://localhost:3000'
            : 'https://all-star-three.vercel.app';

        // Create referral link
        const referralUrl = `${baseUrl}/ref/${data.customer.id}`;

        // Facebook share URL
        const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralUrl)}`;

        // Open Facebook share dialog
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
                <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="text-center text-gray-500 mt-10">
                No active subscription found.
            </div>
        );
    }

    const nextBilling = getNextBillingDate(data.subscription.invoice_date);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white neon-text">My Dashboard</h1>
                    <p className="text-xs text-gray-500 font-mono mt-1">SUBSCRIBER: {data.customer.name}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowShareModal(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                        <Share2 className="w-4 h-4" />
                        Refer a Friend
                    </button>
                    <span className="px-3 py-1 rounded border border-green-500/30 bg-green-900/10 text-green-400 text-sm font-mono flex items-center">
                        <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                        ACTIVE SERVICE
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="tech-card p-6 rounded-xl group hover:border-red-500/50 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-gray-400 text-xs font-mono uppercase">Current Plan</h3>
                        <Wifi className="w-5 h-5 text-red-500 group-hover:animate-pulse" />
                    </div>
                    <p className="text-2xl font-bold text-white neon-text">{data.subscription.plan_name}</p>
                    <p className="text-sm text-gray-500 mt-1 font-mono">₱{data.subscription.monthly_fee.toLocaleString()} / month</p>
                </div>

                <div className="tech-card p-6 rounded-xl group hover:border-red-500/50 transition-colors relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-gray-400 text-xs font-mono uppercase">Current Balance</h3>
                        <CreditCard className="w-5 h-5 text-red-500 group-hover:animate-pulse" />
                    </div>
                    <p className="text-2xl font-bold text-white neon-text">₱{data.balance.toLocaleString()}</p>
                    <p className="text-sm text-red-500 mt-1 font-mono">
                        {data.balance > 0 ? 'Payment Due' : 'No Payment Due'}
                    </p>

                    {data.balance > 0 && (
                        <button
                            onClick={() => setShowPayModal(true)}
                            className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors flex items-center justify-center gap-2"
                        >
                            <CreditCard className="w-4 h-4" />
                            Pay Now
                        </button>
                    )}
                </div>

                <div className="tech-card p-6 rounded-xl group hover:border-red-500/50 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-gray-400 text-xs font-mono uppercase">Next Billing</h3>
                        <Calendar className="w-5 h-5 text-red-500 group-hover:animate-pulse" />
                    </div>
                    <p className="text-2xl font-bold text-white neon-text">
                        {nextBilling.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <p className="text-sm text-gray-500 mt-1 font-mono">Billing Cycle: {data.subscription.invoice_date}</p>
                </div>
            </div>

            <div className="tech-card p-6 rounded-xl">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-white flex items-center">
                        <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
                        Recent Invoices
                    </h3>
                    <span className="text-xs text-gray-500 font-mono">HISTORY</span>
                </div>
                <div className="space-y-4">
                    {data.invoices.map((invoice) => (
                        <div key={invoice.id} className="flex items-center justify-between p-4 bg-black/40 border border-gray-800 rounded-lg hover:border-red-500/30 transition-colors group">
                            <div className="flex items-center">
                                <div className="p-2 bg-red-900/10 rounded-lg mr-4 border border-red-900/20 group-hover:border-red-500/50">
                                    <CreditCard className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                                </div>
                                <div>
                                    <p className="text-white font-medium font-mono text-sm">Invoice #{invoice.id.slice(0, 8)}</p>
                                    <p className="text-xs text-gray-500">
                                        Due: {new Date(invoice.due_date).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-white font-medium font-mono">₱{invoice.amount_due.toLocaleString()}</p>
                                <span className={`text-xs font-mono px-2 py-0.5 rounded ${invoice.paid ? 'text-green-400 bg-green-900/20' : 'text-yellow-400 bg-yellow-900/20'}`}>
                                    {invoice.paid ? 'PAID' : 'UNPAID'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Pay Modal */}
            {showPayModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowPayModal(false)} />
                    <div className="relative bg-[#0a0a0a] border border-red-500/30 rounded-xl p-6 max-w-sm w-full text-center">
                        <div className="w-12 h-12 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CreditCard className="w-6 h-6 text-red-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Payment Options</h3>
                        <p className="text-gray-400 mb-6">
                            Online payment via E-Wallet (PayMongo) is coming soon!
                            <br /><br />
                            For now, please pay via Cash to our collector or visit our office.
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
