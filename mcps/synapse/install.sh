#!/bin/sh
# synapse — build + link the bridge/sidecar into ~/.local/bin, then deploy and (re)start
# the always-on sidecar launchd service. Idempotent: re-running redistributes the latest
# build and restarts the service while the token + databases under ~/.synapse persist.
# Set SYNAPSE_SKIP_SERVICE=1 to install only the binaries (bridge still autostarts the
# sidecar lazily on first use).
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
command -v node >/dev/null 2>&1 || { echo "node (>=22.17) required" >&2; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit((a>22||(a===22&&b>=17))?0:1)' \
  || { echo "synapse needs Node >=22.17 for node:sqlite; found $(node -v)" >&2; exit 1; }

cd "$HERE"
if [ -f package-lock.json ]; then npm ci; else npm install; fi
npm run build

BIN="$HOME/.local/bin"
mkdir -p "$BIN"
# Bake the absolute path of the Node we just version-gated, so the wrapper does not depend
# on the host's PATH at launch (a host with Node <22.17 first on PATH would otherwise crash
# deep in node:sqlite). SYNAPSE_NODE overrides; we also re-check the version at runtime.
NODE_BIN="$(command -v node)"
for name in bridge sidecar; do
  target="$BIN/synapse-$name"
  cat > "$target" <<EOF
#!/bin/sh
# synapse-$name launcher — pinned to the Node validated at install; re-checks >=22.17 (node:sqlite).
NODE="\${SYNAPSE_NODE:-$NODE_BIN}"
command -v "\$NODE" >/dev/null 2>&1 || NODE=node
"\$NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit((a>22||(a===22&&b>=17))?0:1)' || {
  echo "synapse-$name: needs Node >=22.17 for node:sqlite; \$NODE is \$("\$NODE" -v 2>/dev/null || echo missing)" >&2
  exit 1
}
exec "\$NODE" "$HERE/dist/src/$name.js" "\$@"
EOF
  chmod +x "$target"
  echo "installed $target"
done

case ":$PATH:" in
  *":$BIN:"*) : ;;
  *) echo "NOTE: add $BIN to your PATH" ;;
esac

# ---- always-on sidecar service (macOS / launchd) --------------------------------------
deploy_launchd() {
  uname -s | grep -qi darwin || { echo "non-macOS: skipping launchd service (bridge still autostarts the sidecar on demand)"; return 0; }
  command -v launchctl >/dev/null 2>&1 || { echo "launchctl unavailable: skipping service install"; return 0; }
  src="$HERE/deploy/launchd/local.synapse.plist"
  [ -f "$src" ] || { echo "WARNING: $src missing; skipping service install" >&2; return 0; }

  dst="$HOME/Library/LaunchAgents/local.synapse.plist"
  uid="$(id -u)"
  mkdir -p "$HOME/Library/LaunchAgents"
  cp "$src" "$dst"

  # Stop whatever is currently serving (launchd job or a lazily autostarted sidecar from
  # THIS build path) so the refreshed build rebinds the port and becomes the sole owner.
  launchctl bootout "gui/$uid/local.synapse" 2>/dev/null || true
  pkill -f "$HERE/dist/src/sidecar.js" 2>/dev/null || true
  rm -f "$HOME/.synapse/sidecar.json" 2>/dev/null || true

  launchctl bootstrap "gui/$uid" "$dst"
  launchctl enable "gui/$uid/local.synapse" 2>/dev/null || true
  launchctl kickstart -k "gui/$uid/local.synapse" 2>/dev/null || true
  echo "service local.synapse deployed and started (RunAtLoad + KeepAlive)"
}

if [ "${SYNAPSE_SKIP_SERVICE:-0}" = "1" ]; then
  echo "SYNAPSE_SKIP_SERVICE=1: skipped launchd service install"
else
  deploy_launchd
fi

echo "Point your MCP host at the stdio command: synapse-bridge"
