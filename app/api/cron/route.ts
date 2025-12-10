/**
 * Cron Job API Route
 * Handles automated billing tasks: invoice generation, due date reminders, and disconnection warnings
 * 
 * Schedule:
 * - 10th of month: Generate invoices for Bulihan & Extension
 * - 15th of month: Due date reminders for Bulihan & Extension
 * - 20th of month: Disconnection warnings for Bulihan & Extension
 * - 25th of month: Generate invoices for Malanggam
 * - 30th of month: Due date reminders for Malanggam
 * - 5th of month: Disconnection warnings for Malanggam
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    generateInvoicesForBusinessUnit,
    sendDueDateReminders,
    sendDisconnectionWarnings,
    getTodaysTasks,
} from '@/lib/invoiceService';

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

function verifyAuthorization(request: NextRequest): boolean {
    const authHeader = request.headers.get('authorization');
    if (!CRON_SECRET) return true; // Allow in dev mode without secret
    return authHeader === `Bearer ${CRON_SECRET}`;
}

// Server-side Supabase client
function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(request: NextRequest) {
    // Verify authorization
    if (!verifyAuthorization(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results: {
        date: string;
        tasksExecuted: string[];
        invoiceGeneration: any[];
        dueReminders: any[];
        disconnectionWarnings: any[];
        errors: string[];
    } = {
        date: new Date().toISOString(),
        tasksExecuted: [],
        invoiceGeneration: [],
        dueReminders: [],
        disconnectionWarnings: [],
        errors: [],
    };

    try {
        const supabase = getSupabaseAdmin();
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1; // 1-12

        // Get today's scheduled tasks
        const tasks = getTodaysTasks(today);

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

        // 1. Invoice Generation
        for (const buType of tasks.shouldGenerateInvoices) {
            const bu = findBusinessUnit(buType);
            if (!bu) {
                results.errors.push(`Business unit not found for type: ${buType}`);
                continue;
            }

            results.tasksExecuted.push(`Invoice Generation: ${bu.name}`);

            const genResult = await generateInvoicesForBusinessUnit(
                bu.id,
                year,
                month,
                true // Send SMS notifications
            );

            results.invoiceGeneration.push({
                businessUnit: bu.name,
                generated: genResult.generated,
                skipped: genResult.skipped,
                smsSent: genResult.smsSent,
                errors: genResult.errors,
            });
        }

        // 2. Due Date Reminders
        for (const buType of tasks.shouldSendDueReminders) {
            const bu = findBusinessUnit(buType);
            if (!bu) {
                results.errors.push(`Business unit not found for type: ${buType}`);
                continue;
            }

            results.tasksExecuted.push(`Due Date Reminder: ${bu.name}`);

            const reminderResult = await sendDueDateReminders(bu.id);

            results.dueReminders.push({
                businessUnit: bu.name,
                sent: reminderResult.sent,
                errors: reminderResult.errors,
            });
        }

        // 3. Disconnection Warnings
        for (const buType of tasks.shouldSendDisconnectionWarnings) {
            const bu = findBusinessUnit(buType);
            if (!bu) {
                results.errors.push(`Business unit not found for type: ${buType}`);
                continue;
            }

            results.tasksExecuted.push(`Disconnection Warning: ${bu.name}`);

            const warningResult = await sendDisconnectionWarnings(bu.id);

            results.disconnectionWarnings.push({
                businessUnit: bu.name,
                sent: warningResult.sent,
                errors: warningResult.errors,
            });
        }

        // If no tasks were scheduled for today
        if (results.tasksExecuted.length === 0) {
            results.tasksExecuted.push('No scheduled tasks for today');
        }

        return NextResponse.json(results);

    } catch (error) {
        results.errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown'}`);
        return NextResponse.json(results, { status: 500 });
    }
}

// Allow POST for manual triggering with specific parameters
export async function POST(request: NextRequest) {
    // Verify authorization
    if (!verifyAuthorization(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { action, businessUnitId, year, month, sendSms = true } = body;

        const supabase = getSupabaseAdmin();

        switch (action) {
            case 'generate_invoices': {
                if (!businessUnitId || !year || !month) {
                    return NextResponse.json(
                        { error: 'Missing required parameters: businessUnitId, year, month' },
                        { status: 400 }
                    );
                }

                const result = await generateInvoicesForBusinessUnit(
                    businessUnitId,
                    year,
                    month,
                    sendSms
                );

                return NextResponse.json(result);
            }

            case 'send_due_reminders': {
                if (!businessUnitId) {
                    return NextResponse.json(
                        { error: 'Missing required parameter: businessUnitId' },
                        { status: 400 }
                    );
                }

                const result = await sendDueDateReminders(businessUnitId);
                return NextResponse.json(result);
            }

            case 'send_disconnection_warnings': {
                if (!businessUnitId) {
                    return NextResponse.json(
                        { error: 'Missing required parameter: businessUnitId' },
                        { status: 400 }
                    );
                }

                const result = await sendDisconnectionWarnings(businessUnitId);
                return NextResponse.json(result);
            }

            default:
                return NextResponse.json(
                    { error: `Invalid action: ${action}. Valid actions: generate_invoices, send_due_reminders, send_disconnection_warnings` },
                    { status: 400 }
                );
        }

    } catch (error) {
        return NextResponse.json(
            { error: `Error: ${error instanceof Error ? error.message : 'Unknown'}` },
            { status: 500 }
        );
    }
}
