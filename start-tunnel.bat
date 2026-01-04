@echo off
set "NGROK_PATH=C:\ngrok\ngrok.exe"

if exist "%NGROK_PATH%" (
    echo Starting Ngrok Tunnel...
    start powershell -NoExit -Command "%NGROK_PATH% http --domain=tiffanie-ungraced-rebuffably.ngrok-free.dev 192.168.1.211:80"
) else (
    echo Ngrok not found at %NGROK_PATH%
    powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('Ngrok executable not found at C:\ngrok\ngrok.exe. Please install Ngrok first.', 'Ngrok Missing', 'OK', 'Error')"
)
