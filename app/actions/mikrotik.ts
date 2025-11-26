'use server';

const nodeRouterOs = require('node-routeros');
const RouterOSClient = nodeRouterOs.RouterOSClient || nodeRouterOs.default || nodeRouterOs;

// console.log('NodeRouterOS Import:', {
//     isConstructor: typeof RouterOSClient === 'function',
//     keys: Object.keys(nodeRouterOs)
// });

// if (typeof RouterOSClient !== 'function') {
//     console.error('RouterOSClient is not a constructor. Export:', nodeRouterOs);
// }

export async function getMikrotikData() {

    const host = process.env.MIKROTIK_HOST;
    const user = process.env.MIKROTIK_USER;
    const password = process.env.MIKROTIK_PASSWORD;
    const port = parseInt(process.env.MIKROTIK_PORT || '8728');


    if (!host || !user || !password) {
        return {
            success: false,
            error: 'Mikrotik credentials not configured in environment variables.'
        };
    }

    const client = new RouterOSClient({
        host,
        user,
        password,
        port,
        keepalive: false,
    });

    try {
        await client.connect();

        // Fetch System Resources
        const resources = await client.menu('/system/resource').get();

        // Fetch Interfaces
        const interfaces = await client.menu('/interface').get();

        // Fetch IP Addresses
        const addresses = await client.menu('/ip/address').get();

        // Fetch Active Hotspot Users (optional, good for ISP context)
        // const activeUsers = await client.menu('/ip/hotspot/active').get();

        // Fetch DHCP Leases
        const leases = await client.menu('/ip/dhcp-server/lease').get();

        client.close();

        return {
            success: true,
            data: {
                resources: resources[0] || {},
                interfaces: interfaces || [],
                addresses: addresses || [],
                leases: leases || []
            }
        };

    } catch (error: any) {
        // Ensure client is closed on error
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
