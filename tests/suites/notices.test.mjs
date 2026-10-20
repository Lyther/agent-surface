#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { gooseXdgConfigNotice, localDate, noticeTiming, opencodeConfigRootNotices, sharedSkillRootNotice } from "../../scripts/agent-surface/notices.mjs";
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

// Goose resolves its config home from XDG_CONFIG_HOME when that is set, so only a route it would
// not read earns the notice.
const gooseConfigMerge = {
  relativeOutput: path.join(".config", "goose", "config.yaml"),
  entries: [["synapse", { type: "stdio" }], ["grimoire", { type: "stdio" }]],
};
// What a Windows user reinstall leaves at this path: entries are pruned, none are written.
const gooseCleanupMerge = { relativeOutput: gooseConfigMerge.relativeOutput, entries: [], removeMcpServers: ["synapse", "grimoire"] };
const gooseRoot = path.join(os.tmpdir(), "agent-surface-notice-goose");
const elsewhere = path.join(os.tmpdir(), "agent-surface-notice-xdg");
assert.equal(gooseXdgConfigNotice("goose", [gooseConfigMerge], gooseRoot, { XDG_CONFIG_HOME: elsewhere })?.code, "GOOSE_XDG_CONFIG_HOME_SET");
assert.equal(gooseXdgConfigNotice("goose", [gooseConfigMerge], gooseRoot, {}), null, "an unset XDG_CONFIG_HOME reads the written file");
assert.equal(gooseXdgConfigNotice("goose", [gooseConfigMerge], gooseRoot, { XDG_CONFIG_HOME: "  " }), null, "a blank value is no override");
assert.equal(
  gooseXdgConfigNotice("goose", [gooseConfigMerge], gooseRoot, { XDG_CONFIG_HOME: path.join(gooseRoot, ".config") }),
  null,
  "the same directory is the same file",
);
assert.equal(gooseXdgConfigNotice("goose", [], gooseRoot, { XDG_CONFIG_HOME: elsewhere }), null, "a plan without the Goose route is outside the notice");
assert.equal(
  gooseXdgConfigNotice("goose", [gooseCleanupMerge], gooseRoot, { XDG_CONFIG_HOME: elsewhere }),
  null,
  "pruning the legacy route writes no extensions to read",
);
assert.equal(gooseXdgConfigNotice("zed", [gooseConfigMerge], gooseRoot, { XDG_CONFIG_HOME: elsewhere }), null, "only Goose's loader is qualified");

// OpenCode reads its user root under XDG_CONFIG_HOME, and OpenCode 2 reads OPENCODE_CONFIG_DIR in its
// place, so only a user root the client would not read earns a notice.
const opencodeUserWrite = { relativeOutput: path.join(".config", "opencode", "AGENTS.md") };
const opencodeProjectWrite = { relativeOutput: path.join(".opencode", "agents", "boss.md") };
const opencodeRoot = path.join(os.tmpdir(), "agent-surface-notice-opencode");
const opencodeCodes = (target, writes, env) => opencodeConfigRootNotices(target, writes, [], opencodeRoot, env).map((notice) => notice.code);
assert.deepEqual(opencodeCodes("opencode", [opencodeUserWrite], { XDG_CONFIG_HOME: elsewhere }), ["OPENCODE_XDG_CONFIG_HOME_SET"]);
assert.deepEqual(opencodeCodes("opencode", [opencodeUserWrite], { OPENCODE_CONFIG_DIR: elsewhere }), ["OPENCODE_CONFIG_DIR_SET"]);
assert.deepEqual(opencodeCodes("opencode", [opencodeUserWrite], {}), [], "unset variables read the written root");
assert.deepEqual(opencodeCodes("opencode", [opencodeUserWrite], { XDG_CONFIG_HOME: " ", OPENCODE_CONFIG_DIR: " " }), [], "blank values are no override");
assert.deepEqual(
  opencodeCodes("opencode", [opencodeUserWrite], { XDG_CONFIG_HOME: path.join(opencodeRoot, ".config"), OPENCODE_CONFIG_DIR: path.join(opencodeRoot, ".config", "opencode") }),
  [],
  "variables naming the written root name the same files",
);
assert.deepEqual(opencodeCodes("opencode", [opencodeProjectWrite], { XDG_CONFIG_HOME: elsewhere, OPENCODE_CONFIG_DIR: elsewhere }), [], "a project install is outside both notices");
assert.deepEqual(opencodeCodes("kilo", [opencodeUserWrite], { XDG_CONFIG_HOME: elsewhere }), [], "only OpenCode's loader is qualified");
// An MCP-only plan writes no file of its own, only the opencode.json merge.
const opencodeMcpMerge = { relativeOutput: path.join(".config", "opencode", "opencode.json"), entries: [["synapse", { type: "local" }]] };
assert.deepEqual(
  opencodeConfigRootNotices("opencode", [], [opencodeMcpMerge], opencodeRoot, { XDG_CONFIG_HOME: elsewhere }).map((notice) => notice.code),
  ["OPENCODE_XDG_CONFIG_HOME_SET"],
  "a user-root config merge alone earns the notice",
);

const scratch = mkdtempSync(path.join(os.tmpdir(), "agent-surface-notices-"));
try {
  const home = path.join(scratch, "home");

  // Stored notices stay with their target: one run, two plans.
  const combined = planSections(run(["install", "--target", "openhands,cursor", "--scope", "project", "--dest", path.join(scratch, "combined"), "--dry-run"]));
  assert.match(combined.openhands, /^ {2}OPENHANDS_CLI_LEGACY \(maintenance; target\)$/m);
  assert.match(combined.openhands, /^ {2}OPENHANDS_MANUAL_SKILLS_MODEL_INVOCABLE \(compatibility; skills\)$/m);
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

  // The Goose notice follows the environment the install runs in, not the scope. POSIX only: the
  // Windows config route is under AppData, where XDG_CONFIG_HOME plays no part.
  if (process.platform !== "win32") {
    const gooseDest = path.join(scratch, "goose");
    const gooseEnv = { ...process.env, HOME: home };
    delete gooseEnv.XDG_CONFIG_HOME;
    const gooseWritten = run(["install", "--target", "goose", "--scope", "user", "--dest", gooseDest, "--dry-run"], {
      env: { ...gooseEnv, XDG_CONFIG_HOME: path.join(gooseDest, ".config") },
    });
    assert.doesNotMatch(gooseWritten, /GOOSE_XDG_CONFIG_HOME_SET/, "the written config home needs no notice");
    const gooseElsewhere = run(["install", "--target", "goose", "--scope", "user", "--dest", gooseDest, "--dry-run"], {
      env: { ...gooseEnv, XDG_CONFIG_HOME: path.join(scratch, "xdg") },
    });
    assert.match(gooseElsewhere, /^ {2}GOOSE_XDG_CONFIG_HOME_SET \(compatibility; mcp\)$/m);
  }

  // The OpenCode notices follow the environment too, and only for the user root.
  const opencodeEnv = { ...process.env, HOME: home };
  delete opencodeEnv.XDG_CONFIG_HOME;
  delete opencodeEnv.OPENCODE_CONFIG_DIR;
  const opencodeUser = run(["install", "--target", "opencode", "--scope", "user", "--dest", path.join(scratch, "opencode"), "--dry-run"], {
    env: { ...opencodeEnv, XDG_CONFIG_HOME: path.join(scratch, "xdg"), OPENCODE_CONFIG_DIR: path.join(scratch, "opencode-dir") },
  });
  assert.match(opencodeUser, /^ {2}OPENCODE_XDG_CONFIG_HOME_SET \(compatibility; target\)$/m);
  assert.match(opencodeUser, /^ {2}OPENCODE_CONFIG_DIR_SET \(compatibility; target\)$/m);
  const opencodeProject = run(["install", "--target", "opencode", "--scope", "project", "--dest", path.join(scratch, "opencode-project"), "--dry-run"], {
    env: { ...opencodeEnv, XDG_CONFIG_HOME: path.join(scratch, "xdg"), OPENCODE_CONFIG_DIR: path.join(scratch, "opencode-dir") },
  });
  assert.doesNotMatch(opencodeProject, /OPENCODE_XDG_CONFIG_HOME_SET|OPENCODE_CONFIG_DIR_SET/, "a project install is outside both notices");

  // Build prints each target's notices before any write; doctor lists every stored notice.
  const windsurfPlan = run(["install", "--target", "windsurf", "--scope", "project", "--dest", path.join(scratch, "windsurf"), "--dry-run"], {
    env: { ...process.env, HOME: home },
  });
  assert.match(windsurfPlan, /^  WINDSURF_CASCADE_LEGACY \(retirement; target; /m);
  assert.match(windsurfPlan, /^  WINDSURF_RULE_SIZE_LIMITS \(compatibility; rules\)/m);
  const poolBuild = run(["build", "--target", "pool", "--dry-run"]);
  assert.match(poolBuild, /^pool notice: POOL_AGENTS_MD_CLIENT_FLOOR \(/m);
  assert.ok(poolBuild.indexOf("pool notice:") < poolBuild.indexOf("[dry-run]"), "notices precede the planned writes");
  const doctor = run(["doctor"], { env: { ...process.env, HOME: home } });
  assert.match(doctor, /^notice windsurf: WINDSURF_RULE_SIZE_LIMITS \(/m);
  assert.match(doctor, /^notice pool: POOL_AGENTS_MD_CLIENT_FLOOR \(/m);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log("notices: ok");
