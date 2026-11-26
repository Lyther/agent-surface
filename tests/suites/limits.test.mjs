#!/usr/bin/env node
// Output size limits (contract, Validation Ownership): a selected document larger than its host reads
// blocks the plan.
import assert from "node:assert/strict";

import { outputLimitError } from "../../scripts/agent-surface/install.mjs";
import { codexStaticOutputs } from "../../scripts/agent-surface/targets.mjs";

assert.equal(outputLimitError({ relativeOutput: "rules.md", content: "a".repeat(99) }), null, "an output without a limit never blocks");

// Codex's project_doc_max_bytes counts bytes, so a multi-byte document blocks below 10 characters.
const byteLimited = (content) => outputLimitError({ relativeOutput: "AGENTS.md", content, byteLimit: 10 });
assert.equal(byteLimited("a".repeat(10)), null, "a document exactly at the byte limit fits");
assert.match(byteLimited("é".repeat(6)), /^OUTPUT_LIMIT_EXCEEDED: AGENTS\.md is 12 bytes and its host reads at most 10 bytes/);
// Only the project AGENTS.md carries the limit; Codex reads ~/.codex/AGENTS.md whole.
const [codexProject] = await codexStaticOutputs([], { target: "codex", scope: "project", mode: "install", categoryFilter: null });
assert.equal(codexProject.relativeOutput, "AGENTS.md");
assert.equal(codexProject.byteLimit, 32 * 1024);
const [codexUser] = await codexStaticOutputs([], { target: "codex", scope: "user", mode: "install", categoryFilter: null });
assert.equal(codexUser.byteLimit, undefined);

console.log("limits: ok");
