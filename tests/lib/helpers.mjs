import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const cli = path.join(root, "scripts", "agent-surface.mjs");

// Copy the WORKING TREE's tracked sources (not HEAD — the point is to exercise the current code),
// minus the external submodules, which are large and read-only here and so are linked instead.
// Suites that must change a tracked file do it in this copy, never in the shared checkout.
export function disposableCheckout(prefix) {
  const checkout = mkdtempSync(path.join(os.tmpdir(), prefix));
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter((file) => file.length > 0 && !file.startsWith("external/"));
  for (const file of tracked) {
    const destination = path.join(checkout, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(root, file), destination);
  }
  for (const linked of ["node_modules", "external"]) {
    const source = path.join(root, linked);
    if (existsSync(source)) symlinkSync(source, path.join(checkout, linked));
  }
  return checkout;
}
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

export const clineUserMcpRoutes = [
  path.join(".cline", "data", "settings", "cline_mcp_settings.json"),
  ...["Code", "Cursor", "Windsurf"].map((product) => path.join(
    clineIdeUserDataRoot(product),
    "User",
    "globalStorage",
    "saoudrizwan.claude-dev",
    "settings",
    "cline_mcp_settings.json",
  )),
].sort();

export function run(args, options = {}) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
}

export function status(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
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
  path.join(root, "registry", "target-capabilities.json"),
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
