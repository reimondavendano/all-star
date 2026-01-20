#!/bin/bash

# =================================================
# ALLSTAR TECH - macOS Auto-Run Setup
# =================================================

# Get absolute path to the directory containing this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TARGET_SCRIPT="$SCRIPT_DIR/start-tunnel.sh"
PLIST_NAME="com.allstar.tunnel.plist"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "Setting up auto-run for macOS..."

if [ ! -f "$TARGET_SCRIPT" ]; then
    echo "[ERROR] Could not find 'start-tunnel.sh'"
    echo "Please ensure it exists at: $TARGET_SCRIPT"
    exit 1
fi

# Ensure the target script is executable
echo "Making start-tunnel.sh executable..."
chmod +x "$TARGET_SCRIPT"

# Ensure the LaunchAgents directory exists
mkdir -p "$HOME/Library/LaunchAgents"

# Create the Property List (plist) file
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.allstar.tunnel</string>
    <key>ProgramArguments</key>
    <array>
        <string>$TARGET_SCRIPT</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>$SCRIPT_DIR</string>
    <key>StandardOutPath</key>
    <string>/tmp/allstar-tunnel.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/allstar-tunnel.err</string>
</dict>
</plist>
EOF

echo "Created configuration at: $PLIST_PATH"

# Unload previous version if exists (ignore error)
launchctl unload "$PLIST_PATH" 2>/dev/null

# Load the new plist
if launchctl load "$PLIST_PATH"; then
    echo ""
    echo "[SUCCESS] Auto-run configured!"
    echo "================================================="
    echo "The tunnel will now start automatically on login."
    echo "To uninstall, run: launchctl unload $PLIST_PATH"
    echo "================================================="
else
    echo "[ERROR] Failed to load launch agent."
fi
