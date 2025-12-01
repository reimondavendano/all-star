require('dotenv').config({ path: '.env.local' });

const host = process.env.MIKROTIK_HOST?.trim();
const user = process.env.MIKROTIK_USER?.trim();
const password = process.env.MIKROTIK_PASSWORD?.trim();
const port = process.env.MIKROTIK_PORT || '80';

console.log('--- Testing Mikrotik REST API Connection (Dual Protocol) ---');
console.log(`Host: ${host}`);
console.log(`Port: ${port}`);

if (!host || !user || !password) {
    console.error('ERROR: Missing credentials');
    process.exit(1);
}

const auth = Buffer.from(`${user}:${password}`).toString('base64');

async function testProtocol(protocol) {
    const baseUrl = `${protocol}://${host}:${port}/rest`;
    console.log(`\nTesting ${protocol.toUpperCase()}... URL: ${baseUrl}/system/resource`);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        // For HTTPS with self-signed certs
        const agent = protocol === 'https' ? new (require('https').Agent)({ rejectUnauthorized: false }) : undefined;

        const response = await fetch(`${baseUrl}/system/resource`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            },
            signal: controller.signal,
            agent: agent // This might not work with native fetch, but let's try. 
            // Actually native fetch in Node 18+ doesn't take agent directly like this usually, 
            // but we can rely on default behavior or NODE_TLS_REJECT_UNAUTHORIZED
        });

        clearTimeout(timeoutId);

        console.log(`[${protocol.toUpperCase()}] Response Status: ${response.status}`);
        if (response.ok) {
            const data = await response.json();
            console.log(`[${protocol.toUpperCase()}] SUCCESS!`);
            return true;
        } else {
            const text = await response.text();
            console.log(`[${protocol.toUpperCase()}] Failed: ${text}`);
        }
    } catch (error) {
        console.log(`[${protocol.toUpperCase()}] Error: ${error.message}`);
        if (error.cause) console.log(`[${protocol.toUpperCase()}] Cause code: ${error.cause.code}`);
    }
    return false;
}

async function run() {
    // Try HTTP first
    const httpSuccess = await testProtocol('http');
    if (httpSuccess) return;

    // Try HTTPS
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Allow self-signed for test
    await testProtocol('https');
}

run();
