#!/usr/bin/env bash
# Builds the zip for extensions.gnome.org (dist/<uuid>.shell-extension.zip)
# and checks its contents against the review guidelines.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

OUT="$ROOT/dist"
mkdir -p "$OUT"
gnome-extensions pack --force --out-dir="$OUT" --podir=po --extra-source=moon.svg --extra-source=../LICENSE "$SRC"
ZIP="$OUT/$UUID.shell-extension.zip"

echo "Contents of $ZIP:"
unzip -l "$ZIP"

# Files reviewers do not accept in the package.
bad=$(unzip -Z1 "$ZIP" | grep -E '\.(sh|po|pot|so|exe)$' || true)
if [ -n "$bad" ]; then
    echo "ERROR: disallowed files in the package:" >&2
    echo "$bad" >&2
    exit 1
fi
for f in metadata.json extension.js; do
    unzip -Z1 "$ZIP" | grep -qx "$f" || { echo "ERROR: $f missing from the package" >&2; exit 1; }
done
echo "OK."
