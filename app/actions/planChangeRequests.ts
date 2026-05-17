'use server';

import { createClient } from '@supabase/supabase-js';

export type PlanChangeStatus = 'pending' | 'approved' | 'declined';
export type PlanChangeBusinessFilter = 'all' | 'malanggam' | 'bulihan' | 'extension' | '30th-cycle';

export interface AdminPlanChangeRequest {
    id: string;
    status: PlanChangeStatus;
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
    created_at?: string | null;
    subscription: any;
    old_plan: { name: string; monthly_fee: number } | null;
    new_plan: { name: string; monthly_fee: number } | null;
}

interface ListPlanChangeRequestParams {
    status: PlanChangeStatus;
    search?: string;
    businessFilter?: PlanChangeBusinessFilter;
    monthFilter?: string;
    page?: number;
    pageSize?: number;
}

function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase admin environment variables are not configured.');
    }

    return createClient(supabaseUrl, supabaseServiceKey);
}

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] || null;
    return value || null;
}

function getBusinessUnitName(request: AdminPlanChangeRequest) {
    return String(normalizeRelation(request.subscription?.business_units)?.name || '').toLowerCase();
}

function matchesBusinessFilter(request: AdminPlanChangeRequest, filter: PlanChangeBusinessFilter) {
    if (filter === 'all') return true;

    const businessUnitName = getBusinessUnitName(request);
    const invoiceDate = request.subscription?.invoice_date;

    if (filter === 'malanggam') return businessUnitName.includes('malanggam');
    if (filter === 'bulihan') return businessUnitName.includes('bulihan');
    if (filter === 'extension') return businessUnitName.includes('extension');
    if (filter === '30th-cycle') {
        return businessUnitName.includes('malanggam') ||
            (businessUnitName.includes('extension') && invoiceDate === '30th');
    }

    return true;
}

function matchesSearch(request: AdminPlanChangeRequest, search: string) {
    const query = search.trim().toLowerCase();
    if (!query) return true;

    const customer = normalizeRelation(request.subscription?.customers);
    const businessUnit = normalizeRelation(request.subscription?.business_units);

    return [
        customer?.name,
        customer?.mobile_number,
        request.subscription?.address,
        request.subscription?.barangay,
        businessUnit?.name,
        request.old_plan?.name,
        request.new_plan?.name,
        request.subscription?.invoice_date
    ].some(value => String(value || '').toLowerCase().includes(query));
}

function matchesMonthFilter(request: AdminPlanChangeRequest, monthFilter?: string) {
    if (!monthFilter || monthFilter === 'all') return true;

    const requestDate = request.requested_at || request.created_at;
    if (!requestDate) return false;

    return requestDate.slice(0, 7) === monthFilter;
}

async function fetchAllPlanChangeRequests() {
    const supabase = getSupabaseAdmin();

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
            created_at,
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
        .order('requested_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

    if (error) {
        throw error;
    }

    return ((data || []) as any[]).map((request) => ({
        ...request,
        subscription: normalizeRelation(request.subscription),
        old_plan: normalizeRelation(request.old_plan),
        new_plan: normalizeRelation(request.new_plan)
    })) as AdminPlanChangeRequest[];
}

export async function listAdminPlanChangeRequests(params: ListPlanChangeRequestParams) {
    const status = params.status;
    const search = params.search || '';
    const businessFilter = params.businessFilter || 'all';
    const monthFilter = params.monthFilter || 'all';
    const pageSize = Math.max(1, Math.min(params.pageSize || 10, 50));
    const currentPage = Math.max(1, params.page || 1);

    const requests = await fetchAllPlanChangeRequests();
    const baseFiltered = requests
        .filter(request => matchesBusinessFilter(request, businessFilter))
        .filter(request => matchesMonthFilter(request, monthFilter))
        .filter(request => matchesSearch(request, search));

    const counts = {
        pending: baseFiltered.filter(request => request.status === 'pending').length,
        approved: baseFiltered.filter(request => request.status === 'approved').length,
        declined: baseFiltered.filter(request => request.status === 'declined').length
    };

    const statusFiltered = baseFiltered.filter(request => request.status === status);
    const total = statusFiltered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * pageSize;

    return {
        success: true,
        requests: statusFiltered.slice(startIndex, startIndex + pageSize),
        counts,
        total,
        page: safePage,
        pageSize,
        totalPages
    };
}

export async function getPendingPlanChangeRequestCount() {
    const supabase = getSupabaseAdmin();

    const { count, error } = await supabase
        .from('plan_changes')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

    if (error) {
        console.error('Error counting pending plan-change requests:', error);
        return 0;
    }

    return count || 0;
}

export async function declineAdminPlanChangeRequest(planChangeId: string, reason?: string) {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
        .from('plan_changes')
        .update({
            status: 'declined',
            reviewed_at: new Date().toISOString(),
            decision_notes: reason || null
        })
        .eq('id', planChangeId)
        .eq('status', 'pending');

    if (error) {
        console.error('Decline Plan Change Request Error:', error);
        return { success: false, error: error.message };
    }

    return { success: true };
}
