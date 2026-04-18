#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  Bible Song Pro — LAN Network Broadcast Server
#  Double-click this file in Finder to start the server.
#  Press Ctrl+C in the Terminal window to stop it.
# ═══════════════════════════════════════════════════════════════════

# Move to the folder that contains this script (the project folder)
cd "$(dirname "$0")"

# Ensure common Node.js install locations are on PATH
# (Finder-launched scripts don't inherit the shell's full PATH)
export PATH="/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/opt/node/bin:$PATH"

# Check that Node.js is installed
if ! command -v node &> /dev/null; then
  echo ""
  echo "✗  Node.js was not found."
  echo ""
  echo "   Install Node.js from https://nodejs.org  (LTS version recommended)"
  echo "   Then double-click this file again."
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi

echo ""
echo "Starting Bible Song Pro LAN server..."
echo ""
node bsp-server.js "$@"

# If the server exits (e.g. Ctrl+C), pause so the Terminal window stays open
echo ""
read -p "Server stopped. Press Enter to close..."
