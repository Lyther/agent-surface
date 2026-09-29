#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { localDate, noticeHeading, noticeTiming, sharedSkillRootNotice } from "../../scripts/agent-surface/notices.mjs";
import { files, root, run } from "../lib/helpers.mjs";

const noticeCodes = [
  "ANTIGRAVITY_WORKFLOW_RETIREMENT",
  "DSH_REQUALIFY_AFTER_SECURITY_UPDATE",
  "KIRO_MANUAL_STEERING_AUTOLOADED",
  "OPENHANDS_CLI_LEGACY",
  "SHARED_SKILL_ROOT_MANUAL_UNQUALIFIED",
  "WINDSURF_CASCADE_LEGACY",
  "WINDSURF_RULE_SIZE_LIMITS",
];

// Split an install plan printout into one section per target.
function planSections(stdout) {
  return Object.fromEntries(
    stdout.split(/^(?=target: )/m)
      .filter((section) => section.startsWith("target: "))
      .map((section) => [section.slice("target: ".length, section.indexOf("\n")), section]),
  );
}

function assertNoNoticeCodes(dir) {
  for (const file of files(dir)) {
    const content = readFileSync(file, "utf8");
    for (const code of noticeCodes) {
      assert.ok(!content.includes(code), `${path.relative(dir, file)} must not carry notice ${code}`);
    }
  }
}

// SUBSTITUTE_JUSTIFICATION
// - substitute: fixed `today` dates passed to noticeTiming/noticeHeading, and a fixed Date passed to localDate
// - replaces: the real wall clock at the notice date-wording boundary
// - necessity: the wording flips on a fixed effective date; the real clock cannot deterministically sit before, on and after it
// - real-option: the CLI cases below run with the real clock; they assert which notices appear, not the date wording
// - proof-limit: proves the boundary rule of the pure wording functions, not which date the host clock reports
// - real-proof: the install/build/doctor cases in this file run the real CLI with the real clock
const retirement = { code: "EXAMPLE_RETIREMENT", kind: "retirement", surface: "commands-as-workflows", effective_on: "2026-11-01" };
assert.equal(noticeTiming(retirement, "2026-10-31"), "takes effect 2026-11-01");
assert.equal(noticeTiming(retirement, "2026-11-01"), "in effect since 2026-11-01");
assert.equal(noticeTiming(retirement, "2027-01-15"), "in effect since 2026-11-01");
assert.equal(noticeTiming({ code: "EXAMPLE_MAINTENANCE", kind: "maintenance", surface: "target" }, "2026-10-31"), null);
assert.equal(
  noticeHeading({ ...retirement, selected: false }, "2026-10-31"),
  "EXAMPLE_RETIREMENT (retirement; commands-as-workflows; takes effect 2026-11-01; commands-as-workflows is not part of this selection)",
);
assert.equal(localDate(new Date(2026, 10, 1, 0, 30)), "2026-11-01");
assert.equal(localDate(new Date(2026, 9, 31, 23, 30)), "2026-10-31");

const manualSkill = {
  relativeOutput: path.join(".agents", "skills", "ops-nuke", "SKILL.md"),
  content: "---\nname: ops-nuke\ndescription: \"Manual command.\"\ndisable-model-invocation: true\n---\n\nBody\n",
};
const modelSkill = {
  relativeOutput: path.join(".agents", "skills", "arch-contract", "SKILL.md"),
  content: "---\nname: arch-contract\ndescription: \"Model-invocable skill.\"\n---\n\nBody\n",
};
const workspace = path.join(os.tmpdir(), "agent-surface-notice-workspace");
assert.equal(sharedSkillRootNotice([manualSkill], workspace)?.code, "SHARED_SKILL_ROOT_MANUAL_UNQUALIFIED");
assert.equal(sharedSkillRootNotice([manualSkill], os.homedir()), null, "home-root installs are outside the shared-root notice");
assert.equal(sharedSkillRootNotice([modelSkill], workspace), null, "model-invocable skills do not trigger the notice");
assert.equal(
  sharedSkillRootNotice([{ ...manualSkill, relativeOutput: path.join(".dsh", "skills", "ops-nuke", "SKILL.md") }], workspace),
  null,
  "manual skills outside .agents/skills do not trigger the notice",
);

const scratch = mkdtempSync(path.join(os.tmpdir(), "agent-surface-notices-"));
try {
  const home = path.join(scratch, "home");

  // Surface-specific retirement: shown on every Antigravity plan, marked when workflows are not selected.
  const antigravityGeneral = run(["install", "--target", "antigravity", "--scope", "user", "--dest", path.join(scratch, "ag"), "--dry-run"]);
  assert.match(antigravityGeneral, /^notices:\n {2}ANTIGRAVITY_WORKFLOW_RETIREMENT \(retirement; commands-as-workflows; .*commands-as-workflows is not part of this selection\)$/m);
  assert.match(antigravityGeneral, /^ {4}action: .*\/migrate-workflows/m);
  const antigravityDevelopment = run(["install", "--target", "antigravity", "--scope", "user", "--dest", path.join(scratch, "ag"), "--category", "development", "--dry-run"]);
  const developmentHeading = antigravityDevelopment.split("\n").find((line) => line.includes("ANTIGRAVITY_WORKFLOW_RETIREMENT"));
  assert.ok(developmentHeading, "development selection still shows the Antigravity retirement notice");
  assert.doesNotMatch(developmentHeading, /not part of this selection/, "the development selection includes workflows");

  // Shared-root notice follows the resolved root, not --scope: a user-scope --dest workspace gets it.
  const codexUserDest = run(["install", "--target", "codex", "--scope", "user", "--dest", path.join(scratch, "cx-user"), "--category", "development", "--dry-run"]);
  assert.match(codexUserDest, /^ {2}SHARED_SKILL_ROOT_MANUAL_UNQUALIFIED \(compatibility; skills\)$/m);
  const codexProject = run(["install", "--target", "codex", "--scope", "project", "--dest", path.join(scratch, "cx-project"), "--category", "development", "--dry-run"]);
  assert.match(codexProject, /SHARED_SKILL_ROOT_MANUAL_UNQUALIFIED/);
  const codexHome = run(["install", "--target", "codex", "--scope", "user", "--category", "development", "--dry-run"], {
    env: { ...process.env, HOME: home },
  });
  assert.match(codexHome, new RegExp(`^root: ${home.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  assert.doesNotMatch(codexHome, /SHARED_SKILL_ROOT_MANUAL_UNQUALIFIED/, "a home-root install is outside the notice");
  const codexGeneral = run(["install", "--target", "codex", "--scope", "project", "--dest", path.join(scratch, "cx-general"), "--dry-run"]);
  assert.doesNotMatch(codexGeneral, /^notices:$/m, "a general Codex install writes no manual-only skills and has no stored notices");

  // Notices stay with their target: one run, two plans.
  const combined = planSections(run(["install", "--target", "openhands,cursor", "--scope", "project", "--dest", path.join(scratch, "combined"), "--dry-run"]));
  assert.match(combined.openhands, /^ {2}OPENHANDS_CLI_LEGACY \(maintenance; target\)$/m);
  assert.doesNotMatch(combined.cursor, /^notices:$/m);
  assert.doesNotMatch(combined.cursor, /OPENHANDS_CLI_LEGACY/);

  // One notice per (target, code), however often the target is named.
  const doubled = run(["install", "--target", "openhands", "--runtime", "openhands", "--scope", "project", "--dest", path.join(scratch, "doubled"), "--dry-run"]);
  assert.equal(doubled.match(/OPENHANDS_CLI_LEGACY/g)?.length, 1);

  // A live install prints notices before its first write and writes none into native files or the manifest.
  const liveRoot = path.join(scratch, "live");
  const live = run(["install", "--target", "antigravity,dsh", "--scope", "user", "--dest", liveRoot, "--category", "development"], {
    env: { ...process.env, HOME: home },
  });
  assert.match(live, /ANTIGRAVITY_WORKFLOW_RETIREMENT/);
  assert.match(live, /DSH_REQUALIFY_AFTER_SECURITY_UPDATE/);
  assert.ok(live.indexOf("DSH_REQUALIFY_AFTER_SECURITY_UPDATE") < live.indexOf("installed:"), "notices print before the apply phase");
  assert.ok(files(liveRoot).length > 0, "the live install wrote files");
  assertNoNoticeCodes(liveRoot);

  // Build prints each target's notices before writing it, and none into the artifact.
  const windsurfBuild = run(["build", "--target", "windsurf", "--dry-run"]);
  assert.match(windsurfBuild, /^windsurf notice: WINDSURF_CASCADE_LEGACY \(retirement; target; /m);
  assert.match(windsurfBuild, /^windsurf notice: WINDSURF_RULE_SIZE_LIMITS \(compatibility; rules\)$/m);
  assert.ok(windsurfBuild.indexOf("windsurf notice:") < windsurfBuild.indexOf("[dry-run]"), "notices precede the planned writes");
  const allBuild = run(["build", "--dry-run"], { maxBuffer: 64 * 1024 * 1024 });
  const lastNotice = Math.max(...[...allBuild.matchAll(/^\S+ notice: /gm)].map((match) => match.index));
  assert.ok(lastNotice >= 0 && lastNotice < allBuild.indexOf("[dry-run]"), "every target's notices precede the first write of any target");
  assert.doesNotMatch(run(["build", "--target", "cursor", "--dry-run"]), /notice:/);
  const openhandsBuild = run(["build", "--target", "openhands"]);
  assert.match(openhandsBuild, /^openhands notice: OPENHANDS_CLI_LEGACY/m);
  assertNoNoticeCodes(path.join(root, "dist", "openhands"));

  // Doctor lists every stored notice without touching host state.
  const doctor = run(["doctor"], { env: { ...process.env, HOME: home } });
  for (const [target, code] of [
    ["antigravity", "ANTIGRAVITY_WORKFLOW_RETIREMENT"],
    ["dsh", "DSH_REQUALIFY_AFTER_SECURITY_UPDATE"],
    ["kiro", "KIRO_MANUAL_STEERING_AUTOLOADED"],
    ["openhands", "OPENHANDS_CLI_LEGACY"],
    ["windsurf", "WINDSURF_CASCADE_LEGACY"],
    ["windsurf", "WINDSURF_RULE_SIZE_LIMITS"],
  ]) {
    assert.match(doctor, new RegExp(`^notice ${target}: ${code} \\(`, "m"));
  }
  assert.doesNotMatch(doctor, /SHARED_SKILL_ROOT_MANUAL_UNQUALIFIED/, "planner-derived notices need a plan");
} finally {
  rmSync(scratch, { recursive: true, force: true });
  rmSync(path.join(root, "dist", "openhands"), { recursive: true, force: true });
}

console.log("notices: ok");
