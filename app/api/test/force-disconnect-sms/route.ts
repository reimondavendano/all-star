import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBulkSMS, SMSTemplates } from '@/lib/sms';
import { toISODateString, formatDatePH } from '@/lib/billing';

export async function GET(request: Request) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        return NextResponse.json({ error: 'Missing Supabase keys' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const { searchParams } = new URL(request.url);
        const testNumber = searchParams.get('number');
        const businessUnitName = searchParams.get('bu') || 'bulihan';
        const sendToExtension = searchParams.get('ext') === 'true';
        
        // We use March 20, 2026 as the explicit reference date since that was when it failed
        const referenceDate = new Date('2026-03-20T00:00:00Z');
        const smsMessages: Array<{ to: string; message: string }> = [];
        let totalFound = 0;

        if (testNumber) {
            // TEST MODE: Send multiple variants to see which one bypasses the spam filters!
            
            // Format 1: No link at all (to confirm if it's the message content getting flagged)
            smsMessages.push({
                to: testNumber,
                message: "URGENT NOTICE\n\nHi Test Customer,\n\nYour internet service will be disconnected on March 20 due to unpaid balance.\n\nPlease pay immediately to continue service.\n- Allstar"
            });

            // Format 2: Older project format exactly (with trailing slash)
            const link2 = `allstar-kalibre.github.io/client-portal.github.io/?customerid=test-id-123`;
            smsMessages.push({
                to: testNumber,
                message: `URGENT NOTICE\n\nHi Test Customer,\n\nYour internet service will be disconnected on March 20 due to unpaid balance.\n\nView account:\n${link2}\n\nPlease pay immediately to continue service.\n- Allstar`
            });

            // Format 3: Use the .html format like their old project 
            // even if it redirects or 404s, we just want to test delivery first.
            const link3 = `allstar-kalibre.github.io/client-portal.github.io/index.html?customerid=test-id-123`;
            smsMessages.push({
                to: testNumber,
                message: `URGENT NOTICE\n\nHi Test Customer,\n\nYour internet service will be disconnected on March 20 due to unpaid balance.\n\nView account:\n${link3}\n\nPlease pay immediately to continue service.\n- Allstar`
            });

            totalFound = 3;
        } else {
            // NORMAL MODE: Query DB for unpaid active invoices
            let targetBusinessUnitIds: string[] = [];
            let extensionIds: string[] = [];
            
            // Find business unit IDs
            if (businessUnitName) {
                const { data } = await supabase
                    .from('business_units')
                    .select('id')
                    .ilike('name', `%${businessUnitName}%`);
                if (data) {
                    targetBusinessUnitIds.push(...data.map(bu => bu.id));
                }
            }

            if (sendToExtension) {
                const { data } = await supabase
                    .from('business_units')
                    .select('id')
                    .ilike('name', '%extension%');
                if (data) {
                    extensionIds = data.map(bu => bu.id);
                    targetBusinessUnitIds.push(...extensionIds);
                }
            }
            
            if (targetBusinessUnitIds.length === 0) {
               return NextResponse.json({ error: 'No matching business units found' }, { status: 400 });
            }

            // Fetch unpaid invoices that exist for active subscriptions in these BUs
            const { data: unpaidInvoices, error } = await supabase
                .from('invoices')
                .select(`
                    id,
                    amount_due,
                    due_date,
                    subscriptions!inner (
                        id,
                        active,
                        business_unit_id,
                        invoice_date,
                        customers!subscriptions_subscriber_id_fkey (
                            id,
                            name,
                            mobile_number
                        )
                    )
                `)
                .in('payment_status', ['Unpaid', 'Partially Paid'])
                .in('subscriptions.business_unit_id', targetBusinessUnitIds)
                .eq('subscriptions.active', true);

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            
            // Note: For Extension we only target 15th cycle (since 20th is the disconnect for 15th cycle)
            const validInvoices = (unpaidInvoices || []).filter(inv => {
                const sub = inv.subscriptions as any;
                
                // If it is an extension subscription, enforce the '15th' cycle rule
                if (extensionIds.includes(sub.business_unit_id)) {
                    if (sub.invoice_date !== '15th') {
                        return false; // Skip 30th cycle extensions
                    }
                }
                return true;
            });

            for (const invoice of validInvoices) {
                const sub = invoice.subscriptions as any;
                const customer = sub?.customers;

                if (customer?.mobile_number) {
                    const portalLink = `allstar-kalibre.github.io/client-portal.github.io?customerid=${customer.id}`;

                    smsMessages.push({
                        to: customer.mobile_number,
                        message: SMSTemplates.disconnectionWarning(
                            customer.name,
                            formatDatePH(referenceDate),
                            portalLink
                        ),
                    });
                }
            }
            totalFound = validInvoices.length;
        }

        let smsResult = { sent: 0, failed: 0 };
        if (smsMessages.length > 0) {
            smsResult = await sendBulkSMS(smsMessages);
        }

        return NextResponse.json({
            success: true,
            totalFound,
            smsSent: smsResult.sent,
            smsFailed: smsResult.failed,
            messagesProcessed: smsMessages.length
        });
        
    } catch (e: any) {
         return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
