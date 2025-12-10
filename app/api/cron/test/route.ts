/**
 * Test Endpoint for Manual Cron Trigger
 * Use this to manually test scheduled billing tasks
 * 
 * GET /api/cron/test - Runs today's scheduled tasks
 * GET /api/cron/test?simulate=2025-12-10 - Simulates a specific date
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    generateInvoicesForBusinessUnit,
    sendDueDateReminders,
    sendDisconnectionWarnings,
    getTodaysTasks,
} from '@/lib/invoiceService';

// Server-side Supabase client
function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const simulateDate = searchParams.get('simulate');
    const sendSms = searchParams.get('sms') !== 'false'; // Default true, set ?sms=false to disable
    const dryRun = searchParams.get('dryrun') === 'true'; // ?dryrun=true to just check what would run

    // Use simulated date or current date
    let testDate: Date;
    if (simulateDate) {
        testDate = new Date(simulateDate + 'T06:00:00+08:00'); // 6 AM Philippine Time
    } else {
        testDate = new Date(); // Current time
    }

    // Convert to Philippine Time for display
    const philippineTime = new Date(testDate.getTime() + (8 * 60 * 60 * 1000));
    const phDateStr = philippineTime.toISOString().split('T')[0];
    const phDay = philippineTime.getUTCDate();

    const results: {
        testDate: string;
        philippineDate: string;
        dayOfMonth: number;
        dryRun: boolean;
        sendSms: boolean;
        scheduledTasks: any;
        executionResults: any[];
        errors: string[];
    } = {
        testDate: testDate.toISOString(),
        philippineDate: phDateStr,
        dayOfMonth: phDay,
        dryRun,
        sendSms,
        scheduledTasks: null,
        executionResults: [],
        errors: [],
    };

    try {
        const supabase = getSupabaseAdmin();

        // Get scheduled tasks for this date
        const tasks = getTodaysTasks(testDate);
        results.scheduledTasks = tasks;

        if (dryRun) {
            // Just return what would be executed
            return NextResponse.json({
                message: 'Dry run - no actions taken',
                ...results,
            });
        }

        // Get all business units
        const { data: businessUnits, error: buError } = await supabase
            .from('business_units')
            .select('id, name');

        if (buError) {
            results.errors.push(`Failed to fetch business units: ${buError.message}`);
            return NextResponse.json(results, { status: 500 });
        }

        // Helper to find business unit by type
        const findBusinessUnit = (type: string) => {
            return businessUnits?.find(bu =>
                bu.name.toLowerCase().includes(type.toLowerCase())
            );
        };

        const year = philippineTime.getUTCFullYear();
        const month = philippineTime.getUTCMonth() + 1; // 1-12

        // Execute Invoice Generation
        for (const buType of tasks.shouldGenerateInvoices) {
            const bu = findBusinessUnit(buType);
            if (!bu) {
                results.errors.push(`Business unit not found: ${buType}`);
                continue;
            }

            const result = await generateInvoicesForBusinessUnit(
                bu.id,
                year,
                month,
                sendSms
            );

            results.executionResults.push({
                task: 'Invoice Generation',
                businessUnit: bu.name,
                ...result,
            });
        }

        // Execute Due Date Reminders
        for (const buType of tasks.shouldSendDueReminders) {
            const bu = findBusinessUnit(buType);
            if (!bu) {
                results.errors.push(`Business unit not found: ${buType}`);
                continue;
            }

            const result = await sendDueDateReminders(bu.id);

            results.executionResults.push({
                task: 'Due Date Reminder',
                businessUnit: bu.name,
                ...result,
            });
        }

        // Execute Disconnection Warnings
        for (const buType of tasks.shouldSendDisconnectionWarnings) {
            const bu = findBusinessUnit(buType);
            if (!bu) {
                results.errors.push(`Business unit not found: ${buType}`);
                continue;
            }

            const result = await sendDisconnectionWarnings(bu.id);

            results.executionResults.push({
                task: 'Disconnection Warning',
                businessUnit: bu.name,
                ...result,
            });
        }

        // Return summary
        const summary = {
            message: results.executionResults.length > 0
                ? `Executed ${results.executionResults.length} task(s)`
                : 'No scheduled tasks for this date',
            ...results,
        };

        return NextResponse.json(summary);

    } catch (error) {
        results.errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown'}`);
        return NextResponse.json(results, { status: 500 });
    }
}
