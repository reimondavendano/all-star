import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(request: NextRequest) {
    try {
        const supabase = getSupabaseAdmin();
        
        const { data, error } = await supabase
            .from('business_units')
            .select('id, name')
            .order('name');
        
        if (error) {
            return NextResponse.json({ 
                success: false,
                error: error.message 
            }, { status: 500 });
        }
        
        return NextResponse.json({ 
            success: true,
            businessUnits: data,
            count: data?.length || 0
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
