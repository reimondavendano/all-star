import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendBulkSMS } from '@/lib/sms';

const THIRTIETH_CYCLE_AUDIENCE = '30th-cycle';

function isThirtiethCycleAudience(subscription: any) {
    const businessUnitName = String(subscription.business_units?.name || '').toLowerCase();
    return subscription.invoice_date === '30th' &&
        (businessUnitName.includes('malanggam') || businessUnitName.includes('extension'));
}

export async function POST(request: Request) {
    try {
        const { businessUnitId, message } = await request.json();

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        if (!businessUnitId) {
            return NextResponse.json({ error: 'Business Unit is required' }, { status: 400 });
        }

        // Query active subscriptions and get the customer's phone number
        let query = supabase
            .from('subscriptions')
            .select(`
                id,
                business_unit_id,
                invoice_date,
                active,
                business_units (
                    name
                ),
                customers:subscriber_id (
                    id,
                    name,
                    mobile_number
                )
            `)
            .eq('active', true);

        if (businessUnitId !== 'all' && businessUnitId !== THIRTIETH_CYCLE_AUDIENCE) {
            query = query.eq('business_unit_id', businessUnitId);
        }

        const { data: subscriptions, error } = await query;

        if (error) {
            console.error('Error fetching subscribers:', error);
            return NextResponse.json({ error: 'Failed to fetch subscribers' }, { status: 500 });
        }

        const targetSubscriptions = businessUnitId === THIRTIETH_CYCLE_AUDIENCE
            ? subscriptions?.filter(isThirtiethCycleAudience)
            : subscriptions;

        if (!targetSubscriptions || targetSubscriptions.length === 0) {
            return NextResponse.json({ error: 'No active subscribers found for this Business Unit' }, { status: 404 });
        }

        // Map and deduplicate phone numbers
        const phoneMap = new Map<string, string>(); // phone -> name

        targetSubscriptions.forEach((sub: any) => {
            if (sub.customers && sub.customers.mobile_number) {
                const phone = sub.customers.mobile_number.trim();
                if (phone && phone.length >= 10) {
                    phoneMap.set(phone, sub.customers.name);
                }
            }
        });

        const messagesToSend = Array.from(phoneMap.entries()).map(([phone, name]) => ({
            to: phone,
            message: message // We send the exact message they typed in the box
        }));

        if (messagesToSend.length === 0) {
            return NextResponse.json({ error: 'No valid phone numbers found for the selected subscribers' }, { status: 404 });
        }

        // Send bulk SMS
        const result = await sendBulkSMS(messagesToSend);

        return NextResponse.json({
            success: true,
            message: 'Bulk SMS queued successfully',
            stats: {
                totalTargeted: messagesToSend.length,
                sent: result.sent,
                failed: result.failed
            }
        });

    } catch (error: any) {
        console.error('Error in bulk SMS route:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
