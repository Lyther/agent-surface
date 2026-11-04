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
import { stopRunningSidecar } from "./stop-sidecar.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(here, "package.json"), "utf8"));

// bootout can return before launchd has removed the job: an install saw it still loaded while it
// was gone about a second later. So look again for up to two seconds before calling it loaded.
const UNLOAD_CHECKS = 10;
const UNLOAD_CHECK_INTERVAL_MS = 200;
function stillLoaded(job) {
  for (let check = 0; check < UNLOAD_CHECKS; check += 1) {
    if (spawnSync("launchctl", ["print", job], { stdio: "ignore" }).status !== 0) return false;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, UNLOAD_CHECK_INTERVAL_MS);
  }
  return true;
}

// Earlier installs deployed a KeepAlive launchd agent that raced the bridge's autostart for the port.
// The plist goes only once the job is unloaded, so a failed bootout is retried by the next install.
function retireLaunchdAgent() {
  const plist = path.join(os.homedir(), "Library", "LaunchAgents", "local.synapse.plist");
  if (process.platform !== "darwin" || !existsSync(plist)) return;
  const job = `gui/${process.getuid()}/local.synapse`;
  spawnSync("launchctl", ["bootout", job], { stdio: "ignore" });
  if (stillLoaded(job)) {
    console.warn(`WARNING: ${job} is still loaded; run \`launchctl bootout ${job}\`, then rerun this install`);
    return;
  }
  rmSync(plist, { force: true });
  console.log(`retired the local.synapse launchd agent (${plist}); the bridge autostarts the sidecar`);
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
