$ErrorActionPreference = "Stop"

# Configuration
$CloudflaredPath = "C:\cloudflared\cloudflared.exe"
$TargetUrl = "http://192.168.1.211:80"
$EnvFilePath = ".env.local"

# 1. Stop existing process if running (optional cleanup)
Write-Host "Stopping any old instances..." -ForegroundColor Yellow
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# 2. Start Cloudflare Tunnel
Write-Host "Starting Cloudflare Tunnel..." -ForegroundColor Cyan
$ProcessInfo = New-Object System.Diagnostics.ProcessStartInfo
$ProcessInfo.FileName = $CloudflaredPath
$ProcessInfo.Arguments = "tunnel --url $TargetUrl"
$ProcessInfo.RedirectStandardError = $true
$ProcessInfo.UseShellExecute = $false
$ProcessInfo.CreateNoWindow = $true

$Process = New-Object System.Diagnostics.Process
$Process.StartInfo = $ProcessInfo
$Process.Start() | Out-Null

# 3. Capture the random URL
Write-Host "Waiting for Tunnel URL..." -ForegroundColor Cyan
$TunnelUrl = $null
$Timeout = 20 # seconds

$StartTime = Get-Date
while ($null -eq $TunnelUrl -and ((Get-Date) - $StartTime).TotalSeconds -lt $Timeout) {
    $Line = $Process.StandardError.ReadLine()
    if ($Line -match "https://[a-zA-Z0-9-]+\.trycloudflare\.com") {
        $TunnelUrl = $Matches[0]
    }
}

if ($null -eq $TunnelUrl) {
    Write-Host "Failed to grab Cloudflare URL. Check if cloudflared is installed/working." -ForegroundColor Red
    Stop-Process -Id $Process.Id -Force
    exit 1
}

Write-Host "Tunnel Active at: $TunnelUrl" -ForegroundColor Green

# 4. Update .env.local
Write-Host "Updating .env.local..." -ForegroundColor Yellow
$EnvContent = Get-Content $EnvFilePath
$NewEnvContent = @()
$Found = $false

foreach ($Line in $EnvContent) {
    if ($Line -match "^MIKROTIK_HOST=") {
        $NewEnvContent += "MIKROTIK_HOST=$TunnelUrl"
        $Found = $true
    } else {
        $NewEnvContent += $Line
    }
}

if (-not $Found) {
    $NewEnvContent += "MIKROTIK_HOST=$TunnelUrl"
}

$NewEnvContent | Set-Content $EnvFilePath
Write-Host "Environment updated!" -ForegroundColor Green

# 5. Start Next.js
Write-Host "Starting Next.js Dev Server..." -ForegroundColor Yellow
Write-Host "You can now access your app." -ForegroundColor White
npm run dev
