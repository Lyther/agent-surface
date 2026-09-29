#!/usr/bin/env node
// Per-OS install routes, planned through the real CLI on the OS that runs the suite. On macOS and Linux
// (`npm test`) it confirms the unchanged ~/.config routes; the Windows CI job runs it natively, where
// it covers the AppData routes and the cleanup of what pre-fix Windows installs left behind.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { gooseMcpPath, zedInstructionPath, zedMcpPath } from "../../scripts/agent-surface/roots.mjs";
import { status } from "../lib/helpers.mjs";

const scratch = mkdtempSync(path.join(os.tmpdir(), "agent-surface-os-routes-"));
const home = path.join(scratch, "home");
mkdirSync(home);
const env = { ...process.env, HOME: home, USERPROFILE: home };
const windows = process.platform === "win32";

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function plan(target, dest) {
  const result = status(["install", "--target", target, "--scope", "user", "--dest", dest, "--dry-run"], { env });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

// A profile's pre-fix state: files and config entries a Windows install recorded before the per-OS
// route, which the Windows client never reads.
function writeOldInstall(dest, target, { managed = [], configRoute, format, root, servers = ["grimoire", "synapse"] }) {
  mkdirSync(path.join(dest, ".agent-surface"), { recursive: true });
  for (const output of managed) {
    mkdirSync(path.dirname(path.join(dest, output)), { recursive: true });
    writeFileSync(path.join(dest, output), "written by an earlier install\n");
  }
  mkdirSync(path.dirname(path.join(dest, configRoute)), { recursive: true });
  writeFileSync(path.join(dest, configRoute), root);
  writeFileSync(path.join(dest, ".agent-surface", `${target}-manifest.json`), `${JSON.stringify({
    target,
    scope: "user",
    managed: managed.map((output) => ({ target, source: "rules/*.mdc", output })),
    config_entries: [{ path: configRoute, format, ids: servers }],
  }, null, 2)}\n`);
}

try {
  const zedInstructions = zedInstructionPath({ scope: "user" });
  const zedSettings = zedMcpPath({ scope: "user" });
  const gooseConfig = gooseMcpPath({ scope: "user" });
  assert.equal(zedInstructions, windows ? path.join("AppData", "Roaming", "Zed", "AGENTS.md") : path.join(".config", "zed", "AGENTS.md"));
  assert.equal(gooseConfig, windows ? path.join("AppData", "Roaming", "Block", "goose", "config", "config.yaml") : path.join(".config", "goose", "config.yaml"));
  {
    const zed = plan("zed", path.join(scratch, "zed-fresh"));
    assert.equal(zed.code, 0, zed.out);
    assert.match(zed.out, new RegExp(`^ {2}${escapeRegExp(zedInstructions)} <- `, "m"));
    assert.match(zed.out, new RegExp(`^ {2}${escapeRegExp(zedSettings)} MCP \\+= `, "m"));
    const goose = plan("goose", path.join(scratch, "goose-fresh"));
    assert.equal(goose.code, 0, goose.out);
    assert.match(goose.out, new RegExp(`^ {2}${escapeRegExp(gooseConfig)} MCP \\+= `, "m"));
  }

  // A Windows profile installed before the per-OS routes: the old ~/.config settings go through
  // obsolete-route cleanup, a differing personal AGENTS.md is kept with a warning because Windows Zed
  // never reads it, and nothing blocks.
  // SUBSTITUTE_JUSTIFICATION
  // - substitute: hand-written manifests and files in the shape the pre-fix installer recorded
  // - replaces: a Windows profile installed by a release before the per-OS routes
  // - necessity: this checkout cannot produce the old Windows layout, and no such profile is kept
  // - real-option: the real CLI plans against a real root on a real Windows runner
  // - proof-limit: proves the plan, not the apply or either client's own loading
  // - real-proof: none yet; a Windows profile upgraded from an older release would supply it
  if (windows) {
    const zedDest = path.join(scratch, "zed-windows-upgrade");
    const oldZedInstructions = path.join(".config", "zed", "AGENTS.md");
    const oldZedSettings = path.join(".config", "zed", "settings.json");
    writeOldInstall(zedDest, "zed", {
      managed: [oldZedInstructions],
      configRoute: oldZedSettings,
      format: "zed-context-servers",
      root: `${JSON.stringify({ theme: "mono", context_servers: { grimoire: { command: "old" }, synapse: { command: "old" } } }, null, 2)}\n`,
    });
    const zed = plan("zed", zedDest);
    assert.equal(zed.code, 0, zed.out);
    assert.match(zed.out, new RegExp(`^ {2}LEGACY_FILE_RETAINED: ${escapeRegExp(oldZedInstructions)} differs from its replacement ${escapeRegExp(zedInstructions)} and is kept, because `, "m"));
    assert.match(zed.out, new RegExp(`^planned route migrations:\\n {2}${escapeRegExp(oldZedInstructions)} -> ${escapeRegExp(zedInstructions)}: kept; see warnings$`, "m"));
    assert.doesNotMatch(zed.out, new RegExp(`^planned stale managed removals:\\n(?: {2}.*\\n)*? {2}${escapeRegExp(oldZedInstructions)}$`, "m"));
    assert.match(zed.out, new RegExp(`^ {2}${escapeRegExp(oldZedSettings)} MCP -= grimoire, synapse$`, "m"));
    assert.match(zed.out, new RegExp(`^ {2}${escapeRegExp(zedInstructions)} <- `, "m"));
    assert.match(zed.out, /^blocked:\n {2}none$/m);

    const gooseDest = path.join(scratch, "goose-windows-upgrade");
    const oldGooseConfig = path.join(".config", "goose", "config.yaml");
    writeOldInstall(gooseDest, "goose", {
      configRoute: oldGooseConfig,
      format: "goose-extensions",
      root: "extensions:\n  grimoire:\n    name: grimoire\n    type: stdio\n    cmd: old\n  synapse:\n    name: synapse\n    type: stdio\n    cmd: old\n",
    });
    const goose = plan("goose", gooseDest);
    assert.equal(goose.code, 0, goose.out);
    assert.match(goose.out, new RegExp(`^ {2}${escapeRegExp(oldGooseConfig)} MCP -= grimoire, synapse$`, "m"));
    assert.match(goose.out, new RegExp(`^ {2}${escapeRegExp(gooseConfig)} MCP \\+= `, "m"));
    assert.match(goose.out, /^blocked:\n {2}none$/m);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`os-routes: ok (${process.platform})`);
