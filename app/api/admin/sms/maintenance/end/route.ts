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

        const message = `Network maintenance is now complete. Internet service is back to normal. Thank you for your patience. - Allstar`;

        const smsJobs = validCustomers.map(customer => ({
            to: customer.mobile_number,
            message: message
        }));

        console.log(`Sending maintenance end SMS to ${smsJobs.length} customers...`);
        const result = await sendBulkSMS(smsJobs);

        return NextResponse.json({
            success: true,
            message: 'Maintenance end SMS queued successfully',
            customersCount: validCustomers.length,
            result
        });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
