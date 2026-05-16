import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendBulkSMS } from '@/lib/sms';

export async function GET() {
    try {
        const { data: customers, error } = await supabase
            .from('customers')
            .select('name, mobile_number');

        if (error) {
            console.error('Error fetching customers:', error);
            return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
        }

        const validCustomers = customers.filter(c => c.mobile_number && c.mobile_number.trim() !== '');

        const message = `Brief network maintenance at 1:00 PM today. Internet will be unavailable for 5-15 minutes. Thank you. - Allstar`;

        const smsJobs = validCustomers.map(customer => ({
            to: customer.mobile_number,
            message: message
        }));

        console.log(`Sending maintenance start SMS to ${smsJobs.length} customers...`);
        const result = await sendBulkSMS(smsJobs);

        return NextResponse.json({
            success: true,
            message: 'Maintenance start SMS queued successfully',
            customersCount: validCustomers.length,
            result
        });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
