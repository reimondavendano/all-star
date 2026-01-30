/**
 * Disconnection Notice Cron Job
 * 
 * This endpoint should be called daily by a cron scheduler (e.g., Vercel Cron)
 * It checks if today is a disconnection warning day for any business unit
 * and sends SMS notifications to customers with unpaid balances.
 * 
 * Schedule: Daily at 9:00 AM PHT
 * Vercel Cron: 0 1 * * * (1 AM UTC = 9 AM PHT)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTodaysTasks, sendDisconnectionWarnings } from '@/lib/invoiceService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
    return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(request: Request) {
    try {
        // Verify cron secret to prevent unauthorized access
        const authHeader = request.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = getSupabaseAdmin();
        const today = new Date();
        
        // Get today's scheduled tasks
        const tasks = getTodaysTasks(today);
        
        const results = {
            date: today.toISOString(),
            disconnectionWarnings: [] as any[],
            errors: [] as string[]
        };

        // Send disconnection warnings if scheduled for today
        if (tasks.shouldSendDisconnectionWarnings.length > 0) {
            console.log(`[Cron] Sending disconnection warnings for: ${tasks.shouldSendDisconnectionWarnings.join(', ')}`);
            
            for (const buType of tasks.shouldSendDisconnectionWarnings) {
                try {
                    // Find business units matching this type
                    const { data: businessUnits, error: buError } = await supabase
                        .from('business_units')
                        .select('id, name')
                        .ilike('name', `%${buType}%`);

                    if (buError) {
                        results.errors.push(`Error fetching business units for ${buType}: ${buError.message}`);
                        continue;
                    }

                    // Send warnings for each business unit
                    for (const bu of businessUnits || []) {
                        console.log(`[Cron] Processing disconnection warnings for ${bu.name}`);
                        
                        const result = await sendDisconnectionWarnings(bu.id);
                        
                        results.disconnectionWarnings.push({
                            businessUnit: bu.name,
                            sent: result.sent,
                            success: result.success,
                            errors: result.errors
                        });

                        if (!result.success) {
                            results.errors.push(`Failed for ${bu.name}: ${result.errors.join(', ')}`);
                        }
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    results.errors.push(`Error processing ${buType}: ${errorMsg}`);
                    console.error(`[Cron] Error for ${buType}:`, error);
                }
            }
        } else {
            console.log('[Cron] No disconnection warnings scheduled for today');
        }

        return NextResponse.json({
            success: true,
            message: 'Disconnection notice cron job completed',
            results
        });

    } catch (error) {
        console.error('[Cron] Disconnection notice error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// Also support POST for manual triggers
export async function POST(request: Request) {
    return GET(request);
}
