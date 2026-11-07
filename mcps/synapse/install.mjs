#!/usr/bin/env node
// synapse — build + link the server into ~/.local/bin. Idempotent: re-running relinks the latest build
// while the databases under ~/.synapse persist. There is no service: each host session starts its own
// server over stdio, and those servers share the SQLite files.
//
// Runs under Node on every platform, which synapse already requires, so Windows is served by this
// same script rather than a translated shell script that would drift.
import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNodeFloor, binEntries, installAndBuild } from "../../scripts/agent-surface/mcp-build.mjs";
import { pinnedNodePath, writeShims } from "../../scripts/agent-surface/mcp-shims.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(here, "package.json"), "utf8"));

assertNodeFloor("synapse");
// tsc never deletes output, so a rebuild over an old dist would keep files no source produces any more.
rmSync(path.join(here, "dist"), { recursive: true, force: true });
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

console.log("Point your MCP host at the stdio command: synapse-bridge");
console.log("Restart host sessions that were open during this install; they keep running the build they started with");
