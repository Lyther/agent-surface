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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Opt-in guard. NOT process.exit(): these suites are imported by the shared runner, so
// exiting here would silently end the whole run and report success for suites never run.
const enabled = process.env.AGENT_SURFACE_LIVE_LAUNCH === "1";
if (!enabled) console.log("live-launch: skipped (set AGENT_SURFACE_LIVE_LAUNCH=1 to run the networked acceptance)");

if (enabled) {
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

  // An MCP stdio session over the launched process. `steps` is an async driver that receives a
  // `call(method, params)` function; the session resolves with whatever the driver returns, or
  // rejects with why the chain failed to start.
  function mcpSession(command, args, { cwd, env, timeoutMs = 300000 }, steps) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
      const pending = new Map();
      let buffer = "";
      let stderr = "";
      let started = false;
      let nextId = 1;
      const settle = (fn, value) => { clearTimeout(timer); child.kill(); fn(value); };
      const timer = setTimeout(() => settle(reject, new Error(`timed out; stderr: ${stderr.slice(-1200)}`)), timeoutMs);
      const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
      const call = (method, params) => new Promise((ok, fail) => {
        const id = nextId += 1;
        pending.set(id, { ok, fail });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
      child.on("error", (error) => settle(reject, new Error(`${error.message}; stderr: ${stderr.slice(-1200)}`)));
      child.on("exit", (code) => { if (!started) settle(reject, new Error(`exited ${code} before initialize; stderr: ${stderr.slice(-1200)}`)); });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.stdout.on("data", (chunk) => {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (!line) continue;
          const message = JSON.parse(line);
          if (message.id === 1) {
            if (message.error) { settle(reject, new Error(`initialize failed: ${JSON.stringify(message.error)}`)); return; }
            started = true;
            notify("notifications/initialized");
            steps({ call, serverInfo: message.result.serverInfo }).then((value) => settle(resolve, value), (error) => settle(reject, error));
            continue;
          }
          const waiter = pending.get(message.id);
          if (!waiter) continue;
          pending.delete(message.id);
          if (message.error) waiter.fail(new Error(`rpc error: ${JSON.stringify(message.error)}`));
          else waiter.ok(message.result);
        }
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "live-launch", version: "0" } } })}\n`);
    });
  }

  // Flatten an MCP tool result's content blocks to text.
  const resultText = (result) => (result?.content ?? []).map((block) => block.text ?? "").join("\n");

  // A failed tool call comes back as a normal result carrying isError, not as a JSON-RPC error, so it
  // has to be checked explicitly — otherwise a failure reads as an empty success.
  async function callTool(call, name, args) {
    const result = await call("tools/call", { name, arguments: args });
    const text = resultText(result);
    if (result?.isError) throw new Error(`${name} failed: ${text}`);
    return text;
  }

  // new_page answers with the browser's page list, marking the new one [selected]; take_snapshot
  // addresses a page by that id. Parse it rather than guessing an index.
  function selectedPageId(pageList) {
    const line = pageList.split("\n").find((entry) => entry.includes("[selected]"));
    const match = /^\s*(\d+):/.exec(line ?? "");
    return match ? Number(match[1]) : null;
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

    // A real page for the browser to render, so the check is an actual page operation driving the
    // provisioned browser — not just a protocol handshake.
    const marker = `agent-surface-live-${process.platform}`;
    const pagePath = path.join(dir, "page.html");
    writeFileSync(pagePath, `<!doctype html><title>${marker}</title><h1>${marker}</h1>\n`);
    const pageUrl = pathToFileURL(pagePath).href;

    // The acceptance itself: a different working directory, a minimal PATH, a real MCP session, and a
    // real page rendered by the browser the installer wired via --executablePath.
    const session = await mcpSession(entry.command, args, { cwd: os.tmpdir(), env: minimalEnv(home) }, async ({ call, serverInfo }) => {
      const tools = (await call("tools/list", {})).tools;
      const pages = await callTool(call, "new_page", { url: pageUrl });
      const pageId = selectedPageId(pages);
      assert.ok(pageId !== null, `could not identify the opened page: ${pages}`);
      const rendered = await callTool(call, "take_snapshot", { pageId });
      return { serverInfo, tools: tools.length, rendered };
    });
    assert.equal(session.serverInfo.name, "chrome_devtools", `unexpected server identity: ${JSON.stringify(session.serverInfo)}`);
    assert.ok(session.tools > 0, "the server advertised its tools");
    assert.ok(session.rendered.includes(marker), `the provisioned browser rendered the page (marker "${marker}" missing from the snapshot)`);
    console.log(`live-launch: initialize=${session.serverInfo.name} ${session.serverInfo.version}, tools=${session.tools}, page rendered=yes, platform=${process.platform}`);
  } finally {
    // Windows keeps handles open briefly after a process exits — the browser profile the MCP server
    // created is still locked here. Retry, then REPORT rather than throw: a temp-directory lock is
    // not what this acceptance tests, and throwing from `finally` would replace the real failure.
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    } catch (error) {
      console.log(`live-launch: could not remove the temporary directory ${dir} (${error.code})`);
    }
  }

  console.log("live-launch: ok");
}
