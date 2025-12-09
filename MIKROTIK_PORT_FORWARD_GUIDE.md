# MikroTik API Port Forwarding Setup Guide

## Request Summary
We need to enable remote access to the MikroTik API service for application integration.

---

## Current Setup
- **Public IP:** 45.32.26.177
- **Network Topology:** Internet → Main Router (45.32.26.177) → MikroTik Router → Local Network
- **Current Port Forwards:** Port 230 → MikroTik Winbox (working ✅)
- **Needed:** Port forward for MikroTik API service

---

## What Needs to Be Done

### Step 1: Identify MikroTik's Internal IP Address

**If you have many IP addresses (100+), use this better method:**

#### Method A: Find the default gateway route
```
/ip route print where dst-address=0.0.0.0/0
```

**Example output:**
```
Flags: X - disabled, I - invalid, D - dynamic
 #      DST-ADDRESS        PREF-SRC        GATEWAY            DISTANCE
 0 D    0.0.0.0/0                          192.168.1.1               1
```

- The **GATEWAY** (192.168.1.1) is your main router
- The **PREF-SRC** (if shown) is your MikroTik's IP
- If PREF-SRC is empty, your MikroTik's IP is on the same subnet as the gateway (e.g., 192.168.1.x)

#### Method B: Check the WAN interface
Find which interface connects to the main router (usually `ether1`):
```
/ip address print where interface=ether1
```
Replace `ether1` with your WAN interface name.

#### Method C: Traditional method (if you have few addresses)
```
/ip address print
```

Look for the IP address on the interface connected to the main router. It will be something like:
- `192.168.x.x` or
- `10.x.x.x` or
- `172.16.x.x` to `172.31.x.x`

**Example output:**
```
Flags: X - disabled, I - invalid, D - dynamic
 #   ADDRESS            NETWORK         INTERFACE
 0   192.168.88.1/24    192.168.88.0    bridge1
```
In this example, the MikroTik's IP is **192.168.88.1**

---

### Step 2: Add Port Forwarding Rule on Main Router

Access the main router (45.32.26.177) admin panel and add this port forwarding rule:

#### Port Forward Configuration:
```
Rule Name: MikroTik API Access
External Interface: WAN
External Port: 8728 (or any available port like 8730, 8888, etc.)
Internal IP Address: [MikroTik's IP from Step 1]
Internal Port: 8728
Protocol: TCP
Enable: Yes
```

#### Visual Example:
```
Internet Traffic on Port 8728
        ↓
Main Router (45.32.26.177:8728)
        ↓ [Port Forward]
MikroTik Router (192.168.x.x:8728)
        ↓
API Service Running
```

---

### Step 3: Verify the Port Forward

After adding the rule, test the connection from an external network:

**Option A: Using telnet (from any external computer)**
```bash
telnet 45.32.26.177 8728
```
If successful, you should see a connection (even if it closes immediately).

**Option B: Using our test script**
We have a Node.js test script that can verify the connection.

---

### Step 4: Update Application Configuration

Once the port forward is working, update the application's `.env.local` file:

```env
MIKROTIK_HOST=45.32.26.177
MIKROTIK_PORT=8728
MIKROTIK_USER=admin
MIKROTIK_PASSWORD=julsanity05
```

---

## Security Considerations

1. **Firewall Rules:** Ensure the main router's firewall allows incoming connections on port 8728
2. **Strong Password:** The MikroTik admin password should be strong (already set: julsanity05)
3. **IP Whitelist (Optional):** Consider restricting access to specific IP addresses if possible
4. **Alternative Port:** If you prefer not to use 8728 externally, you can use any port (e.g., 8730) and forward it to 8728 internally

---

## Troubleshooting

### If connection still fails after setup:

1. **Check firewall rules** on the main router
2. **Verify MikroTik API service is enabled:**
   ```
   /ip service print
   ```
   Look for `api` service - it should show `port: 8728` and not be disabled

3. **Check if port is listening:**
   ```
   /ip service set api address=0.0.0.0/0
   ```
   This ensures the API accepts connections from any IP

4. **Test from internal network first:**
   - Try connecting to `[MikroTik_Internal_IP]:8728` from a computer on the local network
   - If this works, the issue is with the port forward
   - If this fails, the issue is with the MikroTik API service

---

## Alternative Solutions

If port forwarding is not possible or preferred:

### Option 1: VPN Access
Set up a VPN server on the main router or MikroTik, then connect to the API through the VPN tunnel.

### Option 2: Cloud Proxy
Use a cloud service (like ngrok or similar) to create a tunnel to the MikroTik API.

### Option 3: Change API Port
Change the MikroTik API to run on port 8291 (same as Winbox), then use port 230:
```
/ip service set api port=8291
```
**Warning:** This will conflict with Winbox and is not recommended.

---

## Contact Information

If you need any clarification or encounter issues, please contact:
- **Requester:** [Your Name]
- **Purpose:** Application integration for network monitoring dashboard
- **Urgency:** Medium priority

---

## Technical Reference

- **MikroTik API Documentation:** https://wiki.mikrotik.com/wiki/Manual:API
- **Default API Port:** 8728 (TCP)
- **Protocol:** RouterOS API (Binary)
- **Similar to existing setup:** Port 230 forward (Winbox) - same concept, different service

---

**Thank you for your assistance!**
