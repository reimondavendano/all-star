
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAccess() {
    console.log('Testing access to tables...');

    // Test Prospects
    const { data: prospects, error: prospectsError } = await supabase
        .from('prospects')
        .select('count')
        .limit(1);

    if (prospectsError) {
        console.error('Error accessing prospects:', prospectsError.message);
    } else {
        console.log('Prospects access successful. Count:', prospects.length); // Count might be 0 or 1 depending on data
    }

    // Test Customers
    const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .limit(5);

    if (customersError) {
        console.error('Error accessing customers:', customersError.message);
    } else {
        console.log('Customers access successful. Rows found:', customers.length);
        if (customers.length > 0) {
            console.log('Sample customer:', customers[0]);
        } else {
            console.log('No customers found (RLS might be blocking or table is empty).');
        }
    }
}

testAccess();
