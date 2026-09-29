#!/usr/bin/env node
// Installer-wide destination ownership (contract Migration steps 2, 3, 6 and 7), exercised through the
// real CLI against disposable install roots. POSIX only, like the rest of `npm test`: the Windows CI
// job runs the platform suites instead.
//
// SUBSTITUTE_JUSTIFICATION
// - substitute: a scratch HOME and XDG_CONFIG_HOME for every install, with the operator's real
//   first-party MCP binaries linked into its ~/.local/bin
// - replaces: the operator's real home directory
// - necessity: installs materialize launchers and read config under HOME; the operator's home must
//   stay untouched and the result must not depend on its contents
// - real-option: the real CLI, planner, filesystem and MCP binaries run unchanged; only the home
//   location differs
// - proof-limit: proves ownership inside install roots, not anything about the operator's own profile
// - real-proof: a read-only `install --target all --scope user --dry-run` against the real HOME
//   plans no unowned destination and no unreadable manifest (recorded in the RT2.0 review)
import assert from "node:assert/strict";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { disposableCheckout, status } from "../lib/helpers.mjs";

if (process.platform === "win32") {
  console.log("ownership: skipped on Windows (POSIX suite)");
  process.exit(0);
}

const scratch = mkdtempSync(path.join(os.tmpdir(), "agent-surface-ownership-"));
const home = path.join(scratch, "home");
mkdirSync(home);
const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config") };

// These installs wire the first-party MCP servers, whose binaries `npm run install:mcps` links into
// ~/.local/bin (CI runs it before the suite). Link those real binaries into the scratch HOME so the
// prerequisite check finds them; nothing stands in for them.
const operatorBin = path.join(os.homedir(), ".local", "bin");
mkdirSync(path.join(home, ".local", "bin"), { recursive: true });
for (const name of ["grimoire-server", "synapse-bridge"]) {
  assert.ok(existsSync(path.join(operatorBin, name)), `${name} is missing; run npm run install:mcps first`);
  symlinkSync(path.join(operatorBin, name), path.join(home, ".local", "bin", name));
}
const shipDeploy = path.join(".agents", "skills", "ship-deploy", "SKILL.md");

function install(args, cli = null) {
  const result = cli
    ? spawnSync(process.execPath, [cli, "install", ...args], { encoding: "utf8", env })
    : status(["install", ...args], { env });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

function project(dest, target, extra = []) {
  return install(["--target", target, "--scope", "project", "--dest", dest, ...extra]);
}

function manifest(dest, target) {
  const file = path.join(dest, ".agent-surface", `${target}-manifest.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

function claims(dest, target, output) {
  return manifest(dest, target)?.managed.some((entry) => entry.output === output) ?? false;
}

function read(dest, relative) {
  return readFileSync(path.join(dest, relative), "utf8");
}

// Every directory and file under a root, with file contents, to prove a refused plan changed nothing.
function snapshot(dir, entries = {}, base = dir) {
  if (!existsSync(dir)) return entries;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(base, full);
    if (entry.isDirectory()) {
      entries[`${relative}${path.sep}`] = "directory";
      snapshot(full, entries, base);
    } else {
      entries[relative] = readFileSync(full, "utf8");
    }
  }
  return entries;
}

function count(text, pattern) {
  return text.match(pattern)?.length ?? 0;
}

function escapeRegExp(text) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The VS Code profile root of the old nested layouts, read from the plan so it follows the platform.
function vsCodeUserRootOf(dest, target, file) {
  const plan = install(["--target", target, "--scope", "user", "--dest", dest, "--dry-run"]);
  const planned = plan.out.split("\n").map((line) => line.trim())
    .find((line) => line.endsWith(`instructions${path.sep}${file} <- rules/*.mdc`))
    ?.split(" <- ")[0];
  assert.ok(planned, plan.out);
  return path.dirname(path.dirname(planned));
}

try {
  // Step 2, no claim: an existing file nobody claims blocks the whole plan, differing or identical,
  // with nothing written and nothing adopted into a manifest.
  {
    const dest = path.join(scratch, "unowned-differing");
    mkdirSync(dest, { recursive: true });
    writeFileSync(path.join(dest, "AGENTS.md"), "# Operator rules\n");
    const before = snapshot(dest);
    const preview = project(dest, "openhands", ["--category", "rules", "--dry-run"]);
    assert.equal(preview.code, 1, preview.out);
    assert.match(preview.out, /^ {2}UNOWNED_DESTINATION: AGENTS\.md exists and no agent-surface manifest in this install root claims it; move or remove it, then rerun$/m);
    const live = project(dest, "openhands", ["--category", "rules"]);
    assert.equal(live.code, 1, live.out);
    assert.deepEqual(snapshot(dest), before, "a refused plan writes nothing, manifest included");
  }
  const rulesReference = path.join(scratch, "reference");
  assert.equal(project(rulesReference, "openhands", ["--category", "rules"]).code, 0);
  {
    const dest = path.join(scratch, "unowned-identical");
    mkdirSync(dest, { recursive: true });
    writeFileSync(path.join(dest, "AGENTS.md"), read(rulesReference, "AGENTS.md"));
    const before = snapshot(dest);
    const live = project(dest, "openhands", ["--category", "rules"]);
    assert.equal(live.code, 1, live.out);
    assert.match(live.out, /UNOWNED_DESTINATION: AGENTS\.md /);
    assert.deepEqual(snapshot(dest), before, "an identical unowned file is not adopted");
  }

  // Step 2, differing bytes with another owner's claim: regenerated, with a warning naming the
  // contribution the selection drops. Another target's manifest is not a veto.
  {
    const dest = path.join(scratch, "droid-then-openhands");
    const droid = project(dest, "droid", ["--category", "development"]);
    assert.equal(droid.code, 0, droid.out);
    const preview = project(dest, "openhands", ["--category", "rules", "--dry-run"]);
    assert.equal(preview.code, 0, preview.out);
    assert.match(preview.out, /^ {2}SHARED_CONTRIBUTION_REPLACED: AGENTS\.md drops droid's development contribution; installing --target droid --category development into this root restores it$/m);
    const live = project(dest, "openhands", ["--category", "rules"]);
    assert.equal(live.code, 0, live.out);
    assert.equal(read(dest, "AGENTS.md"), read(rulesReference, "AGENTS.md"), "the shared file now holds the rules-only render");
    assert.ok(claims(dest, "droid", "AGENTS.md") && claims(dest, "openhands", "AGENTS.md"), "both owners keep their claim");
  }
  {
    // One warning per path names every owner whose recorded category the selection drops.
    const dest = path.join(scratch, "two-owners-then-openhands");
    assert.equal(project(dest, "zed", ["--category", "development"]).code, 0);
    assert.equal(project(dest, "droid", ["--category", "development"]).code, 0);
    const preview = project(dest, "openhands", ["--category", "rules", "--dry-run"]);
    assert.equal(preview.code, 0, preview.out);
    assert.match(preview.out, /^ {2}SHARED_CONTRIBUTION_REPLACED: AGENTS\.md drops droid's development and zed's development contributions; installing --target droid --category development or --target zed --category development into this root restores them$/m);
    assert.equal(count(preview.out, /SHARED_CONTRIBUTION_REPLACED/g), 1, "listed once per path");
  }

  // Two development co-owners: individual reset, last-owner release, return to development, joint
  // reset and repeat, all without editing a manifest.
  {
    const dest = path.join(scratch, "co-owners");
    assert.equal(project(dest, "openhands", ["--category", "development"]).code, 0);
    const second = project(dest, "zed", ["--category", "development"]);
    assert.equal(second.code, 0, second.out);
    assert.ok(claims(dest, "zed", "AGENTS.md") && claims(dest, "zed", shipDeploy), "identical shared bytes become co-owned");

    const zedReset = project(dest, "zed");
    assert.equal(zedReset.code, 0, zedReset.out);
    assert.match(zedReset.out, /SHARED_CONTRIBUTION_REPLACED: AGENTS\.md drops openhands's development contribution/);
    assert.match(zedReset.out, new RegExp(`^ {2}${escapeRegExp(shipDeploy)} \\(claimed by openhands\\)$`, "m"), "the retained path names who keeps it");
    assert.ok(existsSync(path.join(dest, shipDeploy)), "cleanup retains a file another owner still claims");
    assert.ok(!claims(dest, "zed", shipDeploy), "the withdrawing target drops only its own claim");
    assert.ok(claims(dest, "openhands", shipDeploy));
    const generalBytes = read(dest, "AGENTS.md");

    const openhandsReset = project(dest, "openhands");
    assert.equal(openhandsReset.code, 0, openhandsReset.out);
    assert.doesNotMatch(openhandsReset.out, /SHARED_CONTRIBUTION_REPLACED/, "the shared file already holds the general render, so nothing is replaced");
    assert.equal(read(dest, "AGENTS.md"), generalBytes);
    assert.ok(!existsSync(path.join(dest, shipDeploy)), "the last owner's release deletes the file");

    assert.equal(project(dest, "openhands", ["--category", "development"]).code, 0, "return to development");
    assert.equal(project(dest, "zed", ["--category", "development"]).code, 0, "return to development");

    const joint = install(["--target", "openhands,zed", "--scope", "project", "--dest", dest]);
    assert.equal(joint.code, 0, joint.out);
    assert.doesNotMatch(joint.out, /also planned by/, "co-selected targets render identical shared bytes");
    assert.doesNotMatch(joint.out, /SHARED_CONTRIBUTION_REPLACED/, "participants are judged by their next manifests");
    assert.ok(!existsSync(path.join(dest, shipDeploy)), "two participants that both stop claiming a path both remove it");

    const repeat = install(["--target", "openhands,zed", "--scope", "project", "--dest", dest]);
    assert.equal(repeat.code, 0, repeat.out);
    assert.equal(count(repeat.out, /^ {2}wrote: 0$/gm), 2, "a repeat install writes nothing");
    assert.equal(count(repeat.out, /^ {2}removed stale: 0$/gm), 2, "a repeat install removes nothing");
  }

  // Every path several targets share renders identical bytes for one selection, so a joint plan
  // over all targets has no same-run conflict.
  for (const selection of [[], ["--category", "development"], ["--category", "rules"]]) {
    const label = `project all ${selection.join(" ") || "general"}`;
    const plan = install(["--target", "all", "--scope", "project", "--dest", path.join(scratch, "all-project"), ...selection, "--dry-run"]);
    assert.equal(plan.code, 0, `${label}: ${plan.out}`);
    assert.ok(count(plan.out, /^target: /gm) >= 20, `${label} plans every target`);
    assert.doesNotMatch(plan.out, /also planned by/, label);
  }

  // Claim sources: any <id>-manifest.json directly in .agent-surface/, unknown targets included;
  // other files there are not manifests; an unreadable or malformed manifest blocks the root once.
  // SUBSTITUTE_JUSTIFICATION
  // - substitute: hand-written manifests for an unknown owner, with a valid and an unrecognized
  //   category, plus unparsable, content-bearing and malformed manifests
  // - replaces: manifests left by a retired target, another tool or a damaged disk
  // - necessity: no shipped target produces these states, and each needs an exact shape
  // - real-option: the real planner reads them from a real install root through the real CLI
  // - proof-limit: proves how the planner treats these shapes, not how they arose
  // - real-proof: none for foreign or damaged manifests; manifests the installer writes itself are
  //   exercised by every other case in this suite
  {
    const dest = path.join(scratch, "discovery");
    const agentSurface = path.join(dest, ".agent-surface");
    mkdirSync(agentSurface, { recursive: true });
    writeFileSync(path.join(dest, "AGENTS.md"), "written by targets this checkout no longer knows\n");
    for (const [owner, category] of [["former-host", "development"], ["odd-host", "Not A Category!"]]) {
      writeFileSync(path.join(agentSurface, `${owner}-manifest.json`), `${JSON.stringify({
        target: owner,
        scope: "project",
        managed: [{ target: owner, source: "rules/*.mdc", output: "AGENTS.md", asset_category: category }],
        config_entries: [],
      })}\n`);
    }
    writeFileSync(path.join(agentSurface, "notes.json"), "not a manifest");
    const claimed = project(dest, "openhands", ["--category", "rules"]);
    assert.equal(claimed.code, 0, claimed.out);
    assert.match(claimed.out, /^ {2}SHARED_CONTRIBUTION_REPLACED: AGENTS\.md drops former-host's development and odd-host's unrecognized contributions; no selectable target restores them$/m);
    assert.doesNotMatch(claimed.out, /Not A Category!/, "a foreign category value is not echoed");

    writeFileSync(path.join(agentSurface, "broken-manifest.json"), "{LEAKMARK");
    const broken = project(dest, "openhands", ["--category", "rules", "--dry-run"]);
    assert.equal(broken.code, 1, broken.out);
    assert.match(broken.out, new RegExp(`^install blocked: ${escapeRegExp(dest)}: MANIFEST_UNREADABLE: \\.agent-surface[\\\\/]broken-manifest\\.json is not valid JSON; `, "m"));
    assert.equal(count(broken.out, /MANIFEST_UNREADABLE/g), 1, "the root block is listed once");
    assert.doesNotMatch(broken.out, /LEAKMARK/, "the report never prints manifest content");
    assert.doesNotMatch(broken.out, /UNOWNED_DESTINATION/, "an incomplete claim set reports no unowned files");
    rmSync(path.join(agentSurface, "broken-manifest.json"));

    // A corrupt own manifest, in a root where only that target claims its files: without its claims
    // every installed file would look unowned, so the root block must stand alone.
    const ownRoot = path.join(scratch, "corrupt-own");
    assert.equal(project(ownRoot, "openhands").code, 0);
    writeFileSync(path.join(ownRoot, ".agent-surface", "openhands-manifest.json"), "{");
    const corruptOwn = project(ownRoot, "openhands", ["--dry-run"]);
    assert.equal(corruptOwn.code, 1, corruptOwn.out);
    assert.equal(count(corruptOwn.out, /MANIFEST_UNREADABLE: \.agent-surface[\\/]openhands-manifest\.json /g), 1);
    assert.doesNotMatch(corruptOwn.out, /UNOWNED_DESTINATION/, "a corrupt own manifest does not turn its files into unowned ones");

    writeFileSync(path.join(agentSurface, "odd-config-manifest.json"), `${JSON.stringify({
      target: "odd-config",
      managed: [],
      config_entries: [{ path: "mcp.json", ids: ["synapse"] }],
    })}\n`);
    const malformed = project(dest, "openhands", ["--category", "rules", "--dry-run"]);
    assert.equal(malformed.code, 1, malformed.out);
    assert.match(malformed.out, /MANIFEST_UNREADABLE: \.agent-surface[\\/]odd-config-manifest\.json config entry 0 /);
  }

  // Claim sources: outputs recorded inside a legacy-listed nested manifest belong to that target,
  // rebased to the nested manifest's root (Copilot's pre-146d8e8 user root). Cleaning up the nested
  // manifest never removes what it recorded, and a recorded file left without a claim is listed.
  // SUBSTITUTE_JUSTIFICATION
  // - substitute: hand-written nested manifests in the pre-146d8e8 layout and the files they record
  // - replaces: a profile last installed by an agent-surface release older than 146d8e8
  // - necessity: running that release needs a separate checkout and install per case; its nested
  //   layout is fixed history, and these files match the shape it writes
  // - real-option: the shipped legacy-owned.json entries and the real planner and apply run unchanged
  // - proof-limit: proves handling of that layout, not every historical manifest variant
  // - real-proof: the RT2.0 review ran the pre-146d8e8 release from git history for vscode and
  //   copilot, got real nested manifests of this shape, and upgraded that home cleanly
  {
    const dest = path.join(scratch, "copilot-legacy");
    const nestedRoot = vsCodeUserRootOf(dest, "copilot", "agent-surface-copilot.instructions.md");
    const instructions = path.join(nestedRoot, "instructions", "agent-surface-copilot.instructions.md");
    const nestedManifest = path.join(nestedRoot, ".agent-surface", "copilot-manifest.json");
    const retiredRecord = path.join("instructions", "retired-copilot.instructions.md");
    mkdirSync(path.join(dest, path.dirname(nestedManifest)), { recursive: true });
    writeFileSync(path.join(dest, nestedManifest), `${JSON.stringify({
      target: "copilot",
      scope: "user",
      managed: [
        { target: "copilot", source: "rules/*.mdc", output: path.join("instructions", "agent-surface-copilot.instructions.md") },
        { target: "copilot", source: "rules/*.mdc", output: retiredRecord },
      ],
      config_entries: [],
    })}\n`);
    mkdirSync(path.join(dest, path.dirname(instructions)), { recursive: true });
    writeFileSync(path.join(dest, instructions), "instructions from an older copilot install\n");
    writeFileSync(path.join(dest, nestedRoot, retiredRecord), "retired by an older copilot install\n");
    const live = install(["--target", "copilot", "--scope", "user", "--dest", dest]);
    assert.equal(live.code, 0, live.out);
    assert.notEqual(read(dest, instructions), "instructions from an older copilot install\n");
    assert.ok(!existsSync(path.join(dest, nestedManifest)), "the legacy nested manifest itself is cleaned up");
    assert.equal(read(dest, path.join(nestedRoot, retiredRecord)), "retired by an older copilot install\n", "a nested claim never authorizes a removal");
    assert.match(live.out, new RegExp(`^legacy paths left in place without a claim:\\n {2}${escapeRegExp(path.join(nestedRoot, retiredRecord))}$`, "m"));
  }
  {
    // A nested file deleted on other authority is not reported as left in place, and another
    // target's nested claim keeps a stale path alive.
    // SUBSTITUTE_JUSTIFICATION
    // - substitute: the nested manifests above plus a hand-written current vscode manifest that
    //   still claims a prompt vscode no longer renders
    // - replaces: a profile whose vscode manifest predates the removal of that prompt
    // - necessity: no shipped release writes that exact combination of claims
    // - real-option: the shipped legacy registry, planner and apply run unchanged
    // - proof-limit: proves how retention and release listing combine, not how the state arose
    // - real-proof: none for this combination; each claim source alone has a real-path case here
    const dest = path.join(scratch, "vscode-legacy");
    const nestedRoot = vsCodeUserRootOf(dest, "vscode", "agent-surface.instructions.md");
    const legacyPrompt = path.join(nestedRoot, "prompts", "agent-surface.prompt.md");
    const sharedPrompt = path.join(nestedRoot, "prompts", "shared.prompt.md");
    mkdirSync(path.join(dest, nestedRoot, "prompts"), { recursive: true });
    mkdirSync(path.join(dest, nestedRoot, ".agent-surface"), { recursive: true });
    mkdirSync(path.join(dest, ".agent-surface"), { recursive: true });
    writeFileSync(path.join(dest, legacyPrompt), "prompt from an older vscode install\n");
    writeFileSync(path.join(dest, sharedPrompt), "prompt an older copilot install still records\n");
    writeFileSync(path.join(dest, nestedRoot, ".agent-surface", "vscode-manifest.json"), `${JSON.stringify({
      target: "vscode",
      scope: "user",
      managed: [{ target: "vscode", source: "commands/*.md", output: path.join("prompts", "agent-surface.prompt.md") }],
      config_entries: [],
    })}\n`);
    writeFileSync(path.join(dest, nestedRoot, ".agent-surface", "copilot-manifest.json"), `${JSON.stringify({
      target: "copilot",
      scope: "user",
      managed: [{ target: "copilot", source: "commands/*.md", output: path.join("prompts", "shared.prompt.md") }],
      config_entries: [],
    })}\n`);
    writeFileSync(path.join(dest, ".agent-surface", "vscode-manifest.json"), `${JSON.stringify({
      target: "vscode",
      scope: "user",
      managed: [{ target: "vscode", source: "commands/*.md", output: sharedPrompt }],
      config_entries: [],
    })}\n`);
    const live = install(["--target", "vscode", "--scope", "user", "--dest", dest]);
    assert.equal(live.code, 0, live.out);
    assert.ok(!existsSync(path.join(dest, legacyPrompt)), "vscode's own legacy entry removes the old prompt");
    assert.doesNotMatch(live.out, /^legacy paths left in place without a claim:$/m, "a deleted file is not left in place");
    assert.match(live.out, new RegExp(`^ {2}${escapeRegExp(sharedPrompt)} \\(claimed by copilot\\)$`, "m"));
    assert.equal(read(dest, sharedPrompt), "prompt an older copilot install still records\n", "another target's nested claim retains it");
    assert.ok(!claims(dest, "vscode", sharedPrompt), "vscode drops only its own claim");
  }

  // The same-run conflict still refuses genuinely differing bytes at one path. No shipped pair of
  // producers renders them any more, so a disposable checkout restores one host-specific header.
  // SUBSTITUTE_JUSTIFICATION
  // - substitute: a disposable copy of the checkout whose Zed producer keeps its own project
  //   AGENTS.md header
  // - replaces: two producers that genuinely render differing bytes at one path
  // - necessity: the target-neutral header removed the last natural trigger, and the guard must
  //   still hold for a future producer
  // - real-option: the copy runs the real CLI, planner and filesystem; only one producer line differs
  // - proof-limit: proves the guard, not that any shipped producer pair conflicts
  // - real-proof: none exists; the shipped producers are proven conflict-free by the all-target plans above
  {
    const checkout = disposableCheckout("agent-surface-conflict-");
    try {
      const producers = path.join(checkout, "scripts", "agent-surface", "targets.mjs");
      const shared = 'const shared = context.scope === "project" && relativeOutput === "AGENTS.md";';
      const source = readFileSync(producers, "utf8");
      assert.equal(count(source, new RegExp(escapeRegExp(shared), "g")), 1, "the neutral-header condition is where this case expects it");
      writeFileSync(producers, source.replace(shared, `${shared.slice(0, -1)} && label !== "Zed instructions";`));
      const dest = path.join(scratch, "conflict");
      const cli = path.join(checkout, "scripts", "agent-surface.mjs");
      const conflict = install(["--target", "openhands,zed", "--scope", "project", "--dest", dest], cli);
      assert.equal(conflict.code, 1, conflict.out);
      assert.match(conflict.out, /^ {2}output AGENTS\.md also planned by zed$/m);
      assert.match(conflict.out, /^ {2}output AGENTS\.md also planned by openhands$/m);
      assert.ok(!existsSync(dest), "a conflicting run writes nothing");
    } finally {
      rmSync(checkout, { recursive: true, force: true });
    }
  }

  // Step 4: an owned route migration. Poolside's personal instructions moved from .poolside to the
  // documented AGENTS.md.
  // SUBSTITUTE_JUSTIFICATION
  // - substitute: a disposable checkout with the Poolside route and its migration declaration
  //   reverted (two edits), standing in for the release before the move; a second copy whose
  //   migration records an ignored-route qualification (one edit); a read-only skill file that
  //   makes one write fail after the replacement has landed; and a hand-written manifest for an
  //   unknown owner that co-claims the old route
  // - replaces: installs made by earlier releases, a native qualification that does not exist yet,
  //   and a real mid-apply I/O failure
  // - necessity: the old layout must be produced without git history, the kept-with-a-warning branch
  //   has no real qualification to trigger it, and the interrupted case needs a deterministic failure
  //   between the replacement write and the old route's removal
  // - real-option: every run uses the real CLI, planner, apply and filesystem
  // - proof-limit: proves the migration rule, not whether Poolside reads or ignores either file
  // - real-proof: the RT2.1 review upgraded real installs made from 67df0b3 and f237274 archives in
  //   scratch roots: the identical route migrated and the differing one blocked. Native discovery
  //   of both routes remains an open RT2.1 qualification
  {
    const legacy = path.join(".config", "poolside", ".poolside");
    const current = path.join(".config", "poolside", "AGENTS.md");
    const oldRelease = disposableCheckout("agent-surface-pool-old-");
    const ignoring = disposableCheckout("agent-surface-pool-ignored-");
    const patch = (checkout, relative, from, to) => {
      const file = path.join(checkout, relative);
      const source = readFileSync(file, "utf8");
      assert.equal(count(source, new RegExp(escapeRegExp(from), "g")), 1, `${relative} holds the line this case patches`);
      writeFileSync(file, source.replace(from, to));
    };
    try {
      patch(oldRelease, "scripts/agent-surface/roots.mjs", 'path.join(".config", "poolside", "AGENTS.md") : "AGENTS.md"', 'path.join(".config", "poolside", ".poolside") : "AGENTS.md"');
      patch(oldRelease, "scripts/agent-surface/targets.mjs", "routeMigrations: [{ from: poolLegacyInstructionPath, to: poolInstructionPath, ignoredBy: null }],", "routeMigrations: [],");
      patch(ignoring, "scripts/agent-surface/targets.mjs", "ignoredBy: null }]", 'ignoredBy: "a recorded discovery qualification" }]');
      const oldCli = path.join(oldRelease, "scripts", "agent-surface.mjs");
      const ignoringCli = path.join(ignoring, "scripts", "agent-surface.mjs");
      const user = (dest, extra = [], cli = null) => install(["--target", "pool", "--scope", "user", "--dest", dest, ...extra], cli);
      const differ = (dest) => writeFileSync(path.join(dest, legacy), `${read(dest, legacy)}\n# operator note\n`);

      {
        // Identical old route: the replacement is written, then the old file removed.
        const dest = path.join(scratch, "pool-identical");
        assert.equal(user(dest, [], oldCli).code, 0);
        assert.ok(claims(dest, "pool", legacy), "the earlier release owns .poolside");
        const unrelated = path.join(".config", "poolside", "notes.md");
        writeFileSync(path.join(dest, unrelated), "operator notes\n");
        const upgrade = user(dest);
        assert.equal(upgrade.code, 0, upgrade.out);
        assert.match(upgrade.out, new RegExp(`^planned route migrations:\\n {2}${escapeRegExp(legacy)} -> ${escapeRegExp(current)}: identical to the replacement; removed after it is written$`, "m"));
        assert.match(upgrade.out, /^planned stale managed removals:\n {2}none$/m, "the migration is not reported as stale cleanup");
        assert.match(upgrade.out, /^ {2}removed stale: 0\n {2}removed migrated routes: 1$/m);
        assert.ok(!existsSync(path.join(dest, legacy)) && existsSync(path.join(dest, current)));
        assert.equal(read(dest, unrelated), "operator notes\n");
        assert.ok(!claims(dest, "pool", legacy) && claims(dest, "pool", current));
        const repeat = user(dest);
        assert.equal(repeat.code, 0, repeat.out);
        assert.match(repeat.out, /^ {2}wrote: 0$/m);
        assert.match(repeat.out, /^ {2}removed stale: 0$/m);
      }
      {
        // Differing old route, discovery unproven: refused before anything changes, and a selection
        // that writes no replacement leaves the old route alone and claimed.
        const dest = path.join(scratch, "pool-differing");
        assert.equal(user(dest, [], oldCli).code, 0);
        differ(dest);
        const before = snapshot(dest);
        const upgrade = user(dest);
        assert.equal(upgrade.code, 1, upgrade.out);
        assert.match(upgrade.out, new RegExp(`MIGRATION_SOURCE_CONFLICT: ${escapeRegExp(legacy)} differs from its replacement ${escapeRegExp(current)}, `));
        assert.doesNotMatch(upgrade.out, /operator note/, "the diagnostic prints no file contents");
        assert.deepEqual(snapshot(dest), before, "a refused migration changes nothing");
        const skillsOnly = user(dest, ["--category", "skills"]);
        assert.equal(skillsOnly.code, 0, skillsOnly.out);
        assert.equal(read(dest, legacy), before[legacy]);
        assert.ok(claims(dest, "pool", legacy), "the old route stays claimed while nothing replaces it");
        // Following the advice clears it: once the old file is removed, the rerun writes the
        // replacement and drops the old claim.
        rmSync(path.join(dest, legacy));
        const resolved = user(dest);
        assert.equal(resolved.code, 0, resolved.out);
        assert.match(resolved.out, new RegExp(`^ {2}${escapeRegExp(legacy)} -> ${escapeRegExp(current)}: already gone; its claim ends$`, "m"));
        assert.ok(existsSync(path.join(dest, current)) && !claims(dest, "pool", legacy));
      }
      if (process.getuid?.() !== 0) {
        // Interrupted after the replacement landed: the old route outlives every write, the pending
        // manifest keeps it claimed, and the rerun finishes the migration.
        const dest = path.join(scratch, "pool-interrupted");
        assert.equal(user(dest, [], oldCli).code, 0);
        const skill = path.join(".config", "poolside", "skills", "ops-ask", "SKILL.md");
        writeFileSync(path.join(dest, skill), `${read(dest, skill)}\n# operator edit\n`);
        chmodSync(path.join(dest, skill), 0o444);
        const first = user(dest);
        chmodSync(path.join(dest, skill), 0o644);
        assert.notEqual(first.code, 0, first.out);
        assert.match(first.out, new RegExp(`^install interrupted: pool: ${escapeRegExp(skill)}: `, "m"));
        assert.ok(existsSync(path.join(dest, current)), "the replacement landed before the failure");
        assert.ok(existsSync(path.join(dest, legacy)), "the old route is removed only after every write");
        assert.ok(claims(dest, "pool", legacy) && claims(dest, "pool", current), "the pending manifest claims both routes");
        const rerun = user(dest);
        assert.equal(rerun.code, 0, rerun.out);
        assert.ok(!existsSync(path.join(dest, legacy)) && !claims(dest, "pool", legacy));
      }
      {
        // An old route reached through a symbolic link is refused before anything changes, and the
        // link's target is left alone.
        const dest = path.join(scratch, "pool-symlinked");
        assert.equal(user(dest, [], oldCli).code, 0);
        const target = path.join(scratch, "pool-symlink-target");
        writeFileSync(target, read(dest, legacy));
        rmSync(path.join(dest, legacy));
        symlinkSync(target, path.join(dest, legacy));
        const upgrade = user(dest);
        assert.equal(upgrade.code, 1, upgrade.out);
        assert.match(upgrade.out, new RegExp(`^ {2}migrated route ${escapeRegExp(legacy)} traverses symbolic link: `, "m"));
        assert.ok(lstatSync(path.join(dest, legacy)).isSymbolicLink() && existsSync(target));
        assert.ok(!existsSync(path.join(dest, current)), "a refused plan writes nothing");
      }
      {
        // The moved document keeps the category contribution its old route recorded, even once the
        // old file is gone: a narrower selection may not overwrite the development document.
        const dest = path.join(scratch, "pool-category");
        assert.equal(user(dest, ["--category", "development"], oldCli).code, 0);
        rmSync(path.join(dest, legacy));
        const before = snapshot(dest);
        const rules = user(dest, ["--category", "rules"]);
        assert.equal(rules.code, 1, rules.out);
        assert.match(rules.out, new RegExp(`${escapeRegExp(current)} replaces ${escapeRegExp(legacy)}, which carries the development category's contribution`));
        assert.deepEqual(snapshot(dest), before);
        // The category that recorded the contribution still passes, and the moved document records it.
        const development = user(dest, ["--category", "development"]);
        assert.equal(development.code, 0, development.out);
        assert.match(development.out, new RegExp(`^ {2}${escapeRegExp(legacy)} -> ${escapeRegExp(current)}: already gone; its claim ends$`, "m"));
        assert.equal(manifest(dest, "pool").managed.find((entry) => entry.output === current)?.asset_category, "development");
      }
      {
        // An identical old route another owner still claims stays for that owner: only this target's
        // claim ends, and the route is listed once, as a migration.
        const dest = path.join(scratch, "pool-co-claimed");
        assert.equal(user(dest, [], oldCli).code, 0);
        writeFileSync(path.join(dest, ".agent-surface", "foreign-manifest.json"), `${JSON.stringify({
          target: "foreign",
          scope: "user",
          managed: [{ target: "foreign", source: "notes", output: legacy }],
          config_entries: [],
        })}\n`);
        const upgrade = user(dest);
        assert.equal(upgrade.code, 0, upgrade.out);
        assert.match(upgrade.out, new RegExp(`^ {2}${escapeRegExp(legacy)} -> ${escapeRegExp(current)}: identical to the replacement; kept, still claimed by foreign$`, "m"));
        assert.match(upgrade.out, /^planned stale managed paths retained for other owners:\n {2}none$/m);
        assert.ok(existsSync(path.join(dest, legacy)) && existsSync(path.join(dest, current)));
        assert.ok(!claims(dest, "pool", legacy) && claims(dest, "foreign", legacy));
      }
      {
        // Differing old route proven ignored: the replacement is written and the old file kept,
        // claimed and listed on every run until the operator removes it.
        const dest = path.join(scratch, "pool-ignored");
        assert.equal(user(dest, [], oldCli).code, 0);
        differ(dest);
        const kept = read(dest, legacy);
        const upgrade = user(dest, [], ignoringCli);
        assert.equal(upgrade.code, 0, upgrade.out);
        assert.match(upgrade.out, new RegExp(`^ {2}LEGACY_FILE_RETAINED: ${escapeRegExp(legacy)} differs from its replacement ${escapeRegExp(current)} and is kept, because a recorded discovery qualification shows the client ignores it; `, "m"));
        assert.equal(read(dest, legacy), kept);
        assert.ok(existsSync(path.join(dest, current)) && claims(dest, "pool", legacy));
        assert.match(user(dest, [], ignoringCli).out, /LEGACY_FILE_RETAINED/, "the warning repeats until the operator removes the file");
      }
      {
        // An old route this target does not own is not its to remove.
        const dest = path.join(scratch, "pool-unowned-legacy");
        mkdirSync(path.join(dest, ".config", "poolside"), { recursive: true });
        writeFileSync(path.join(dest, legacy), "operator notes\n");
        const fresh = user(dest);
        assert.equal(fresh.code, 0, fresh.out);
        assert.equal(read(dest, legacy), "operator notes\n");
        assert.doesNotMatch(fresh.out, /planned route migrations:|MIGRATION_SOURCE_CONFLICT/);
      }
      {
        // A personal AGENTS.md the operator already has is theirs: the new route blocks through the
        // unowned-destination rule and nothing changes.
        const dest = path.join(scratch, "pool-unowned-current");
        mkdirSync(path.join(dest, ".config", "poolside"), { recursive: true });
        writeFileSync(path.join(dest, current), "my instructions\n");
        const before = snapshot(dest);
        const fresh = user(dest);
        assert.equal(fresh.code, 1, fresh.out);
        assert.match(fresh.out, new RegExp(`UNOWNED_DESTINATION: ${escapeRegExp(current)} exists `));
        assert.deepEqual(snapshot(dest), before);
      }
      {
        // The default root with XDG_CONFIG_HOME moved: the route stays under ~/.config/poolside,
        // since agent-surface does not follow XDG_CONFIG_HOME.
        const xdg = path.join(scratch, "xdg");
        const result = status(["install", "--target", "pool", "--scope", "user", "--allow-scope-root"], { env: { ...env, XDG_CONFIG_HOME: xdg } });
        assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.ok(existsSync(path.join(home, current)) && !existsSync(path.join(home, legacy)));
        assert.ok(!existsSync(path.join(xdg, "poolside")));
      }
    } finally {
      rmSync(oldRelease, { recursive: true, force: true });
      rmSync(ignoring, { recursive: true, force: true });
    }
  }

  // Steps 6 and 7: every participant's pending manifest lands before the run's first mutation and
  // keeps an interrupted run's paths claimed, so rerunning the same selection finishes without
  // deleting anything by hand.
  // SUBSTITUTE_JUSTIFICATION
  // - substitute: a read-only install root whose pre-created subdirectories stay writable, so the
  //   skill writes land and the root-level AGENTS.md write, planned last, fails
  // - replaces: a real mid-apply I/O failure such as a full disk or a crash
  // - necessity: the late-failure path needs an I/O error after some writes have landed, deterministically
  // - real-option: the real planner, apply loop and filesystem run unchanged; only a directory mode is set
  // - proof-limit: proves recovery from one failed write, not from a process crash between two writes
  // - real-proof: the rerun below goes through the unmodified CLI against the same root
  if (process.getuid?.() !== 0) {
    const dest = path.join(scratch, "interrupted");
    const opsDocs = path.join(".agents", "skills", "ops-docs", "SKILL.md");
    mkdirSync(path.join(dest, ".agents", "skills"), { recursive: true });
    mkdirSync(path.join(dest, ".agent-surface"), { recursive: true });
    const joint = ["--target", "openhands,zed", "--scope", "project", "--dest", dest];
    chmodSync(dest, 0o555);
    const first = install(joint);
    chmodSync(dest, 0o755);
    assert.notEqual(first.code, 0, first.out);
    assert.match(first.out, /^install interrupted: openhands: AGENTS\.md: /m);
    assert.match(first.out, /^ {2}targets applied before it: none$/m);
    const [completed, pending] = first.out.split(/^ {2}pending for openhands: \d+$/m);
    assert.ok(pending, first.out);
    assert.match(completed, new RegExp(`^ {4}write ${escapeRegExp(opsDocs)}$`, "m"), "the report names what landed");
    assert.match(pending, /^ {4}write AGENTS\.md$/m, "the report names the failed write as pending");
    assert.match(pending, /^ {4}manifest \.agent-surface[\\/]openhands-manifest\.json$/m);
    assert.match(first.out, /^ {2}not applied: zed$/m);
    assert.ok(existsSync(path.join(dest, opsDocs)), "earlier writes landed before the failure");
    assert.ok(!existsSync(path.join(dest, "AGENTS.md")), "the failing write did not land");
    assert.ok(claims(dest, "openhands", opsDocs) && claims(dest, "openhands", "AGENTS.md"), "the pending manifest claims every planned path");
    assert.ok(claims(dest, "zed", opsDocs) && claims(dest, "zed", "AGENTS.md"), "a participant not yet applied already has its pending manifest");
    const rerun = install(joint);
    assert.equal(rerun.code, 0, rerun.out);
    assert.doesNotMatch(rerun.out, /UNOWNED_DESTINATION/);
    assert.ok(existsSync(path.join(dest, "AGENTS.md")), "the rerun finished the install");
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log("ownership: ok");
