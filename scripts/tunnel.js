const { spawn, exec } = require('child_process');
const os = require('os');
const path = require('path');

const platform = os.platform(); // 'win32' or 'darwin' or 'linux'

console.log(`[Tunnel Launcher] Detected platform: ${platform}`);

if (platform === 'win32') {
    // Windows: Use start-tunnel.bat
    // We use 'start' command in cmd to open a NEW window
    const batPath = path.join(__dirname, '..', 'start-tunnel.bat');
    console.log(`[Tunnel Launcher] Launching: ${batPath}`);

    // Using 'start' to spawn a separate window
    // Arguments: start "Title" "command"
    exec(`start "Ngrok Tunnel" "${batPath}"`, (error) => {
        if (error) {
            console.error(`[Tunnel Launcher] Failed to start tunnel: ${error.message}`);
        } else {
            console.log('[Tunnel Launcher] Windows script triggered.');
        }
    });

} else if (platform === 'darwin') {
    // macOS: Use start-tunnel.sh
    const shPath = path.join(__dirname, '..', 'start-tunnel.sh');
    console.log(`[Tunnel Launcher] Launching: ${shPath}`);

    // Ensure it's executable
    exec(`chmod +x "${shPath}"`);

    // Execute
    // The script itself handles opening a new terminal window using osascript
    const child = spawn(shPath, [], {
        stdio: 'inherit',
        shell: true
    });

    child.on('error', (err) => {
        console.error(`[Tunnel Launcher] Failed to start script: ${err.message}`);
    });

} else {
    // Linux/Other
    const shPath = path.join(__dirname, '..', 'start-tunnel.sh');
    console.log(`[Tunnel Launcher] Launching for Linux: ${shPath}`);

    exec(`chmod +x "${shPath}"`);

    // Run in background or same terminal? 
    // The script runs ngrok in background for Linux
    const child = spawn(shPath, [], {
        stdio: 'inherit',
        shell: true
    });
}
