import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendBulkSMS } from '@/lib/sms';

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
                customers:subscriber_id (
                    id,
                    name,
                    phone_number
                )
            `)
            .eq('active', true);

        if (businessUnitId !== 'all') {
            query = query.eq('business_unit_id', businessUnitId);
        }

        const { data: subscriptions, error } = await query;

        if (error) {
            console.error('Error fetching subscribers:', error);
            return NextResponse.json({ error: 'Failed to fetch subscribers' }, { status: 500 });
        }

        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json({ error: 'No active subscribers found for this Business Unit' }, { status: 404 });
        }

        // Map and deduplicate phone numbers
        const phoneMap = new Map<string, string>(); // phone -> name

        subscriptions.forEach((sub: any) => {
            if (sub.customers && sub.customers.phone_number) {
                const phone = sub.customers.phone_number.trim();
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
