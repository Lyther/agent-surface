#!/usr/bin/env node
import * as TOML from "@decimalturn/toml-patch";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { run, status } from "../lib/helpers.mjs";

// Table-driven live install smoke: each installable target must write a manifest
// with managed entries. Distinct from build/check generated (render path only).
for (const target of [
  "codex",
  "cursor",
  "copilot",
  "vscode",
  "dsh",
  "qoder",
  "qwen-code",
  "kiro",
  "opencode",
  "trae",
  "kilo",
  "kimi-code",
  "droid",
  "deepagents",
  "goose",
  "grok-build",
  "openhands",
  "pi",
  "pool",
  "windsurf",
  "zed",
]) {
  const targetDest = `/tmp/agent-surface-${target}-live`;
  rmSync(targetDest, { recursive: true, force: true });
  try {
    const installArgs = ["install", "--target", target, "--dest", targetDest];
    if (target === "kiro") installArgs.push("--scope", "user");
    const install = run(installArgs);
    assert.match(install, /^installed:$/m, `${target}: install summary`);
    const manifest = JSON.parse(readFileSync(path.join(targetDest, ".agent-surface", `${target}-manifest.json`), "utf8"));
    assert.equal(manifest.target, target);
    assert.equal(manifest.managed.length > 0, true, `${target}: managed entries`);
    if (target === "kilo") {
      const kiloConfig = JSON.parse(readFileSync(path.join(targetDest, "kilo.jsonc"), "utf8"));
      assert.deepEqual(kiloConfig.instructions, [
        ".kilo/rules/00-precedence-and-safety.md",
        ".kilo/rules/01-response-style.md",
      ]);
      run([...installArgs, "--category", "development"]);
      const developmentConfig = JSON.parse(readFileSync(path.join(targetDest, "kilo.jsonc"), "utf8"));
      assert.deepEqual(developmentConfig.instructions, [
        ".kilo/rules/00-precedence-and-safety.md",
        ".kilo/rules/01-response-style.md",
        ".kilo/rules/02-agent-workflow.md",
        ".kilo/rules/03-project-defaults.md",
        ".kilo/rules/05-tooling.md",
        ".kilo/rules/06-test-policy.md",
      ]);
      assert.deepEqual(developmentConfig.permission, { "*": "allow" });
      assert.equal(developmentConfig.share, "disabled");
      // A later full general install reconciles the instruction list back to the baseline —
      // the development rule paths must not linger after their .kilo/rules files are pruned.
      run(installArgs);
      const restoredConfig = JSON.parse(readFileSync(path.join(targetDest, "kilo.jsonc"), "utf8"));
      assert.deepEqual(restoredConfig.instructions, [
        ".kilo/rules/00-precedence-and-safety.md",
        ".kilo/rules/01-response-style.md",
      ]);
    }
    if (target === "codex") {
      const instructionPath = path.join(targetDest, ".codex", "AGENTS.md");
      assert.match(readFileSync(instructionPath, "utf8"), /^## 00-precedence-and-safety\.mdc$/m);
      run([...installArgs, "--category", "development"]);
      const developmentInstructions = readFileSync(instructionPath, "utf8");
      assert.match(developmentInstructions, /^## 00-precedence-and-safety\.mdc$/m);
      assert.match(developmentInstructions, /^## 02-agent-workflow\.mdc$/m);
      run([...installArgs, "--category", "cybersecurity"]);
      const cybersecurityInstructions = readFileSync(instructionPath, "utf8");
      assert.match(cybersecurityInstructions, /^## 00-precedence-and-safety\.mdc$/m);
      assert.match(cybersecurityInstructions, /^## 02-agent-workflow\.mdc$/m);
      // A combined asset-category install must still emit the always-on instruction document
      // (not just the category's skills), carrying baseline + development always-on rules.
      run([...installArgs, "--category", "development,cybersecurity"]);
      const combinedInstructions = readFileSync(instructionPath, "utf8");
      assert.match(combinedInstructions, /^## 00-precedence-and-safety\.mdc$/m);
      assert.match(combinedInstructions, /^## 02-agent-workflow\.mdc$/m);

      // An output-only rules refresh must not quietly rewrite this document back to the general
      // baseline: it is a single file carrying development's always-on rules, and dropping them
      // here would leave development's skills installed beside rules that no longer mention them.
      // The manifest knows the document is development-owned, so the operation is refused BEFORE
      // writing — the alternative, reassembling the contribution, is not something one recorded
      // category can do faithfully.
      const refresh = status([...installArgs, "--category", "rules"]);
      assert.notEqual(refresh.status, 0, `codex: an output-only rules refresh over a category-owned document is refused: ${refresh.stdout}`);
      assert.match(refresh.stdout, /AGENTS\.md carries the development category's contribution/, `codex: the refusal names the document and its owner: ${refresh.stdout}${refresh.stderr}`);
      assert.equal(readFileSync(instructionPath, "utf8"), combinedInstructions, "codex: the refused refresh left the document byte-identical");
      // And the refusal is not a dead end: the owning category still refreshes it.
      run([...installArgs, "--category", "development"]);
      assert.match(readFileSync(instructionPath, "utf8"), /^## 02-agent-workflow\.mdc$/m, "codex: re-running the owning category restores the document");

      run(installArgs);
      run([...installArgs, "--category", "development,cybersecurity,private,modding", "--service", "synapse,grimoire"]);
      const primaryMcpConfig = TOML.parse(readFileSync(path.join(targetDest, ".codex", "config.toml"), "utf8"));
      assert.deepEqual(Object.keys(primaryMcpConfig.mcp_servers).sort(), ["grimoire", "synapse"]);
      assert.match(readFileSync(instructionPath, "utf8"), /^## 02-agent-workflow\.mdc$/m);
      for (const skill of ["dev-feature", "solve-challenge", "stellaris-design"]) {
        assert.ok(existsSync(path.join(targetDest, ".agents", "skills", skill, "SKILL.md")), skill);
      }
    }
    if (target === "cursor") {
      // The per-file counterpart to the codex case above, and the reason that one is refused rather
      // than rewritten: here each rule is its own managed output, so an output-only refresh has
      // nothing to overwrite and development's rules simply stay. Same command, same sequence, no
      // refusal — the contract differs because the host's rule surface does.
      const ruleDir = path.join(targetDest, ".cursor", "rules");
      run([...installArgs, "--category", "development"]);
      assert.ok(existsSync(path.join(ruleDir, "02-agent-workflow.mdc")), "cursor: development contributes its own rule file");
      const refresh = status([...installArgs, "--category", "rules"]);
      assert.equal(refresh.status, 0, `cursor: a per-file rule host refreshes without refusal: ${refresh.stdout}${refresh.stderr}`);
      assert.ok(existsSync(path.join(ruleDir, "02-agent-workflow.mdc")), "cursor: and development's rule file survives the refresh");
      assert.ok(existsSync(path.join(ruleDir, "00-precedence-and-safety.mdc")), "cursor: alongside the baseline rules");
    }
    if (target === "opencode") {
      const openCodeConfig = JSON.parse(readFileSync(path.join(targetDest, ".opencode", "opencode.json"), "utf8"));
      assert.deepEqual(openCodeConfig.permission, { "*": "allow" });
      assert.equal(openCodeConfig.share, "disabled");
    }
    if (target === "kimi-code") {
      assert.match(
        readFileSync(path.join(targetDest, ".kimi-code", "config.toml"), "utf8"),
        /^default_permission_mode = "auto"$/m,
      );
      const kimiMcp = JSON.parse(readFileSync(path.join(targetDest, ".kimi-code", "mcp.json"), "utf8"));
      assert.equal(Object.hasOwn(kimiMcp.mcpServers.synapse, "type"), false);
    }
    if (target === "qoder") {
      const settings = JSON.parse(readFileSync(path.join(targetDest, ".qoder", "settings.json"), "utf8"));
      assert.equal(settings.general.defaultPermissionMode, "bypass_permissions");
      assert.equal(settings.skills.loadFromAgentsDirectory, false);
      assert.equal(Object.hasOwn(settings.mcpServers.synapse, "type"), false);
    }
    if (target === "qwen-code") {
      const settings = JSON.parse(readFileSync(path.join(targetDest, ".qwen", "settings.json"), "utf8"));
      assert.equal(settings.tools.approvalMode, "yolo");
      assert.equal(Object.hasOwn(settings.mcpServers.synapse, "type"), false);
    }
    if (target === "kiro") {
      assert.match(
        readFileSync(path.join(targetDest, ".kiro", "settings", "permissions.yaml"), "utf8"),
        /^rules:\n  - capability: all\n    effect: allow\n$/,
      );
    }
    if (target === "grok-build") {
      const config = readFileSync(path.join(targetDest, ".grok", "config.toml"), "utf8");
      assert.doesNotMatch(config, /^permission_mode =/m);
      assert.match(config, /^\[mcp_servers\.synapse\]$/m);
    }
  } finally {
    rmSync(targetDest, { recursive: true, force: true });
  }
}

console.log("install-live: ok");
