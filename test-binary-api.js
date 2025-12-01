const { RouterOSAPI } = require('node-routeros');
require('dotenv').config({ path: '.env.local' });

const host = '45.32.26.177';
const port = 230;
const user = process.env.MIKROTIK_USER?.trim() || 'admin';
const password = process.env.MIKROTIK_PASSWORD?.trim();

console.log(`Testing Binary API connection to ${host}:${port}...`);

const client = new RouterOSAPI({
    host,
    user,
    password,
    port,
    timeout: 5,
    keepalive: false
});

client.connect()
    .then(() => {
        console.log('SUCCESS: Connected via Binary API!');
        console.log('This confirms port 230 is the "API" service, NOT the "REST API" (www) service.');
        client.close();
    })
    .catch(err => {
        console.error('Failed to connect via Binary API:', err.message);
    });
