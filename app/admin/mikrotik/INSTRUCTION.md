# MikroTik Connection Instructions

## The Issue: "Double NAT" and "Hairpin NAT"
You experienced a connection issue where your specific setup prevented the App from connecting to the MikroTik router.
- **Externally** (from outside your home), the DDNS address (`*.sn.mynetname.net`) works because it hits your Public IP, and the Port Forwarding rules send it to the MikroTik.
- **Internally** (from your own WiFi/LAN), using the DDNS/Public IP often fails because of **Loopback** issues (your main router doesn't know how to route "Public IP" requests back into the "Private Network").

## The Fix I Implemented
I have updated the code in `app/actions/mikrotik.ts` to be "Smart".
1. It tries to connect to your configured `MIKROTIK_HOST` (e.g., your DDNS address).
2. If that **Times Out** (server runs into a wall), it automatically retries using the Local IP (`192.168.1.211`).

This means:
- **At Home**: The app will verify DDNS (fail) -> Switch to Local IP (Success).
- **Remotely**: The app will use DDNS (Success).

## Configuration
Ensure your `.env.local` has the correct credentials. You don't need to change the Host if you want to keep it ready for remote access.

```env
MIKROTIK_HOST=hfh09e86kp3.sn.mynetname.net
MIKROTIK_USER=admin
MIKROTIK_PASSWORD=your_password
MIKROTIK_PORT=8728
```

## Troubleshooting
If connection still fails:
1. Ensure your PC is connected to the same network (upstream or same subnet) as the MikroTik.
2. Verify the MikroTik IP is indeed `192.168.1.211` (Check in Winbox > IP > Addresses).
3. Ensure the API service is enabled in MikroTik:
   - Command: `/ip service print`
   - Enable if disabled: `/ip service enable api`

## Verification
You can use the included `debug-connection.js` script to verify connectivity from the terminal:
```bash
node debug-connection.js
```
