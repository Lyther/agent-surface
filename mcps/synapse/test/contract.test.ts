import assert from "node:assert/strict";
import { test } from "node:test";
import { SERVER_INSTRUCTIONS } from "../src/contract.js";

test("instructions open with a self-contained trigger line within the host display limits", () => {
  const [first = ""] = SERVER_INSTRUCTIONS.split("\n");
  // Codex shows only the first line of the instructions, at most 250 characters.
  assert.ok(first.length <= 250, `first line is ${first.length} characters`);
  assert.match(first, /memory_recall/);
  assert.match(first, /memory_remember/);
  // Claude Code cuts the instructions at 4,096 characters.
  assert.ok(SERVER_INSTRUCTIONS.length <= 4096, `instructions are ${SERVER_INSTRUCTIONS.length} characters`);
});
