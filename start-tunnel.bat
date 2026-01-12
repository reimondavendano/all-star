@echo off
set "DOMAIN=tiffanie-ungraced-rebuffably.ngrok-free.dev"
set "TARGET=192.168.1.211:80"

echo Searching for ngrok...

REM 1. Check PATH
where.exe ngrok >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Ngrok found in PATH.
    start powershell -NoExit -Command "ngrok http --domain=%DOMAIN% %TARGET%"
    exit /b
)

REM 2. Check Custom Locations
set "LOC1=C:\ngrok\ngrok.exe"
set "LOC2=%USERPROFILE%\ngrok.exe"
set "LOC3=%USERPROFILE%\Downloads\ngrok.exe"
set "LOC4=%USERPROFILE%\Desktop\ngrok.exe"

if exist "%LOC1%" (
    echo Found at %LOC1%
    start powershell -NoExit -Command "%LOC1% http --domain=%DOMAIN% %TARGET%"
    exit /b
)
if exist "%LOC2%" (
    echo Found at %LOC2%
    start powershell -NoExit -Command "%LOC2% http --domain=%DOMAIN% %TARGET%"
    exit /b
)
if exist "%LOC3%" (
    echo Found at %LOC3%
    start powershell -NoExit -Command "%LOC3% http --domain=%DOMAIN% %TARGET%"
    exit /b
)
if exist "%LOC4%" (
    echo Found at %LOC4%
    start powershell -NoExit -Command "%LOC4% http --domain=%DOMAIN% %TARGET%"
    exit /b
)

REM 3. Not Found
echo.
echo ==================================================
echo ERROR: Ngrok executable not found!
echo ==================================================
echo.
echo Please download ngrok from https://ngrok.com/download
echo and place 'ngrok.exe' in one of these locations:
echo  - C:\ngrok\
echo  - %USERPROFILE%\
echo  - %USERPROFILE%\Downloads\
echo.
echo Or add it to your System PATH.
echo.
pause
