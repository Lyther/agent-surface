#!/usr/bin/env node
// grimoire — build the server, link the bins into ~/.local/bin, and build the read-only index from
// the pinned skill pack(s). Idempotent: re-running rebuilds the index (write-once + fail-closed
// publication) and re-links. The index + manifest live under ~/.grimoire.
// If a required pack is absent the install FAILS; any existing index is left untouched until
// publication, and a clean machine then reports INDEX_MISSING.
//
// Runs under Node on every platform, which grimoire already requires, so this same script serves
// Windows rather than a translated shell script that would drift.
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNodeFloor, binEntries, installAndBuild, run } from "../../scripts/agent-surface/mcp-build.mjs";
import { writeShims } from "../../scripts/agent-surface/mcp-shims.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const manifest = JSON.parse(readFileSync(path.join(here, "package.json"), "utf8"));

assertNodeFloor("grimoire");
installAndBuild(here);

// Wrapper targets come from package.json#bin so a launcher path can never drift from the declared
// entry points (grimoire-index -> dist/src/indexer.js, not index.js). Linked BEFORE indexing so a
// pack-less checkout still gets a working server that honestly reports INDEX_MISSING.
const binDir = path.join(os.homedir(), ".local", "bin");
for (const written of writeShims({
  binDir,
  nodeBin: process.execPath, // the Node this installer validated, not whatever PATH resolves later
  entries: binEntries(here, manifest),
  override: "GRIMOIRE_NODE",
})) console.log(`installed ${written}`);

const pathEntries = (process.env.PATH ?? "").split(path.delimiter);
const onPath = process.platform === "win32"
  ? pathEntries.some((entry) => entry.toLowerCase() === binDir.toLowerCase())
  : pathEntries.includes(binDir);
if (!onPath) console.log(`NOTE: add ${binDir} to your PATH`);

// Build the index from the pinned packs (served_by grimoire in registry/optional-services.json).
// A required pack that is absent FAILS rather than silently succeeding without rebuilding. The
// indexer builds temp artifacts before publishing; interruption between the two final renames
// reports INDEX_STALE and is repaired by rerunning this installer.
run(process.execPath, [
  path.join(here, "dist", "src", "served-packs.js"),
  "--repo", repo,
  "--index",
  "--indexer", path.join(here, "dist", "src", "indexer.js"),
], { label: "grimoire index build" });

console.log("Point your MCP host at the stdio command: grimoire-server");
