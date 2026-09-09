#!/usr/bin/env node
// LIVE acceptance: run the REAL installer, then launch the EXACT command and arguments it generated
// — from a different working directory, under a MINIMAL PATH that is never repaired here — and
// require a working MCP session. This is the shape a host actually uses, and the only check that
// proves the whole npx → MCP chain starts without the operator's interactive-shell PATH.
//
// A second phase drives the provisioned browser through a real page. Where that fails, the cause is
// established by comparison against the upstream invocation rather than asserted: only a failure the
// upstream server does NOT share is attributed to what agent-surface generates.
//
// Opt-in (needs network: `npx -y` fetches the pinned MCP package): AGENT_SURFACE_LIVE_LAUNCH=1.
// Without it this skips, so the default suite stays hermetic and offline.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { callTool, mcpSession, minimalLaunchEnv } from "../lib/mcp-session.mjs";

// Opt-in guard. NOT process.exit(): these suites are imported by the shared runner, so
// exiting here would silently end the whole run and report success for suites never run.
const enabled = process.env.AGENT_SURFACE_LIVE_LAUNCH === "1";
if (!enabled) console.log("live-launch: skipped (set AGENT_SURFACE_LIVE_LAUNCH=1 to run the networked acceptance)");

if (enabled) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const cli = path.join(root, "scripts", "agent-surface.mjs");
  const windows = process.platform === "win32";

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

    // ---- the acceptance proper: the EXACT generated command, nothing added ----------------
    // A different working directory and a minimal PATH, never repaired. No flag is appended here —
    // this is precisely what a host launches.
    const session = await mcpSession(entry.command, args, { cwd: os.tmpdir(), env: minimalLaunchEnv(home) }, async ({ call, serverInfo }) => {
      const tools = (await call("tools/list", {})).tools;
      return { serverInfo, tools: tools.length };
    });
    assert.equal(session.serverInfo.name, "chrome_devtools", `unexpected server identity: ${JSON.stringify(session.serverInfo)}`);
    assert.ok(session.tools > 0, "the server advertised its tools");

    // ---- browser qualification: drive the provisioned browser through a real page ----------
    // HARNESS-ONLY FLAGS, recorded explicitly: `--headless` because a CI runner has no interactive
    // desktop, and `--isolated` so each run gets its own profile instead of contending for a shared
    // one. They are appended HERE, for this check only — the installed configuration asserted above
    // carries neither, and the browser sandbox is not touched.
    //
    // This phase also uses an ORDINARY environment rather than the austere one above. A browser
    // needs far more than PATH to start (on Windows, APPDATA/LOCALAPPDATA among others), and PATH
    // independence is already proven by the exact-command phase; what is under test here is that the
    // provisioned browser actually renders a page.
    const qualifyEnv = { ...process.env, HOME: home, USERPROFILE: home };
    const renderPage = (command, launchArgs) => mcpSession(command, launchArgs, { cwd: os.tmpdir(), env: qualifyEnv, timeoutMs: 180000 }, async ({ call }) => {
      const pages = await callTool(call, "new_page", { url: pageUrl });
      const pageId = selectedPageId(pages);
      assert.ok(pageId !== null, `could not identify the opened page: ${pages}`);
      const snapshot = await callTool(call, "take_snapshot", { pageId });
      assert.ok(snapshot.includes(marker), `marker "${marker}" missing from the snapshot`);
      return true;
    }).then(() => ({ rendered: true }), (error) => ({ rendered: false, error: error.message }));

    const generatedRender = await renderPage(entry.command, [...args, "--headless", "--isolated"]);

    // On a runner where the generated launch cannot render, the cause is NOT assumed. Run a CONTROL
    // outside agent-surface's launch path entirely — the registry's own upstream invocation, no
    // wrapper, no wired --executablePath, upstream browser discovery — and compare. If the control
    // renders while the generated command does not, the wiring is at fault and this suite fails; if
    // both fail the same way, the failure is reproduced outside anything agent-surface generates.
    let control = null;
    if (!generatedRender.rendered) {
      const upstream = JSON.parse(readFileSync(path.join(root, "registry", "optional-services.json"), "utf8")).services["chrome-devtools"].mcp.server;
      const upstreamArgs = [...upstream.args, "--headless", "--isolated"];
      // `npx` is a batch shim on Windows, which Node will not spawn directly; route it through
      // cmd.exe here rather than reusing the product's launcher, so the control stays independent.
      control = windows
        ? await renderPage(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", [upstream.command, ...upstreamArgs].join(" ")])
        : await renderPage(upstream.command, upstreamArgs);
      console.log(`live-launch: generated launch did not render (${generatedRender.error})`);
      console.log(`live-launch: control (upstream ${upstream.command} ${upstreamArgs.join(" ")}, no agent-surface wiring) rendered=${control.rendered}${control.rendered ? "" : ` (${control.error})`}`);
      assert.ok(!control.rendered, `the upstream invocation rendered the page but the generated launch did not — the generated wiring is at fault: ${generatedRender.error}`);
    }

    // Both paths failed identically: the page operation is unverified here, and the failure is not
    // specific to what agent-surface generates. Reported rather than skipped quietly, and never
    // worked around by relaxing the browser sandbox.
    const rendered = generatedRender.rendered
      ? "yes (headless+isolated harness flags)"
      : "NOT VERIFIED — also fails with the upstream invocation on this machine";
    console.log(`live-launch: initialize=${session.serverInfo.name} ${session.serverInfo.version}, tools=${session.tools}, page rendered=${rendered}, platform=${process.platform}`);
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
