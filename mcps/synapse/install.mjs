#!/usr/bin/env node
// synapse — build + link the bridge/sidecar into ~/.local/bin, then deploy and (re)start the
// always-on sidecar launchd service. Idempotent: re-running redistributes the latest build and
// restarts the service while the token + databases under ~/.synapse persist.
// Set SYNAPSE_SKIP_SERVICE=1 to install only the binaries (the bridge still autostarts the sidecar
// lazily on first use).
//
// Runs under Node on every platform, which synapse already requires, so Windows is served by this
// same script rather than a translated shell script that would drift. The always-on service is
// macOS-only: Linux and Windows rely on the bridge's lazy autostart, which needs no service manager.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNodeFloor, binEntries, installAndBuild } from "../../scripts/agent-surface/mcp-build.mjs";
import { writeShims } from "../../scripts/agent-surface/mcp-shims.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(here, "package.json"), "utf8"));

function deployLaunchd() {
  if (process.platform !== "darwin") {
    console.log(`${process.platform}: skipping always-on service (the bridge still autostarts the sidecar on demand)`);
    return;
  }
  if (spawnSync("launchctl", ["version"], { stdio: "ignore" }).status !== 0) {
    console.log("launchctl unavailable: skipping service install");
    return;
  }
  const src = path.join(here, "deploy", "launchd", "local.synapse.plist");
  if (!existsSync(src)) {
    console.warn(`WARNING: ${src} missing; skipping service install`);
    return;
  }
  const dst = path.join(os.homedir(), "Library", "LaunchAgents", "local.synapse.plist");
  const uid = process.getuid();
  mkdirSync(path.dirname(dst), { recursive: true });
  copyFileSync(src, dst);

  // Stop whatever is currently serving (launchd job or a lazily autostarted sidecar from THIS build
  // path) so the refreshed build rebinds the port and becomes the sole owner.
  const quiet = { stdio: "ignore" };
  spawnSync("launchctl", ["bootout", `gui/${uid}/local.synapse`], quiet);
  spawnSync("pkill", ["-f", path.join(here, "dist", "src", "sidecar.js")], quiet);
  rmSync(path.join(os.homedir(), ".synapse", "sidecar.json"), { force: true });

  const bootstrap = spawnSync("launchctl", ["bootstrap", `gui/${uid}`, dst], { stdio: "inherit" });
  if (bootstrap.status !== 0) throw new Error(`launchctl bootstrap failed (exit ${bootstrap.status})`);
  spawnSync("launchctl", ["enable", `gui/${uid}/local.synapse`], quiet);
  spawnSync("launchctl", ["kickstart", "-k", `gui/${uid}/local.synapse`], quiet);
  console.log("service local.synapse deployed and started (RunAtLoad + KeepAlive)");
}

assertNodeFloor("synapse");
installAndBuild(here);

const binDir = path.join(os.homedir(), ".local", "bin");
for (const written of writeShims({
  binDir,
  nodeBin: process.execPath, // the Node this installer validated, not whatever PATH resolves later
  entries: binEntries(here, manifest),
  override: "SYNAPSE_NODE",
})) console.log(`installed ${written}`);

const pathEntries = (process.env.PATH ?? "").split(path.delimiter);
const onPath = process.platform === "win32"
  ? pathEntries.some((entry) => entry.toLowerCase() === binDir.toLowerCase())
  : pathEntries.includes(binDir);
if (!onPath) console.log(`NOTE: add ${binDir} to your PATH`);

if (process.env.SYNAPSE_SKIP_SERVICE === "1") console.log("SYNAPSE_SKIP_SERVICE=1: skipped always-on service install");
else deployLaunchd();

console.log("Point your MCP host at the stdio command: synapse-bridge");
