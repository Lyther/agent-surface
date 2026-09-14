#!/usr/bin/env node
// LIVE acceptance for the generated plugin package, through the host's OWN plugin manager:
//   1. EXPORT: build the package from canonical sources
//   2. INSTALL: register it as a local marketplace and install it natively
//   3. DISCOVERY: read the model-visible prompt and require the packaged skill to be offered from
//      the INSTALLED CACHE, namespaced, alongside a direct-file copy of the same skill
//   4. INVOCATION: a harmless task that explicitly names the namespaced skill, where the evidence is
//      the session's own recorded file reads — not its prose about itself
//   5. REMOVAL: the native remove takes the skill out of discovery and leaves the direct-file copy
//
// Both copies of the skill are installed on purpose. Proving the PLUGIN copy was used is only
// meaningful under contention: with the direct-file copy absent, any read would trivially resolve to
// the package. Everything runs in a disposable HOME and CODEX_HOME so the operator's own plugins,
// marketplaces, and skills are neither read as evidence nor modified.
//
// Opt-in (needs the host CLI and an authenticated session): AGENT_SURFACE_LIVE_PLUGIN=1.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CODEX_PLUGIN_NAME, CODEX_PLUGIN_SKILLS } from "../../scripts/agent-surface/targets.mjs";
import { root, run } from "../lib/helpers.mjs";

// NOT process.exit(): these suites are imported by the shared runner, so exiting here would end the
// whole run and report success for suites never run.
const enabled = process.env.AGENT_SURFACE_LIVE_PLUGIN === "1";
if (!enabled) console.log("live-plugin: skipped (set AGENT_SURFACE_LIVE_PLUGIN=1 to run the native plugin acceptance)");

if (enabled) {
  const host = spawnSync("codex", ["--version"], { encoding: "utf8" });
  assert.equal(host.status, 0, "the host CLI must be installed to run this acceptance; it is not emulated");
  const hostVersion = host.stdout.trim();
  const skillName = CODEX_PLUGIN_SKILLS[0];
  const namespaced = `${CODEX_PLUGIN_NAME}:${skillName}`;

  // realpath: on macOS the system temp dir is a symlink (/var -> /private/var) and the host reports
  // resolved paths, so an unresolved prefix would never match what discovery prints back.
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "as-live-plugin-")));
  const home = path.join(dir, "home");
  const codexHome = path.join(dir, "codex-home");
  const work = path.join(dir, "work");
  for (const created of [home, codexHome, work]) mkdirSync(created, { recursive: true });
  const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: codexHome };

  // A disposable profile has no credentials of its own, and phase 4 needs a real session. The
  // operator's auth file is LINKED rather than copied: copying would put a second copy of a secret
  // into a world-traversable temp directory, while a link leaves the original — and its owner-only
  // mode — as the only copy. Its contents are never read, printed, or sent anywhere the host would
  // not already send them. Absent, phase 4 is reported as a bounded blocker instead of faked.
  const operatorAuth = path.join(os.homedir(), ".codex", "auth.json");
  const authenticated = existsSync(operatorAuth);
  if (authenticated) symlinkSync(operatorAuth, path.join(codexHome, "auth.json"));
  const codex = (args, options = {}) => spawnSync("codex", args, { encoding: "utf8", cwd: work, env, ...options });

  // Only the packaged skill's own entries are ever extracted from the prompt. The full prompt
  // carries unrelated operator instructions and must not be read into evidence or a failure message.
  const discoveredSkillLines = () => {
    const rendered = codex(["debug", "prompt-input"], { timeout: 180000 });
    assert.equal(rendered.status, 0, `could not read the model-visible prompt: ${rendered.stderr?.slice(0, 400)}`);
    const roots = new Map();
    const entries = [];
    for (const message of JSON.parse(rendered.stdout)) {
      for (const item of message.content ?? []) {
        const text = typeof item.text === "string" ? item.text : "";
        if (!text.includes("<skills_instructions>")) continue;
        for (const [, key, value] of text.matchAll(/`(r\d+)` = `([^`]+)`/g)) roots.set(key, value);
        for (const line of text.split("\n")) {
          if (line.startsWith(`- ${skillName}:`) || line.startsWith(`- ${namespaced}:`)) entries.push(line.trim());
        }
      }
    }
    return { roots, entries };
  };
  const entryFor = (entries, name) => entries.find((line) => line.startsWith(`- ${name}:`));
  const resolvedPath = (entry, roots) => {
    const match = /\(file: (r\d+)\/(.+)\)$/.exec(entry);
    assert.ok(match, `the discovery entry names a skill root and path: ${entry}`);
    return path.join(roots.get(match[1]), match[2]);
  };

  try {
    // ---- phase 1: export from canonical sources ------------------------------------------
    run(["build", "--target", "codex-plugin"]);
    const marketplaceRoot = path.join(root, "dist", "codex-plugin");
    const packageRoot = path.join(marketplaceRoot, "plugins", CODEX_PLUGIN_NAME);
    for (const required of [
      path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json"),
      path.join(packageRoot, "plugin.json"),
      path.join(packageRoot, ".codex-plugin", "plugin.json"),
      path.join(packageRoot, "skills", skillName, "SKILL.md"),
    ]) assert.ok(existsSync(required), `the exported package contains ${path.relative(marketplaceRoot, required)}`);
    // One metadata definition reached both manifests, so the package cannot drift against itself.
    assert.equal(
      readFileSync(path.join(packageRoot, "plugin.json"), "utf8"),
      readFileSync(path.join(packageRoot, ".codex-plugin", "plugin.json"), "utf8"),
      "the portable manifest and the host overlay are the same metadata",
    );

    // The direct-file copy of the same skill, installed into the disposable home. This is the
    // contention the invocation evidence below depends on.
    // Skills only: the contention this needs is two copies of one skill, and a full install would
    // additionally provision and wire MCP servers that have nothing to do with the packaging path.
    run(["install", "--target", "codex", "--scope", "user", "--dest", home, "--category", "skills", "-y"], { env });
    assert.ok(existsSync(path.join(home, ".agents", "skills", skillName, "SKILL.md")), "the direct-file copy is installed and will compete for the same task");

    // ---- phase 2: native installation ----------------------------------------------------
    const added = codex(["plugin", "marketplace", "add", marketplaceRoot], { timeout: 180000 });
    assert.equal(added.status, 0, `the host rejected the generated marketplace: ${added.stderr}`);
    const installed = codex(["plugin", "add", `${CODEX_PLUGIN_NAME}@${CODEX_PLUGIN_NAME}`], { timeout: 300000 });
    assert.equal(installed.status, 0, `the host rejected the generated package: ${installed.stderr}`);
    const listed = codex(["plugin", "list"], { timeout: 180000 });
    assert.match(listed.stdout, new RegExp(`${CODEX_PLUGIN_NAME}@${CODEX_PLUGIN_NAME}\\s+installed, enabled`), "the host reports the package installed and enabled");

    // ---- phase 3: discovery, from the installed cache ------------------------------------
    const before = discoveredSkillLines();
    const pluginEntry = entryFor(before.entries, namespaced);
    assert.ok(pluginEntry, `the packaged skill is offered to the model as ${namespaced}`);
    assert.ok(entryFor(before.entries, skillName), "the direct-file copy is offered too, so the next phase runs under real contention");
    const pluginSkillPath = resolvedPath(pluginEntry, before.roots);
    const cacheRoot = path.join(codexHome, "plugins", "cache");
    assert.ok(pluginSkillPath.startsWith(cacheRoot), `the packaged skill resolves from the installed cache, not the source tree: ${pluginSkillPath}`);
    assert.ok(existsSync(pluginSkillPath), "and that cached file exists on disk");
    const companion = path.join(path.dirname(pluginSkillPath), "references", "runtime-catalog.md");
    assert.ok(existsSync(companion), `the skill's companion file was cached with it: ${companion}`);
    console.log(`live-plugin: ${hostVersion} discovered ${namespaced} at ${pluginSkillPath}`);

    // ---- phase 4: a harmless task that names the packaged skill --------------------------
    // The evidence is what the session RECORDED ITSELF DOING — the file paths in its own events —
    // not its answer. A model can describe reading a file it never opened; it cannot fabricate the
    // host's record of the reads it actually performed.
    if (!authenticated) {
      console.log("live-plugin: BLOCKED at task-shaped invocation — no host credentials are available to a disposable profile; export, native installation, discovery from the cache, and removal are still proven below");
    }
    const task = `Use the ${namespaced} skill. Read its runtime-catalog reference file and reply with the first markdown heading in that file. Do not modify anything.`;
    const session = authenticated
      ? codex(["exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only", "-C", work, task], { timeout: 600000 })
      : null;
    if (session) assert.equal(session.status, 0, `the session failed: ${session.stderr?.slice(0, 600)}`);
    const events = !session ? [] : session.stdout.split("\n").filter((line) => line.trim().length > 0).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    if (session) {
      assert.ok(events.length > 0, "the session emitted machine-readable events");
      const record = JSON.stringify(events);
      assert.ok(record.includes(cacheRoot), "the session's own recorded activity reads from the installed plugin cache");
      assert.ok(
        !record.includes(path.join(home, ".agents", "skills", skillName)),
        "and not from the competing direct-file copy of the same skill",
      );
      console.log("live-plugin: the session read the packaged copy under the plugin cache while a direct-file copy was installed");
    }

    // ---- phase 5: native removal ---------------------------------------------------------
    const removed = codex(["plugin", "remove", `${CODEX_PLUGIN_NAME}@${CODEX_PLUGIN_NAME}`], { timeout: 180000 });
    assert.equal(removed.status, 0, `the host could not remove the package: ${removed.stderr}`);
    const after = discoveredSkillLines();
    assert.ok(!entryFor(after.entries, namespaced), "removal takes the packaged skill out of discovery");
    assert.ok(entryFor(after.entries, skillName), "and leaves the unrelated direct-file copy alone");
    assert.ok(existsSync(path.join(home, ".agents", "skills", skillName, "SKILL.md")), "whose files are still on disk");
  } finally {
    codex(["plugin", "marketplace", "remove", CODEX_PLUGIN_NAME], { timeout: 120000 });
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }

  console.log("live-plugin: ok");
}
