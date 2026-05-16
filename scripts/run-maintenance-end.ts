import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, '../.env.local') });

async function run() {
    // Dynamic import to avoid hoisting before dotenv loads
    const { supabase } = await import('../lib/supabase');
    const { sendBulkSMS } = await import('../lib/sms');

    try {
        console.log('Fetching customers...');
        const { data: customers, error } = await supabase
            .from('customers')
            .select('name, mobile_number');

        if (error) {
            console.error('Error fetching customers:', error);
            process.exit(1);
        }

        const validCustomers = customers.filter((c: any) => c.mobile_number && c.mobile_number.trim() !== '');

        const message = `Network maintenance is now complete. Internet service is back to normal. Thank you for your patience. - Allstar`;

        const smsJobs = validCustomers.map((customer: any) => ({
            to: customer.mobile_number,
            message: message
        }));

        console.log(`Sending maintenance end SMS to ${smsJobs.length} customers...`);
        const result = await sendBulkSMS(smsJobs);

        console.log('Success!', result);
    } catch (error) {
        console.error('Unexpected error:', error);
    }
}

run();
