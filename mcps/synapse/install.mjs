#!/usr/bin/env node
// synapse — build + link the bridge/sidecar into ~/.local/bin. Idempotent: re-running relinks the
// latest build while the token + databases under ~/.synapse persist. There is no service: on every
// platform the first bridge autostarts the lock-elected sidecar and later bridges reuse it.
//
// Runs under Node on every platform, which synapse already requires, so Windows is served by this
// same script rather than a translated shell script that would drift.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNodeFloor, binEntries, installAndBuild } from "../../scripts/agent-surface/mcp-build.mjs";
import { pinnedNodePath, writeShims } from "../../scripts/agent-surface/mcp-shims.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(here, "package.json"), "utf8"));

// Earlier installs deployed a KeepAlive launchd agent that raced the bridge's autostart for the port.
// The plist goes only once the job is unloaded, so a failed bootout is retried by the next install.
function retireLaunchdAgent() {
  const plist = path.join(os.homedir(), "Library", "LaunchAgents", "local.synapse.plist");
  if (process.platform !== "darwin" || !existsSync(plist)) return;
  const job = `gui/${process.getuid()}/local.synapse`;
  spawnSync("launchctl", ["bootout", job], { stdio: "ignore" });
  if (spawnSync("launchctl", ["print", job], { stdio: "ignore" }).status === 0) {
    console.warn(`WARNING: ${job} is still loaded; run \`launchctl bootout ${job}\`, then rerun this install`);
    return;
  }
  rmSync(plist, { force: true });
  console.log(`retired the local.synapse launchd agent (${plist}); the bridge autostarts the sidecar`);
}

// A running sidecar keeps serving the old build until it exits. Stop it, but only when the recorded
// pid is alive and its address answers as synapse, so a recycled pid is never signalled; open bridges
// then elect a sidecar from this build on their next call.
async function stopRunningSidecar() {
  const dbDir = process.env.SYNAPSE_DB_DIR ?? path.join(os.homedir(), ".synapse");
  let discovery;
  try { discovery = JSON.parse(readFileSync(path.join(dbDir, "sidecar.json"), "utf8")); } catch { return; }
  const { pid, url } = discovery ?? {};
  if (!Number.isInteger(pid) || pid <= 0 || typeof url !== "string") return;
  try { process.kill(pid, 0); } catch { return; }
  try {
    const res = await fetch(`${url.replace(/\/mcp$/, "")}/health`, { signal: AbortSignal.timeout(1000) });
    if (!res.ok || (await res.json())?.name !== "synapse") return;
  } catch { return; }
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    // ESRCH: it exited after the health check, so there is nothing left to stop.
    if (error.code !== "ESRCH") console.warn(`WARNING: could not stop the running sidecar (pid ${pid}, ${error.code}); stop it so bridges start one from this build`);
    return;
  }
  console.log(`stopped the running sidecar (pid ${pid}); the next bridge call starts one from this build`);
}

assertNodeFloor("synapse");
installAndBuild(here);

const binDir = path.join(os.homedir(), ".local", "bin");
for (const written of writeShims({
  binDir,
  nodeBin: pinnedNodePath(), // this installer's Node (its opt link under Homebrew), not whatever PATH resolves later
  entries: binEntries(here, manifest),
  override: "SYNAPSE_NODE",
})) console.log(`installed ${written}`);

const pathEntries = (process.env.PATH ?? "").split(path.delimiter);
const onPath = process.platform === "win32"
  ? pathEntries.some((entry) => entry.toLowerCase() === binDir.toLowerCase())
  : pathEntries.includes(binDir);
if (!onPath) console.log(`NOTE: add ${binDir} to your PATH`);

retireLaunchdAgent();
await stopRunningSidecar();

console.log("Point your MCP host at the stdio command: synapse-bridge");
