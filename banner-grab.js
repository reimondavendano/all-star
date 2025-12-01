const net = require('net');

const host = '45.32.26.177';
const ports = [230, 443];

ports.forEach(port => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    console.log(`Connecting to port ${port}...`);
    socket.connect(port, host, () => {
        console.log(`Connected to ${port}. Sending HTTP request...`);
        socket.write("GET / HTTP/1.1\r\nHost: " + host + "\r\n\r\n");
    });

    socket.on('data', (data) => {
        console.log(`\n--- DATA FROM PORT ${port} ---`);
        console.log(data.toString().substring(0, 200)); // First 200 chars
        console.log('-----------------------------');
        socket.destroy();
    });

    socket.on('error', (err) => {
        console.log(`Error on ${port}: ${err.message}`);
    });

    socket.on('timeout', () => {
        console.log(`Timeout on ${port}`);
        socket.destroy();
    });
});
