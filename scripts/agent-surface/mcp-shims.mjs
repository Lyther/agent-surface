// Launcher shims for the first-party MCPs, in each platform's own idiom.
//
// Both MCPs need Node >=22.17 (node:sqlite). The shim bakes the absolute path of the Node the
// installer version-gated, so a launch never depends on the host's PATH — a host with an older Node
// first on PATH would otherwise crash deep inside node:sqlite — and re-checks the floor at launch,
// because the pinned Node can be removed and the per-MCP override can point anywhere.
//
// POSIX gets a `#!/bin/sh` script. Windows has no shebang, so it gets the native equivalent: a
// `.cmd` shim, the same shape npm installs for its own console entry points. That extension makes it
// executable under PATHEXT, and `launchNameOf` strips it, so `~/.local/bin/<name>` in the registry
// still matches the resolved `<name>.cmd` and the launcher routes it through cmd.exe with per-token
// quoting.
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// The runtime floor check, written WITHOUT quote characters of either kind: the same source string
// is embedded in a single-quoted `sh` argument and a double-quoted cmd.exe argument. The regex
// literal stands in for a string separator, and the comparison operators are inert inside cmd's
// quotes. Keep it that way — adding a quote breaks one of the two shims silently.
const FLOOR_CHECK = "const v=process.versions.node.split(/\\./).map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=17)?0:1)";
const FLOOR_TEXT = "Node 22.17 or newer (node:sqlite)";

function posixShim({ name, nodeBin, entry, override }) {
  return `#!/bin/sh
# ${name} launcher — pinned to the Node validated at install; re-checks the floor at launch.
NODE="\${${override}:-${nodeBin}}"
command -v "$NODE" >/dev/null 2>&1 || NODE=node
"$NODE" -e '${FLOOR_CHECK}' || {
  echo "${name}: needs ${FLOOR_TEXT}; $NODE is $("$NODE" -v 2>/dev/null || echo missing)" >&2
  exit 1
}
exec "$NODE" "${entry}" "$@"
`;
}

// CRLF throughout: cmd.exe misparses a batch file with bare LF line endings on some Windows builds.
// `if defined` guards the override expansion — an undefined %VAR% stays literal inside a batch file,
// so assigning it unconditionally would set NODE to the text "%VAR%".
function windowsShim({ name, nodeBin, entry, override }) {
  return [
    "@echo off",
    `rem ${name} launcher — pinned to the Node validated at install; re-checks the floor at launch.`,
    "setlocal",
    `set "NODE=${nodeBin}"`,
    `if defined ${override} set "NODE=%${override}%"`,
    `"%NODE%" -e "${FLOOR_CHECK}" 2>nul`,
    "if errorlevel 1 (",
    `  echo ${name}: needs ${FLOOR_TEXT}; %NODE% is unusable 1>&2`,
    "  exit /b 1",
    ")",
    `"%NODE%" "${entry}" %*`,
    "exit /b %ERRORLEVEL%",
    "",
  ].join("\r\n");
}

export function shimFileName(name, platform = process.platform) {
  return platform === "win32" ? `${name}.cmd` : name;
}

export function shimContent(spec, platform = process.platform) {
  return platform === "win32" ? windowsShim(spec) : posixShim(spec);
}

/**
 * Write one launcher per entry into binDir. `entries` maps a shim name to the absolute JS entry it
 * runs; `override` names the environment variable that repoints the Node (SYNAPSE_NODE /
 * GRIMOIRE_NODE). Returns the absolute paths written.
 */
export function writeShims({ binDir, nodeBin, entries, override, platform = process.platform }) {
  mkdirSync(binDir, { recursive: true });
  const written = [];
  for (const [name, entry] of Object.entries(entries)) {
    const target = path.join(binDir, shimFileName(name, platform));
    writeFileSync(target, shimContent({ name, nodeBin, entry, override }, platform));
    // Windows decides executability by extension, so there is no bit to set there.
    if (platform !== "win32") chmodSync(target, 0o755);
    written.push(target);
  }
  return written;
}
