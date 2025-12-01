'use server';

import { RouterOSAPI } from 'node-routeros';

export async function getMikrotikData() {
    const host = process.env.MIKROTIK_HOST?.trim();
    const user = process.env.MIKROTIK_USER?.trim();
    const password = process.env.MIKROTIK_PASSWORD?.trim();
    const port = parseInt(process.env.MIKROTIK_PORT || '230');

    if (!host || !user || !password) {
        return {
            success: false,
            error: 'Mikrotik credentials not configured in environment variables.'
        };
    }

    const client = new RouterOSAPI({
        host,
        user,
        password,
        port,
        timeout: 10000,
        keepalive: true,
    });

    console.log(`[Mikrotik] Attempting connection to ${host}:${port} via Binary API...`);

    try {
        await client.connect();
        console.log('[Mikrotik] Connected Successfully!');

        // Fetch System Resources
        const resources = await client.write('/system/resource/print');

        // Fetch Interfaces (limit to 10)
        const allInterfaces = await client.write('/interface/print');
        const interfaces = allInterfaces.slice(0, 10);

        // Fetch Active DHCP Leases (max 50)
        const allLeases = await client.write('/ip/dhcp-server/lease/print');
        const activeLeases = allLeases
            .filter((lease: any) => lease.status === 'bound')
            .slice(0, 50);

        client.close();

        return {
            success: true,
            data: {
                resources: resources[0] || {},
                interfaces: interfaces || [],
                leases: activeLeases || []
            }
        };

    } catch (error: any) {
        try {
            client.close();
        } catch (e) {
            // Ignore close error
        }

        console.error('[Mikrotik] Connection Error:', error);

        let errorMessage = error.message || 'Failed to connect to Mikrotik router.';

        // Add helpful hints based on error type
        if (error.message?.includes('Timed out') || error.message?.includes('timeout')) {
            errorMessage = 'Connection timed out. The API service may not be enabled on the router. Please contact your network administrator to enable the API service on port 230 or 8728.';
        } else if (error.message?.includes('ECONNREFUSED')) {
            errorMessage = 'Connection refused. The API service is not running on this port. Please verify the port number and ensure the API service is enabled.';
        } else if (error.message?.includes('ENOTFOUND')) {
            errorMessage = 'Host not found. Please verify the IP address is correct.';
        }

        return {
            success: false,
            error: errorMessage
        };
    }
}
