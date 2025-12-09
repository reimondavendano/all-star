'use server';

import { RouterOSAPI } from 'node-routeros';
import https from 'https';

export async function getMikrotikData() {
    const host = process.env.MIKROTIK_HOST?.trim();
    const user = process.env.MIKROTIK_USER?.trim();
    const password = process.env.MIKROTIK_PASSWORD?.trim();
    const port = parseInt(process.env.MIKROTIK_PORT || '8728');
    const LOCAL_FALLBACK_IP = '192.168.1.211';

    if (!host || !user || !password) {
        return {
            success: false,
            error: 'Mikrotik credentials not configured in environment variables.'
        };
    }

    // --- REST API HELPER (For Cloudflare Tunnel & Ngrok) ---
    async function fetchRestData(hostUrl: string, path: string) {
        return new Promise((resolve, reject) => {
            const cleanHost = hostUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
            const options = {
                hostname: cleanHost,
                port: 443,
                path: `/rest/${path}`,
                method: 'GET',
                headers: {
                    'ngrok-skip-browser-warning': 'true'
                },
                auth: `${user}:${password}`,
                rejectUnauthorized: false
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error('Invalid JSON response'));
                        }
                    } else {
                        reject(new Error(`HTTP Status ${res.statusCode}`));
                    }
                });
            });

            req.on('error', (e) => reject(e));
            req.end();
        });
    }

    // --- STRATEGY 1: REST API via Tunnel (Priority) ---
    // Works for both Cloudflare (trycloudflare.com) and ngrok (ngrok-free.app/dev)
    if (host && (host.includes('trycloudflare.com') || host.includes('ngrok-free'))) {
        try {
            console.log(`[Mikrotik] Attempting REST connection via Tunnel: ${host}...`);

            // Parallel fetches for speed
            const [resources, interfaces, leases, hotspotUsers, activeUsers, pppActive] = await Promise.all([
                fetchRestData(host, 'system/resource'),
                fetchRestData(host, 'interface'), // Get ALL interfaces, then filter
                fetchRestData(host, 'ip/dhcp-server/lease'),
                fetchRestData(host, 'ip/hotspot/user'),
                fetchRestData(host, 'ip/hotspot/active'),
                fetchRestData(host, 'ppp/active') // Use PPP Active for cleaner usernames
            ]);

            console.log('[Mikrotik] REST Connection Successful!');

            // Filter interfaces for PPPoE (D - dynamic, type=pppoe-in)
            // Or use pppActive list which might be better
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
                    pppInterfaces: pppInterfaces, // Display actual interfaces
                    pppActive: Array.isArray(pppActive) ? pppActive : [],
                }
            };

        } catch (error: any) {
            console.error(`[Mikrotik] Tunnel REST connection failed: ${error.message}`);
            // Fall through to local fallback...
        }
    }

    // --- STRATEGY 2: Local Binary API (Fallback) ---
    async function connectAndFetch(targetHost: string): Promise<any> {
        const client = new RouterOSAPI({
            host: targetHost,
            user,
            password,
            port,
            timeout: 5000,
            keepalive: true,
        });

        console.log(`[Mikrotik] Attempting Binary connection to ${targetHost}:${port}...`);

        try {
            await client.connect();
            console.log(`[Mikrotik] Binary Connected Successfully to ${targetHost}!`);

            // Fetch System Resources
            const resources = await client.write('/system/resource/print');

            // Fetch Interfaces
            const allInterfaces = await client.write('/interface/print');
            const interfaces = allInterfaces.slice(0, 10);
            const pppInterfaces = allInterfaces.filter((i: any) => i.type === 'pppoe-in');

            // Fetch Active DHCP Leases (max 50)
            const allLeases = await client.write('/ip/dhcp-server/lease/print');
            const activeLeases = allLeases
                .filter((lease: any) => lease.status === 'bound')
                .slice(0, 50);

            // Fetch Hotspot Users & Active
            const hotspotUsers = await client.write('/ip/hotspot/user/print');
            const activeHotspotUsers = await client.write('/ip/hotspot/active/print');

            // Fetch PPP Active
            const pppActive = await client.write('/ppp/active/print');

            client.close();

            return {
                success: true,
                data: {
                    resources: resources[0] || {},
                    interfaces: interfaces || [],
                    leases: activeLeases || [],
                    hotspotUsers: hotspotUsers || [],
                    activeUsers: activeHotspotUsers || [],
                    pppInterfaces: pppInterfaces || [],
                    pppActive: pppActive || []
                }
            };

        } catch (error: any) {
            try { client.close(); } catch (e) { /* ignore */ }
            throw error;
        }
    }

    try {
        // Only try configured host if it wasn't the tunnel we just tried
        if (host && !host.includes('trycloudflare.com') && !host.includes('ngrok-free')) {
            return await connectAndFetch(host);
        }
        // If tunnel failed, force local fallback
        throw new Error('Tunnel failed, forcing fallback');

    } catch (error: any) {
        console.log(`[Mikrotik] Primary/Tunnel connection failed with error: ${error.message}`);

        // Final Fallback: Local IP
        try {
            console.log(`[Mikrotik] Attempting Final Fallback to Local IP: ${LOCAL_FALLBACK_IP}...`);
            return await connectAndFetch(LOCAL_FALLBACK_IP);
        } catch (fallbackError: any) {
            console.error(`[Mikrotik] All connection attempts failed.`);
            return {
                success: false,
                error: 'Could not connect to Mikrotik via Tunnel or Local Network.'
            };
        }
    }
}
