'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
    Search, ChevronLeft, ChevronRight, Edit, Trash2, ChevronDown,
    User, Building2, Wifi, MapPin, Home, Calendar, RefreshCw,
    CreditCard, ExternalLink, Plus, DollarSign, Hash
} from 'lucide-react';
import EditSubscriptionModal from '@/components/admin/EditSubscriptionModal';
import AddSubscriptionModal from '@/components/admin/AddSubscriptionModal';
import { syncSubscriptionToMikrotik } from '@/app/actions/mikrotik';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

interface Subscription {
    id: string;
    subscriber_id: string;
    business_unit_id: string;
    plan_id: string;
    active: boolean;
    date_installed: string;
    contact_person: string;
    address: string;
    barangay: string;
    landmark: string;
    label?: string;
    customer_portal: string;
    invoice_date: string;
    referral_credit_applied: boolean;
    created_at: string;
    balance?: number;
    router_serial_number?: string;
    // Joined data
    customer_name?: string;
    plan_name?: string;
    plan_fee?: number;
    business_unit_name?: string;
}

interface GroupedSubscription {
    customer_id: string;
    customer_name: string;
    subscriptions: Subscription[];
}

export default function SubscriptionsPage() {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
    const [expandedSubscriptions, setExpandedSubscriptions] = useState<Set<string>>(new Set());

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);

    // Add Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const itemsPerPage = 10;

    useEffect(() => {
        fetchSubscriptions();
    }, []);

    // Real-time subscription for subscriptions table
    useRealtimeSubscription({
        table: 'subscriptions',
        onAny: () => fetchSubscriptions()
    });

    const fetchSubscriptions = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('subscriptions')
                .select(`
                    *,
                    customers!subscriptions_subscriber_id_fkey(name),
                    plans!plan_id(name, monthly_fee),
                    business_units!business_unit_id(name)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Map the joined data to flat structure
            const mappedData = data?.map((sub: any) => ({
                ...sub,
                customer_name: sub.customers?.name || '-',
                plan_name: sub.plans?.name || '-',
                plan_fee: sub.plans?.monthly_fee || 0,
                business_unit_name: sub.business_units?.name || '-'
            })) || [];

            setSubscriptions(mappedData);
        } catch (error) {
            console.error('Error fetching subscriptions:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase
                .from('subscriptions')
                .delete()
                .eq('id', id);

            if (error) throw error;

            fetchSubscriptions();
            setDeleteConfirm(null);
        } catch (error) {
            console.error('Error deleting subscription:', error);
            alert('Failed to delete subscription');
        }
    };

    const handleEdit = (subscription: Subscription, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedSubscription(subscription);
        setIsEditModalOpen(true);
    };

    const handleToggleActive = async (subscription: Subscription, e: React.MouseEvent) => {
        e.stopPropagation();
        const newActiveState = !subscription.active;

        try {
            const { error } = await supabase
                .from('subscriptions')
                .update({ active: newActiveState })
                .eq('id', subscription.id);

            if (error) throw error;

            console.log(`[Subscription] Syncing ${subscription.id} to MikroTik (active: ${newActiveState})`);
            const syncResult = await syncSubscriptionToMikrotik(subscription.id, newActiveState);

            if (!syncResult.success) {
                console.warn(`[Subscription] MikroTik sync warning: ${syncResult.error}`);
            }

            fetchSubscriptions();
        } catch (error) {
            console.error('Error toggling subscription status:', error);
            alert('Failed to update subscription status');
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const toggleCustomer = (customerId: string) => {
        const newExpanded = new Set(expandedCustomers);
        if (newExpanded.has(customerId)) {
            newExpanded.delete(customerId);
        } else {
            newExpanded.add(customerId);
        }
        setExpandedCustomers(newExpanded);
    };

    const toggleSubscription = (subscriptionId: string) => {
        const newExpanded = new Set(expandedSubscriptions);
        if (newExpanded.has(subscriptionId)) {
            newExpanded.delete(subscriptionId);
        } else {
            newExpanded.add(subscriptionId);
        }
        setExpandedSubscriptions(newExpanded);
    };

    const filteredSubscriptions = subscriptions.filter(sub =>
        sub.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.plan_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.business_unit_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.address?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Group by customer
    const groupedSubscriptions: GroupedSubscription[] = Object.values(
        filteredSubscriptions.reduce((acc, sub) => {
            if (!acc[sub.subscriber_id]) {
                acc[sub.subscriber_id] = {
                    customer_id: sub.subscriber_id,
                    customer_name: sub.customer_name || 'Unknown',
                    subscriptions: []
                };
            }
            acc[sub.subscriber_id].subscriptions.push(sub);
            return acc;
        }, {} as Record<string, GroupedSubscription>)
    );

    const totalPages = Math.ceil(groupedSubscriptions.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentGroups = groupedSubscriptions.slice(startIndex, endIndex);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Wifi className="w-6 h-6 text-cyan-500" />
                            Subscriptions
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">
                            Manage customer subscriptions and service connections
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
                        >
                            <Plus className="w-4 h-4" />
                            Add Subscription
                        </button>
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="bg-[#1a1a1a] border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 w-64"
                            />
                        </div>
                        <button
                            onClick={fetchSubscriptions}
                            className="px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Subscription List */}
            <div className="glass-card overflow-hidden">
                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                        Loading...
                    </div>
                ) : currentGroups.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <Wifi className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>{searchQuery ? `No subscriptions found matching "${searchQuery}"` : 'No subscriptions found'}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {currentGroups.map((group) => {
                            const activeSubs = group.subscriptions.filter(s => s.active).length;
                            const inactiveSubs = group.subscriptions.length - activeSubs;

                            return (
                                <div key={group.customer_id}>
                                    {/* Customer Row */}
                                    <div
                                        className="p-4 hover:bg-[#1a1a1a] cursor-pointer flex items-center gap-3 transition-colors"
                                        onClick={() => toggleCustomer(group.customer_id)}
                                    >
                                        {expandedCustomers.has(group.customer_id) ? (
                                            <ChevronDown className="w-5 h-5 text-gray-500" />
                                        ) : (
                                            <ChevronRight className="w-5 h-5 text-gray-500" />
                                        )}
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center">
                                            <User className="w-5 h-5 text-white" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-medium text-white">{group.customer_name}</div>
                                            <div className="text-xs text-gray-500">
                                                {group.subscriptions.length} subscription(s)
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {activeSubs > 0 && (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-800">
                                                    {activeSubs} Active
                                                </span>
                                            )}
                                            {inactiveSubs > 0 && (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-900/30 text-red-400 border border-red-800">
                                                    {inactiveSubs} Disconnected
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Expanded Subscriptions */}
                                    {expandedCustomers.has(group.customer_id) && (
                                        <div className="bg-[#0a0a0a]">
                                            {group.subscriptions.map(subscription => (
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
                                                        <Wifi className={`w-4 h-4 ${subscription.active ? 'text-green-500' : 'text-red-500'}`} />
                                                        <div className="flex-1">
                                                            <div className="text-sm text-white">
                                                                {subscription.plan_name}
                                                                {subscription.label && (
                                                                    <span className="ml-2 text-xs text-gray-500">({subscription.label})</span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {subscription.business_unit_name} • ₱{subscription.plan_fee?.toLocaleString()}/mo
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {/* Toggle */}
                                                            <button
                                                                onClick={(e) => handleToggleActive(subscription, e)}
                                                                className="relative inline-flex items-center cursor-pointer"
                                                                title={subscription.active ? 'Click to disconnect' : 'Click to activate'}
                                                            >
                                                                <div className={`w-9 h-5 rounded-full transition-colors ${subscription.active ? 'bg-green-600' : 'bg-gray-700'}`}>
                                                                    <div className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform ${subscription.active ? 'translate-x-4' : 'translate-x-0'}`} />
                                                                </div>
                                                            </button>
                                                            <button
                                                                onClick={(e) => handleEdit(subscription, e)}
                                                                className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                                                                title="Edit"
                                                            >
                                                                <Edit className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setDeleteConfirm(subscription.id);
                                                                }}
                                                                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                                                                title="Delete"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Subscription Details */}
                                                    {expandedSubscriptions.has(subscription.id) && (
                                                        <div className="bg-[#0f0f0f] border-t border-gray-800 p-4 pl-12">
                                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                                <div className="flex items-start gap-2">
                                                                    <Calendar className="w-4 h-4 text-pink-500 mt-0.5" />
                                                                    <div>
                                                                        <div className="text-xs text-gray-500">Installed</div>
                                                                        <div className="text-gray-300">{formatDate(subscription.date_installed)}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-start gap-2">
                                                                    <MapPin className="w-4 h-4 text-red-500 mt-0.5" />
                                                                    <div>
                                                                        <div className="text-xs text-gray-500">Barangay</div>
                                                                        <div className="text-gray-300">{subscription.barangay || '-'}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-start gap-2">
                                                                    <Home className="w-4 h-4 text-orange-500 mt-0.5" />
                                                                    <div>
                                                                        <div className="text-xs text-gray-500">Address</div>
                                                                        <div className="text-gray-300">{subscription.address || '-'}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-start gap-2">
                                                                    <DollarSign className="w-4 h-4 text-green-500 mt-0.5" />
                                                                    <div>
                                                                        <div className="text-xs text-gray-500">Balance</div>
                                                                        <div className={`font-medium ${(subscription.balance || 0) > 0 ? 'text-red-400' : (subscription.balance || 0) < 0 ? 'text-green-400' : 'text-gray-300'}`}>
                                                                            ₱{Math.abs(subscription.balance || 0).toLocaleString()}
                                                                            {(subscription.balance || 0) < 0 && ' (Credit)'}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-start gap-2">
                                                                    <CreditCard className="w-4 h-4 text-emerald-500 mt-0.5" />
                                                                    <div>
                                                                        <div className="text-xs text-gray-500">Invoice Date</div>
                                                                        <div className="text-gray-300">{subscription.invoice_date || 'Not set'}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-start gap-2">
                                                                    <Hash className="w-4 h-4 text-gray-500 mt-0.5" />
                                                                    <div>
                                                                        <div className="text-xs text-gray-500">Router Serial</div>
                                                                        <div className="text-gray-300">{subscription.router_serial_number || '-'}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-start gap-2">
                                                                    <Building2 className="w-4 h-4 text-purple-500 mt-0.5" />
                                                                    <div>
                                                                        <div className="text-xs text-gray-500">Landmark</div>
                                                                        <div className="text-gray-300">{subscription.landmark || '-'}</div>
                                                                    </div>
                                                                </div>
                                                                {subscription.customer_portal && (
                                                                    <div className="flex items-start gap-2">
                                                                        <ExternalLink className="w-4 h-4 text-blue-500 mt-0.5" />
                                                                        <div>
                                                                            <div className="text-xs text-gray-500">Portal</div>
                                                                            <a href={subscription.customer_portal} target="_blank" className="text-blue-400 hover:underline text-xs">
                                                                                View Portal
                                                                            </a>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination */}
                {groupedSubscriptions.length > itemsPerPage && (
                    <div className="flex items-center justify-between p-4 border-t border-gray-800">
                        <div className="text-sm text-gray-500">
                            Showing {startIndex + 1} to {Math.min(endIndex, groupedSubscriptions.length)} of {groupedSubscriptions.length} customers
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-sm text-gray-400">
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
                    <div className="relative bg-[#0a0a0a] border border-red-500/30 rounded-xl shadow-[0_0_50px_rgba(255,0,0,0.3)] w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-white mb-2">Confirm Delete</h3>
                        <p className="text-gray-400 mb-6">
                            Are you sure you want to delete this subscription? This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedSubscription && (
                <EditSubscriptionModal
                    isOpen={isEditModalOpen}
                    onClose={() => {
                        setIsEditModalOpen(false);
                        setSelectedSubscription(null);
                    }}
                    subscription={selectedSubscription}
                    onUpdate={fetchSubscriptions}
                />
            )}

            <AddSubscriptionModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSuccess={fetchSubscriptions}
            />
        </div>
    );
}
