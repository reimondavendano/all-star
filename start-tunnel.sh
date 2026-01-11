#!/bin/bash

# =====================================================
# ALLSTAR TECH - Ngrok Tunnel Script for macOS/Linux
# =====================================================

NGROK_DOMAIN="tiffanie-ungraced-rebuffably.ngrok-free.dev"
NGROK_TARGET="192.168.1.211:80"

# Function to find ngrok executable
find_ngrok() {
    # Check if ngrok is in PATH
    if command -v ngrok &> /dev/null; then
        echo "$(command -v ngrok)"
        return 0
    fi
    
    # Common locations to check
    local LOCATIONS=(
        "/usr/local/bin/ngrok"
        "$HOME/Downloads/ngrok"
        "$HOME/ngrok"
        "/opt/ngrok/ngrok"
        "/Applications/ngrok"
    )
    
    for loc in "${LOCATIONS[@]}"; do
        if [ -f "$loc" ] && [ -x "$loc" ]; then
            echo "$loc"
            return 0
        fi
    done
    
    return 1
}

# Main script
NGROK_PATH=$(find_ngrok)

if [ -n "$NGROK_PATH" ]; then
    echo "Found ngrok at: $NGROK_PATH"
    echo "Starting Ngrok Tunnel..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - Open in new Terminal window
        osascript -e "tell application \"Terminal\" to do script \"'$NGROK_PATH' http --domain=$NGROK_DOMAIN $NGROK_TARGET\""
        echo "Ngrok tunnel started in new Terminal window."
    else
        # Linux - Run in background
        echo "Starting ngrok in background..."
        "$NGROK_PATH" http --domain="$NGROK_DOMAIN" "$NGROK_TARGET" &
        echo "Ngrok tunnel started. PID: $!"
    fi
else
    echo "========================================="
    echo "ERROR: Ngrok not found!"
    echo "========================================="
    echo ""
    echo "Please install ngrok manually:"
    echo ""
    echo "1. Go to: https://ngrok.com/download"
    echo "2. Download the ZIP file for your system"
    echo "3. Unzip the file"
    echo "4. Move ngrok to /usr/local/bin:"
    echo "   sudo mv ~/Downloads/ngrok /usr/local/bin/"
    echo ""
    echo "Or keep it in ~/Downloads and run this script again."
    echo ""
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        osascript -e 'display alert "Ngrok not found" message "Please download ngrok from https://ngrok.com/download and place it in /usr/local/bin or ~/Downloads"'
    fi
    
    exit 1
fi
