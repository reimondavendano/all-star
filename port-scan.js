const net = require('net');

const host = '45.32.26.177';
const ports = [80, 443, 230, 8080, 8728, 8729];

console.log(`Scanning ports on ${host}...`);

ports.forEach(port => {
    const socket = new net.Socket();
    socket.setTimeout(3000);

    socket.on('connect', () => {
        console.log(`[OPEN] Port ${port} is OPEN`);
        socket.destroy();
    });

    socket.on('timeout', () => {
        console.log(`[TIMEOUT] Port ${port} timed out`);
        socket.destroy();
    });

    socket.on('error', (err) => {
        console.log(`[CLOSED] Port ${port} is closed/refused (${err.message})`);
    });

    socket.connect(port, host);
});
