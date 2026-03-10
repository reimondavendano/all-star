import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

// Server-side Supabase client
function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase credentials not configured');
    }

    return createClient(supabaseUrl, supabaseServiceKey);
}

// Helper: Normalize text for comparison (remove spaces, lowercase)
function normalizeText(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, '');
}

// Helper: Map address to barangay
function mapAddressToBarangay(address: string): string {
    const addressUpper = address.toUpperCase();

    if (addressUpper.includes('SAN AGUSTIN')) return 'San Agustin';
    if (addressUpper.includes('SAN GABRIEL')) return 'San Gabriel';
    if (addressUpper.includes('SAN VICENTE') || addressUpper.includes('LIANG')) return 'Liang';
    if (addressUpper.includes('CATMON')) return 'Catmon';

    return 'Bulihan'; // Default
}

// Helper: Format mobile number (add 0 prefix if starts with 9)
function formatMobileNumber(mobile: string): string {
    const cleaned = mobile.toString().trim();
    if (cleaned.startsWith('9') && cleaned.length === 10) {
        return '0' + cleaned;
    }
    return cleaned;
}

// Helper: Format date from Excel serial number or string
function formatDate(dateValue: any): string | null {
    if (!dateValue) return null;

    try {
        // If it's an Excel serial number
        if (typeof dateValue === 'number') {
            const date = XLSX.SSF.parse_date_code(dateValue);
            return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
        }

        // If it's already a string in YYYY-MM-DD format
        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
            return dateValue;
        }

        // Try to parse as date
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }
    } catch (error) {
        console.error('Date parsing error:', error);
    }

    return null;
}

export async function POST(request: NextRequest) {
    const supabase = getSupabaseAdmin();
    const errors: string[] = [];
    let customersCreated = 0;
    let subscriptionsCreated = 0;
    let subscriptionsUpdated = 0;
    let mikrotikSecretsCreated = 0;

    try {
        // Parse form data
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // Read Excel file
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet) as any[];

        // Get column names from first row
        const columnsFound = data.length > 0 ? Object.keys(data[0] as object) : [];
        console.log('Excel columns found:', columnsFound);

        if (data.length === 0) {
            return NextResponse.json({ error: 'Excel file is empty' }, { status: 400 });
        }

        // Fetch business units and plans for mapping
        const { data: businessUnits } = await supabase.from('business_units').select('id, name');
        const { data: plans } = await supabase.from('plans').select('id, name, monthly_fee');

        if (!businessUnits || !plans) {
            throw new Error('Failed to fetch business units or plans');
        }

        // Fetch MikroTik PPP Interfaces to look up profiles for DC users
        let mikrotikInterfaces: any[] = [];
        try {
            // Import and call MikroTik API
            const { getMikrotikData } = await import('@/app/actions/mikrotik');
            const mikrotikResult = await getMikrotikData();

            if (mikrotikResult.success && mikrotikResult.data?.pppInterfaces) {
                mikrotikInterfaces = mikrotikResult.data.pppInterfaces;
                console.log(`Fetched ${mikrotikInterfaces.length} PPP interfaces from MikroTik`);
            } else {
                console.log('Could not fetch MikroTik interfaces, DC profiles will default to Plan 999');
            }
        } catch (error) {
            console.log('Error fetching MikroTik data:', error);
        }

        // Process each row
        const createdMikrotikUsernames = new Set<string>(); // Track usernames created in this run

        for (let i = 0; i < data.length; i++) {
            const row: any = data[i];

            try {
                // Extract data from Excel columns - try multiple possible column name variations
                const customerName = (row['Customer Name'] || row['customer_name'] || row['CustomerName'])?.toString().trim();
                const mikrotikCustomerName = (row['PPP SECRET'] || row['ppp_secret'] || row['PPPSecret'] || row['Mikrotik Customer Name'])?.toString().trim();
                const mobileNumber = row['Mobile Number'] || row['mobile_number'] || row['MobileNumber'] ?
                    formatMobileNumber(row['Mobile Number'] || row['mobile_number'] || row['MobileNumber']) : null;
                const businessUnitName = (row['Business Unit'] || row['business_unit'] || row['BusinessUnit'])?.toString().trim();
                const profile = (row['Profile'] || row['profile'])?.toString().trim(); // Use Profile column for plan mapping
                const completeAddress = (row['Complete Address'] || row['complete_address'] || row['CompleteAddress'])?.toString().trim();
                const landmark = (row['LandMark'] || row['Landmark'] || row['landmark'])?.toString().trim();
                const invoiceDate = (row['Invoice Date'] || row['invoice_date'] || row['InvoiceDate'])?.toString().trim();
                const dateInstalled = formatDate(row['Date Installed'] || row['date_installed'] || row['DateInstalled']);
                const reconnectionDate = formatDate(row['Reconnection Date'] || row['reconnection_date'] || row['ReconnectionDate']);
                const balance = row['Balance'] || row['balance'] ? parseFloat(row['Balance'] || row['balance']) : 0;
                const okToDelete = (row['Ok to Delete in Mikrotik?'] || row['ok_to_delete'] || row['OkToDelete'])?.toString().trim().toUpperCase();
                const isFree = (row['Free?'] || row['free'] || row['Free'])?.toString().trim().toUpperCase();
                // Disconnected column: empty/null = active (true), "Yes" = disconnected (false)
                const disconnectedRaw = (row['Disconnected'] || row['disconnected'] || row['DISCONNECTED'])?.toString().trim().toUpperCase();
                const isDisconnected = disconnectedRaw === 'YES'; // true only if explicitly "Yes"

                // Always log active status for every row for debugging
                console.log(`Row ${i + 2} [${customerName}]: Disconnected column raw="${disconnectedRaw ?? '(empty)'}" → active=${!isDisconnected}`);

                if (!customerName || !mikrotikCustomerName) {
                    errors.push(`Row ${i + 2}: Missing customer name or MikroTik name. Customer: "${customerName}", MikroTik: "${mikrotikCustomerName}"`);
                    continue;
                }

                // 1. Find or create customer
                let customerId: string;
                const { data: existingCustomer } = await supabase
                    .from('customers')
                    .select('id')
                    .eq('name', customerName)
                    .single();

                if (existingCustomer) {
                    customerId = existingCustomer.id;
                } else {
                    const { data: newCustomer, error: customerError } = await supabase
                        .from('customers')
                        .insert({
                            name: customerName,
                            mobile_number: mobileNumber
                        })
                        .select('id')
                        .single();

                    if (customerError || !newCustomer) {
                        errors.push(`Row ${i + 2}: Failed to create customer - ${customerError?.message}`);
                        continue;
                    }

                    customerId = newCustomer.id;
                    customersCreated++;
                }

                // 2. Find business unit
                let businessUnitId: string | null = null;
                if (businessUnitName) {
                    const normalizedInput = normalizeText(businessUnitName);

                    // Handle typos and variations
                    let correctedName = businessUnitName;

                    // Map common typos to correct names
                    if (normalizedInput.includes('bliss')) {
                        correctedName = 'Malanggam';
                    } else if (normalizedInput.includes('bulhian') || normalizedInput.includes('bulhiam') || normalizedInput === 'bulihan0') {
                        correctedName = 'Bulihan';
                    }

                    const normalizedCorrected = normalizeText(correctedName);

                    // Check for Extension
                    if (normalizedCorrected.includes('ext')) {
                        const extensionUnit = businessUnits.find(bu =>
                            normalizeText(bu.name).includes('extension')
                        );
                        businessUnitId = extensionUnit?.id || null;
                    } else {
                        // Find matching business unit (fuzzy match)
                        const matchingUnit = businessUnits.find(bu => {
                            const buNormalized = normalizeText(bu.name);
                            return buNormalized === normalizedCorrected ||
                                buNormalized.includes(normalizedCorrected) ||
                                normalizedCorrected.includes(buNormalized);
                        });
                        businessUnitId = matchingUnit?.id || null;
                    }
                }

                if (!businessUnitId) {
                    errors.push(`Row ${i + 2}: Business unit not found - ${businessUnitName}`);
                    continue;
                }

                // 3. Find plan based on Profile column
                let planId: string | null = null;

                if (profile) {
                    const profileUpper = profile.toUpperCase().trim();

                    // Map profile to plan name
                    let planName: string;

                    if (profileUpper === '50MBPS' || profileUpper === '50MBPS-2') {
                        planName = 'Plan 799';
                    } else if (profileUpper === '100MBPS' || profileUpper === '100MBPS-2') {
                        planName = 'Plan 999';
                    } else if (profileUpper === '130MBPS' || profileUpper === '130MBPS-2') {
                        planName = 'Plan 1299';
                    } else if (profileUpper === '150MBPS' || profileUpper === '150MBPS-2') {
                        planName = 'Plan 1499';
                    } else if (profileUpper === 'DC') {
                        // For DC (disconnected), try to find profile from MikroTik PPP Interfaces
                        // PPP Interface names are like "<pppoe-USERNAME>"
                        const pppInterfaceName = `<pppoe-${mikrotikCustomerName}>`;
                        const mikrotikInterface = mikrotikInterfaces.find(iface =>
                            iface.name.toUpperCase() === pppInterfaceName.toUpperCase() ||
                            iface.name.toUpperCase().includes(mikrotikCustomerName.toUpperCase())
                        );

                        if (mikrotikInterface) {
                            // Get profile from PPP Secrets using the interface name
                            // The profile is stored in PPP Secrets, not in PPP Interface
                            // We need to look up the secret by username
                            const { data: pppSecret } = await supabase
                                .from('mikrotik_ppp_secrets')
                                .select('profile')
                                .eq('name', mikrotikCustomerName)
                                .single();

                            if (pppSecret && pppSecret.profile) {
                                const mtProfile = pppSecret.profile.toUpperCase();

                                // Map MikroTik profile to plan
                                if (mtProfile === '50MBPS' || mtProfile === '50MBPS-2') {
                                    planName = 'Plan 799';
                                } else if (mtProfile === '130MBPS' || mtProfile === '130MBPS-2') {
                                    planName = 'Plan 1299';
                                } else if (mtProfile === '150MBPS' || mtProfile === '150MBPS-2') {
                                    planName = 'Plan 1499';
                                } else if (mtProfile === '100MBPS' || mtProfile === '100MBPS-2') {
                                    planName = 'Plan 999';
                                } else {
                                    planName = 'Plan 799';
                                    errors.push(`Row ${i + 2}: DC profile for ${customerName}, found MikroTik profile "${pppSecret.profile}" but couldn't map to plan, defaulting to Plan 799`);
                                }
                            } else {
                                // Couldn't find profile, default to Plan 799
                                planName = 'Plan 799';
                                errors.push(`Row ${i + 2}: DC profile for ${customerName}, found interface but no profile in secrets, defaulting to Plan 799`);
                            }
                        } else {
                            // Couldn't find in MikroTik interfaces, default to Plan 799
                            planName = 'Plan 799';
                            errors.push(`Row ${i + 2}: DC profile for ${customerName}, MikroTik interface for "${mikrotikCustomerName}" not found, defaulting to Plan 799`);
                        }
                    } else {
                        // Unknown profile, default to Plan 799
                        planName = 'Plan 799';
                        errors.push(`Row ${i + 2}: Unknown profile "${profile}" for ${customerName}, defaulting to Plan 799`);
                    }

                    // Find the plan in database
                    const matchingPlan = plans.find(p => p.name === planName);
                    planId = matchingPlan?.id || null;
                }

                if (!planId) {
                    errors.push(`Row ${i + 2}: Plan not found for profile "${profile}"`);
                    continue;
                }

                // 4. Determine barangay
                const barangay = mapAddressToBarangay(completeAddress || '');

                // 5. Determine invoice date
                let normalizedInvoiceDate = '30th'; // Default to 30th

                // Clean and normalize the invoice date value
                if (invoiceDate) {
                    // Remove all whitespace (including non-breaking spaces, tabs, etc.)
                    const cleaned = invoiceDate
                        .toString()
                        .replace(/\s+/g, '') // Remove all whitespace
                        .toLowerCase()
                        .trim();

                    // Check if it contains "15" anywhere
                    if (cleaned.includes('15')) {
                        normalizedInvoiceDate = '15th';
                    } else if (cleaned.includes('30')) {
                        normalizedInvoiceDate = '30th';
                    }

                    // Log if we couldn't determine from the value
                    if (!cleaned.includes('15') && !cleaned.includes('30') && cleaned !== '') {
                        console.warn(`Row ${i + 2}: Unexpected invoice date value: "${invoiceDate}" (cleaned: "${cleaned}"), defaulting to 30th`);
                    }
                } else {
                    // Fallback: determine based on Business Unit if invoice date is truly empty
                    const buNameLower = businessUnitName?.toLowerCase() || '';

                    if (buNameLower.includes('bulihan')) {
                        normalizedInvoiceDate = '15th';
                    } else if (buNameLower.includes('malanggam')) {
                        normalizedInvoiceDate = '30th';
                    } else if (buNameLower.includes('extension') || buNameLower.includes('ext')) {
                        normalizedInvoiceDate = '30th';
                    }
                }

                // Log the data being processed for first few rows
                if (i < 5) {
                    const charCodes = invoiceDate
                        ? invoiceDate.toString().split('').map((c: string) => c.charCodeAt(0))
                        : [];

                    console.log(`Processing row ${i + 2}:`, {
                        customerName,
                        businessUnitName,
                        invoiceDateRaw: JSON.stringify(row['Invoice Date']), // Show exact value with quotes
                        invoiceDateProcessed: invoiceDate,
                        invoiceDateLength: invoiceDate?.length || 0,
                        invoiceDateCharCodes: charCodes,
                        invoiceDateDetermined: normalizedInvoiceDate,
                        profile,
                        balance
                    });
                }

                // 6. Check if subscription already exists (same subscriber + business unit)
                // If yes: UPDATE active/balance/plan. If no: INSERT new.
                const { data: existingSubscription } = await supabase
                    .from('subscriptions')
                    .select('id')
                    .eq('subscriber_id', customerId)
                    .eq('business_unit_id', businessUnitId)
                    .maybeSingle();

                let subscriptionId: string;

                if (existingSubscription) {
                    // UPDATE existing subscription — especially fix the active field
                    const { error: updateError } = await supabase
                        .from('subscriptions')
                        .update({
                            plan_id: planId,
                            address: completeAddress,
                            landmark: landmark,
                            barangay: barangay,
                            invoice_date: normalizedInvoiceDate,
                            date_installed: dateInstalled,
                            last_reconnection_date: reconnectionDate,
                            balance: balance,
                            active: !isDisconnected, // Disconnected=Yes → false, empty/null → true
                            is_free: isFree === 'YES',
                        })
                        .eq('id', existingSubscription.id);

                    if (updateError) {
                        errors.push(`Row ${i + 2}: Failed to update subscription for ${customerName} - ${updateError.message}`);
                        continue;
                    }

                    subscriptionId = existingSubscription.id;
                    subscriptionsUpdated++;
                    console.log(`Row ${i + 2}: Updated existing subscription for ${customerName} → active=${!isDisconnected}`);
                } else {
                    // INSERT new subscription
                    const { data: newSubscription, error: subscriptionError } = await supabase
                        .from('subscriptions')
                        .insert({
                            subscriber_id: customerId,
                            business_unit_id: businessUnitId,
                            plan_id: planId,
                            address: completeAddress,
                            landmark: landmark,
                            barangay: barangay,
                            invoice_date: normalizedInvoiceDate,
                            date_installed: dateInstalled,
                            last_reconnection_date: reconnectionDate,
                            balance: balance,
                            active: !isDisconnected, // Disconnected=Yes → false, empty/null → true
                            is_free: isFree === 'YES',
                            referral_credit_applied: false
                        })
                        .select('id')
                        .single();

                    if (subscriptionError || !newSubscription) {
                        errors.push(`Row ${i + 2}: Failed to create subscription for ${customerName} - ${subscriptionError?.message}`);
                        continue;
                    }

                    subscriptionId = newSubscription.id;
                    subscriptionsCreated++;
                    console.log(`Row ${i + 2}: Created new subscription for ${customerName} → active=${!isDisconnected}`);
                }

                // 7. Update customer_portal in subscription
                await supabase
                    .from('subscriptions')
                    .update({ customer_portal: `/portal/${subscriptionId}` })
                    .eq('id', subscriptionId);

                // 8. Create or link MikroTik PPP Secret
                // Check if this username was already created in this migration run OR exists in database
                let mikrotikSecretId: string | null = null;

                if (createdMikrotikUsernames.has(mikrotikCustomerName)) {
                    // Already created in this run, fetch the existing secret ID
                    const { data: existingSecret } = await supabase
                        .from('mikrotik_ppp_secrets')
                        .select('id')
                        .eq('name', mikrotikCustomerName)
                        .single();

                    if (existingSecret) {
                        mikrotikSecretId = existingSecret.id;
                        // Note: This is a multiple subscription for the same customer
                        console.log(`Row ${i + 2}: Linking subscription to existing MikroTik username "${mikrotikCustomerName}"`);
                    }
                } else {
                    // Check if it exists in database from previous migrations
                    const { data: existingSecret } = await supabase
                        .from('mikrotik_ppp_secrets')
                        .select('id')
                        .eq('name', mikrotikCustomerName)
                        .single();

                    if (existingSecret) {
                        mikrotikSecretId = existingSecret.id;
                        createdMikrotikUsernames.add(mikrotikCustomerName);
                        console.log(`Row ${i + 2}: MikroTik username "${mikrotikCustomerName}" already exists in database, linking subscription`);
                    } else {
                        // Create new MikroTik secret
                        const { data: newSecret, error: mikrotikError } = await supabase
                            .from('mikrotik_ppp_secrets')
                            .insert({
                                customer_id: customerId,
                                subscription_id: subscriptionId,
                                name: mikrotikCustomerName,
                                password: '1111',
                                service: 'pppoe',
                                profile: profile || 'default',
                                enabled: true,
                                disabled: okToDelete === 'YES' // YES = True (disabled), NO = False (enabled)
                            })
                            .select('id')
                            .single();

                        if (mikrotikError || !newSecret) {
                            errors.push(`Row ${i + 2}: Failed to create MikroTik secret - ${mikrotikError?.message}`);
                        } else {
                            mikrotikSecretId = newSecret.id;
                            mikrotikSecretsCreated++;
                            createdMikrotikUsernames.add(mikrotikCustomerName);
                        }
                    }
                }

            } catch (rowError) {
                errors.push(`Row ${i + 2}: ${rowError instanceof Error ? rowError.message : 'Unknown error'}`);
            }
        }

        return NextResponse.json({
            success: true,
            customersCreated,
            subscriptionsCreated,
            subscriptionsUpdated,
            mikrotikSecretsCreated,
            columnsFound,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Migration error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Migration failed' },
            { status: 500 }
        );
    }
}
