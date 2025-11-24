'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import {
    User, Wifi, Calendar, MapPin, CreditCard,
    Activity, Shield, Clock, Download, AlertCircle, CheckCircle
} from 'lucide-react';

interface SubscriptionDetails {
    id: string;
    active: boolean;
    plan_id: string;
    date_installed: string;
    invoice_date: string;
    address: string;
    barangay: string;
    customer_portal: string;
    customers: {
        name: string;
        mobile_number: string;
    };
    plans: {
        name: string;
        monthly_fee: number;
        details: string;
    };
}

export default function CustomerPortalPage() {
    const params = useParams();
    const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (params.id) {
            fetchSubscriptionDetails();
        }
    }, [params.id]);

    const fetchSubscriptionDetails = async () => {
        try {
            const portalPath = `/portal/${params.id}`;

            const { data, error } = await supabase
                .from('subscriptions')
                .select(`
                    *,
                    customers (name, mobile_number),
                    plans (name, monthly_fee, details)
                `)
                .eq('customer_portal', portalPath)
                .single();

            if (error) throw error;
            if (!data) throw new Error('Subscription not found');

            setSubscription(data);
        } catch (err) {
            console.error('Error fetching subscription:', err);
            setError('Unable to load subscription details. Please check your link.');
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

    if (error || !subscription) {
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
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white neon-text">
                        Welcome, <span className="text-red-500">{subscription.customers?.name}</span>
                    </h1>
                    <p className="text-sm text-gray-500 font-mono mt-1 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        SUBSCRIBER ID: #{subscription.id.slice(0, 8).toUpperCase()}
                    </p>
                </div>
                <div className={`px-4 py-2 rounded border ${subscription.active
                        ? 'border-green-500/30 bg-green-900/10 text-green-400'
                        : 'border-red-500/30 bg-red-900/10 text-red-400'
                    } text-sm font-mono flex items-center self-start md:self-auto`}>
                    <span className={`w-2 h-2 rounded-full mr-2 ${subscription.active ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                    {subscription.active ? 'SYSTEM OPERATIONAL' : 'SERVICE DISCONNECTED'}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content - Left Column */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Status Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="tech-card p-6 rounded-xl group hover:border-red-500/50 transition-colors">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-gray-400 text-xs font-mono uppercase">Current Plan</h3>
                                <Wifi className="w-5 h-5 text-red-500 group-hover:animate-pulse" />
                            </div>
                            <p className="text-xl font-bold text-white neon-text truncate" title={subscription.plans?.name}>
                                {subscription.plans?.name}
                            </p>
                            <p className="text-xs text-gray-500 mt-1 font-mono truncate">
                                {subscription.plans?.details || 'High-speed internet'}
                            </p>
                        </div>

                        <div className="tech-card p-6 rounded-xl group hover:border-red-500/50 transition-colors">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-gray-400 text-xs font-mono uppercase">Monthly Fee</h3>
                                <CreditCard className="w-5 h-5 text-red-500 group-hover:animate-pulse" />
                            </div>
                            <p className="text-2xl font-bold text-white neon-text">
                                ₱{subscription.plans?.monthly_fee.toLocaleString()}
                            </p>
                            <p className="text-xs text-red-500 mt-1 font-mono">
                                Due on {subscription.invoice_date || '30th'}
                            </p>
                        </div>

                        <div className="tech-card p-6 rounded-xl group hover:border-red-500/50 transition-colors">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-gray-400 text-xs font-mono uppercase">Usage Status</h3>
                                <Activity className="w-5 h-5 text-red-500 group-hover:animate-pulse" />
                            </div>
                            <p className="text-xl font-bold text-white neon-text">UNLIMITED</p>
                            <p className="text-xs text-gray-500 mt-1 font-mono">No data caps</p>
                        </div>
                    </div>

                    {/* Account Details */}
                    <div className="tech-card p-6 rounded-xl">
                        <div className="flex items-center justify-between mb-6 border-b border-gray-800 pb-4">
                            <h3 className="text-lg font-semibold text-white flex items-center">
                                <User className="w-4 h-4 mr-2 text-red-500" />
                                Account Information
                            </h3>
                            <span className="text-xs text-gray-500 font-mono">DETAILS</span>
                        </div>

                        <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b border-gray-800/50 hover:bg-white/5 px-2 rounded transition-colors">
                                <span className="text-gray-500 text-sm font-mono">Account Name</span>
                                <span className="text-white font-medium">{subscription.customers?.name}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b border-gray-800/50 hover:bg-white/5 px-2 rounded transition-colors">
                                <span className="text-gray-500 text-sm font-mono">Mobile Number</span>
                                <span className="text-white font-medium">{subscription.customers?.mobile_number}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b border-gray-800/50 hover:bg-white/5 px-2 rounded transition-colors">
                                <span className="text-gray-500 text-sm font-mono">Installation Date</span>
                                <span className="text-white font-medium">{formatDate(subscription.date_installed)}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 hover:bg-white/5 px-2 rounded transition-colors">
                                <span className="text-gray-500 text-sm font-mono">Service Address</span>
                                <span className="text-white font-medium text-right max-w-md">
                                    {subscription.address}, {subscription.barangay}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar - Right Column */}
                <div className="space-y-6">
                    {/* Quick Actions */}
                    <div className="tech-card p-6 rounded-xl">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold text-white flex items-center">
                                <Shield className="w-4 h-4 mr-2 text-red-500" />
                                Quick Actions
                            </h3>
                        </div>
                        <div className="space-y-3">
                            <button className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all hover:shadow-[0_0_15px_rgba(220,38,38,0.5)] flex items-center justify-center gap-2 group">
                                <CreditCard className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                Pay Bill Now
                            </button>
                            <button className="w-full py-3 px-4 bg-transparent border border-gray-700 hover:border-red-500/50 text-gray-300 hover:text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2 group">
                                <Download className="w-4 h-4 group-hover:translate-y-1 transition-transform" />
                                Download Invoice
                            </button>
                        </div>
                    </div>

                    {/* Support */}
                    <div className="tech-card p-6 rounded-xl bg-gradient-to-br from-gray-900 to-black border-red-900/20">
                        <h3 className="text-lg font-semibold text-white mb-2">Need Assistance?</h3>
                        <p className="text-sm text-gray-400 mb-4">Our support team is available 24/7 to assist you with any connection issues.</p>
                        <div className="flex items-center gap-3 text-xs text-gray-500 font-mono mb-4">
                            <Clock className="w-3 h-3" />
                            <span>AVG RESPONSE: &lt; 15 MINS</span>
                        </div>
                        <button className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors flex items-center gap-1 group">
                            Contact Support
                            <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
