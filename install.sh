#!/usr/bin/env bash
# Installs the extension for the current user and enables it at login.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

command -v gsettings >/dev/null || { echo "gsettings not found - is this really GNOME?" >&2; exit 1; }

echo "Copying the extension to $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"
cp "$SRC"/metadata.json "$SRC"/extension.js "$SRC"/prefs.js "$SRC"/stylesheet.css "$SRC"/moon.svg "$DEST"/
mkdir -p "$DEST/schemas"
cp "$SRC"/schemas/*.gschema.xml "$DEST/schemas/"
glib-compile-schemas "$DEST/schemas"

# Compile translations (po/*.po -> locale/<lang>/LC_MESSAGES/<domain>.mo).
for po in "$SRC"/po/*.po; do
    [ -e "$po" ] || continue
    lang="$(basename "$po" .po)"
    mkdir -p "$DEST/locale/$lang/LC_MESSAGES"
    msgfmt -o "$DEST/locale/$lang/LC_MESSAGES/$UUID.mo" "$po"
done

if [ "$(gsettings get org.gnome.shell disable-user-extensions)" = "true" ]; then
    echo "Enabling user extensions (disable-user-extensions=false)"
    gsettings set org.gnome.shell disable-user-extensions false
fi

edit_enabled add
# If the shell already knows the extension (reinstall), enable it right away.
gnome-extensions enable "$UUID" 2>/dev/null || true

cat <<MSG

Done. The extension will start with every session.
On Wayland GNOME loads new extensions only after you log out and back in -
do that once.

Shortcut to show the window:  Super+Shift+Z (configurable in preferences)
Preferences:                  gnome-extensions prefs $UUID
Uninstall:                    ./uninstall.sh
MSG
