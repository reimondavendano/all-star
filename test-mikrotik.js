require('dotenv').config({ path: '.env.local' });
const nodeRouterOs = require('node-routeros');

console.log('--- Debugging node-routeros ---');
console.log('Type of export:', typeof nodeRouterOs);
console.log('Export keys:', Object.keys(nodeRouterOs));

const RouterOSClient = nodeRouterOs.RouterOSClient || nodeRouterOs.default || nodeRouterOs;
console.log('Resolved RouterOSClient type:', typeof RouterOSClient);

if (typeof RouterOSClient !== 'function') {
    console.error('ERROR: RouterOSClient is not a constructor!');
    process.exit(1);
}

console.log('RouterOSClient is a valid constructor.');

const host = process.env.MIKROTIK_HOST;
const user = process.env.MIKROTIK_USER;
const password = process.env.MIKROTIK_PASSWORD;

if (!host || !user || !password) {
    console.error('Missing credentials in .env.local');
    process.exit(1);
}

console.log(`Attempting connection to ${host}...`);

const client = new RouterOSClient({
    host,
    user,
    password,
    port: parseInt(process.env.MIKROTIK_PORT || '8728'),
    timeout: 10,
});

client.connect()
    .then(() => {
        console.log('Connection Successful!');
        return client.menu('/system/resource').get();
    })
    .then((resources) => {
        console.log('System Resources:', resources[0]);
        client.close();
    })
    .catch((err) => {
        console.error('Connection Failed:', err);
        client.close();
    });
