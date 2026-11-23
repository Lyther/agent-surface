import assert from "node:assert/strict";
import { test } from "node:test";
import { SERVER_INSTRUCTIONS, TOOL_DESCRIPTIONS } from "../src/contract.js";

test("instructions open with a self-contained trigger line that fits the codex summary, within the claude-code cap", () => {
  const [first = ""] = SERVER_INSTRUCTIONS.split("\n");
  assert.ok(first.length <= 250, `first line is ${first.length} characters`);
  assert.match(first, /memory_recall/);
  assert.match(first, /memory_remember/);
  assert.ok(SERVER_INSTRUCTIONS.length <= 4096, `instructions are ${SERVER_INSTRUCTIONS.length} characters`);
});

test("recall and remember say why to use them over the host's own memory", () => {
  assert.match(TOOL_DESCRIPTIONS["memory_recall"]!, /every agent and host/i);
  assert.match(TOOL_DESCRIPTIONS["memory_remember"]!, /host's own memory reaches only that host/i);
});
