@echo off
set "SCRIPT_DIR=%~dp0"
REM Remove trailing backslash if present
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

set "TARGET_BAT=%SCRIPT_DIR%\start-tunnel.bat"
set "SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AllStar Tunnel.lnk"

echo =================================================
echo ALLSTAR TECH - Windows Auto-Run Setup
echo =================================================
echo.

if not exist "%TARGET_BAT%" (
    echo [ERROR] Could not find 'start-tunnel.bat' in the current directory.
    echo Please ensure this setup script is in the same folder as start-tunnel.bat
    echo.
    pause
    exit /b
)

echo Target Script: %TARGET_BAT%
echo Startup Link:  %SHORTCUT_PATH%
echo.
echo Creating shortcut...

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%TARGET_BAT%'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.WindowStyle = 7; $s.Save()"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] Auto-run configured successfully!
    echo =================================================
    echo The tunnel will now start automatically every time you log in.
    echo you can delete this shortcut anytime from:
    echo shell:startup
    echo =================================================
) else (
    echo [ERROR] Failed to create shortcut.
)

echo.
pause
