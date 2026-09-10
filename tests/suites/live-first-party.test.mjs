#!/usr/bin/env node
// LIVE acceptance for the two first-party MCPs, through the product's own path, in four phases:
//   1. INSTALL: agent-surface provisions synapse and grimoire by running their registry recipe on
//      this platform (build, link the launcher, build grimoire's index) and wires the host config
//   2. STARTUP: launch each wired command UNCHANGED and require a real MCP session from the
//      installed server — initialize plus tools/list
//   3. REPEAT: install again; the prerequisites are already satisfied, so nothing is re-provisioned
//      and the generated config is byte-identical
//   4. LIFECYCLE: reinstall while synapse's sidecar is running — the case Windows makes distinct,
//      since a running process there can hold the files an install rewrites — then start again
//
// Everything runs in a disposable home. Synapse binds one sidecar per machine on a fixed port, so
// this run is given its own SYNAPSE_PORT rather than contending with a developer's own sidecar.
//
// Opt-in (network: npm install for both packages): AGENT_SURFACE_LIVE_FIRST_PARTY=1. Without it
// this skips, so the default suite stays hermetic and offline.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mcpSession, minimalLaunchEnv } from "../lib/mcp-session.mjs";

// Opt-in guard. NOT process.exit(): these suites are imported by the shared runner, so
// exiting here would silently end the whole run and report success for suites never run.
const enabled = process.env.AGENT_SURFACE_LIVE_FIRST_PARTY === "1";
if (!enabled) console.log("live-first-party: skipped (set AGENT_SURFACE_LIVE_FIRST_PARTY=1 to run the networked first-party acceptance)");

if (enabled) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const cli = path.join(root, "scripts", "agent-surface.mjs");
  const windows = process.platform === "win32";
  // A port this machine is not already serving synapse on, so the acceptance owns its own sidecar.
  const port = String(45000 + (process.pid % 2000));

  const dir = mkdtempSync(path.join(os.tmpdir(), "as-live-fp-"));
  const home = path.join(dir, "home");
  const dest = path.join(dir, "project");
  const configPath = path.join(dest, ".factory", "mcp.json");
  const sidecarState = path.join(home, ".synapse", "sidecar.json");

  // os.homedir() reads USERPROFILE on Windows and HOME elsewhere; both are set so the installer,
  // the launcher and the servers all agree on where the disposable home is.
  //
  // SYNAPSE_SKIP_SERVICE because a disposable HOME does NOT isolate launchd: on macOS the installer
  // addresses `gui/<uid>/local.synapse`, a per-user namespace this run cannot redirect, so without
  // the flag the acceptance would boot out and restart the operator's own always-on sidecar. The
  // lazily started sidecar it tests instead is the same one Linux and Windows use, and it lives
  // entirely inside the disposable home. Deploying the launchd service is therefore NOT covered
  // here; it needs a deliberately scoped host test that may take over the real service.
  const installEnv = { ...process.env, HOME: home, USERPROFILE: home, SYNAPSE_PORT: port, SYNAPSE_SKIP_SERVICE: "1" };
  const install = (label) => {
    const result = spawnSync(process.execPath, [cli, "install", "--target", "droid", "--dest", dest, "--category", "mcps", "--service", "synapse", "--service", "grimoire", "-y"], { encoding: "utf8", env: installEnv });
    console.log(result.stdout);
    assert.equal(result.status, 0, `${label} failed: ${result.stderr || result.stdout}`);
    return result.stdout;
  };

  // Launch a wired server exactly as the generated config spells it, from another working directory
  // under a minimal PATH that is never repaired here.
  const startServer = (entry, expected) => mcpSession(entry.command, entry.args ?? [], {
    cwd: os.tmpdir(),
    env: { ...minimalLaunchEnv(home), SYNAPSE_PORT: port },
    timeoutMs: 120000,
  }, async ({ call, serverInfo }) => {
    const { tools } = await call("tools/list", {});
    return { serverInfo, names: tools.map((tool) => tool.name) };
  }).then((session) => {
    assert.equal(session.serverInfo.name, expected.name, `unexpected server identity: ${JSON.stringify(session.serverInfo)}`);
    for (const tool of expected.tools) assert.ok(session.names.includes(tool), `${expected.name} advertised ${tool}: ${session.names.join(", ")}`);
    return session;
  });

  const readSidecarPid = () => {
    try { return JSON.parse(readFileSync(sidecarState, "utf8")).pid; } catch { return null; }
  };
  const stopSidecar = () => {
    const pid = readSidecarPid();
    if (pid === null) return null;
    // Windows does not deliver SIGTERM; taskkill is how a process tree is ended there.
    if (windows) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    else { try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ } }
    return pid;
  };

  try {
    mkdirSync(home, { recursive: true });
    mkdirSync(dest, { recursive: true });

    // ---- phase 1: install through the product's own provisioning ------------------------
    const first = install("install");
    assert.match(first, /provisioning: ok agent-surface repo build \(mcps\/synapse\/install\.mjs\)/, "synapse was built by its registry recipe on this platform");
    assert.match(first, /provisioning: ok agent-surface repo build \(mcps\/grimoire\/install\.mjs\)/, "grimoire was built by its registry recipe on this platform");

    const servers = JSON.parse(readFileSync(configPath, "utf8")).mcpServers;
    for (const id of ["synapse", "grimoire"]) assert.ok(servers[id], `${id} was not wired: ${first}`);
    const launchTarget = (entry) => (entry.args?.includes("--") ? entry.args[entry.args.indexOf("--") + 1] : entry.command);
    for (const id of ["synapse", "grimoire"]) {
      const target = launchTarget(servers[id]);
      assert.ok(path.isAbsolute(target) && existsSync(target), `${id}'s launch target is an absolute path that exists: ${target}`);
      // The shim is named in the platform's idiom; the registry still spells it without an extension.
      assert.match(path.basename(target), windows ? /^(synapse-bridge|grimoire-server)\.cmd$/ : /^(synapse-bridge|grimoire-server)$/, `unexpected launch target: ${target}`);
      assert.ok(!(servers[id].args ?? []).includes("--as-env-file"), `${id} is keyless and is never handed a credential env-file`);
      console.log(`wired ${id}: ${servers[id].command} ${JSON.stringify(servers[id].args ?? [])}`);
    }

    // ---- phase 2: the installed servers actually start -----------------------------------
    const synapse = await startServer(servers.synapse, { name: "synapse", tools: ["memory_remember", "memory_recall", "lock_acquire"] });
    const grimoire = await startServer(servers.grimoire, { name: "grimoire", tools: ["grimoire_search", "grimoire_get"] });
    console.log(`live-first-party: started synapse ${synapse.serverInfo.version} (${synapse.names.length} tools) and grimoire ${grimoire.serverInfo.version} (${grimoire.names.length} tools)`);
    assert.ok(existsSync(sidecarState), "starting the bridge elected and started the shared sidecar");

    // ---- phase 3: repeat install is idempotent -------------------------------------------
    const before = readFileSync(configPath, "utf8");
    const second = install("repeat install");
    assert.doesNotMatch(second, /provisioning: ok agent-surface repo build/, "an already-satisfied prerequisite is not rebuilt");
    assert.match(second, /synapse-bridge ok/, "synapse's launcher is detected as present on re-run");
    assert.match(second, /grimoire-server ok/, "grimoire's launcher is detected as present on re-run");
    assert.equal(readFileSync(configPath, "utf8"), before, "the generated config is byte-identical on re-run");

    // ---- phase 4: reinstall while the sidecar is running ----------------------------------
    // The interesting platform is Windows, where a running process can hold the very files an
    // install rewrites. The sidecar started in phase 2 is still up, so this reinstall happens
    // under exactly that condition; afterwards the bridge must still start.
    const runningPid = readSidecarPid();
    assert.ok(runningPid, "the sidecar recorded its pid for this phase");
    const third = spawnSync(process.execPath, [path.join(root, "mcps", "synapse", "install.mjs")], { encoding: "utf8", env: installEnv });
    console.log(third.stdout.split("\n").slice(-6).join("\n"));
    assert.equal(third.status, 0, `reinstall with the sidecar running failed: ${third.stderr}`);
    const restarted = await startServer(servers.synapse, { name: "synapse", tools: ["memory_remember"] });
    assert.ok(restarted.names.length > 0, "the bridge still starts after a rebuild under a live sidecar");
    console.log(`live-first-party: rebuilt with sidecar ${runningPid} running, bridge restarted, platform=${process.platform}`);
  } finally {
    const stopped = stopSidecar();
    if (stopped) console.log(`live-first-party: stopped the sidecar this run started (pid ${stopped})`);
    // Retry, then REPORT rather than throw: Windows keeps handles open briefly after a process
    // exits, and throwing from `finally` would replace the real failure.
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    } catch (error) {
      console.log(`live-first-party: could not remove the temporary directory ${dir} (${error.code})`);
    }
  }

  console.log("live-first-party: ok");
}
