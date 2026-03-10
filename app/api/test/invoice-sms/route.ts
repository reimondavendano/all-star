/**
 * Test Invoice SMS for Specific Customer
 * Sends invoice SMS to a specific phone number only (for testing)
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
            `)
            .eq('id', subscriptionId)
            .single();
        
        if (subError || !subscription) {
            return NextResponse.json({
                success: false,
                error: `Subscription not found: ${subError?.message}`
            }, { status: 404 });
        }
        
        // Get latest unpaid invoice for this subscription
        const { data: invoice, error: invError } = await supabase
            .from('invoices')
            .select('*')
            .eq('subscription_id', subscriptionId)
            .lt('amount_paid', supabase.rpc('amount', {})) // amount_paid < amount
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        if (invError || !invoice) {
            return NextResponse.json({
                success: false,
                error: 'No unpaid invoice found for this subscription'
            }, { status: 404 });
        }
        
        // Prepare SMS data
        const customerName = (subscription.subscriber as any).name;
        const businessUnit = (subscription.business_unit as any).name;
        const amount = invoice.amount;
        const unpaidBalance = subscription.balance || 0;
        const dueDate = new Date(invoice.due_date).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
        
        // Generate portal link
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const portalLink = removeHttpsProtocol(`${baseUrl}${subscription.customer_portal}`);
        
        // Generate SMS message
        const message = SMSTemplates.invoiceGenerated(
            customerName,
            amount,
            dueDate,
            businessUnit,
            portalLink,
            unpaidBalance > 0 ? unpaidBalance : undefined
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
                businessUnit,
                invoiceNumber: invoice.invoice_number,
                amount,
                unpaidBalance,
                dueDate,
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
        message: 'Test Invoice SMS Endpoint',
        usage: 'POST with JSON body',
        description: 'Send invoice SMS to a specific phone number for testing',
        example: {
            phoneNumber: '09123456789',
            subscriptionId: 'uuid-of-subscription'
        },
        note: 'Use this to test SMS without sending to all customers'
    });
}
