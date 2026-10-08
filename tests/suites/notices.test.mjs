#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { localDate, noticeTiming, sharedSkillRootNotice } from "../../scripts/agent-surface/notices.mjs";
import { files, run } from "../lib/helpers.mjs";

// Split an install plan printout into one section per target.
function planSections(stdout) {
  return Object.fromEntries(
    stdout.split(/^(?=target: )/m)
      .filter((section) => section.startsWith("target: "))
      .map((section) => [section.slice("target: ".length, section.indexOf("\n")), section]),
  );
}

// SUBSTITUTE_JUSTIFICATION
// - substitute: fixed `today` dates passed to noticeTiming, and a fixed Date passed to localDate
// - replaces: the real wall clock at the notice date-wording boundary
// - necessity: the wording flips on a fixed effective date; the real clock cannot deterministically sit before, on and after it
// - real-option: the CLI cases below run with the real clock; they assert which notices appear, not the date wording
// - proof-limit: proves the boundary rule of the pure wording functions, not which date the host clock reports
// - real-proof: the install, build and doctor cases in this file run the real CLI with the real clock
const retirement = { code: "EXAMPLE_RETIREMENT", kind: "retirement", surface: "commands-as-workflows", effective_on: "2026-11-01" };
assert.equal(noticeTiming(retirement, "2026-10-31"), "takes effect 2026-11-01");
assert.equal(noticeTiming(retirement, "2026-11-01"), "in effect since 2026-11-01");
assert.equal(noticeTiming({ code: "EXAMPLE_MAINTENANCE", kind: "maintenance", surface: "target" }, "2026-10-31"), null);
assert.equal(localDate(new Date(2026, 10, 1, 0, 30)), "2026-11-01");

const manualSkill = {
  relativeOutput: path.join(".agents", "skills", "ops-nuke", "SKILL.md"),
  content: "---\nname: ops-nuke\ndescription: \"Manual command.\"\ndisable-model-invocation: true\n---\n\nBody\n",
};
const workspace = path.join(os.tmpdir(), "agent-surface-notice-workspace");
assert.equal(sharedSkillRootNotice([manualSkill], workspace)?.code, "SHARED_SKILL_ROOT_MANUAL_UNQUALIFIED");
assert.equal(sharedSkillRootNotice([manualSkill], os.homedir()), null, "home-root installs are outside the shared-root notice");
assert.equal(
  sharedSkillRootNotice([{ ...manualSkill, content: manualSkill.content.replace("disable-model-invocation: true\n", "") }], workspace),
  null,
  "model-invocable skills do not trigger the notice",
);

const scratch = mkdtempSync(path.join(os.tmpdir(), "agent-surface-notices-"));
try {
  const home = path.join(scratch, "home");

  // Stored notices stay with their target: one run, two plans.
  const combined = planSections(run(["install", "--target", "openhands,cursor", "--scope", "project", "--dest", path.join(scratch, "combined"), "--dry-run"]));
  assert.match(combined.openhands, /^ {2}OPENHANDS_CLI_LEGACY \(maintenance; target\)$/m);
  assert.doesNotMatch(combined.cursor, /^notices:$/m);

  // The shared-root notice follows the resolved root, not --scope: a user-scope --dest workspace gets
  // it, a home-root install does not.
  const codexUserDest = run(["install", "--target", "codex", "--scope", "user", "--dest", path.join(scratch, "cx-user"), "--category", "development", "--dry-run"]);
  assert.match(codexUserDest, /^ {2}SHARED_SKILL_ROOT_MANUAL_UNQUALIFIED \(compatibility; skills\)$/m);
  const codexHome = run(["install", "--target", "codex", "--scope", "user", "--category", "development", "--dry-run"], {
    env: { ...process.env, HOME: home },
  });
  assert.doesNotMatch(codexHome, /SHARED_SKILL_ROOT_MANUAL_UNQUALIFIED/, "a home-root install is outside the notice");

  // A live install prints notices before its first write and writes none into native files.
  const liveRoot = path.join(scratch, "live");
  const live = run(["install", "--target", "antigravity,dsh", "--scope", "user", "--dest", liveRoot, "--category", "development"], {
    env: { ...process.env, HOME: home },
  });
  assert.match(live, /ANTIGRAVITY_WORKFLOW_RETIREMENT \(retirement; commands-as-workflows; /);
  assert.ok(live.indexOf("DSH_REQUALIFY_AFTER_SECURITY_UPDATE") < live.indexOf("installed:"), "notices print before the apply phase");
  for (const file of files(liveRoot)) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /ANTIGRAVITY_WORKFLOW_RETIREMENT|DSH_REQUALIFY_AFTER_SECURITY_UPDATE/, file);
  }

  // Build prints each target's notices before any write; doctor lists every stored notice.
  const windsurfBuild = run(["build", "--target", "windsurf", "--dry-run"]);
  assert.match(windsurfBuild, /^windsurf notice: WINDSURF_CASCADE_LEGACY \(retirement; target; /m);
  assert.ok(windsurfBuild.indexOf("windsurf notice:") < windsurfBuild.indexOf("[dry-run]"), "notices precede the planned writes");
  const doctor = run(["doctor"], { env: { ...process.env, HOME: home } });
  assert.match(doctor, /^notice kiro: KIRO_MANUAL_STEERING_AUTOLOADED \(/m);
  assert.match(doctor, /^notice pool: POOL_AGENTS_MD_CLIENT_FLOOR \(/m);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log("notices: ok");
