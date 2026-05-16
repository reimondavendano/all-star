'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, CheckCircle, Clock, Loader2, Search, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { declinePlanChangeRequest } from '@/app/actions/subscription';
import EditSubscriptionModal from '@/components/admin/EditSubscriptionModal';

interface PlanChangeRequest {
    id: string;
    status: 'pending' | 'approved' | 'declined';
    request_type: 'upgrade' | 'downgrade' | 'same' | null;
    subscription_id: string;
    old_plan_id: string;
    new_plan_id: string;
    old_monthly_fee: number;
    new_monthly_fee: number;
    requested_old_plan_end_date: string | null;
    requested_at: string | null;
    reviewed_at: string | null;
    decision_notes: string | null;
    subscription: PlanChangeSubscription | null;
    old_plan: { name: string; monthly_fee: number } | null;
    new_plan: { name: string; monthly_fee: number } | null;
}

interface PlanChangeSubscription {
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
    customer_name?: string;
    balance?: number;
    router_serial_number?: string;
    is_free?: boolean;
    promised_date?: string | null;
    last_reconnection_date?: string | null;
    last_disconnection_date?: string | null;
    'x-coordinates'?: number;
    'y-coordinates'?: number;
    customers?: { id: string; name: string; mobile_number?: string } | { id: string; name: string; mobile_number?: string }[];
    business_units?: { name: string } | { name: string }[];
    plans?: { name: string; monthly_fee: number } | { name: string; monthly_fee: number }[];
    mikrotik_ppp_secrets?: unknown[];
}

type PlanChangeRequestRow = Omit<PlanChangeRequest, 'subscription' | 'old_plan' | 'new_plan'> & {
    subscription: PlanChangeSubscription | PlanChangeSubscription[] | null;
    old_plan: { name: string; monthly_fee: number } | { name: string; monthly_fee: number }[] | null;
    new_plan: { name: string; monthly_fee: number } | { name: string; monthly_fee: number }[] | null;
};

const statusStyles = {
    pending: 'bg-amber-900/30 text-amber-300 border-amber-700/50',
    approved: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50',
    declined: 'bg-red-900/30 text-red-300 border-red-700/50'
};

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] || null;
    return value || null;
}

function formatCurrency(amount: number) {
    return `₱${Math.round(Number(amount) || 0).toLocaleString()}`;
}

function formatDate(date?: string | null) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

export default function PlanChangeRequestsPage() {
    const [requests, setRequests] = useState<PlanChangeRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [statusTab, setStatusTab] = useState<'pending' | 'approved' | 'declined'>('pending');
    const [searchQuery, setSearchQuery] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [selectedRequest, setSelectedRequest] = useState<PlanChangeRequest | null>(null);

    const fetchRequests = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('plan_changes')
                .select(`
                    id,
                    status,
                    request_type,
                    subscription_id,
                    old_plan_id,
                    new_plan_id,
                    old_monthly_fee,
                    new_monthly_fee,
                    requested_old_plan_end_date,
                    requested_at,
                    reviewed_at,
                    decision_notes,
                    subscription:subscriptions!plan_changes_subscription_id_fkey (
                        *,
                        customers!subscriptions_subscriber_id_fkey (
                            id,
                            name,
                            mobile_number
                        ),
                        business_units (
                            name
                        ),
                        plans (
                            name,
                            monthly_fee
                        ),
                        mikrotik_ppp_secrets (*)
                    ),
                    old_plan:plans!plan_changes_old_plan_id_fkey (
                        name,
                        monthly_fee
                    ),
                    new_plan:plans!plan_changes_new_plan_id_fkey (
                        name,
                        monthly_fee
                    )
                `)
                .order('requested_at', { ascending: false });

            if (error) throw error;

            setRequests(((data || []) as PlanChangeRequestRow[]).map((request) => ({
                ...request,
                subscription: normalizeRelation(request.subscription),
                old_plan: normalizeRelation(request.old_plan),
                new_plan: normalizeRelation(request.new_plan)
            })));
        } catch (error) {
            console.error('Error fetching plan-change requests:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    useRealtimeSubscription({
        table: 'plan_changes',
        onAny: fetchRequests
    });

    const filteredRequests = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return requests
            .filter(request => request.status === statusTab)
            .filter(request => {
                if (!query) return true;
                const customer = normalizeRelation(request.subscription?.customers);
                const address = request.subscription?.address || '';
                return [
                    customer?.name,
                    customer?.mobile_number,
                    address,
                    request.old_plan?.name,
                    request.new_plan?.name
                ].some(value => String(value || '').toLowerCase().includes(query));
            });
    }, [requests, searchQuery, statusTab]);

    const counts = {
        pending: requests.filter(request => request.status === 'pending').length,
        approved: requests.filter(request => request.status === 'approved').length,
        declined: requests.filter(request => request.status === 'declined').length
    };

    const openApprovalModal = (request: PlanChangeRequest) => {
        setSelectedRequest(request);
    };

    const handleDecline = async (request: PlanChangeRequest) => {
        const reason = prompt('Reason for declining this request (optional):') || undefined;
        setProcessingId(request.id);
        try {
            const result = await declinePlanChangeRequest(request.id, reason);
            if (!result.success) {
                alert(result.error || 'Unable to decline request.');
                return;
            }
            await fetchRequests();
        } finally {
            setProcessingId(null);
        }
    };

    const modalSubscription = selectedRequest?.subscription
        ? {
            ...selectedRequest.subscription,
            customer_name: normalizeRelation(selectedRequest.subscription.customers)?.name || 'Customer'
        }
        : null;

    return (
        <div className="min-h-screen bg-[#0f0f0f] text-gray-100 p-6 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <ArrowUpDown className="w-8 h-8 text-violet-400" />
                        Upgrade/Downgrade Requests
                    </h1>
                    <p className="text-gray-400 mt-1">Review customer plan-change requests before billing and MikroTik updates are applied.</p>
                </div>

                <div className="relative w-full lg:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search customer, phone, plan..."
                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {(['pending', 'approved', 'declined'] as const).map(status => (
                    <button
                        key={status}
                        onClick={() => setStatusTab(status)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                            statusTab === status
                                ? statusStyles[status]
                                : 'bg-gray-900/50 border-gray-800 text-gray-400 hover:text-white'
                        }`}
                    >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                        {counts[status] > 0 && (
                            <span className="ml-2 px-2 py-0.5 bg-white/10 rounded-full text-xs">{counts[status]}</span>
                        )}
                    </button>
                ))}
            </div>

            <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl overflow-hidden">
                {isLoading ? (
                    <div className="p-12 flex justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
                    </div>
                ) : filteredRequests.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <Clock className="w-12 h-12 mx-auto mb-4 text-gray-700" />
                        <p>No {statusTab} plan-change requests found.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {filteredRequests.map(request => {
                            const subscription = request.subscription;
                            const customer = normalizeRelation(subscription?.customers);
                            const businessUnit = normalizeRelation(subscription?.business_units);
                            const isProcessing = processingId === request.id;

                            return (
                                <div key={request.id} className="p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-5 hover:bg-white/[0.02] transition-colors">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1">
                                        <div>
                                            <div className="text-white font-semibold">{customer?.name || 'Unknown customer'}</div>
                                            <div className="text-xs text-gray-500 mt-1">{customer?.mobile_number || '-'}</div>
                                            <div className="text-xs text-gray-500 mt-1">{subscription?.address || '-'} {subscription?.barangay || ''}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-500 uppercase mb-1">Current Plan</div>
                                            <div className="text-gray-200">{request.old_plan?.name || 'Unknown'}</div>
                                            <div className="text-xs text-gray-500">{formatCurrency(request.old_monthly_fee)}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-500 uppercase mb-1">Requested Plan</div>
                                            <div className="text-violet-300 font-medium">{request.new_plan?.name || 'Unknown'}</div>
                                            <div className="text-xs text-gray-500">{formatCurrency(request.new_monthly_fee)}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-500 uppercase mb-1">Request Details</div>
                                            <div className="text-gray-300 capitalize">{request.request_type || 'plan change'}</div>
                                            <div className="text-xs text-gray-500">{businessUnit?.name || 'No business unit'}</div>
                                            <div className="text-xs text-gray-500">Submitted {formatDate(request.requested_at)}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 xl:w-72 xl:justify-end">
                                        <span className={`px-3 py-1 rounded-full border text-xs font-medium ${statusStyles[request.status]}`}>
                                            {request.status}
                                        </span>

                                        {request.status === 'pending' ? (
                                            <>
                                                <button
                                                    onClick={() => handleDecline(request)}
                                                    disabled={isProcessing}
                                                    className="px-3 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-800 text-red-300 rounded-lg text-sm transition-colors flex items-center gap-2"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                    Decline
                                                </button>
                                                <button
                                                    onClick={() => openApprovalModal(request)}
                                                    disabled={isProcessing}
                                                    className="px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                    Review & Apply
                                                </button>
                                            </>
                                        ) : (
                                            <span className="text-xs text-gray-500">
                                                Reviewed {formatDate(request.reviewed_at)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {selectedRequest && modalSubscription && (
                <EditSubscriptionModal
                    isOpen={Boolean(selectedRequest)}
                    onClose={() => setSelectedRequest(null)}
                    subscription={modalSubscription}
                    onUpdate={() => {
                        setSelectedRequest(null);
                        fetchRequests();
                    }}
                    initialTab="plan"
                    initialPlanId={selectedRequest.new_plan_id}
                    initialPlanChangeDate={selectedRequest.requested_old_plan_end_date || undefined}
                    planChangeRequestId={selectedRequest.id}
                />
            )}
        </div>
    );
}
