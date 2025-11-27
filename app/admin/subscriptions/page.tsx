
'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
    Search, Filter, ChevronLeft, ChevronRight, Edit, Trash2, ChevronDown, ChevronUp,
    User, Building2, Wifi, MapPin, Home, Landmark as LandmarkIcon, Calendar,
    CreditCard, UserCheck, ExternalLink, ToggleLeft, ToggleRight, Plus, DollarSign
} from 'lucide-react';
import EditSubscriptionModal from '@/components/admin/EditSubscriptionModal';
import AddSubscriptionModal from '@/components/admin/AddSubscriptionModal';

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
    // Joined data
    customer_name?: string;
    plan_name?: string;
    plan_fee?: number;
    business_unit_name?: string;
    balance?: number;
}

export default function SubscriptionsPage() {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
    const [expandedSubscription, setExpandedSubscription] = useState<string | null>(null);

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);

    // Add Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const itemsPerPage = 10;

    useEffect(() => {
        fetchSubscriptions();
    }, []);

    const fetchSubscriptions = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('subscriptions')
                .select(`
                    *,
                    customers!subscriber_id(name),
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

    const handleEdit = (subscription: Subscription) => {
        setSelectedSubscription(subscription);
        setIsEditModalOpen(true);
    };

    const handleToggleActive = async (subscription: Subscription, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const { error } = await supabase
                .from('subscriptions')
                .update({ active: !subscription.active })
                .eq('id', subscription.id);

            if (error) throw error;

            // Refresh the subscriptions list
            fetchSubscriptions();
        } catch (error) {
            console.error('Error toggling subscription status:', error);
            alert('Failed to update subscription status');
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const toggleCustomer = (customerId: string) => {
        setExpandedCustomer(expandedCustomer === customerId ? null : customerId);
    };

    const toggleSubscription = (subscriptionId: string) => {
        setExpandedSubscription(expandedSubscription === subscriptionId ? null : subscriptionId);
    };

    const filteredSubscriptions = subscriptions.filter(sub =>
        sub.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.plan_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.business_unit_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.address?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const groupedSubscriptions = Object.values(filteredSubscriptions.reduce((acc, sub) => {
        if (!acc[sub.subscriber_id]) {
            acc[sub.subscriber_id] = {
                customer_id: sub.subscriber_id,
                customer_name: sub.customer_name || 'Unknown',
                subscriptions: []
            };
        }
        acc[sub.subscriber_id].subscriptions.push(sub);
        return acc;
    }, {} as Record<string, { customer_id: string, customer_name: string, subscriptions: Subscription[] }>));

    const totalPages = Math.ceil(groupedSubscriptions.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentGroups = groupedSubscriptions.slice(startIndex, endIndex);

    const formatSubscriptionCount = (subscriptions: Subscription[]) => {
        const activeCount = subscriptions.filter(s => s.active).length;
        const inactiveCount = subscriptions.length - activeCount;

        const parts = [];
        if (activeCount > 0) {
            parts.push(`${activeCount} active`);
        }
        if (inactiveCount > 0) {
            parts.push(`${inactiveCount} disconnected`);
        }

        if (parts.length === 0) return '0 subscriptions';

        return `${parts.join(' and ')} subscription${subscriptions.length !== 1 ? 's' : ''}`;
    };

    return (
        <>
            <div className="bg-[#0a0a0a] rounded-lg overflow-hidden border-2 border-red-900/50">
                <div className="p-6 flex justify-between items-center border-b border-gray-900">
                    <h1 className="text-2xl font-bold text-white">Subscriptions</h1>
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
                                className="bg-[#1a1a1a] border border-gray-800 rounded pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-gray-700 w-64"
                            />
                        </div>
                        <button className="p-2 bg-[#1a1a1a] border border-gray-800 rounded text-gray-400 hover:text-white transition-colors">
                            <Filter className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-900">
                            <th className="w-10"></th>
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Customer</th>
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Subscriptions</th>
                            <th className="w-10"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={4} className="text-center p-8 text-gray-500">
                                    Loading...
                                </td>
                            </tr>
                        ) : currentGroups.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="text-center p-8 text-gray-500">
                                    No subscriptions found
                                </td>
                            </tr>
                        ) : (
                            currentGroups.map((group) => (
                                <React.Fragment key={group.customer_id}>
                                    {/* Level 1: Customer Row */}
                                    <tr className="border-b border-gray-900 hover:bg-[#1a1a1a] transition-colors cursor-pointer" onClick={() => toggleCustomer(group.customer_id)}>
                                        <td className="p-4">
                                            <button className="text-gray-400 hover:text-white transition-colors">
                                                {expandedCustomer === group.customer_id ? (
                                                    <ChevronUp className="w-4 h-4" />
                                                ) : (
                                                    <ChevronDown className="w-4 h-4" />
                                                )}
                                            </button>
                                        </td>
                                        <td className="p-4 text-white font-medium">
                                            <div className="flex items-center gap-2">
                                                <User className="w-4 h-4 text-blue-500" />
                                                {group.customer_name}
                                            </div>
                                        </td>
                                        <td className="p-4 text-gray-400">{formatSubscriptionCount(group.subscriptions)}</td>
                                        <td className="p-4"></td>
                                    </tr>

                                    {/* Level 2: Subscriptions List */}
                                    {expandedCustomer === group.customer_id && (
                                        <tr className="bg-[#0f0f0f]">
                                            <td colSpan={4} className="p-0">
                                                <div className="border-b border-gray-800">
                                                    <table className="w-full">
                                                        <thead>
                                                            <tr className="border-b border-gray-800 bg-[#151515]">
                                                                <th className="w-10 pl-8"></th>
                                                                <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Label</th>
                                                                <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Plan</th>
                                                                <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Business Unit</th>
                                                                <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                                                                <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Install Date</th>
                                                                <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {group.subscriptions.map(subscription => (
                                                                <React.Fragment key={subscription.id}>
                                                                    <tr className="border-b border-gray-800 hover:bg-[#1a1a1a] transition-colors cursor-pointer" onClick={() => toggleSubscription(subscription.id)}>
                                                                        <td className="p-3 pl-8">
                                                                            <button className="text-gray-400 hover:text-white transition-colors">
                                                                                {expandedSubscription === subscription.id ? (
                                                                                    <ChevronUp className="w-4 h-4" />
                                                                                ) : (
                                                                                    <ChevronDown className="w-4 h-4" />
                                                                                )}
                                                                            </button>
                                                                        </td>
                                                                        <td className="p-3 text-gray-300">
                                                                            <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                                                                {subscription.label || 'N/A'}
                                                                            </span>
                                                                        </td>
                                                                        <td className="p-3 text-gray-300">
                                                                            <div className="flex items-center gap-2">
                                                                                <Wifi className="w-4 h-4 text-cyan-500" />
                                                                                {subscription.plan_name}
                                                                            </div>
                                                                        </td>
                                                                        <td className="p-3 text-gray-300">{subscription.business_unit_name}</td>
                                                                        <td className="p-3">
                                                                            <button
                                                                                onClick={(e) => handleToggleActive(subscription, e)}
                                                                                className="relative inline-flex items-center cursor-pointer group"
                                                                                title={subscription.active ? 'Click to disconnect' : 'Click to activate'}
                                                                            >
                                                                                <div className={`w-9 h-5 rounded-full transition-colors ${subscription.active ? 'bg-green-600' : 'bg-gray-700'
                                                                                    }`}>
                                                                                    <div className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform ${subscription.active ? 'translate-x-4' : 'translate-x-0'
                                                                                        }`} />
                                                                                </div>
                                                                            </button>
                                                                        </td>
                                                                        <td className="p-3 text-gray-400">{formatDate(subscription.date_installed)}</td>
                                                                        <td className="p-3">
                                                                            <div className="flex items-center gap-2">
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleEdit(subscription);
                                                                                    }}
                                                                                    className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                                                                                    title="Edit subscription"
                                                                                >
                                                                                    <Edit className="w-3.5 h-3.5" />
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setDeleteConfirm(subscription.id);
                                                                                    }}
                                                                                    className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                                                                                    title="Delete subscription"
                                                                                >
                                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>

                                                                    {/* Level 3: Details */}
                                                                    {expandedSubscription === subscription.id && (
                                                                        <tr className="bg-[#151515] border-b border-gray-800">
                                                                            <td colSpan={7} className="p-6 pl-12">
                                                                                <div className="grid grid-cols-2 gap-6">
                                                                                    <div>
                                                                                        <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase">Customer Information</h3>
                                                                                        <div className="space-y-3">
                                                                                            <div className="flex items-start gap-3">
                                                                                                <User className="w-4 h-4 text-blue-500 mt-0.5" />
                                                                                                <div className="flex-1">
                                                                                                    <label className="text-xs text-gray-500">Status</label>
                                                                                                    <p className={`text-sm font-medium ${subscription.active ? 'text-green-500' : 'text-red-500'
                                                                                                        }`}>
                                                                                                        {subscription.active ? 'Active' : 'Inactive'}
                                                                                                    </p>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>

                                                                                    <div>
                                                                                        <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase">Service Details</h3>
                                                                                        <div className="space-y-3">
                                                                                            <div className="flex items-start gap-3">
                                                                                                <Wifi className="w-4 h-4 text-cyan-500 mt-0.5" />
                                                                                                <div className="flex-1">
                                                                                                    <label className="text-xs text-gray-500">Plan</label>
                                                                                                    <p className="text-sm text-gray-300">{subscription.plan_name}</p>
                                                                                                    <p className="text-xs text-green-400 font-semibold">₱{subscription.plan_fee?.toLocaleString()}/month</p>
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="flex items-start gap-3">
                                                                                                <Building2 className="w-4 h-4 text-purple-500 mt-0.5" />
                                                                                                <div className="flex-1">
                                                                                                    <label className="text-xs text-gray-500">Business Unit</label>
                                                                                                    <p className="text-sm text-gray-300">{subscription.business_unit_name}</p>
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="flex items-start gap-3">
                                                                                                <Calendar className="w-4 h-4 text-pink-500 mt-0.5" />
                                                                                                <div className="flex-1">
                                                                                                    <label className="text-xs text-gray-500">Installation Date</label>
                                                                                                    <p className="text-sm text-gray-300">{formatDate(subscription.date_installed)}</p>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>

                                                                                    <div>
                                                                                        <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase">Location Details</h3>
                                                                                        <div className="space-y-3">
                                                                                            <div className="flex items-start gap-3">
                                                                                                <MapPin className="w-4 h-4 text-red-500 mt-0.5" />
                                                                                                <div className="flex-1">
                                                                                                    <label className="text-xs text-gray-500">Barangay</label>
                                                                                                    <p className="text-sm text-gray-300">{subscription.barangay || '-'}</p>
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="flex items-start gap-3">
                                                                                                <Home className="w-4 h-4 text-orange-500 mt-0.5" />
                                                                                                <div className="flex-1">
                                                                                                    <label className="text-xs text-gray-500">Address</label>
                                                                                                    <p className="text-sm text-gray-300">{subscription.address || '-'}</p>
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="flex items-start gap-3">
                                                                                                <LandmarkIcon className="w-4 h-4 text-yellow-500 mt-0.5" />
                                                                                                <div className="flex-1">
                                                                                                    <label className="text-xs text-gray-500">Landmark</label>
                                                                                                    <p className="text-sm text-gray-300">{subscription.landmark || '-'}</p>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>

                                                                                    <div>
                                                                                        <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase">Billing & Portal</h3>
                                                                                        <div className="space-y-3">
                                                                                            <div className="flex items-start gap-3">
                                                                                                <DollarSign className="w-4 h-4 text-green-500 mt-0.5" />
                                                                                                <div className="flex-1">
                                                                                                    <label className="text-xs text-gray-500">
                                                                                                        {(subscription.balance || 0) < 0 ? 'Extra Balance' : (subscription.balance || 0) > 0 ? 'Credit Balance' : 'Balance'}
                                                                                                    </label>
                                                                                                    <p className={`text-sm font-medium ${(subscription.balance || 0) > 0 ? 'text-red-400' : (subscription.balance || 0) < 0 ? 'text-green-400' : 'text-gray-300'}`}>
                                                                                                        ₱{Math.abs(subscription.balance || 0).toLocaleString()}
                                                                                                    </p>
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="flex items-start gap-3">
                                                                                                <CreditCard className="w-4 h-4 text-emerald-500 mt-0.5" />
                                                                                                <div className="flex-1">
                                                                                                    <label className="text-xs text-gray-500">Invoice Date</label>
                                                                                                    <p className="text-sm text-gray-300">{subscription.invoice_date || 'Not set'}</p>
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="flex items-start gap-3">
                                                                                                <CreditCard className="w-4 h-4 text-amber-500 mt-0.5" />
                                                                                                <div className="flex-1">
                                                                                                    <label className="text-xs text-gray-500">Referral Credit Applied</label>
                                                                                                    <p className={`text-sm font-medium ${subscription.referral_credit_applied ? 'text-green-500' : 'text-gray-400'
                                                                                                        }`}>
                                                                                                        {subscription.referral_credit_applied ? 'Yes' : 'No'}
                                                                                                    </p>
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="flex items-start gap-3">
                                                                                                <ExternalLink className="w-4 h-4 text-blue-500 mt-0.5" />
                                                                                                <div className="flex-1">
                                                                                                    <label className="text-xs text-gray-500">Customer Portal</label>
                                                                                                    {subscription.customer_portal ? (
                                                                                                        <a
                                                                                                            href={subscription.customer_portal}
                                                                                                            className="text-sm text-blue-400 hover:text-blue-300 underline"
                                                                                                            target="_blank"
                                                                                                            rel="noopener noreferrer"
                                                                                                        >
                                                                                                            {subscription.customer_portal}
                                                                                                        </a>
                                                                                                    ) : (
                                                                                                        <p className="text-sm text-gray-500">-</p>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </React.Fragment>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))
                        )}
                    </tbody>
                </table>

                <div className="flex items-center justify-between p-4 border-t border-gray-900">
                    <div className="text-sm text-gray-500">
                        Showing {startIndex + 1} to {Math.min(endIndex, groupedSubscriptions.length)} of {groupedSubscriptions.length} entries
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
                            Page {currentPage} of {totalPages || 1}
                        </span>
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>

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
        </>
    );
}
