# Shared helpers for install.sh / uninstall.sh
UUID="go-to-sleep@niemojewski.eu"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$ROOT/extension"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

# Adds/removes the UUID in enabled-extensions (works even when the shell does
# not know the extension yet, where `gnome-extensions enable` would fail).
edit_enabled() {
    python3 - "$1" "$UUID" <<'PY'
import ast, subprocess, sys
op, uuid = sys.argv[1:3]
def get(key):
    raw = subprocess.check_output(["gsettings", "get", "org.gnome.shell", key], text=True).strip()
    if raw.startswith("@as"):
        raw = raw[3:].strip()
    return ast.literal_eval(raw)
def put(key, val):
    subprocess.check_call(["gsettings", "set", "org.gnome.shell", key, repr(val)])

enabled = get("enabled-extensions")
if op == "add":
    if uuid not in enabled:
        enabled.append(uuid)
        put("enabled-extensions", enabled)
    disabled = get("disabled-extensions")
    if uuid in disabled:
        put("disabled-extensions", [u for u in disabled if u != uuid])
elif op == "remove" and uuid in enabled:
    put("enabled-extensions", [u for u in enabled if u != uuid])
PY
}
