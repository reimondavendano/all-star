require('dotenv').config({ path: '.env.local' });
const { RouterOSAPI } = require('node-routeros');

const host = process.env.MIKROTIK_HOST?.trim();
const port = parseInt(process.env.MIKROTIK_PORT || '8728');
const user = process.env.MIKROTIK_USER?.trim();
const password = process.env.MIKROTIK_PASSWORD?.trim();

console.log('=== Mikrotik Connection Test ===');
console.log(`Host: ${host}`);
console.log(`Port: ${port}`);
console.log(`User: ${user}`);
console.log('================================\n');

const client = new RouterOSAPI({
    host,
    user,
    password,
    port,
    timeout: 10000,
    keepalive: false
});

console.log('Attempting connection...\n');

client.connect()
    .then(() => {
        console.log('✓ SUCCESS! Connected to Mikrotik router!');
        return client.write('/system/resource/print');
    })
    .then((resources) => {
        console.log('\n=== System Info ===');
        console.log('Board:', resources[0]['board-name']);
        console.log('Version:', resources[0].version);
        console.log('Uptime:', resources[0].uptime);
        console.log('CPU Load:', resources[0]['cpu-load'] + '%');
        client.close();
        console.log('\n✓ Test completed successfully!');
    })
    .catch(err => {
        console.error('✗ Connection Failed!');
        console.error('Error:', err.message);
        console.error('\nTroubleshooting:');
        console.error('1. Verify API service is enabled: /ip service print');
        console.error('2. Check firewall rules: /ip firewall filter print');
        console.error('3. Verify your public IP hasn\'t changed: https://api.ipify.org');
        console.error('4. Try connecting from Mikrotik Mobile to confirm credentials work');
    });
