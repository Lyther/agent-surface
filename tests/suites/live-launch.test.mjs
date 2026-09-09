#!/usr/bin/env node
// LIVE acceptance: run the REAL installer, then launch the EXACT command and arguments it generated
// — from a different working directory, under a MINIMAL PATH that is never repaired here — and
// require a working MCP session. This is the shape a host actually uses, and the only check that
// proves the whole npx → MCP chain starts without the operator's interactive-shell PATH.
//
// Opt-in (needs network: `npx -y` fetches the pinned MCP package): AGENT_SURFACE_LIVE_LAUNCH=1.
// Without it this skips, so the default suite stays hermetic and offline.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.AGENT_SURFACE_LIVE_LAUNCH !== "1") {
  console.log("live-launch: skipped (set AGENT_SURFACE_LIVE_LAUNCH=1 to run the networked acceptance)");
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = path.join(root, "scripts", "agent-surface.mjs");
const windows = process.platform === "win32";

// A minimal-but-valid launch environment: the system directories a process is always given, and
// NOTHING else. The runtime's own directory is deliberately absent — that is the defect under test,
// so the harness must not add it back. On Windows the OS itself requires SystemRoot/ComSpec to
// create a process at all; supplying those is not a PATH repair.
function minimalEnv(home) {
  if (!windows) return { PATH: "/usr/bin:/bin", HOME: home };
  return {
    Path: `${process.env.SystemRoot ?? "C:\\Windows"}\\system32;${process.env.SystemRoot ?? "C:\\Windows"}`,
    SystemRoot: process.env.SystemRoot ?? "C:\\Windows",
    ComSpec: process.env.ComSpec ?? "C:\\Windows\\system32\\cmd.exe",
    TEMP: process.env.TEMP ?? os.tmpdir(),
    TMP: process.env.TMP ?? os.tmpdir(),
    USERPROFILE: home,
    HOME: home,
  };
}

// One MCP stdio session over the launched process: initialize, then tools/list. Resolves with the
// server identity and tool count, or rejects with why the chain failed to start.
function mcpSession(command, args, { cwd, env, timeoutMs = 180000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "";
    let stderr = "";
    let serverInfo = null;
    const done = (fn, value) => { clearTimeout(timer); child.kill(); fn(value); };
    const timer = setTimeout(() => done(reject, new Error(`timed out; stderr: ${stderr.slice(-800)}`)), timeoutMs);
    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
    child.on("error", (error) => done(reject, new Error(`${error.message}; stderr: ${stderr.slice(-800)}`)));
    child.on("exit", (code) => { if (!serverInfo) done(reject, new Error(`exited ${code} before initialize; stderr: ${stderr.slice(-800)}`)); });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        if (message.error) { done(reject, new Error(`rpc error: ${JSON.stringify(message.error)}`)); return; }
        if (message.id === 1) {
          serverInfo = message.result.serverInfo;
          send({ jsonrpc: "2.0", method: "notifications/initialized" });
          send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
        } else if (message.id === 2) {
          done(resolve, { serverInfo, tools: message.result.tools.length });
          return;
        }
      }
    });
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "live-launch", version: "0" } } });
  });
}

const dir = mkdtempSync(path.join(os.tmpdir(), "as-live-launch-"));
try {
  // Isolated home so the run never depends on (or disturbs) the developer's own wiring. os.homedir()
  // reads USERPROFILE on Windows and HOME elsewhere, so both are set.
  const home = path.join(dir, "home");
  const dest = path.join(dir, "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(dest, { recursive: true });

  const install = spawnSync(process.execPath, [cli, "install", "--target", "droid", "--dest", dest, "--category", "mcps", "--service", "chrome-devtools", "-y"], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  console.log(install.stdout);
  assert.equal(install.status, 0, `install failed: ${install.stderr || install.stdout}`);

  const configPath = path.join(dest, ".factory", "mcp.json");
  assert.ok(existsSync(configPath), "the installer wrote the host config");
  const entry = JSON.parse(readFileSync(configPath, "utf8")).mcpServers["chrome-devtools"];
  assert.ok(entry, `chrome-devtools was not wired (prerequisites unmet?): ${install.stdout}`);
  console.log(`launching: ${entry.command} ${JSON.stringify(entry.args ?? [])}`);

  // The generated command must be a real file, not a name resolved through the launch PATH.
  assert.ok(path.isAbsolute(entry.command), `generated command must be absolute, got: ${entry.command}`);
  assert.ok(existsSync(entry.command), `generated command must exist on disk: ${entry.command}`);
  const args = entry.args ?? [];
  assert.ok(!args.includes("--as-env-file"), "a keyless server is never handed the credential env-file");
  const browserFlags = args.filter((arg) => arg === "--executablePath");
  assert.equal(browserFlags.length, 1, "the provisioned browser is wired exactly once");
  const browser = args[args.indexOf("--executablePath") + 1];
  assert.ok(existsSync(browser), `the wired browser path must exist: ${browser}`);

  // The acceptance itself: a different working directory, a minimal PATH, a real MCP session.
  const session = await mcpSession(entry.command, args, { cwd: os.tmpdir(), env: minimalEnv(home) });
  assert.equal(session.serverInfo.name, "chrome_devtools", `unexpected server identity: ${JSON.stringify(session.serverInfo)}`);
  assert.ok(session.tools > 0, "the server advertised its tools");
  console.log(`live-launch: initialize=${session.serverInfo.name} ${session.serverInfo.version}, tools=${session.tools}, platform=${process.platform}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("live-launch: ok");
