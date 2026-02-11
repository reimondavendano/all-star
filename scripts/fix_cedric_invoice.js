const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase URL or Service Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixCedricInvoice() {
    console.log('Finding customer Cedric Ilag...');
    const { data: customers, error: customerError } = await supabase
        .from('customers')
        .select('id, name')
        .ilike('name', '%Cedric%');

    if (customerError || !customers?.length) {
        console.error('Customer not found', customerError);
        return;
    }

    const customerId = customers[0].id;
    console.log(`Found customer: ${customers[0].name} (${customerId})`);

    // Get active subscription
    const { data: subs, error: subError } = await supabase
        .from('subscriptions')
        .select('id, plan_id, balance')
        .eq('subscriber_id', customerId)
        .eq('active', true);

    if (subError || !subs?.length) {
        console.error('Subscription not found', subError);
        return;
    }

    const sub = subs[0];
    console.log(`Found subscription: ${sub.id}, Balance: ${sub.balance}`);

    // Get invoices
    const { data: invoices, error: invError } = await supabase
        .from('invoices')
        .select('*')
        .eq('subscription_id', sub.id)
        .order('due_date');

    if (invError) {
        console.error('Error fetching invoices', invError);
        return;
    }

    console.log('Current Invoices:');
    invoices.forEach(inv => {
        console.log(`- Due: ${inv.due_date}, Period: ${inv.from_date} to ${inv.to_date}, Amount: ${inv.amount_due}, Status: ${inv.payment_status}`);
    });

    // Find the Feb 15 invoice with 1598
    const badInvoice = invoices.find(inv =>
        (inv.amount_due == 1598 || inv.due_date === '2026-02-15')
    );

    if (badInvoice) {
        console.log(`Fixing invoice ${badInvoice.id}... changing amount 1598 -> 799`);
        const { error: updateError } = await supabase
            .from('invoices')
            .update({ amount_due: 799 })
            .eq('id', badInvoice.id);

        if (updateError) {
            console.error('Failed to update invoice', updateError);
        } else {
            console.log('Invoice updated successfully.');
        }
    } else {
        console.log('No specific invoice with 1598 found, checking for one with 1598...');
        const specificBad = invoices.find(inv => inv.amount_due == 1598);
        if (specificBad) {
            console.log(`Found an invoice with 1598, updating amount to 799...`);
            await supabase.from('invoices').update({ amount_due: 799 }).eq('id', specificBad.id);
            console.log('Updated.');
        } else {
            console.log('All looking good or manual check needed.');
        }
    }
}

fixCedricInvoice();
