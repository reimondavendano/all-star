/**
 * Find Subscription by Customer Name or Phone Number
 * Helper endpoint to get subscription IDs for testing
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const name = searchParams.get('name');
        const phone = searchParams.get('phone');
        const businessUnit = searchParams.get('businessUnit');
        
        if (!name && !phone) {
            return NextResponse.json({
                success: false,
                error: 'Either name or phone parameter is required',
                usage: 'GET /api/test/find-subscription?name=John or ?phone=09123456789'
            }, { status: 400 });
        }
        
        const supabase = getSupabaseAdmin();
        
        let query = supabase
            .from('subscriptions')
            .select(`
                id,
                active,
                balance,
                invoice_date,
                customer_portal,
                subscriber:customers!subscriptions_subscriber_id_fkey (
                    id,
                    name,
                    mobile_number
                ),
                business_unit:business_units!subscriptions_business_unit_id_fkey (
                    id,
                    name
                ),
                plan:plans!subscriptions_plan_id_fkey (
                    id,
                    name,
                    monthly_fee
                )
            `);
        
        // Search by customer name
        if (name) {
            const { data: customers } = await supabase
                .from('customers')
                .select('id')
                .ilike('name', `%${name}%`);
            
            if (customers && customers.length > 0) {
                const customerIds = customers.map(c => c.id);
                query = query.in('subscriber_id', customerIds);
            }
        }
        
        // Search by phone number
        if (phone) {
            const { data: customers } = await supabase
                .from('customers')
                .select('id')
                .ilike('mobile_number', `%${phone}%`);
            
            if (customers && customers.length > 0) {
                const customerIds = customers.map(c => c.id);
                query = query.in('subscriber_id', customerIds);
            }
        }
        
        // Filter by business unit if provided
        if (businessUnit) {
            const { data: businessUnits } = await supabase
                .from('business_units')
                .select('id')
                .ilike('name', `%${businessUnit}%`);
            
            if (businessUnits && businessUnits.length > 0) {
                query = query.in('business_unit_id', businessUnits.map(bu => bu.id));
            }
        }
        
        const { data: subscriptions, error } = await query.limit(20);
        
        if (error) {
            return NextResponse.json({
                success: false,
                error: error.message
            }, { status: 500 });
        }
        
        // Get unpaid invoice count for each subscription
        const subscriptionsWithInvoices = await Promise.all(
            (subscriptions || []).map(async (sub) => {
                const { data: unpaidInvoices } = await supabase
                    .from('invoices')
                    .select('id, invoice_number, amount, amount_paid, due_date')
                    .eq('subscription_id', sub.id)
                    .lt('amount_paid', supabase.rpc('amount', {}))
                    .order('created_at', { ascending: false });
                
                return {
                    subscriptionId: sub.id,
                    customerName: (sub.subscriber as any).name,
                    mobileNumber: (sub.subscriber as any).mobile_number,
                    businessUnit: (sub.business_unit as any).name,
                    plan: (sub.plan as any).name,
                    monthlyFee: (sub.plan as any).monthly_fee,
                    active: sub.active,
                    balance: sub.balance,
                    invoiceDate: sub.invoice_date,
                    unpaidInvoices: unpaidInvoices?.length || 0,
                    latestUnpaidInvoice: unpaidInvoices?.[0] || null
                };
            })
        );
        
        return NextResponse.json({
            success: true,
            count: subscriptionsWithInvoices.length,
            subscriptions: subscriptionsWithInvoices
        });
        
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
