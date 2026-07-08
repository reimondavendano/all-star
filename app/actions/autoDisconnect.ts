'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSupabase() {
    return createClient(supabaseUrl, supabaseKey);
}

export interface AutoDisconnectRule {
    id: string;
    business_unit_id: string;
    invoice_cycle: string | null;
    disconnect_date: string | null;
    is_recurring: boolean;
    created_at: string;
    updated_at: string;
}

export async function getAutoDisconnectRules() {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('auto_disconnect_rules')
        .select('*, business_units(name)');

    if (error) {
        console.error('Error fetching auto disconnect rules:', error);
        return { success: false, error: error.message };
    }

    return { success: true, data };
}

export async function upsertAutoDisconnectRule(
    business_unit_id: string,
    invoice_cycle: string | null,
    disconnect_date: string | null,
    is_recurring: boolean
) {
    const supabase = getSupabase();

    // In Supabase with unique nulls not distinct, we might have to use match
    // since onConflict doesn't perfectly handle nullable columns in all PG versions
    // So we try an update first, then insert if not found
    let query = supabase.from('auto_disconnect_rules').select('id').eq('business_unit_id', business_unit_id);
    if (invoice_cycle) {
        query = query.eq('invoice_cycle', invoice_cycle);
    } else {
        query = query.is('invoice_cycle', null);
    }

    const { data: existing } = await query.single();

    let result;
    if (existing) {
        result = await supabase
            .from('auto_disconnect_rules')
            .update({
                disconnect_date,
                is_recurring,
                updated_at: new Date().toISOString()
            })
            .eq('id', existing.id)
            .select()
            .single();
    } else {
        result = await supabase
            .from('auto_disconnect_rules')
            .insert({
                business_unit_id,
                invoice_cycle,
                disconnect_date,
                is_recurring,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();
    }

    if (result.error) {
        console.error('Error upserting auto disconnect rule:', result.error);
        return { success: false, error: result.error.message };
    }

    revalidatePath('/admin/auto-disconnect');
    return { success: true, data: result.data };
}

export async function getRecentlyDisconnectedSubscriptions() {
    const supabase = getSupabase();
    
    // Fetch recently disconnected subscriptions (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data, error } = await supabase
        .from('subscriptions')
        .select(`
            id,
            last_disconnection_date,
            balance,
            invoice_date,
            business_unit_id,
            customers!subscriptions_subscriber_id_fkey!inner ( name ),
            business_units ( name )
        `)
        .eq('active', false)
        .not('last_disconnection_date', 'is', null)
        .gte('last_disconnection_date', thirtyDaysAgo.toISOString())
        .order('last_disconnection_date', { ascending: false })
        .limit(100);

    if (error) {
        console.error('Error fetching disconnected subs:', error);
        return { success: false, error: error.message };
    }

    return { success: true, data };
}

export async function getBusinessUnits() {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('business_units')
        .select('id, name')
        .order('name');
        
    if (error) {
        console.error('Error fetching business units:', error);
        return { success: false, error: error.message };
    }
    
    return { success: true, data };
}

