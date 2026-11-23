#!/usr/bin/env bash
# Disables and removes the extension.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

gnome-extensions disable "$UUID" 2>/dev/null || true
edit_enabled remove
rm -rf "$DEST"

echo "Uninstalled $UUID."
echo "If the overlay was showing in this session it disappears right away;"
echo "the extension code is fully unloaded at the next login."
