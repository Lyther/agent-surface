import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const cli = path.join(root, "scripts", "agent-surface.mjs");
export const stripAiAttributionHook = path.join(root, "hooks", "strip-ai-attribution.sh");
const opsServerCommandPath = path.join(root, "commands", "ops-server.md");
export const hasLocalOpsServerCommand = existsSync(opsServerCommandPath);
export const expectedCommandCount = 5 + Number(hasLocalOpsServerCommand);
export const expectedSkillCount = 62;

export function clineIdeUserDataRoot(product) {
  if (process.platform === "darwin") return path.join("Library", "Application Support", product);
  if (process.platform === "win32") return path.join("AppData", "Roaming", product);
  return path.join(".config", product);
}

// SUBSTITUTE_JUSTIFICATION
// - substitute: an empty saoudrizwan.claude-dev-<version> folder in an editor's extensions directory
// - replaces: a Cline extension installed in that editor
// - necessity: the planner's presence check reads only folder names; installing editors and Cline
//   in a test would launch editor clients and download the extension
// - real-option: the real CLI plans against a disposable root
// - proof-limit: proves which per-editor routes are planned, not that the editor loads Cline
// - real-proof: a read-only `install --target cline --scope user --dry-run` against the operator's
//   profile planned the VS Code and Cursor routes
const clineExtensionDirs = { Code: ".vscode", Cursor: ".cursor", Windsurf: ".windsurf", Devin: ".devin" };
export function installClineExtension(installRoot, editors = Object.keys(clineExtensionDirs)) {
  for (const editor of editors) {
    mkdirSync(path.join(installRoot, clineExtensionDirs[editor], "extensions", "saoudrizwan.claude-dev-3.86.2"), { recursive: true });
  }
}

export const clineUserMcpRoutes = [
  path.join(".cline", "data", "settings", "cline_mcp_settings.json"),
  ...["Code", "Cursor", "Windsurf", "Devin"].map((product) => path.join(
    clineIdeUserDataRoot(product),
    "User",
    "globalStorage",
    "saoudrizwan.claude-dev",
    "settings",
    "cline_mcp_settings.json",
  )),
].sort();

// An all-target plan prints one line per planned file, and npm pack JSON lists every packaged
// file; both outgrow Node's 1 MiB default capture.
export const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;

export function run(args, options = {}) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: MAX_CAPTURE_BYTES,
    ...options,
  });
}

export function status(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: MAX_CAPTURE_BYTES,
    ...options,
  });
}

export function files(dir) {
  const out = [];
  let entries;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      entries = readdirSync(dir, { withFileTypes: true });
      break;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  if (!entries) return out;
  for (const name of entries) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...files(full));
    if (name.isFile()) out.push(full);
  }
  return out;
}

const guardedRepoFiles = [
  path.join(root, "registry", "targets.json"),
  path.join(root, "registry", "optional-services.json"),
  path.join(root, "registry", "cybersecurity-assets.json"),
  path.join(root, "registry", "private-secret.json"),
  path.join(root, "registry", "modding.json"),
  path.join(root, "registry", "legacy-owned.json"),
  path.join(root, "subagents", "boss.md"),
];
const guardedSnapshots = new Map();
for (const file of guardedRepoFiles) {
  try {
    guardedSnapshots.set(file, readFileSync(file, "utf8"));
  } catch {
    guardedSnapshots.set(file, null);
  }
}

function restoreGuardedFiles() {
  for (const [file, content] of guardedSnapshots) {
    if (content !== null) {
      try {
        writeFileSync(file, content);
      } catch {
        // best-effort restore during teardown
      }
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    restoreGuardedFiles();
    process.exit(130);
  });
}

// An install that wires a credentialed MCP server writes the shared env launcher into
// $HOME/.local/bin, naming the checkout it ran from. A suite that runs such installs calls this
// first: HOME points at a disposable home with the operator's provisioned binaries and uv tool
// environments linked in, so prerequisite detection finds the real tools while the launcher lands
// in the disposable home and the operator's is never rewritten.
export function useDisposableHome() {
  const operatorHome = os.homedir();
  const home = mkdtempSync(path.join(os.tmpdir(), "agent-surface-home-"));
  const links = [];
  const link = (target, source) => {
    mkdirSync(path.dirname(target), { recursive: true });
    symlinkSync(source, target);
    links.push(target);
  };
  const operatorBin = path.join(operatorHome, ".local", "bin");
  for (const name of existsSync(operatorBin) ? readdirSync(operatorBin) : []) {
    if (name !== "agent-surface-mcp-env") link(path.join(home, ".local", "bin", name), path.join(operatorBin, name));
  }
  // uv keeps its tool environments under the home, and openosint's extras are detected inside them.
  const uvTools = path.join(operatorHome, ".local", "share", "uv");
  if (existsSync(uvTools)) link(path.join(home, ".local", "share", "uv"), uvTools);
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME };
  // os.homedir() reads USERPROFILE on Windows and HOME elsewhere.
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.XDG_CONFIG_HOME = path.join(home, ".config");
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      // Unlink first, so removing the home never descends into the operator's.
      for (const target of links) rmSync(target, { force: true });
      rmSync(home, { recursive: true, force: true });
    } catch {
      // best-effort cleanup during teardown
    }
  };
  process.once("exit", restore);
  return { home, restore };
}

function assertTomlParses(dir) {
  const script = `
import pathlib
import sys
import tomllib
bad = []
for p in pathlib.Path(sys.argv[1]).rglob("*.toml"):
    try:
        tomllib.loads(p.read_text())
    except Exception as exc:
        bad.append(f"{p}: {exc}")
if bad:
    raise SystemExit("\\n".join(bad))
`;
  execFileSync("python3", ["-c", script, dir], {
    cwd: root,
    encoding: "utf8",
  });
}

export function assertCodexAgentTomlParses() {
  assertTomlParses(path.join(root, "dist", "codex", ".codex", "agents"));
}
