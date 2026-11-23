#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectPrerequisite } from "../../scripts/agent-surface/provision.mjs";
import { root, status, writeFirstPartyLaunchers } from "../lib/helpers.mjs";

// doctor's first-party lines describe the home it runs under: the Grimoire index, the synapse-hook
// launcher, and each hook host's user-scope entry, first absent and then present.
const doctorHome = mkdtempSync(path.join(tmpdir(), "agent-surface-doctor-"));
try {
  const doctor = () => {
    const result = status(["doctor"], { env: { ...process.env, HOME: doctorHome, USERPROFILE: doctorHome } });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    return result.stdout;
  };
  const before = doctor();
  assert.match(before, /^grimoire-index: missing \(npm run install:grimoire\)$/m);
  assert.match(before, /^synapse-hook: missing \(npm run install:synapse\)$/m);
  assert.match(before, /^synapse-hook claude-code: not registered in ~\/\.claude\/settings\.json \(agent-surface install --target claude-code --category mcps\)$/m);

  mkdirSync(path.join(doctorHome, ".grimoire"), { recursive: true });
  writeFileSync(path.join(doctorHome, ".grimoire", "index.sqlite"), "");
  const hookCommand = path.join(doctorHome, ".local", "bin", "synapse-hook");
  mkdirSync(path.dirname(hookCommand), { recursive: true });
  writeFileSync(hookCommand, "");
  mkdirSync(path.join(doctorHome, ".claude"), { recursive: true });
  writeFileSync(path.join(doctorHome, ".claude", "settings.json"), JSON.stringify({
    hooks: { PostToolUse: [{ matcher: "*", hooks: [{ type: "command", command: hookCommand }] }] },
  }));
  const after = doctor();
  assert.match(after, /^grimoire-index: present$/m);
  assert.match(after, /^synapse-hook: linked$/m);
  assert.match(after, /^synapse-hook claude-code: registered \(~\/\.claude\/settings\.json\)$/m);
  assert.match(after, /^synapse-hook codex: not registered in ~\/\.codex\/hooks\.json/m);
} finally {
  rmSync(doctorHome, { recursive: true, force: true });
}

// doctor compares the staged Antigravity plugin with the copy `agy plugin install` imported, from
// constructed directories; it is silent unless both exist and never runs agy.
const importHome = mkdtempSync(path.join(tmpdir(), "agent-surface-doctor-import-"));
try {
  const staged = path.join(importHome, ".gemini", "antigravity-cli", "plugins", "agent-surface");
  const imported = path.join(importHome, ".gemini", "config", "plugins", "agent-surface");
  const importLine = () => {
    const result = status(["doctor"], { env: { ...process.env, HOME: importHome, USERPROFILE: importHome } });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    return result.stdout.match(/^antigravity-cli-import: .*$/m)?.[0] ?? null;
  };
  assert.equal(importLine(), null, "a fresh home prints no line");
  mkdirSync(path.join(staged, "skills", "ops-ask"), { recursive: true });
  writeFileSync(path.join(staged, "skills", "ops-ask", "SKILL.md"), "ask v1\n");
  writeFileSync(path.join(staged, "plugin.json"), "{}\n");
  assert.equal(importLine(), null, "a staged-only home prints no line");

  cpSync(staged, imported, { recursive: true });
  assert.equal(importLine(), "antigravity-cli-import: matches");
  mkdirSync(path.join(imported, "empty-folder"));
  writeFileSync(path.join(imported, ".DS_Store"), "finder");
  assert.equal(importLine(), "antigravity-cli-import: matches", "an empty folder and .DS_Store are not plugin content");

  writeFileSync(path.join(imported, "skills", "ops-ask", "SKILL.md"), "ask v2\n");
  const changed = importLine();
  assert.match(changed, /^antigravity-cli-import: differs \(1 changed, 0 only imported, 0 only staged; e\.g\. skills\/ops-ask\/SKILL\.md\)/, "a same-size edit is found");
  assert.ok(changed.endsWith(`run agy plugin install "${staged}"`), changed);

  writeFileSync(path.join(imported, "skills", "ops-ask", "SKILL.md"), "ask v1\n");
  if (process.platform !== "win32") {
    // Identical bytes, different executable state: the enabled copy cannot run the helper.
    chmodSync(path.join(staged, "plugin.json"), 0o755);
    chmodSync(path.join(imported, "plugin.json"), 0o644);
    assert.match(importLine(), /^antigravity-cli-import: differs \(1 changed, 0 only imported, 0 only staged; e\.g\. plugin\.json\)/);
    // Losing only the owner's execute bit still leaves the enabled copy unrunnable.
    chmodSync(path.join(staged, "plugin.json"), 0o755);
    chmodSync(path.join(imported, "plugin.json"), 0o655);
    assert.match(importLine(), /^antigravity-cli-import: differs \(1 changed, 0 only imported, 0 only staged; e\.g\. plugin\.json\)/);
    chmodSync(path.join(staged, "plugin.json"), 0o644);
    chmodSync(path.join(imported, "plugin.json"), 0o644);
  }
  writeFileSync(path.join(imported, "skills", "ops-server.md"), "old\n");
  assert.match(importLine(), /^antigravity-cli-import: differs \(0 changed, 1 only imported, 0 only staged; e\.g\. skills\/ops-server\.md\)/);
} finally {
  rmSync(importHome, { recursive: true, force: true });
}

// The route fixtures' launchers must satisfy the production detector under each platform's naming
// rule: Windows rejects an extensionless file, so a fixture written for it needs the .cmd names.
{
  const services = JSON.parse(readFileSync(path.join(root, "registry", "optional-services.json"), "utf8")).services;
  const launcherIds = ["synapse-bridge", "synapse-hook", "grimoire-server"];
  const prerequisites = Object.values(services).flatMap((service) => service.provisioning?.prerequisites ?? [])
    .filter((prereq) => launcherIds.includes(prereq.id));
  assert.equal(prerequisites.length, launcherIds.length);
  for (const platform of ["win32", process.platform]) {
    const home = mkdtempSync(path.join(tmpdir(), "agent-surface-launcher-fixture-"));
    try {
      writeFirstPartyLaunchers(home, platform);
      for (const prereq of prerequisites) {
        const detected = detectPrerequisite(prereq, { platform, homedir: home, env: { PATHEXT: ".COM;.EXE;.BAT;.CMD" } });
        assert.equal(detected.satisfied, true, `${prereq.id} is detected on ${platform}`);
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }
}

console.log("runtime: ok");
