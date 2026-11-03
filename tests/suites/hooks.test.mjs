#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { root, stripAiAttributionHook } from "../lib/helpers.mjs";

function assertStripAiAttributionHook() {
  const tmpDir = mkdtempSync("/tmp/agent-surface-strip-ai-");
  try {
    const messagePath = path.join(tmpDir, "COMMIT_EDITMSG");
    const original = [
      "feat(cursor): keep technical scope",
      "",
      "Real body mentioning Cursor as a first-class target.",
      "",
      "Co-authored-by: Human Cursor <human.cursor@example.com>",
      "Co-authored-by: Cursor <cursoragent@cursor.com>",
      "🤖 Generated with [Claude Code](https://claude.ai/code)",
      "Generated-by: Cursor Agent",
      "",
    ].join("\n");
    writeFileSync(messagePath, original);

    const strip = spawnSync(stripAiAttributionHook, [messagePath], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(strip.status, 0, strip.stderr);
    assert.match(strip.stderr, /removed AI attribution/);
    const cleaned = readFileSync(messagePath, "utf8");
    assert.match(cleaned, /^feat\(cursor\): keep technical scope/);
    assert.match(cleaned, /Real body mentioning Cursor as a first-class target/);
    assert.match(cleaned, /Co-authored-by: Human Cursor <human.cursor@example.com>/);
    assert.doesNotMatch(cleaned, /cursoragent@cursor\.com/);
    assert.doesNotMatch(cleaned, /Generated with/);
    assert.doesNotMatch(cleaned, /Generated-by/);

    const unrelatedPath = path.join(tmpDir, "UNRELATED_EDITMSG");
    const unrelated = [
      "docs: preserve unrelated vendor notes",
      "",
      "Generated with Codex during a benchmark note.",
      "Generated-by: Gemini CLI",
      "Co-authored-by: OpenAI User <human.openai@example.com>",
      "",
    ].join("\n");
    writeFileSync(unrelatedPath, unrelated);
    const unrelatedCheck = spawnSync(stripAiAttributionHook, ["--check", unrelatedPath], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(unrelatedCheck.status, 0, unrelatedCheck.stderr);
    assert.equal(readFileSync(unrelatedPath, "utf8"), unrelated);

    writeFileSync(messagePath, original);
    const check = spawnSync(stripAiAttributionHook, ["--check", messagePath], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(check.status, 1);
    assert.match(check.stderr, /AI attribution or vendor advertising found/);
    assert.equal(readFileSync(messagePath, "utf8"), original);

    // Trailers other hosts inject, which the user policy bans as well.
    const otherTools = [
      "fix: other tool trailers",
      "",
      "Made-with: Cursor",
      "Signed-off-by: Claude <noreply@anthropic.com>",
      "Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>",
      "Co-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>",
      "Generated-by: GitHub Copilot",
      "",
    ].join("\n");
    writeFileSync(messagePath, otherTools);
    const otherStrip = spawnSync(stripAiAttributionHook, [messagePath], { cwd: root, encoding: "utf8" });
    assert.equal(otherStrip.status, 0, otherStrip.stderr);
    assert.equal(readFileSync(messagePath, "utf8"), "fix: other tool trailers\n");

    // Prose that merely mentions a tool, and a message ending in a blank line, are not attribution.
    for (const text of [
      "fix: keep prose\n\nGenerated with cursory notes from review.\nGenerated with Cursor rules kept in sync.\n",
      "fix: trailing blank line\n\n",
    ]) {
      writeFileSync(messagePath, text);
      const prose = spawnSync(stripAiAttributionHook, ["--check", messagePath], { cwd: root, encoding: "utf8" });
      assert.equal(prose.status, 0, `${JSON.stringify(text)}: ${prose.stderr}`);
      assert.equal(readFileSync(messagePath, "utf8"), text);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

assertStripAiAttributionHook();
console.log("hooks: ok");
