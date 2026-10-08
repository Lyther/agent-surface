#!/usr/bin/env node
// Output size limits (contract, Validation Ownership): the planner refuses a selected document its
// host cannot load whole, before any write, and judges only the effective selection. POSIX only, like
// the ownership suite.
//
// SUBSTITUTE_JUSTIFICATION
// - substitute: a scratch HOME and XDG_CONFIG_HOME for every install
// - replaces: the operator's real home directory
// - necessity: installs read config under HOME; the operator's home must stay untouched
// - real-option: the real CLI, planner and filesystem run unchanged; only the home location differs
// - proof-limit: proves the planner's refusal, not how much of a file Cascade actually loads
// - real-proof: Cascade's documented limits (docs.devin.ai/desktop/cascade/memories); no Cascade client was run
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { outputLimitError } from "../../scripts/agent-surface/install.mjs";
import { status } from "../lib/helpers.mjs";

if (process.platform === "win32") {
  console.log("limits: skipped on Windows (POSIX suite)");
  process.exit(0);
}

// The character unit is undocumented, so a document must fit both as code points and as UTF-16 units.
const limited = (content) => outputLimitError({ relativeOutput: "rules.md", content, characterLimit: 10 });
assert.equal(limited("a".repeat(10)), null, "a document exactly at the limit fits");
assert.match(limited("a".repeat(11)), /^OUTPUT_LIMIT_EXCEEDED: rules\.md is 11 code points \(11 UTF-16 units, 11 bytes\)/);
assert.equal(limited("é".repeat(10)), null, "bytes are reported, not counted");
assert.equal(limited("😀".repeat(5)), null);
assert.match(limited("😀".repeat(6)), /is 6 code points \(12 UTF-16 units, 24 bytes\)/, "an astral character counts twice as UTF-16");
assert.equal(outputLimitError({ relativeOutput: "rules.md", content: "a".repeat(99) }), null, "an output without a limit never blocks");

const scratch = mkdtempSync(path.join(os.tmpdir(), "agent-surface-limits-"));
const env = { ...process.env, HOME: path.join(scratch, "home"), XDG_CONFIG_HOME: path.join(scratch, "home", ".config") };

function install(args) {
  const result = status(["install", "--target", "windsurf", ...args], { env });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

function snapshot(dir, entries = {}, base = dir) {
  if (!existsSync(dir)) return entries;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) snapshot(full, entries, base);
    else entries[path.relative(base, full)] = readFileSync(full, "utf8");
  }
  return entries;
}

try {
  // Cascade's global rules file holds 6,000 characters and the user-scope rules render more, so only a
  // selection without rules installs there.
  const user = path.join(scratch, "user");
  const skills = install(["--scope", "user", "--dest", user, "--category", "skills"]);
  assert.equal(skills.code, 0, skills.out);
  assert.doesNotMatch(skills.out, /OUTPUT_LIMIT_EXCEEDED: /, "unselected oversized rules do not block");
  const before = snapshot(scratch);
  for (const selection of [["--category", "rules"], []]) {
    const refused = install(["--scope", "user", "--dest", user, ...selection]);
    assert.notEqual(refused.code, 0, refused.out);
    assert.match(refused.out, /OUTPUT_LIMIT_EXCEEDED: \.codeium\/windsurf\/memories\/global_rules\.md is \d+ code points .* at most 6000 characters/);
    assert.deepEqual(snapshot(scratch), before, "a refused plan writes nothing, in the install root or under HOME");
  }

  // A workspace rule file holds 12,000: the general project rules fit, development rules do not.
  const project = path.join(scratch, "project");
  const general = install(["--scope", "project", "--dest", project, "--category", "rules"]);
  assert.equal(general.code, 0, general.out);
  const development = install(["--scope", "project", "--dest", project, "--category", "development"]);
  assert.notEqual(development.code, 0, development.out);
  assert.match(development.out, /OUTPUT_LIMIT_EXCEEDED: \.devin\/rules\/agent-surface\.md is \d+ code points .* at most 12000 characters/);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log("limits: ok");
