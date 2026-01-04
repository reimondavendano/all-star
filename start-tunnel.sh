#!/bin/bash

# Check if ngrok is installed/in path
if command -v ngrok &> /dev/null; then
    echo "Starting Ngrok Tunnel..."
    # Attempt to open in a new Terminal window on macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        osascript -e 'tell application "Terminal" to do script "ngrok http --domain=tiffanie-ungraced-rebuffably.ngrok-free.dev 192.168.1.211:80"'
    else
        # Fallback for Linux or others - run in background? 
        # Or just run it. The bat file logic implies a visible window is desired.
        # For now, targeting macOS as requested.
        ngrok http --domain=tiffanie-ungraced-rebuffably.ngrok-free.dev 192.168.1.211:80 &
    fi
else
    echo "Ngrok not found in PATH."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        osascript -e 'display alert "Ngrok not found" message "Please install ngrok and ensure it is in your PATH."'
    fi
fi
