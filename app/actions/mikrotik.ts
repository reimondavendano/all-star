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
        timeout: 10,
        keepalive: true,
        tls: port === 230 ? {} : undefined,
    });

    console.log(`Connecting to Mikrotik at '${host}':${port}...`);

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

        console.error('Mikrotik Connection Error:', error);
        return {
            success: false,
            error: error.message || 'Failed to connect to Mikrotik router.'
        };
    }
}
