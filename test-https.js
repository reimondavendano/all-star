require('dotenv').config({ path: '.env.local' });
const https = require('https');
const crypto = require('crypto');

const host = '45.32.26.177';
const user = process.env.MIKROTIK_USER?.trim() || 'admin';
const password = process.env.MIKROTIK_PASSWORD?.trim();

console.log(`Testing HTTPS on ${host}:443 with legacy support...`);

// Try to enable legacy options
const options = {
    hostname: host,
    port: 443,
    path: '/rest/system/resource',
    method: 'GET',
    headers: {
        'Authorization': 'Basic ' + Buffer.from(user + ':' + password).toString('base64'),
        'Content-Type': 'application/json'
    },
    rejectUnauthorized: false,
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT, // Allow legacy renegotiation
    minVersion: 'TLSv1', // Allow TLS 1.0
    ciphers: 'DEFAULT:@SECLEVEL=0' // Allow weak ciphers
};

const req = https.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);

    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log('BODY: ' + data.substring(0, 200));
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();
