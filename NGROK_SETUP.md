# Ngrok Persistent Tunnel Guide

This guide will help you set up a **fixed** URL using ngrok, which is perfect for deploying to Vercel because the URL won't change.

## Step 1: Create Ngrok Account & Get Domain
1.  Go to [dashboard.ngrok.com/signup](https://dashboard.ngrok.com/signup) and create a free account.
2.  Once logged in, go to **Cloud Edge** -> **Domains** in the sidebar.
3.  Click **+ New Domain**.
4.  It will generate a free static domain for you (e.g., `shark-related-deeply.ngrok-free.app`).
    *   **Copy this domain.** This will be your permanent `MIKROTIK_HOST`.

## Step 2: Install Ngrok
1.  Download ngrok for Windows from [ngrok.com/download](https://ngrok.com/download).
2.  Unzip it (e.g., to `C:\ngrok\ngrok.exe`).
3.  Connect your account (Authtoken):
    *   Copy your Authtoken from the [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken).
    *   Open PowerShell and run:
        ```powershell
        C:\ngrok\ngrok.exe config add-authtoken <YOUR_TOKEN_HERE>
        ```

## Step 3: Start the Tunnel
Run the following command to start the tunnel pointing to your MikroTik router (Port 80):

```powershell
C:\ngrok\ngrok.exe http --domain=<YOUR-STATIC-DOMAIN> 192.168.1.211:80
```
*   *Replace `<YOUR-STATIC-DOMAIN>` with the domain you got in Step 1.*

**Example:**
`C:\ngrok\ngrok.exe http --domain=shark-related-deeply.ngrok-free.app 192.168.1.211:80`

## Step 4: Verify
1.  The terminal should say `Session Status: online`.
2.  Open your browser and visit: `https://<YOUR-STATIC-DOMAIN>/rest/system/resource`
    *   (It might ask for your MikroTik username/password).
    *   It might also show an ngrok "Visit Site" warning page first. *Note: Data fetching from Vercel *might* fail if ngrok adds a warning page. You usually need to add a header to bypass this, see Step 6.*

## Step 5: Configure Vercel
1.  Go to your project settings in Vercel.
2.  Go to **Environment Variables**.
3.  Add/Update:
    *   `MIKROTIK_HOST` = `https://<YOUR-STATIC-DOMAIN>`
    *   `MIKROTIK_PORT` = `443`
    *   `MIKROTIK_USER` = (Your user)
    *   `MIKROTIK_PASSWORD` = (Your pass)
4.  **Redeploy** your app on Vercel.

## Step 6: Fix "Ngrok Warning Page" (Important)
Ngrok's free plan adds a warning page that breaks API calls. To bypass it, your app needs to send a custom header.

**In `app/actions/mikrotik.ts`:**
We need to add a header `ngrok-skip-browser-warning: true` to the fetch requests. (I will update the code for you now to support this).
