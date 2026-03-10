/**
 * Test Disconnection Warning SMS for Specific Customer
 * Sends disconnection warning SMS to a specific phone number only (for testing)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendSMS, SMSTemplates, removeHttpsProtocol } from '@/lib/sms';

function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(request: NextRequest) {
    try {
        const { phoneNumber, subscriptionId } = await request.json();
        
        if (!phoneNumber) {
            return NextResponse.json({
                success: false,
                error: 'phoneNumber is required'
            }, { status: 400 });
        }
        
        if (!subscriptionId) {
            return NextResponse.json({
                success: false,
                error: 'subscriptionId is required'
            }, { status: 400 });
        }
        
        const supabase = getSupabaseAdmin();
        
        // Get subscription details
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select(`
                id,
                balance,
                customer_portal,
                invoice_date,
                subscriber:customers!subscriptions_subscriber_id_fkey (
                    id,
                    name,
                    mobile_number
                ),
                business_unit:business_units!subscriptions_business_unit_id_fkey (
                    id,
                    name
                )
            `)
            .eq('id', subscriptionId)
            .single();
        
        if (subError || !subscription) {
            return NextResponse.json({
                success: false,
                error: `Subscription not found: ${subError?.message}`
            }, { status: 404 });
        }
        
        // Get all unpaid invoices
        const { data: unpaidInvoices, error: invError } = await supabase
            .from('invoices')
            .select('amount, amount_paid')
            .eq('subscription_id', subscriptionId)
            .lt('amount_paid', supabase.rpc('amount', {}));
        
        if (invError) {
            return NextResponse.json({
                success: false,
                error: `Error fetching invoices: ${invError.message}`
            }, { status: 500 });
        }
        
        // Calculate total unpaid amount
        let totalUnpaid = subscription.balance || 0;
        if (unpaidInvoices && unpaidInvoices.length > 0) {
            totalUnpaid = unpaidInvoices.reduce((sum, inv) => {
                return sum + (inv.amount - (inv.amount_paid || 0));
            }, 0);
        }
        
        // Calculate disconnection date (5 days from now)
        const disconnectionDate = new Date();
        disconnectionDate.setDate(disconnectionDate.getDate() + 5);
        const disconnectionDateStr = disconnectionDate.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
        
        // Prepare SMS data
        const customerName = (subscription.subscriber as any).name;
        
        // Generate portal link
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const portalLink = removeHttpsProtocol(`${baseUrl}${subscription.customer_portal}`);
        
        // Generate SMS message
        const message = SMSTemplates.disconnectionWarning(
            customerName,
            disconnectionDateStr,
            portalLink,
            totalUnpaid > 0 ? totalUnpaid : undefined
        );
        
        // Send SMS to specified phone number
        const result = await sendSMS({
            to: phoneNumber,
            message: message
        });
        
        return NextResponse.json({
            success: result.success,
            messageId: result.messageId,
            error: result.error,
            details: {
                sentTo: phoneNumber,
                customerName,
                businessUnit: (subscription.business_unit as any).name,
                totalUnpaid,
                disconnectionDate: disconnectionDateStr,
                unpaidInvoicesCount: unpaidInvoices?.length || 0,
                messageLength: message.length,
                message: message
            }
        });
        
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    return NextResponse.json({
        message: 'Test Disconnection Warning SMS Endpoint',
        usage: 'POST with JSON body',
        description: 'Send disconnection warning SMS to a specific phone number for testing',
        example: {
            phoneNumber: '09123456789',
            subscriptionId: 'uuid-of-subscription'
        },
        note: 'Use this to test SMS without sending to all customers'
    });
}
