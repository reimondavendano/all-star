'use server';

import { RouterOSAPI } from 'node-routeros';
import https from 'https';

// --- Shared Constants & Helpers ---
const host = process.env.MIKROTIK_HOST?.trim();
const user = process.env.MIKROTIK_USER?.trim();
const password = process.env.MIKROTIK_PASSWORD?.trim();
const port = parseInt(process.env.MIKROTIK_PORT || '8728');
const LOCAL_FALLBACK_IP = '192.168.1.211';

// Helper to check if credentials are set
function checkCredentials() {
    if (!host || !user || !password) {
        throw new Error('Mikrotik credentials not configured in environment variables.');
    }
}

// REST API Helper (Cloudflare/Ngrok)
async function fetchRestData(hostUrl: string, path: string, method: string = 'GET', body: any = null) {
    return new Promise((resolve, reject) => {
        const cleanHost = hostUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const bodyString = body ? JSON.stringify(body) : null;

        const options: https.RequestOptions = {
            hostname: cleanHost,
            port: 443,
            path: `/rest/${path}`,
            method: method,
            headers: {
                'ngrok-skip-browser-warning': 'true',
                'Content-Type': 'application/json',
                ...(bodyString ? { 'Content-Length': Buffer.byteLength(bodyString) } : {})
            },
            auth: `${user}:${password}`,
            rejectUnauthorized: false
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(data ? JSON.parse(data) : {});
                    } catch (e) {
                        // Sometimes POST returns empty body on success
                        resolve({});
                    }
                } else {
                    reject(new Error(`HTTP Status ${res.statusCode}: ${data}`));
                }
            });
        });

        // Add timeout to prevent long hangs
        req.setTimeout(3000, () => {
            req.destroy();
            reject(new Error('Connection timed out'));
        });

        req.on('error', (e) => reject(e));

        if (bodyString) {
            req.write(bodyString);
        }
        req.end();
    });
}

// Binary API Helper
async function withBinaryConnection(callback: (client: RouterOSAPI) => Promise<any>, targetHost: string) {
    const client = new RouterOSAPI({
        host: targetHost,
        user,
        password,
        port,
        timeout: 5000,
        keepalive: false,
    });

    try {
        await client.connect();
        const result = await callback(client);
        client.close();
        return result;
    } catch (err) {
        try { client.close(); } catch (e) { }
        throw err;
    }
}


// --- MAIN DATA FETCHING ---
export async function getMikrotikData() {
    try {
        checkCredentials();

        // STRATEGY 1: REST API via Tunnel
        if (host && (host.includes('trycloudflare.com') || host.includes('ngrok-free'))) {
            try {
                console.log(`[Mikrotik] Attempting REST connection via Tunnel: ${host}...`);
                const [resources, interfaces, leases, hotspotUsers, activeUsers, pppActive, pppSecrets, pppProfiles, ipAddresses] = await Promise.all([
                    fetchRestData(host, 'system/resource'),
                    fetchRestData(host, 'interface'),
                    fetchRestData(host, 'ip/dhcp-server/lease'),
                    fetchRestData(host, 'ip/hotspot/user'),
                    fetchRestData(host, 'ip/hotspot/active'),
                    fetchRestData(host, 'ppp/active'),
                    fetchRestData(host, 'ppp/secret'),
                    fetchRestData(host, 'ppp/profile'),
                    fetchRestData(host, 'ip/address')
                ]);

                // Filter interfaces locally since we fetch all
                const pppInterfaces = Array.isArray(interfaces)
                    ? interfaces.filter((i: any) => i.type === 'pppoe-in')
                    : [];

                return {
                    success: true,
                    data: {
                        resources: resources || {},
                        interfaces: Array.isArray(interfaces) ? interfaces.slice(0, 10) : [],
                        leases: Array.isArray(leases) ? leases.filter((l: any) => l.status === 'bound').slice(0, 50) : [],
                        hotspotUsers: Array.isArray(hotspotUsers) ? hotspotUsers : [],
                        activeUsers: Array.isArray(activeUsers) ? activeUsers : [],
                        pppInterfaces: pppInterfaces,
                        pppActive: Array.isArray(pppActive) ? pppActive : [],
                        pppSecrets: Array.isArray(pppSecrets) ? pppSecrets : [],
                        pppProfiles: Array.isArray(pppProfiles) ? pppProfiles : [],
                        ipAddresses: Array.isArray(ipAddresses) ? ipAddresses : []
                    }
                };
            } catch (error: any) {
                console.error(`[Mikrotik] Tunnel REST connection failed: ${error.message}`);
                // Fall through to fallback
            }
        }

        // STRATEGY 2: Local Binary API Fallback
        const connectAndFetch = async (target: string) => {
            return await withBinaryConnection(async (client) => {
                const resources = await client.write('/system/resource/print');
                const interfaces = await client.write('/interface/print');
                const pppInterfaces = interfaces.filter((i: any) => i.type === 'pppoe-in');

                const leases = await client.write('/ip/dhcp-server/lease/print');
                const activeLeases = leases.filter((l: any) => l.status === 'bound').slice(0, 50);

                const hotspotUsers = await client.write('/ip/hotspot/user/print');
                const activeHotspotUsers = await client.write('/ip/hotspot/active/print');
                const pppActive = await client.write('/ppp/active/print');
                const pppSecrets = await client.write('/ppp/secret/print');
                const pppProfiles = await client.write('/ppp/profile/print');
                const ipAddresses = await client.write('/ip/address/print');

                return {
                    success: true,
                    data: {
                        resources: resources[0] || {},
                        interfaces: interfaces.slice(0, 10) || [],
                        leases: activeLeases || [],
                        hotspotUsers: hotspotUsers || [],
                        activeUsers: activeHotspotUsers || [],
                        pppInterfaces: pppInterfaces || [],
                        pppActive: pppActive || [],
                        pppSecrets: pppSecrets || [],
                        pppProfiles: pppProfiles || [],
                        ipAddresses: ipAddresses || []
                    }
                };
            }, target);
        };

        // Try Configured Host (if not tunnel)
        if (host && !host.includes('trycloudflare.com') && !host.includes('ngrok-free')) {
            return await connectAndFetch(host);
        }

        // Final Fallback: Local IP
        console.log(`[Mikrotik] Fallback to Local IP: ${LOCAL_FALLBACK_IP}`);
        return await connectAndFetch(LOCAL_FALLBACK_IP);

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}


// --- ADD NEW FUNCTIONS ---

// Helper for adding secrets logic matching getMikrotikData pattern
async function addViaBinary(target: string, secretData: any) {
    return await withBinaryConnection(async (client) => {
        // Convert object to API format ['=key=value', ...]
        const params = Object.keys(secretData).map(key =>
            `=${key}=${secretData[key]}`
        );
        await client.write('/ppp/secret/add', params);
        return { success: true };
    }, target);
}


export async function addPppSecret(secretData: { name: string, password: string, service: string, profile: string, comment?: string }) {
    try {
        checkCredentials();

        // 1. Try REST API (Tunnel)
        if (host && (host.includes('trycloudflare.com') || host.includes('ngrok-free'))) {
            try {
                console.log(`[Mikrotik] Adding PPP Secret via Tunnel REST API...`);
                // Use PUT to create new entry in RouterOS v7 REST API
                await fetchRestData(host, 'ppp/secret', 'PUT', secretData);
                return { success: true };
            } catch (e: any) {
                console.error(`Tunnel add failed: ${e.message}`);
                // Fallback to local
            }
        }

        // 2. Local Fallback (Binary)
        if (host && !host.includes('trycloudflare.com') && !host.includes('ngrok-free')) {
            return await addViaBinary(host, secretData);
        }
        return await addViaBinary(LOCAL_FALLBACK_IP, secretData);

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}


// --- TOGGLE PPP CONNECTION (Enable/Disable) ---
export async function togglePppConnection(
    username: string,
    enable: boolean,
    createData?: { password: string, service: string, profile: string, comment?: string }
) {
    try {
        checkCredentials();

        console.log(`[PPP] ${enable ? 'Enabling' : 'Disabling'} PPP secret: ${username}`);

        // 1. Try REST API (Tunnel)
        if (host && (host.includes('trycloudflare.com') || host.includes('ngrok-free'))) {
            try {
                // First, find the secret by name
                const secrets = await fetchRestData(host, 'ppp/secret');
                const secret = Array.isArray(secrets) ? secrets.find((s: any) => s.name === username) : null;

                if (!secret) {
                    if (enable && createData) {
                        console.log(`[PPP] Secret "${username}" not found, creating it now...`);
                        return await addPppSecret({ name: username, ...createData });
                    }
                    return { success: false, error: `PPP secret "${username}" not found` };
                }

                // Update the secret's disabled status
                await fetchRestData(host, `ppp/secret/${secret['.id']}`, 'PATCH', {
                    disabled: enable ? 'false' : 'true'
                });

                // If disabling, also remove any active connection
                if (!enable) {
                    const activeConnections = await fetchRestData(host, 'ppp/active');
                    const activeConn = Array.isArray(activeConnections) ? activeConnections.find((a: any) => a.name === username) : null;
                    if (activeConn) {
                        console.log(`[PPP] Removing active connection for ${username}`);
                        await fetchRestData(host, `ppp/active/${activeConn['.id']}`, 'DELETE');
                    }
                }

                console.log(`[PPP] Successfully ${enable ? 'enabled' : 'disabled'} ${username}`);
                return { success: true };
            } catch (error: any) {
                console.error(`[PPP] REST toggle failed: ${error.message}`);
                // Fallback to binary handled below? No, usually return or throw. 
                // But existing code dropped through? 
                // Existing code caught error and logged, then went to Binary. 
                // We will keep that behavior.
            }
        }

        // 2. Fallback to Binary API
        const target = host && !host.includes('trycloudflare.com') && !host.includes('ngrok-free') ? host : LOCAL_FALLBACK_IP;

        return await withBinaryConnection(async (client) => {
            // Find the secret
            const secrets = await client.write('/ppp/secret/print', ['?name=' + username]);
            if (!secrets || secrets.length === 0) {
                if (enable && createData) {
                    console.log(`[PPP] Secret "${username}" not found (Binary), creating it now...`);
                    // We can call addPppSecret, but it might cycle. 
                    // Better to use addViaBinary directly if we know target.
                    // But addPppSecret handles credentials.
                    // Let's call addPppSecret to be safe and consistent.
                    return await addPppSecret({ name: username, ...createData });
                }
                return { success: false, error: `PPP secret "${username}" not found` };
            }

            const secretId = secrets[0]['.id'];

            // Update disabled status
            await client.write('/ppp/secret/set', [
                `=.id=${secretId}`,
                `=disabled=${enable ? 'false' : 'true'}`
            ]);

            // If disabling, remove active connection
            if (!enable) {
                const activeConns = await client.write('/ppp/active/print', ['?name=' + username]);
                if (activeConns && activeConns.length > 0) {
                    console.log(`[PPP] Removing active connection for ${username}`);
                    await client.write('/ppp/active/remove', [`=.id=${activeConns[0]['.id']}`]);
                }
            }

            console.log(`[PPP] Successfully ${enable ? 'enabled' : 'disabled'} ${username}`);
            return { success: true };
        }, target);

    } catch (error: any) {
        console.error(`[PPP] Toggle connection error: ${error.message}`);
        return { success: false, error: error.message };
    }
}


// --- UPDATE PPP SECRET ---
export async function updatePppSecret(username: string, updates: any) {
    try {
        checkCredentials();

        console.log(`[PPP] Updating PPP secret ${username}:`, updates);

        // 1. Try REST API (Tunnel)
        if (host && (host.includes('trycloudflare.com') || host.includes('ngrok-free'))) {
            try {
                // First, find the secret by name
                const secrets = await fetchRestData(host, 'ppp/secret');
                const secret = Array.isArray(secrets) ? secrets.find((s: any) => s.name === username) : null;

                if (!secret) {
                    return { success: false, error: `PPP secret "${username}" not found` };
                }

                // Update the secret
                await fetchRestData(host, `ppp/secret/${secret['.id']}`, 'PATCH', updates);

                // If profile changed, remove active connection to enforce new profile immediately (optional, or let it apply on reconnect)
                // Often better to kick the user so they reconnect with new profile
                if (updates.profile) {
                    const activeConnections = await fetchRestData(host, 'ppp/active');
                    const activeConn = Array.isArray(activeConnections) ? activeConnections.find((a: any) => a.name === username) : null;
                    if (activeConn) {
                        console.log(`[PPP] Removing active connection for ${username} to apply profile change`);
                        await fetchRestData(host, `ppp/active/${activeConn['.id']}`, 'DELETE');
                    }
                }

                console.log(`[PPP] Successfully updated ${username}`);
                return { success: true };
            } catch (error: any) {
                console.error(`[PPP] REST update failed: ${error.message}`);
            }
        }

        // 2. Fallback to Binary API
        const target = host && !host.includes('trycloudflare.com') && !host.includes('ngrok-free') ? host : LOCAL_FALLBACK_IP;

        return await withBinaryConnection(async (client) => {
            // Find the secret
            const secrets = await client.write('/ppp/secret/print', ['?name=' + username]);
            if (!secrets || secrets.length === 0) {
                return { success: false, error: `PPP secret "${username}" not found` };
            }

            const secretId = secrets[0]['.id'];

            // Prepare updates
            const updateParams = [`=.id=${secretId}`];
            Object.keys(updates).forEach(key => {
                updateParams.push(`=${key}=${updates[key]}`);
            });

            // Update
            await client.write('/ppp/secret/set', updateParams);

            // If profile changed, remove active connection
            if (updates.profile) {
                const activeConns = await client.write('/ppp/active/print', ['?name=' + username]);
                if (activeConns && activeConns.length > 0) {
                    console.log(`[PPP] Removing active connection for ${username} to apply profile change`);
                    await client.write('/ppp/active/remove', [`=.id=${activeConns[0]['.id']}`]);
                }
            }

            console.log(`[PPP] Successfully updated ${username}`);
            return { success: true };
        }, target);

    } catch (error: any) {
        console.error(`[PPP] Update error: ${error.message}`);
        return { success: false, error: error.message };
    }
}


// --- SYNC SUBSCRIPTION ACTIVE STATUS TO MIKROTIK ---
/**
 * Sync subscription active status to MikroTik.
 * When subscription is marked as inactive:
 * 1. Changes profile to "DC" (Disconnected)
 * 2. Disables the PPP secret on MikroTik
 * 3. Disconnects any active PPP session
 * 4. Updates mikrotik_ppp_secrets table
 * 
 * When subscription is marked as active:
 * 1. Restores profile to correct speed based on plan (e.g., "100MBPS")
 * 2. Enables the PPP secret on MikroTik
 * 3. Updates mikrotik_ppp_secrets table
 */
export async function syncSubscriptionToMikrotik(subscriptionId: string, isActive: boolean) {
    try {
        // Import supabase here to avoid circular dependencies
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        console.log(`[SYNC] Syncing subscription ${subscriptionId} to MikroTik (active: ${isActive})`);

        // 1. Get the subscription with plan info and PPP secret
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select(`
                id,
                plan_id,
                plans (
                    name,
                    monthly_fee
                )
            `)
            .eq('id', subscriptionId)
            .single();

        if (subError || !subscription) {
            console.error(`[SYNC] Subscription not found: ${subscriptionId}`);
            return { success: false, error: 'Subscription not found' };
        }

        // 2. Get the PPP secret linked to this subscription
        const { data: pppSecret, error: fetchError } = await supabase
            .from('mikrotik_ppp_secrets')
            .select('*') // Get all fields including password
            .eq('subscription_id', subscriptionId)
            .single();

        if (fetchError || !pppSecret) {
            console.error(`[SYNC] No PPP secret found for subscription ${subscriptionId}`);
            return { success: false, error: 'No PPP secret linked to this subscription' };
        }

        const mikrotikUsername = pppSecret.name;
        console.log(`[SYNC] Found PPP secret: ${mikrotikUsername}`);

        // 3. Determine the correct profile based on plan
        let targetProfile: string;

        if (isActive) {
            // When activating, use the plan-based profile
            const plan = subscription.plans as any;
            const planName = plan?.name || '';

            // Map plan names to MikroTik profiles
            const planToProfile: Record<string, string> = {
                'Plan 799': '50MBPS',
                'Plan 999': '100MBPS',
                'Plan 1299': '130MBPS',
                'Plan 1499': '150MBPS'
            };

            targetProfile = planToProfile[planName] || pppSecret.profile || '50MBPS';
            console.log(`[SYNC] Activating with profile: ${targetProfile} (plan: ${planName})`);
        } else {
            // When disconnecting, set to DC profile
            targetProfile = 'DC';
            console.log(`[SYNC] Disconnecting - setting profile to: DC`);
        }

        // 4. Update the PPP secret on MikroTik (profile + disabled status)
        const updateResult = await updatePppSecret(mikrotikUsername, {
            profile: targetProfile,
            disabled: isActive ? 'false' : 'true'
        });

        if (!updateResult.success) {
            console.error(`[SYNC] Failed to update PPP on MikroTik: ${updateResult.error}`);
            return { success: false, error: updateResult.error };
        }

        // 5. If disabling, also remove any active connection
        if (!isActive) {
            await togglePppConnection(mikrotikUsername, false);
        }

        // 6. Update the mikrotik_ppp_secrets table
        const { error: updateError } = await supabase
            .from('mikrotik_ppp_secrets')
            .update({
                profile: targetProfile,
                enabled: isActive,
                disabled: !isActive,
                last_synced_at: new Date().toISOString()
            })
            .eq('id', pppSecret.id);

        if (updateError) {
            console.error(`[SYNC] Failed to update database: ${updateError.message}`);
            return { success: false, error: updateError.message };
        }

        console.log(`[SYNC] Successfully synced ${mikrotikUsername} to MikroTik (${isActive ? 'enabled' : 'disabled'}, profile: ${targetProfile})`);
        return {
            success: true,
            message: `PPP secret "${mikrotikUsername}" ${isActive ? 'enabled' : 'disabled'} on MikroTik with profile ${targetProfile}`
        };

    } catch (error: any) {
        console.error(`[SYNC] Subscription sync error: ${error.message}`);
        return { success: false, error: error.message };
    }
}


// --- SYNC MIKROTIK TO DATABASE ---

import { createClient } from '@supabase/supabase-js';

// Create Supabase client for server actions
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Get base MikroTik name by stripping trailing numbers
 * e.g., "ROGERGABIN2" -> "ROGERGABIN", "ROGERGABIN3" -> "ROGERGABIN"
 */
function getBaseMikrotikName(mikrotikName: string): string {
    if (!mikrotikName) return '';
    // Remove trailing digits (e.g., ROGERGABIN2 -> ROGERGABIN)
    return mikrotikName.replace(/\d+$/, '');
}

/**
 * Parse MikroTik username (e.g., "PROMISEDELEON") into proper name format (e.g., "Promise Deleon")
 * Handles common patterns like:
 * - PROMISEDELEON -> Promise Deleon
 * - JOHNSMITH -> John Smith (if we can detect word boundaries)
 * - MARIASANTOS -> Maria Santos
 * - ROGERGABIN2 -> Roger Gabin 2 (PRESERVES trailing numbers now)
 * - JOHNDELACRUZ3 -> John Delacruz 3 (PRESERVES trailing numbers now)
 */
function parseMikrotikName(mikrotikName: string): string {
    if (!mikrotikName) return 'Unknown';

    // Extract trailing numbers (e.g., "ROGERGABIN2" -> name: "ROGERGABIN", suffix: "2")
    const match = mikrotikName.match(/^(.+?)(\d+)$/);
    const nameWithoutNumber = match ? match[1] : mikrotikName;
    const numberSuffix = match ? match[2] : '';

    // Process the name without numbers
    let name = nameWithoutNumber.toUpperCase();

    // Common Filipino surnames to help with splitting
    const commonSurnames = [
        'DELEON', 'DELOS', 'DELA', 'DEL', 'DE', 'SANTOS', 'CRUZ', 'REYES', 'GARCIA',
        'RAMOS', 'MENDOZA', 'TORRES', 'FLORES', 'GONZALES', 'BAUTISTA', 'VILLANUEVA',
        'FERNANDEZ', 'AQUINO', 'CASTRO', 'MORALES', 'LOPEZ', 'PEREZ', 'HERNANDEZ',
        'RODRIGUEZ', 'MARTINEZ', 'SANCHEZ', 'RAMIREZ', 'DIAZ', 'RIVERA', 'CAMUA',
        'ANGELES', 'GALIDO', 'DIZON', 'GUZMAN', 'LINGAHAN', 'CAPARAS', 'VICTORIA',
        'MANABAT', 'QUIRING', 'BALANE', 'SILANG', 'MERANO', 'LORENZO', 'CLEMENTE',
        'GUIBAO', 'MAITAN', 'ABALA', 'TORMES', 'BUMANLAG', 'QUETUA', 'TORRES',
        'GABIN', 'GIBAN', 'CEDY', 'CEDI'  // Added based on your MikroTik data
    ];

    let firstName = '';
    let lastName = '';

    // Try to find a surname match
    for (const surname of commonSurnames) {
        if (name.endsWith(surname)) {
            firstName = name.slice(0, name.length - surname.length);
            lastName = surname;
            break;
        }
    }

    // If no surname found, just use the whole name
    if (!lastName) {
        firstName = name;
        lastName = '';
    }

    // Convert to title case
    const toTitleCase = (str: string) => {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    };

    // Handle special cases like "DELEON" -> "DeLeon", "DELA" -> "Dela"
    const formatSurname = (surname: string) => {
        if (surname.startsWith('DE')) {
            if (surname === 'DELEON') return 'DeLeon';
            if (surname === 'DELOS') return 'Delos';
            if (surname === 'DELA') return 'Dela';
            if (surname === 'DEL') return 'Del';
            return 'De' + toTitleCase(surname.slice(2));
        }
        return toTitleCase(surname);
    };

    const formattedFirst = toTitleCase(firstName);
    const formattedLast = formatSurname(lastName);

    // Build the final name with the number suffix if it exists
    const baseName = formattedLast ? `${formattedFirst} ${formattedLast}`.trim() : formattedFirst;
    return numberSuffix ? `${baseName} ${numberSuffix}` : baseName;
}


/**
 * Sync MikroTik PPP Secrets to Database
 * Creates/updates: customers, mikrotik_ppp_secrets, subscriptions
 */
export async function syncMikrotikToDatabase() {
    try {
        checkCredentials();

        console.log('[Sync] Starting MikroTik to Database sync...');

        // 1. Get PPP Secrets from MikroTik
        const mikrotikResult = await getMikrotikData();
        if (!mikrotikResult.success || !mikrotikResult.data) {
            return { success: false, error: 'Failed to fetch MikroTik data' };
        }

        const pppSecrets = mikrotikResult.data.pppSecrets || [];
        console.log(`[Sync] Found ${pppSecrets.length} PPP secrets in MikroTik`);

        if (pppSecrets.length === 0) {
            return { success: true, message: 'No PPP secrets to sync', synced: 0 };
        }

        // 2. Get all plans to create a mapping
        const { data: allPlans } = await supabaseAdmin.from('plans').select('id, name');
        const { data: businessUnits } = await supabaseAdmin.from('business_units').select('id').limit(1);

        const defaultBusinessUnitId = businessUnits?.[0]?.id;

        if (!allPlans || allPlans.length === 0 || !defaultBusinessUnitId) {
            return {
                success: false,
                error: 'No plans or business unit found. Please create at least one of each first.'
            };
        }

        // Create plan mapping: MikroTik Profile -> Plan ID
        // 50MBPS -> Plan 799, 100MBPS -> Plan 999, 130MBPS -> Plan 1299, 150MBPS -> Plan 1499
        const profileToPlanName: Record<string, string> = {
            '50MBPS': 'Plan 799',
            '100MBPS': 'Plan 999',
            '130MBPS': 'Plan 1299',
            '150MBPS': 'Plan 1499'
        };

        const planNameToId: Record<string, string> = {};
        for (const plan of allPlans) {
            planNameToId[plan.name] = plan.id;
        }

        // Helper function to get plan ID from MikroTik profile
        const getPlanIdFromProfile = (profile: string): string => {
            // Extract base profile name (e.g., "50MBPS-2" -> "50MBPS")
            const baseProfile = profile.toUpperCase().replace(/-\d+$/, '');
            const planName = profileToPlanName[baseProfile];
            if (planName && planNameToId[planName]) {
                return planNameToId[planName];
            }
            // Fallback to first plan if no match
            return allPlans[0].id;
        };

        let syncedCount = 0;
        let errors: string[] = [];

        // 3. Process each PPP secret
        for (const secret of pppSecrets) {
            try {
                const mikrotikId = secret['.id'] || secret.id;
                const mikrotikName = secret.name || '';
                // DISABLED: Duplicate name consolidation - client wants to keep all duplicates separate
                // const baseName = getBaseMikrotikName(mikrotikName); // Strip trailing numbers
                const localAddress = secret['local-address'] || secret['remote-address'] || '';
                const profile = secret.profile || 'default';
                const service = secret.service || 'any';
                const isDisabled = secret.disabled === 'true' || secret.disabled === true;
                const callerId = secret['caller-id'] || '';
                const comment = secret.comment || '';

                // Get plan ID based on MikroTik profile
                const planId = getPlanIdFromProfile(profile);

                // Parse the name - now keeps trailing numbers (e.g., "John Dela Cruz 2")
                const customerName = parseMikrotikName(mikrotikName);

                console.log(`[Sync] Processing: ${mikrotikName} -> ${customerName}`);

                // 3a. Check if this exact PPP secret exists
                const { data: existingSecret } = await supabaseAdmin
                    .from('mikrotik_ppp_secrets')
                    .select('id, customer_id')
                    .eq('name', mikrotikName)
                    .single();

                // DISABLED: Base name lookup - client wants each name to be unique customer
                // No longer checking for base names (e.g., ROGERGABIN for ROGERGABIN2)
                let existingCustomerId: string | null = existingSecret?.customer_id || null;

                let customerId: string;
                let subscriptionId: string;

                if (existingCustomerId) {
                    // Customer exists (either exact match or from base name), use that customer
                    customerId = existingCustomerId;

                    // Update customer name
                    await supabaseAdmin
                        .from('customers')
                        .update({ name: customerName })
                        .eq('id', customerId);

                    // Get existing subscription
                    const { data: existingSub } = await supabaseAdmin
                        .from('subscriptions')
                        .select('id')
                        .eq('subscriber_id', customerId)
                        .limit(1)
                        .single();

                    if (existingSub) {
                        subscriptionId = existingSub.id;
                        // Update subscription
                        await supabaseAdmin
                            .from('subscriptions')
                            .update({
                                router_serial_number: localAddress,
                                active: !isDisabled,
                                plan_id: planId,
                                label: 'Home'
                            })
                            .eq('id', subscriptionId);
                    } else {
                        // Create subscription for existing customer
                        const { data: newSub, error: subError } = await supabaseAdmin
                            .from('subscriptions')
                            .insert({
                                subscriber_id: customerId,
                                plan_id: planId,
                                business_unit_id: defaultBusinessUnitId,
                                router_serial_number: localAddress,
                                active: !isDisabled,
                                label: 'Home'
                            })
                            .select('id')
                            .single();

                        if (subError) throw subError;
                        subscriptionId = newSub.id;
                    }

                    // Update or create mikrotik_ppp_secrets record
                    if (existingSecret?.id) {
                        // Update existing PPP secret record
                        await supabaseAdmin
                            .from('mikrotik_ppp_secrets')
                            .update({
                                mikrotik_id: mikrotikId,
                                subscription_id: subscriptionId,
                                profile: profile,
                                service: service,
                                local_address: localAddress,
                                caller_id: callerId,
                                enabled: !isDisabled,
                                disabled: isDisabled,
                                comment: comment,
                                last_synced_at: new Date().toISOString()
                            })
                            .eq('id', existingSecret.id);
                    } else {
                        // Create new PPP secret record (for numbered variants like ROGERGABIN2)
                        await supabaseAdmin
                            .from('mikrotik_ppp_secrets')
                            .insert({
                                mikrotik_id: mikrotikId,
                                customer_id: customerId,
                                subscription_id: subscriptionId,
                                name: mikrotikName,
                                profile: profile,
                                service: service,
                                local_address: localAddress,
                                caller_id: callerId,
                                enabled: !isDisabled,
                                disabled: isDisabled,
                                comment: comment,
                                last_synced_at: new Date().toISOString()
                            });
                    }

                } else {
                    // No existing PPP secret record - check if customer exists by name
                    const { data: existingCustomer } = await supabaseAdmin
                        .from('customers')
                        .select('id')
                        .ilike('name', customerName)
                        .limit(1)
                        .single();

                    if (existingCustomer) {
                        // Customer exists, use their ID
                        customerId = existingCustomer.id;
                        console.log(`[Sync] Found existing customer: ${customerName} (ID: ${customerId})`);
                    } else {
                        // Create new customer
                        const { data: newCustomer, error: custError } = await supabaseAdmin
                            .from('customers')
                            .insert({ name: customerName })
                            .select('id')
                            .single();

                        if (custError) throw custError;
                        customerId = newCustomer.id;
                        console.log(`[Sync] Created new customer: ${customerName} (ID: ${customerId})`);
                    }

                    // Check if subscription exists for this customer
                    const { data: existingSub } = await supabaseAdmin
                        .from('subscriptions')
                        .select('id')
                        .eq('subscriber_id', customerId)
                        .limit(1)
                        .single();

                    if (existingSub) {
                        subscriptionId = existingSub.id;
                        // Update existing subscription
                        await supabaseAdmin
                            .from('subscriptions')
                            .update({
                                router_serial_number: localAddress,
                                active: !isDisabled,
                                plan_id: planId,
                                label: 'Home'
                            })
                            .eq('id', subscriptionId);
                    } else {
                        // Create new subscription
                        const { data: newSub, error: subError } = await supabaseAdmin
                            .from('subscriptions')
                            .insert({
                                subscriber_id: customerId,
                                plan_id: planId,
                                business_unit_id: defaultBusinessUnitId,
                                router_serial_number: localAddress,
                                active: !isDisabled,
                                label: 'Home'
                            })
                            .select('id')
                            .single();

                        if (subError) throw subError;
                        subscriptionId = newSub.id;
                    }

                    // Check if mikrotik_ppp_secrets record already exists for this customer
                    const { data: existingPppSecret } = await supabaseAdmin
                        .from('mikrotik_ppp_secrets')
                        .select('id')
                        .eq('customer_id', customerId)
                        .limit(1)
                        .single();

                    if (existingPppSecret) {
                        // Update existing record
                        await supabaseAdmin
                            .from('mikrotik_ppp_secrets')
                            .update({
                                mikrotik_id: mikrotikId,
                                name: mikrotikName,
                                subscription_id: subscriptionId,
                                profile: profile,
                                service: service,
                                local_address: localAddress,
                                caller_id: callerId,
                                enabled: !isDisabled,
                                disabled: isDisabled,
                                comment: comment,
                                last_synced_at: new Date().toISOString()
                            })
                            .eq('id', existingPppSecret.id);
                    } else {
                        // Create mikrotik_ppp_secrets record
                        await supabaseAdmin
                            .from('mikrotik_ppp_secrets')
                            .insert({
                                mikrotik_id: mikrotikId,
                                customer_id: customerId,
                                subscription_id: subscriptionId,
                                name: mikrotikName,
                                profile: profile,
                                service: service,
                                local_address: localAddress,
                                caller_id: callerId,
                                enabled: !isDisabled,
                                disabled: isDisabled,
                                comment: comment,
                                last_synced_at: new Date().toISOString()
                            });
                    }
                }

                syncedCount++;

            } catch (err: any) {
                console.error(`[Sync] Error processing ${secret.name}:`, err.message);
                errors.push(`${secret.name}: ${err.message}`);
            }
        }

        console.log(`[Sync] Completed. Synced: ${syncedCount}, Errors: ${errors.length}`);

        return {
            success: true,
            message: `Synced ${syncedCount} of ${pppSecrets.length} PPP secrets`,
            synced: syncedCount,
            total: pppSecrets.length,
            errors: errors.length > 0 ? errors : undefined
        };

    } catch (error: any) {
        console.error('[Sync] Fatal error:', error.message);
        return { success: false, error: error.message };
    }
}


/**
 * Add PPP Secret to MikroTik when prospect is Closed Won
 * Call this from your prospect conversion logic
 */
export async function addPppSecretFromProspect(prospect: {
    name: string,
    router_serial_number?: string,
    plan_name?: string
}) {
    try {
        // Convert name to MikroTik format (uppercase, no spaces)
        const mikrotikName = prospect.name.toUpperCase().replace(/\s+/g, '');

        // Generate a default password (you may want to customize this)
        const defaultPassword = Math.random().toString(36).slice(-8);

        // Determine profile based on plan (you can customize this mapping)
        const profile = prospect.plan_name?.includes('100') ? '100MBPS' :
            prospect.plan_name?.includes('50') ? '50MBPS' :
                prospect.plan_name?.includes('150') ? '150MBPS' : '50MBPS';

        const secretData = {
            name: mikrotikName,
            password: defaultPassword,
            service: 'pppoe',
            profile: profile,
            'local-address': prospect.router_serial_number || '',
            comment: `Auto-created from prospect: ${prospect.name}`
        };

        const result = await addPppSecret(secretData);

        if (result.success) {
            return {
                success: true,
                mikrotikName: mikrotikName,
                password: defaultPassword,
                profile: profile
            };
        }

        return result;

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
