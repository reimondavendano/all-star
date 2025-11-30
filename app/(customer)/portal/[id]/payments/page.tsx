'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2, CreditCard, FileText, Wifi, Calendar, MapPin, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';

interface Payment {
    id: string;
    settlement_date: string;
    amount: number;
    mode: string;
    notes: string;
    created_at: string;
}

interface Invoice {
    id: string;
    from_date: string;
    to_date: string;
    due_date: string;
    amount_due: number;
    payment_status: string;
    created_at: string;
}

interface Subscription {
    id: string;
    plan: {
        name: string;
        monthly_fee: number;
    };
    address: string;
    barangay: string;
    active: boolean;
    payments: Payment[];
    invoices: Invoice[];
}

interface CustomerData {
    id: string;
    name: string;
    mobile_number: string;
    subscriptions: Subscription[];
}

export default function CustomerPaymentsPage() {
    const params = useParams();
    const [data, setData] = useState<CustomerData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedSub, setExpandedSub] = useState<string | null>(null);

    useEffect(() => {
        if (params.id) {
            fetchData();
        }
    }, [params.id]);

    const fetchData = async () => {
        try {
            const customerId = params.id as string;

            // 1. Fetch Customer
            const { data: customer, error: customerError } = await supabase
                .from('customers')
                .select('id, name, mobile_number')
                .eq('id', customerId)
                .single();

            if (customerError) throw customerError;
            if (!customer) throw new Error('Customer not found');

            // 2. Fetch Subscriptions with Plans
            const { data: subscriptions, error: subsError } = await supabase
                .from('subscriptions')
                .select(`
                    id,
                    address,
                    barangay,
                    active,
                    plans (name, monthly_fee)
                `)
                .eq('subscriber_id', customerId);

            if (subsError) throw subsError;

            // 3. Fetch Payments and Invoices for each subscription
            const subscriptionsWithHistory = await Promise.all(
                (subscriptions || []).map(async (sub: any) => {
                    // Fetch Payments
                    const { data: payments } = await supabase
                        .from('payments')
                        .select('*')
                        .eq('subscription_id', sub.id)
                        .order('settlement_date', { ascending: false });

                    // Fetch Invoices
                    const { data: invoices } = await supabase
                        .from('invoices')
                        .select('*')
                        .eq('subscription_id', sub.id)
                        .order('created_at', { ascending: false });

                    return {
                        id: sub.id,
                        plan: Array.isArray(sub.plans) ? sub.plans[0] : sub.plans,
                        address: sub.address,
                        barangay: sub.barangay,
                        active: sub.active,
                        payments: payments || [],
                        invoices: invoices || []
                    };
                })
            );

            setData({
                ...customer,
                subscriptions: subscriptionsWithHistory
            });

            // Expand the first subscription by default if exists
            if (subscriptionsWithHistory.length > 0) {
                setExpandedSub(subscriptionsWithHistory[0].id);
            }

        } catch (err: any) {
            console.error('Error fetching payment history:', err);
            setError(err.message || 'Failed to load payment history');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleSubscription = (subId: string) => {
        setExpandedSub(expandedSub === subId ? null : subId);
    };

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
                <div className="text-center p-8 bg-[#0a0a0a] border border-red-900/30 rounded-xl">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-white mb-2">Unable to Load History</h2>
                    <p className="text-gray-400">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white neon-text mb-2">Payment History</h1>
                <p className="text-gray-400">
                    View all your transactions and invoices for <span className="text-white font-medium">{data.name}</span>
                </p>
            </div>

            {/* Subscriptions List */}
            <div className="space-y-6">
                {data.subscriptions.map((sub) => (
                    <div key={sub.id} className="tech-card rounded-xl overflow-hidden border border-gray-800 bg-[#0a0a0a]">
                        {/* Subscription Header */}
                        <div
                            onClick={() => toggleSubscription(sub.id)}
                            className="p-6 cursor-pointer hover:bg-white/5 transition-colors flex items-center justify-between"
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-lg ${sub.active ? 'bg-green-900/20 text-green-500' : 'bg-red-900/20 text-red-500'}`}>
                                    <Wifi className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                        {sub.plan.name}
                                        <span className={`text-xs px-2 py-0.5 rounded border ${sub.active
                                                ? 'border-green-500/30 text-green-400 bg-green-500/10'
                                                : 'border-red-500/30 text-red-400 bg-red-500/10'
                                            }`}>
                                            {sub.active ? 'ACTIVE' : 'INACTIVE'}
                                        </span>
                                    </h3>
                                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-400 font-mono">
                                        <span className="flex items-center gap-1">
                                            <MapPin className="w-3 h-3" />
                                            {sub.address}, {sub.barangay}
                                        </span>
                                        <span className="text-gray-600">|</span>
                                        <span>₱{sub.plan.monthly_fee.toLocaleString()}/mo</span>
                                    </div>
                                </div>
                            </div>
                            {expandedSub === sub.id ? (
                                <ChevronUp className="w-5 h-5 text-gray-500" />
                            ) : (
                                <ChevronDown className="w-5 h-5 text-gray-500" />
                            )}
                        </div>

                        {/* Expanded Content */}
                        {expandedSub === sub.id && (
                            <div className="border-t border-gray-800 p-6 bg-black/20">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                                    {/* Payments Section */}
                                    <div>
                                        <h4 className="text-sm font-mono text-gray-400 uppercase mb-4 flex items-center gap-2">
                                            <CreditCard className="w-4 h-4 text-red-500" />
                                            Payment History
                                        </h4>
                                        <div className="space-y-3">
                                            {sub.payments.length > 0 ? (
                                                sub.payments.map((payment) => (
                                                    <div key={payment.id} className="bg-[#111] border border-gray-800 rounded-lg p-4 flex items-center justify-between hover:border-gray-700 transition-colors">
                                                        <div>
                                                            <p className="text-white font-bold">₱{payment.amount.toLocaleString()}</p>
                                                            <p className="text-xs text-gray-500 font-mono mt-1">
                                                                {payment.settlement_date ? format(new Date(payment.settlement_date), 'MMM dd, yyyy') : 'Pending'}
                                                            </p>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="px-2 py-1 rounded text-xs font-mono bg-blue-900/20 text-blue-400 border border-blue-500/20">
                                                                {payment.mode}
                                                            </span>
                                                            {payment.notes && (
                                                                <p className="text-xs text-gray-500 mt-1 max-w-[150px] truncate">
                                                                    {payment.notes}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center py-8 border border-dashed border-gray-800 rounded-lg">
                                                    <p className="text-gray-500 text-sm">No payments recorded</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Invoices Section */}
                                    <div>
                                        <h4 className="text-sm font-mono text-gray-400 uppercase mb-4 flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-blue-500" />
                                            Invoice History
                                        </h4>
                                        <div className="space-y-3">
                                            {sub.invoices.length > 0 ? (
                                                sub.invoices.map((invoice) => (
                                                    <div key={invoice.id} className="bg-[#111] border border-gray-800 rounded-lg p-4 flex items-center justify-between hover:border-gray-700 transition-colors">
                                                        <div>
                                                            <p className="text-white font-bold">₱{invoice.amount_due.toLocaleString()}</p>
                                                            <p className="text-xs text-gray-500 font-mono mt-1">
                                                                Due: {invoice.due_date ? format(new Date(invoice.due_date), 'MMM dd, yyyy') : '-'}
                                                            </p>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className={`px-2 py-1 rounded text-xs font-mono border ${invoice.payment_status === 'Paid'
                                                                    ? 'bg-green-900/20 text-green-400 border-green-500/20'
                                                                    : 'bg-yellow-900/20 text-yellow-400 border-yellow-500/20'
                                                                }`}>
                                                                {invoice.payment_status}
                                                            </span>
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                {invoice.from_date && invoice.to_date
                                                                    ? `${format(new Date(invoice.from_date), 'MMM dd')} - ${format(new Date(invoice.to_date), 'MMM dd')}`
                                                                    : 'Billing Period'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center py-8 border border-dashed border-gray-800 rounded-lg">
                                                    <p className="text-gray-500 text-sm">No invoices generated</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {data.subscriptions.length === 0 && (
                    <div className="text-center py-12">
                        <p className="text-gray-500">No subscriptions found for this customer.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
