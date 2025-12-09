# Cloudflare Permanent Tunnel Setup Guide

This guide will help you set up a **permanent** Cloudflare Tunnel. This means your URL (e.g., `https://mikrotik.yourdomain.com`) will stay the same forever, and you won't need to update your `.env.local` file every time you restart.

## Prerequisites
1.  **A Cloudflare Account** (Free).
2.  **A Domain Name** active in your Cloudflare account (e.g., `mysite.com`). 
    *   *Note: You cannot use `vercel.app` domains. You must have a real domain (like `.com`, `.net`, etc.) and its DNS must be managed by Cloudflare.*

---

## Step 1: Login to Cloudflare
Open your terminal (PowerShell) and run:
```powershell
cloudflared tunnel login
```
1.  This will print a URL. Copy it and paste it into your browser (if it doesn't open automatically).
2.  Login to Cloudflare and select your domain.
3.  Once authorized, it will download a certificate file (usually to `C:\Users\Admin\.cloudflared\cert.pem`).

## Step 2: Create the Tunnel
Create a new tunnel with a name (e.g., `mikrotik-tunnel`):
```powershell
cloudflared tunnel create mikrotik-tunnel
```
*   This will output a **Tunnel ID** (a long string of random characters, e.g., `a1b2c3d4-...`). 
*   **Save this ID**, you will need it later.
*   It creates a credentials file in `C:\Users\Admin\.cloudflared\<Tunnel-ID>.json`.

## Step 3: Connect Domain (DNS)
Decide on the subdomain you want to use (e.g., `mikrotik.mysite.com`). Run:
```powershell
cloudflared tunnel route dns mikrotik-tunnel mikrotik.mysite.com
```
*   Replace `mikrotik.mysite.com` with your actual domain.

## Step 4: Create Configuration File
Create a new file named `config.yml` inside `C:\Users\Admin\.cloudflared\` (or wherever you want to keep config).
noting the UUID from Step 2.

**Content of `config.yml`:**
```yaml
tunnel: <YOUR-TUNNEL-UUID-FROM-STEP-2>
credentials-file: C:\Users\Admin\.cloudflared\<YOUR-TUNNEL-UUID-FROM-STEP-2>.json

ingress:
  - hostname: mikrotik.mysite.com
    service: http://192.168.1.211:80
  - service: http_status:404
```
*   **Replace** `<YOUR-TUNNEL-UUID...>` with the actual ID.
*   **Replace** `mikrotik.mysite.com` with your domain.

## Step 5: Test the Tunnel
Run the tunnel manually to make sure it works:
```powershell
cloudflared tunnel --config C:\Users\Admin\.cloudflared\config.yml run
```
*   Go to `https://mikrotik.mysite.com/rest/system/resource` in your browser.
*   If it works, press `Ctrl+C` to stop the test.

## Step 6: Install as a Service (Auto-Start)
To make the tunnel run automatically when Windows starts:

1.  **Open PowerShell as Administrator.**
2.  Run:
    ```powershell
    cloudflared service install --config C:\Users\Admin\.cloudflared\config.yml
    cloudflared service start
    ```

## Final Step: Update App
Update your `.env.local` file in the Allstar project one last time:
```properties
MIKROTIK_HOST=https://mikrotik.mysite.com
```

**You are done!** The tunnel will now run 24/7.
