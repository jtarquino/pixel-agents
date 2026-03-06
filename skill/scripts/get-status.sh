#!/usr/bin/env bash
# Pixel Agents — Get Status (wrapper for cross-platform Node.js script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$SCRIPT_DIR/get-status.js" "$@"
