#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { root } from "../lib/helpers.mjs";

const workflowRuntime = readFileSync(path.join(root, "skills", "workflow-runtime", "SKILL.md"), "utf8");
const opsNukeCommand = readFileSync(path.join(root, "commands", "ops-nuke.md"), "utf8");

// ops-nuke: isolated first-commit respawn with one informed arm gate and untouched rollback tree.
assert.match(opsNukeCommand, /branch from the repository's first commit/i);
assert.match(opsNukeCommand, /separate worktree/i);
assert.match(opsNukeCommand, /original branch and worktree remain untouched/i);
assert.match(opsNukeCommand, /## 4\. ARM GATE/);
assert.match(opsNukeCommand, /One informed confirmation arms the run/i);
assert.match(opsNukeCommand, /git worktree add -b respawn/);
assert.match(opsNukeCommand, /Never run reset, clean, checkout-overwrite, or deletion in the original worktree/i);

assert.match(workflowRuntime, /^## PHASE GATE - EVALUATE FIRST$/m);
assert.match(workflowRuntime, /Do not call any tool, including shell, file-read, MCP, search, or `echo`/);
assert.match(workflowRuntime, /--phase inspect\|discovery\|materialization\|mcp\|full/);
assert.match(workflowRuntime, /BLOCKED: external_driver_required/);
assert.match(workflowRuntime, /\| Cline \| Agent Skill \| model `use_skill` action \|/);
assert.doesNotMatch(workflowRuntime, /\| Cline \| workflow Markdown \|/);
assert.match(workflowRuntime, /require `share` to be exactly `disabled`/);

console.log("policy: ok");
