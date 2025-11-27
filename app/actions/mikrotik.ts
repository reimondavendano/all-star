'use server';

import { RouterOSAPI } from 'node-routeros';

export async function getMikrotikData() {
    const host = process.env.MIKROTIK_HOST?.trim();
    const user = process.env.MIKROTIK_USER?.trim();
    const password = process.env.MIKROTIK_PASSWORD?.trim();
    const port = parseInt(process.env.MIKROTIK_PORT || '8728');

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
        timeout: 5000, // Increased timeout to 30 seconds
        keepalive: true,

    });

    console.log(`[Mikrotik] Attempting connection to ${host}:${port} (TLS: ${port === 8728})...`);

    try {
        await client.connect();
        console.log('Mikrotik Connected Successfully!');

        // Fetch System Resources (lightweight)
        const resources = await client.write('/system/resource/print');

        // Fetch only first 10 Interfaces
        const allInterfaces = await client.write('/interface/print');
        const interfaces = allInterfaces.slice(0, 10);

        // Fetch only ACTIVE DHCP Leases (max 50)
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
        if (error.errno === 'SOCKTMOUT' || errorMessage.includes('Timed out')) {
            errorMessage += ' The router is not responding. Check if the IP and port are correct, and if the API service is enabled on the router.';
        } else if (error.errno === -4078 || errorMessage.includes('ECONNREFUSED')) {
            errorMessage += ' Connection refused. The API service might not be running on this port.';
        } else if (error.errno === -3008 || errorMessage.includes('ENOTFOUND')) {
            errorMessage += ' Host not found. Check if the IP address is correct.';
        }

        return {
            success: false,
            error: errorMessage
        };
    }
}
