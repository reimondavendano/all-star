'use server';

export async function getMikrotikData() {
    let host = process.env.MIKROTIK_HOST?.trim();
    const user = process.env.MIKROTIK_USER?.trim();
    const password = process.env.MIKROTIK_PASSWORD?.trim();

    // Handle case where user puts port in the host variable
    if (host && host.includes(':')) {
        const parts = host.split(':');
        host = parts[0];
        // If port is in host, we could use it, but let's rely on MIKROTIK_PORT or default
    }

    // Default to 80 (HTTP) as confirmed by user
    const port = process.env.MIKROTIK_PORT || '80';

    if (!host || !user || !password) {
        return {
            success: false,
            error: 'Mikrotik credentials not configured in environment variables. Please check .env.local'
        };
    }

    // Use HTTP for port 80 (standard) or 230 (legacy/custom), HTTPS for others (443, etc)
    const protocol = (port === '80' || port === '230' || port === '8080') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}:${port}/rest`;
    const auth = Buffer.from(`${user}:${password}`).toString('base64');

    console.log(`[Mikrotik] Connecting to ${baseUrl}...`);

    // Helper function to fetch data with timeout
    const fetchMikrotik = async (endpoint: string) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        try {
            const response = await fetch(`${baseUrl}${endpoint}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                },
                cache: 'no-store',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`API Error ${response.status}: ${text || response.statusText}`);
            }

            return await response.json();
        } catch (error: any) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                throw new Error(`Connection timed out to ${baseUrl}. The router might be unreachable or the REST API service is not enabled on port ${port}.`);
            }
            if (error.cause?.code === 'ECONNREFUSED') {
                throw new Error(`Connection refused to ${baseUrl}. Check IP and Port.`);
            }
            if (error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
                throw new Error('SSL Error: Self-signed certificate detected.');
            }
            throw error;
        }
    };

    try {
        // Parallel fetch for efficiency
        const [resources, interfaces, leases] = await Promise.all([
            fetchMikrotik('/system/resource'),
            fetchMikrotik('/interface'),
            fetchMikrotik('/ip/dhcp-server/lease')
        ]);

        // The REST API returns arrays for these endpoints (equivalent to 'print' command)

        // Process Resources
        const resourceData = Array.isArray(resources) && resources.length > 0 ? resources[0] : {};

        // Process Interfaces (Limit to 10)
        const interfaceData = Array.isArray(interfaces)
            ? interfaces.slice(0, 10)
            : [];

        // Process Leases (Active only, Limit to 50)
        const leaseData = Array.isArray(leases)
            ? leases
                .filter((lease: any) => lease.status === 'bound')
                .slice(0, 50)
            : [];

        return {
            success: true,
            data: {
                resources: resourceData,
                interfaces: interfaceData,
                leases: leaseData
            }
        };

    } catch (error: any) {
        console.error('[Mikrotik] Fetch Error:', error.message);
        return {
            success: false,
            error: error.message || 'Failed to connect to Mikrotik router via REST API.'
        };
    }
}
