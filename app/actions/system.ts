'use server';

import { exec, spawn } from 'child_process';
import path from 'path';

export async function toggleTunnel(action: 'start' | 'stop') {
    const isWindows = process.platform === 'win32';
    const scriptExtension = isWindows ? '.bat' : '.sh';
    const scriptName = `${action}-tunnel${scriptExtension}`;
    const scriptPath = path.resolve(process.cwd(), scriptName);

    console.log(`[System] Executing ${action} tunnel script: ${scriptPath} on ${process.platform}`);

    // For START action
    if (action === 'start') {
        try {
            if (isWindows) {
                // "start" command in Windows cmd launches a separate process
                exec(`start "" "${scriptPath}"`);
            } else {
                // macOS/Linux
                // Make sure it's executable
                exec(`chmod +x "${scriptPath}"`);

                // Execute the shell script
                // We use 'sh' or './' 
                exec(`sh "${scriptPath}"`);
            }

            return { success: true, message: 'Tunnel starting logic initiated.' };
        } catch (error: any) {
            console.error(`[System] Error starting ${scriptName}:`, error);
            return { success: false, message: error.message };
        }
    }

    // For STOP action
    return new Promise<{ success: boolean; message: string }>((resolve) => {
        const command = isWindows ? `"${scriptPath}"` : `sh "${scriptPath}"`;

        if (!isWindows) {
            exec(`chmod +x "${scriptPath}"`);
        }

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`[System] Error executing ${scriptName}:`, error);
                // On pkill, sometimes it errors if process not found, which is fine
                if (action === 'stop' && !isWindows && error.code === 1) {
                    resolve({ success: true, message: 'Tunnel stopped (no process found).' });
                    return;
                }
                resolve({ success: false, message: error.message });
                return;
            }
            console.log(`[System] ${scriptName} output:`, stdout);
            resolve({ success: true, message: 'Tunnel stopped.' });
        });
    });
}
