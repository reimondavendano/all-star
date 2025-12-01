const net = require('net');

const host = '45.32.26.177';
const port = 8728;

console.log(`Testing port ${port}...`);

const socket = new net.Socket();
socket.setTimeout(3000);

socket.on('connect', () => {
    console.log(`✓ Port ${port} is OPEN and accepting connections!`);
    socket.destroy();
});

socket.on('timeout', () => {
    console.log(`✗ Port ${port} timed out (firewall blocking?)`);
    socket.destroy();
});

socket.on('error', (err) => {
    console.log(`✗ Port ${port} error: ${err.message}`);
});

socket.connect(port, host);
