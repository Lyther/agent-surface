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
//   plans no unowned destination and no unreadable manifest
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { status } from "../lib/helpers.mjs";

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

function install(args) {
  const result = status(["install", ...args], { env });
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

try {
  // Step 2, no claim: an existing file nobody claims blocks the whole plan, differing or identical,
  // with nothing written and nothing adopted into a manifest.
  {
    const dest = path.join(scratch, "unowned-differing");
    mkdirSync(dest, { recursive: true });
    writeFileSync(path.join(dest, "AGENTS.md"), "# Operator rules\n");
    const before = snapshot(dest);
    const live = project(dest, "openhands", ["--category", "rules"]);
    assert.equal(live.code, 1, live.out);
    assert.match(live.out, /^ {2}UNOWNED_DESTINATION: AGENTS\.md exists and no agent-surface manifest in this install root claims it; move or remove it, then rerun$/m);
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
    const live = project(dest, "openhands", ["--category", "rules"]);
    assert.equal(live.code, 0, live.out);
    assert.match(live.out, /^ {2}SHARED_CONTRIBUTION_REPLACED: AGENTS\.md drops droid's development; install --target droid --category development into this root to restore it$/m);
    assert.equal(read(dest, "AGENTS.md"), read(rulesReference, "AGENTS.md"), "the shared file now holds the rules-only render");
    assert.ok(claims(dest, "droid", "AGENTS.md") && claims(dest, "openhands", "AGENTS.md"), "both owners keep their claim");
  }

  // Step 3, two development co-owners: one owner's reset keeps what the other still claims, the last
  // owner's release deletes it, and a joint reset and its repeat run without conflict or change.
  {
    const dest = path.join(scratch, "co-owners");
    assert.equal(project(dest, "openhands", ["--category", "development"]).code, 0);
    const second = project(dest, "zed", ["--category", "development"]);
    assert.equal(second.code, 0, second.out);
    assert.ok(claims(dest, "zed", "AGENTS.md") && claims(dest, "zed", shipDeploy), "identical shared bytes become co-owned");

    const zedReset = project(dest, "zed");
    assert.equal(zedReset.code, 0, zedReset.out);
    assert.match(zedReset.out, new RegExp(`^ {2}${escapeRegExp(shipDeploy)} \\(claimed by openhands\\)$`, "m"));
    assert.ok(existsSync(path.join(dest, shipDeploy)), "cleanup retains a file another owner still claims");
    assert.ok(!claims(dest, "zed", shipDeploy) && claims(dest, "openhands", shipDeploy), "the withdrawing target drops only its own claim");

    assert.equal(project(dest, "openhands").code, 0);
    assert.ok(!existsSync(path.join(dest, shipDeploy)), "the last owner's release deletes the file");

    assert.equal(project(dest, "openhands", ["--category", "development"]).code, 0);
    assert.equal(project(dest, "zed", ["--category", "development"]).code, 0);
    const joint = install(["--target", "openhands,zed", "--scope", "project", "--dest", dest]);
    assert.equal(joint.code, 0, joint.out);
    assert.ok(!existsSync(path.join(dest, shipDeploy)), "two participants that both stop claiming a path both remove it");
    const repeat = install(["--target", "openhands,zed", "--scope", "project", "--dest", dest]);
    assert.equal(repeat.code, 0, repeat.out);
    assert.equal(count(repeat.out, /^ {2}wrote: 0$/gm), 2, "a repeat install writes nothing");
  }

  // Every path several targets share renders identical bytes for one selection, so a joint plan
  // over all targets has no same-run conflict.
  for (const selection of [[], ["--category", "development"], ["--category", "rules"]]) {
    const label = `project all ${selection.join(" ") || "general"}`;
    const plan = install(["--target", "all", "--scope", "project", "--dest", path.join(scratch, "all-project"), ...selection, "--dry-run"]);
    assert.equal(plan.code, 0, `${label}: ${plan.out}`);
    assert.doesNotMatch(plan.out, /also planned by/, label);
  }

  // Claim sources: any <id>-manifest.json in .agent-surface/ counts, unknown targets included, and
  // an unparsable one blocks the root once instead of turning claimed files into unowned ones.
  // SUBSTITUTE_JUSTIFICATION
  // - substitute: hand-written manifests for an unknown owner and an unparsable one
  // - replaces: manifests left by a retired target, another tool or a damaged disk
  // - necessity: no shipped target produces these states
  // - real-option: the real planner reads them from a real install root through the real CLI
  // - proof-limit: proves how the planner treats these files, not how they arose
  // - real-proof: none for foreign or damaged manifests
  {
    const dest = path.join(scratch, "discovery");
    const agentSurface = path.join(dest, ".agent-surface");
    mkdirSync(agentSurface, { recursive: true });
    writeFileSync(path.join(dest, "AGENTS.md"), "written by a target this checkout no longer knows\n");
    writeFileSync(path.join(agentSurface, "former-host-manifest.json"), `${JSON.stringify({
      target: "former-host",
      managed: [{ target: "former-host", source: "rules/*.mdc", output: "AGENTS.md" }],
    })}\n`);
    const claimed = project(dest, "openhands", ["--category", "rules", "--dry-run"]);
    assert.equal(claimed.code, 0, claimed.out);

    writeFileSync(path.join(agentSurface, "broken-manifest.json"), "{");
    const broken = project(dest, "openhands", ["--category", "rules", "--dry-run"]);
    assert.equal(broken.code, 1, broken.out);
    assert.match(broken.out, /^install blocked: .*: MANIFEST_UNREADABLE: \.agent-surface[\\/]broken-manifest\.json is not valid JSON; /m);
    assert.doesNotMatch(broken.out, /UNOWNED_DESTINATION/, "an incomplete claim set reports no unowned files");
  }

  // Claim sources: outputs recorded inside a legacy-listed nested manifest (Copilot's pre-146d8e8
  // user root) belong to that target, rebased to the nested manifest's root, so an upgrade finds
  // them owned; cleaning up the nested manifest never removes what it recorded.
  // SUBSTITUTE_JUSTIFICATION
  // - substitute: a hand-written nested manifest in the pre-146d8e8 layout and the files it records
  // - replaces: a profile last installed by an agent-surface release older than 146d8e8
  // - necessity: running that release needs a separate checkout and install
  // - real-option: the shipped legacy-owned.json entries and the real planner and apply run unchanged
  // - proof-limit: proves handling of that layout, not every historical manifest variant
  // - real-proof: the RT2.0 review upgraded a home installed by the pre-146d8e8 release cleanly
  {
    const dest = path.join(scratch, "copilot-legacy");
    const plan = install(["--target", "copilot", "--scope", "user", "--dest", dest, "--dry-run"]);
    const planned = plan.out.split("\n").map((line) => line.trim())
      .find((line) => line.endsWith(`instructions${path.sep}agent-surface-copilot.instructions.md <- rules/*.mdc`))
      ?.split(" <- ")[0];
    assert.ok(planned, plan.out);
    const nestedRoot = path.dirname(path.dirname(planned));
    const nestedManifest = path.join(nestedRoot, ".agent-surface", "copilot-manifest.json");
    const retiredRecord = path.join("instructions", "retired-copilot.instructions.md");
    mkdirSync(path.join(dest, path.dirname(nestedManifest)), { recursive: true });
    writeFileSync(path.join(dest, nestedManifest), `${JSON.stringify({
      target: "copilot",
      managed: [
        { target: "copilot", source: "rules/*.mdc", output: path.join("instructions", "agent-surface-copilot.instructions.md") },
        { target: "copilot", source: "rules/*.mdc", output: retiredRecord },
      ],
    })}\n`);
    mkdirSync(path.join(dest, path.dirname(planned)), { recursive: true });
    writeFileSync(path.join(dest, planned), "instructions from an older copilot install\n");
    writeFileSync(path.join(dest, nestedRoot, retiredRecord), "retired by an older copilot install\n");
    const live = install(["--target", "copilot", "--scope", "user", "--dest", dest]);
    assert.equal(live.code, 0, live.out);
    assert.notEqual(read(dest, planned), "instructions from an older copilot install\n");
    assert.ok(!existsSync(path.join(dest, nestedManifest)), "the legacy nested manifest itself is cleaned up");
    assert.equal(read(dest, path.join(nestedRoot, retiredRecord)), "retired by an older copilot install\n", "a nested claim never authorizes a removal");
  }

  // Step 3, key split: the pre-split trae target also wrote the CN IDE's ~/.trae-cn/user_rules and the
  // CLI's ~/.trae/traecli.toml. trae keeps each path and server claimed and untouched until trae-cn's
  // or trae-cli's own manifest claims it, then lets go of it without removing or pruning it.
  // SUBSTITUTE_JUSTIFICATION
  // - substitute: a hand-written pre-split trae manifest with the files and config entries it recorded
  // - replaces: a profile installed by a release before the Trae split
  // - necessity: this checkout no longer renders the combined layout
  // - real-option: the real CLI, planner and apply run against a real root
  // - proof-limit: proves the handover rule, not what either Trae edition loads
  // - real-proof: a read-only dry-run of the new keys against the operator's pre-split profile
  {
    const cnRule = path.join(".trae-cn", "user_rules", "00-precedence-and-safety.md");
    const cli1Skill = path.join(".traecli", "skills", "ops-flow", "SKILL.md");
    const cliConfig = path.join(".trae", "traecli.toml");
    const unreadMcp = path.join(".trae", "mcp.json");
    const preSplit = (dest) => {
      for (const file of [cnRule, cli1Skill]) {
        mkdirSync(path.dirname(path.join(dest, file)), { recursive: true });
        writeFileSync(path.join(dest, file), "written before the split\n");
      }
      mkdirSync(path.join(dest, ".trae"), { recursive: true });
      writeFileSync(path.join(dest, cliConfig), 'model = "keep-me"\n\n[mcp_servers.grimoire]\ncommand = "old"\n\n[mcp_servers.synapse]\ncommand = "old"\n');
      writeFileSync(path.join(dest, unreadMcp), `${JSON.stringify({ mcpServers: { existing: { command: "keep" }, grimoire: { command: "old" }, synapse: { command: "old" } } }, null, 2)}\n`);
      mkdirSync(path.join(dest, ".agent-surface"), { recursive: true });
      writeFileSync(path.join(dest, ".agent-surface", "trae-manifest.json"), `${JSON.stringify({
        target: "trae",
        scope: "user",
        managed: [cnRule, cli1Skill].map((output) => ({ target: "trae", source: "rules/*.mdc", output })),
        config_entries: [
          { path: cliConfig, format: "codex-toml", ids: ["grimoire", "synapse"] },
          { path: unreadMcp, format: "mcpServers", ids: ["grimoire", "synapse"] },
        ],
      }, null, 2)}\n`);
    };
    const user = (dest, selection) => install(["--target", selection, "--scope", "user", "--dest", dest]);
    const cliIds = (dest, target) => manifest(dest, target)?.config_entries.find((entry) => entry.path === cliConfig)?.ids ?? null;

    const dest = path.join(scratch, "trae-split");
    preSplit(dest);
    // A successor installed for something else takes over nothing.
    for (const successor of ["trae-cn", "trae-cli"]) {
      assert.equal(install(["--target", successor, "--scope", "user", "--dest", dest, "--category", "skills"]).code, 0);
    }
    const alone = user(dest, "trae");
    assert.equal(alone.code, 0, alone.out);
    assert.equal(read(dest, cnRule), "written before the split\n", "a path handed to trae-cn stays untouched");
    assert.ok(claims(dest, "trae", cnRule), "and claimed");
    assert.match(read(dest, cliConfig), /^\[mcp_servers\.grimoire\]$/m, "nothing is pruned from a route handed to trae-cli");
    assert.deepEqual(cliIds(dest, "trae"), ["grimoire", "synapse"]);
    assert.ok(!existsSync(path.join(dest, cli1Skill)), "a former path without a successor is ordinary stale output");
    assert.deepEqual(JSON.parse(read(dest, unreadMcp)).mcpServers, { existing: { command: "keep" } });

    assert.equal(user(dest, "trae-cn").code, 0);
    assert.equal(user(dest, "trae-cli").code, 0);
    const released = user(dest, "trae");
    assert.equal(released.code, 0, released.out);
    assert.ok(!claims(dest, "trae", cnRule) && claims(dest, "trae-cn", cnRule) && existsSync(path.join(dest, cnRule)), "trae lets go of a path trae-cn claims");
    assert.equal(cliIds(dest, "trae"), null, "and of the servers trae-cli records");
    assert.match(read(dest, cliConfig), /^\[mcp_servers\.grimoire\]$/m, "without pruning them");
    assert.match(read(dest, cliConfig), /^model = "keep-me"$/m);

    const joint = path.join(scratch, "trae-split-joint");
    preSplit(joint);
    const all = user(joint, "trae,trae-cn,trae-cli");
    assert.equal(all.code, 0, all.out);
    assert.doesNotMatch(all.out, /also planned by/);
    assert.ok(claims(joint, "trae-cn", cnRule) && read(joint, cnRule) !== "written before the split\n", "trae-cn takes over the CN rules");
    assert.deepEqual(cliIds(joint, "trae-cli"), ["grimoire", "synapse"]);
  }

  // Step 4, moved route: Poolside's personal instructions moved from .poolside to AGENTS.md. The new
  // route inherits the old one's recorded category for the category guard, and a selection that plans
  // the new route retires the owned old one, so a client that reads both never gets two copies.
  // SUBSTITUTE_JUSTIFICATION
  // - substitute: a hand-written pool manifest and .poolside in the shape earlier releases wrote
  // - replaces: a user profile installed before the move
  // - necessity: this checkout no longer renders the old route
  // - real-option: the real CLI, planner and apply run against a real root
  // - proof-limit: proves the transition, not what Poolside loads
  // - real-proof: the operator's profile holds a development-recorded .poolside, and a peer review
  //   reproduced both cases with the earlier and current installers
  {
    const legacy = path.join(".config", "poolside", ".poolside");
    const oldPool = (name, category) => {
      const dest = path.join(scratch, name);
      mkdirSync(path.join(dest, ".config", "poolside"), { recursive: true });
      mkdirSync(path.join(dest, ".agent-surface"), { recursive: true });
      writeFileSync(path.join(dest, legacy), "rules from an earlier install\n");
      writeFileSync(path.join(dest, ".agent-surface", "pool-manifest.json"), `${JSON.stringify({
        target: "pool",
        scope: "user",
        managed: [{ target: "pool", source: "rules/*.mdc", output: legacy, ...(category ? { asset_category: category } : {}) }],
      })}\n`);
      return dest;
    };
    const rulesOnly = (dest) => install(["--target", "pool", "--scope", "user", "--dest", dest, "--category", "rules"]);

    const development = oldPool("pool-development", "development");
    const before = snapshot(development);
    const narrower = rulesOnly(development);
    assert.equal(narrower.code, 1, narrower.out);
    assert.match(narrower.out, /AGENTS\.md replaces .*\.poolside, which carries the development category's contribution/);
    assert.deepEqual(snapshot(development), before, "a narrower selection does not drop the old document's contribution");

    const general = oldPool("pool-general");
    const replaced = rulesOnly(general);
    assert.equal(replaced.code, 0, replaced.out);
    assert.ok(existsSync(path.join(general, ".config", "poolside", "AGENTS.md")), replaced.out);
    assert.ok(!existsSync(path.join(general, legacy)), "the old route is retired with its replacement");
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
    assert.match(first.out, /^install interrupted: openhands: /m);
    assert.ok(existsSync(path.join(dest, opsDocs)), "earlier writes landed before the failure");
    assert.ok(claims(dest, "openhands", opsDocs) && claims(dest, "openhands", "AGENTS.md"), "the pending manifest claims every planned path");
    assert.ok(claims(dest, "zed", "AGENTS.md"), "a participant not yet applied already has its pending manifest");
    const rerun = install(joint);
    assert.equal(rerun.code, 0, rerun.out);
    assert.ok(existsSync(path.join(dest, "AGENTS.md")), "the rerun finished the install");
  }

  // An install root reached through a symbolic link, such as a home directory on another volume, is
  // followed like the directories above it; a link below the root still refuses the plan untouched.
  {
    const real = path.join(scratch, "real-root");
    const linked = path.join(scratch, "linked-root");
    mkdirSync(real);
    symlinkSync(real, linked, "dir");
    const viaLink = project(linked, "openhands");
    assert.equal(viaLink.code, 0, viaLink.out);
    assert.ok(existsSync(path.join(real, "AGENTS.md")) && claims(real, "openhands", "AGENTS.md"), "writes and the manifest land in the link's target");

    const elsewhere = path.join(scratch, "elsewhere");
    mkdirSync(elsewhere);
    const inner = path.join(scratch, "inner-link");
    mkdirSync(inner);
    symlinkSync(elsewhere, path.join(inner, ".agents"), "dir");
    const refused = project(inner, "openhands");
    assert.notEqual(refused.code, 0, refused.out);
    assert.match(refused.out, /traverses symbolic link: .*inner-link\/\.agents/);
    assert.deepEqual(readdirSync(elsewhere), [], "nothing is written through a link inside the root");
    assert.deepEqual(readdirSync(inner), [".agents"], "nothing is written beside the link either");

    const dangling = path.join(scratch, "dangling-root");
    symlinkSync(path.join(scratch, "gone"), dangling, "dir");
    const deadRoot = project(dangling, "openhands");
    assert.notEqual(deadRoot.code, 0, deadRoot.out);
    assert.match(deadRoot.out, /root is a dangling symbolic link: .*dangling-root/);
    assert.equal(existsSync(path.join(scratch, "gone")), false, "a dangling root is not created through its link");

    // The case that motivated following the root: HOME itself is a link, and a user-scope install
    // merges MCP config under it.
    const linkedHome = path.join(scratch, "linked-home");
    symlinkSync(home, linkedHome, "dir");
    const userViaLink = status(["install", "--target", "claude-code", "--scope", "user", "--allow-scope-root", "--category", "mcps"], {
      env: { ...env, HOME: linkedHome, XDG_CONFIG_HOME: path.join(linkedHome, ".config") },
    });
    assert.equal(userViaLink.status, 0, `${userViaLink.stdout}${userViaLink.stderr}`);
    assert.ok(Object.hasOwn(JSON.parse(read(home, ".claude.json")).mcpServers, "synapse"), "the MCP merge lands in the linked home");
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log("ownership: ok");
