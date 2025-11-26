'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import {
    User, Wifi, Calendar, MapPin, CreditCard,
    Activity, Shield, Clock, Download, AlertCircle, CheckCircle,
    Router, Smartphone, Map
} from 'lucide-react';

interface CustomerDetails {
    id: string;
    name: string;
    mobile_number: string;
}

interface Subscription {
    id: string;
    active: boolean;
    plan_id: string;
    date_installed: string;
    invoice_date: string;
    address: string;
    barangay: string;
    router_serial_number: string;
    plans: {
        name: string;
        monthly_fee: number;
        details: string;
    };
}

export default function CustomerPortalPage() {
    const params = useParams();
    const [customer, setCustomer] = useState<CustomerDetails | null>(null);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (params.id) {
            fetchData();
        }
    }, [params.id]);

    const fetchData = async () => {
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

            setCustomer(customerData);

            // 2. Fetch All Subscriptions for this Customer
            const { data: subsData, error: subsError } = await supabase
                .from('subscriptions')
                .select(`
                    *,
                    plans (name, monthly_fee, details)
                `)
                .eq('subscriber_id', customerId)
                .order('created_at', { ascending: false });

            if (subsError) throw subsError;

            setSubscriptions(subsData || []);
        } catch (err) {
            console.error('Error fetching data:', err);
            setError('Unable to load portal. Please check your link.');
        } finally {
            setIsLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
            </div>
        );
    }

    if (error || !customer) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
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
        <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-gray-800 pb-6">
                <div>
                    <h1 className="text-4xl font-bold text-white neon-text mb-2">
                        Welcome, <span className="text-red-500">{customer.name}</span>
                    </h1>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-400 font-mono">
                        <span className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-full">
                            <User className="w-4 h-4 text-red-500" />
                            ID: {customer.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-full">
                            <Smartphone className="w-4 h-4 text-red-500" />
                            {customer.mobile_number}
                        </span>
                        <span className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-full">
                            <Wifi className="w-4 h-4 text-red-500" />
                            {subscriptions.length} Active Subscription{subscriptions.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all hover:shadow-[0_0_15px_rgba(220,38,38,0.5)] flex items-center gap-2 group">
                        <CreditCard className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        Pay All Bills
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content - Subscriptions List */}
                <div className="lg:col-span-2 space-y-6">
                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                        <Activity className="w-5 h-5 text-red-500" />
                        Your Subscriptions
                    </h2>

                    {subscriptions.map((sub) => (
                        <div key={sub.id} className="tech-card p-6 rounded-xl group hover:border-red-500/30 transition-all duration-300">
                            {/* Subscription Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-gray-800 pb-4">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="text-xl font-bold text-white neon-text">{sub.plans?.name}</h3>
                                        <span className={`px-2 py-0.5 rounded text-xs font-mono border ${sub.active
                                                ? 'border-green-500/30 bg-green-900/10 text-green-400'
                                                : 'border-red-500/30 bg-red-900/10 text-red-400'
                                            }`}>
                                            {sub.active ? 'ACTIVE' : 'INACTIVE'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-500 font-mono">{sub.plans?.details || 'High-speed internet'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-bold text-white">₱{sub.plans?.monthly_fee.toLocaleString()}</p>
                                    <p className="text-xs text-red-400 font-mono">Due on {sub.invoice_date || '30th'}</p>
                                </div>
                            </div>

                            {/* Subscription Details Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
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

                                <div className="space-y-4">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-white/5 rounded-lg mt-1">
                                            <Calendar className="w-4 h-4 text-red-500" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 font-mono uppercase mb-1">Installation</p>
                                            <p className="text-sm text-gray-300">Installed: {formatDate(sub.date_installed)}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-800/50">
                                        <button className="flex-1 py-2 px-3 bg-white/5 hover:bg-white/10 text-gray-300 text-sm rounded transition-colors flex items-center justify-center gap-2">
                                            <Download className="w-4 h-4" />
                                            Invoice
                                        </button>
                                        <button className="flex-1 py-2 px-3 bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-600/20 text-sm rounded transition-colors flex items-center justify-center gap-2">
                                            <CreditCard className="w-4 h-4" />
                                            Pay Bill
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {subscriptions.length === 0 && (
                        <div className="text-center py-12 bg-[#0f0f0f] rounded-xl border border-dashed border-gray-800">
                            <Wifi className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-400">No Active Subscriptions</h3>
                            <p className="text-gray-600 text-sm mt-1">Contact support to set up a new connection.</p>
                        </div>
                    )}
                </div>

                {/* Sidebar - Support & Info */}
                <div className="space-y-6">
                    {/* Support Card */}
                    <div className="tech-card p-6 rounded-xl bg-gradient-to-br from-gray-900 to-black border-red-900/20 sticky top-6">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-red-500" />
                            Support Center
                        </h3>

                        <div className="space-y-4 mb-6">
                            <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                                <p className="text-xs text-gray-500 font-mono uppercase mb-1">Technical Support</p>
                                <p className="text-white font-medium">0912-345-6789</p>
                            </div>
                            <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                                <p className="text-xs text-gray-500 font-mono uppercase mb-1">Billing Inquiries</p>
                                <p className="text-white font-medium">billing@allstar.com</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-gray-500 font-mono mb-4">
                            <Clock className="w-3 h-3" />
                            <span>AVG RESPONSE: &lt; 15 MINS</span>
                        </div>

                        <button className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2 group border border-white/10">
                            Contact Support
                            <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
