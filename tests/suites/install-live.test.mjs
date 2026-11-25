#!/usr/bin/env node
import * as TOML from "@decimalturn/toml-patch";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ownTempRoot, run, status, useDisposableHome } from "../lib/helpers.mjs";

const ownTmp = ownTempRoot("install-live");
const RULES = ["code", "core", "git", "hitl", "repository", "task", "test", "tool"];

// Live installs here wire credentialed MCP servers, which write the shared env launcher into HOME.
const disposableHome = useDisposableHome();

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
  "trae-cn",
  "trae-cli",
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
  const targetDest = ownTmp(`${target}-live`);
  rmSync(targetDest, { recursive: true, force: true });
  try {
    const installArgs = ["install", "--target", target, "--dest", targetDest];
    if (target === "kiro") installArgs.push("--scope", "user");
    const install = run(installArgs);
    assert.match(install, /^installed:$/m, `${target}: install summary`);
    const manifest = JSON.parse(readFileSync(path.join(targetDest, ".agent-surface", `${target}-manifest.json`), "utf8"));
    assert.equal(manifest.target, target);
    assert.equal(manifest.managed.length > 0, true, `${target}: managed entries`);

    // A skill's companion files must arrive with it wherever it lands. This is asserted against the
    // INSTALLED tree, not the source checkout, because resolving there is the entire point: a body
    // that references `references/<file>.md` is read from the installed location at runtime.
    const installedSkill = manifest.managed.find((entry) => entry.output.endsWith(path.join("ops-swarm", "SKILL.md")));
    if (installedSkill) {
      const skillDir = path.join(targetDest, path.dirname(installedSkill.output));
      const body = readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
      // Either spelling a body might legitimately use: `references/x.md` or [text](references/x.md).
      // What matters is that a reference RESOLVES from the installed skill, not how it was written.
      const referenced = [...new Set([...body.matchAll(/(?:\]\(|`)(references\/[^)`\s]+)(?:\)|`)/g)].map((match) => match[1]))];
      assert.ok(referenced.length > 0, `${target}: the installed body still points at its companions`);
      for (const reference of referenced) {
        const resource = path.join(skillDir, reference);
        assert.ok(existsSync(resource), `${target}: ${reference} resolves from the installed skill directory`);
        assert.ok(readFileSync(resource, "utf8").length > 0, `${target}: ${reference} arrived with its contents`);
        assert.ok(manifest.managed.some((entry) => entry.output === path.join(path.dirname(installedSkill.output), reference)), `${target}: ${reference} is tracked as a managed output, so ownership cleanup governs it`);
      }
    }
    if (target === "kilo") {
      // Every selection that writes rules lists all of them.
      const allRules = RULES.map((rule) => `.kilo/rules/agent-surface-${rule}.md`);
      const kiloConfig = JSON.parse(readFileSync(path.join(targetDest, "kilo.jsonc"), "utf8"));
      assert.deepEqual(kiloConfig.instructions, allRules);
      run([...installArgs, "--category", "development"]);
      const developmentConfig = JSON.parse(readFileSync(path.join(targetDest, "kilo.jsonc"), "utf8"));
      assert.deepEqual(developmentConfig.instructions, allRules);
      assert.deepEqual(developmentConfig.permission, { "*": "allow" });
      assert.equal(developmentConfig.share, "disabled");
    }
    if (target === "codex") {
      // A project install writes the root AGENTS.md Codex reads, not the .codex/AGENTS.md it never does.
      const instructionPath = path.join(targetDest, "AGENTS.md");
      const instructions = readFileSync(instructionPath, "utf8");
      for (const rule of RULES) assert.match(instructions, new RegExp(`^## ${rule}\\.md$`, "m"));
      assert.equal(existsSync(path.join(targetDest, ".codex", "AGENTS.md")), false);
      // Every selection that writes rules writes this same document, so none rewrites it.
      for (const category of ["development", "cybersecurity", "development,cybersecurity", "rules"]) {
        run([...installArgs, "--category", category]);
        assert.equal(readFileSync(instructionPath, "utf8"), instructions, `codex --category ${category}`);
      }

      run(installArgs);
      run([...installArgs, "--category", "development,cybersecurity,private", "--service", "synapse,grimoire"]);
      const primaryMcpConfig = TOML.parse(readFileSync(path.join(targetDest, ".codex", "config.toml"), "utf8"));
      assert.deepEqual(Object.keys(primaryMcpConfig.mcp_servers).sort(), ["grimoire", "synapse"]);
      assert.equal(readFileSync(instructionPath, "utf8"), instructions);
      for (const skill of ["dev-feature", "solve-challenge"]) {
        assert.ok(existsSync(path.join(targetDest, ".agents", "skills", skill, "SKILL.md")), skill);
      }
    }
    if (target === "cursor") {
      const ruleDir = path.join(targetDest, ".cursor", "rules");
      const ruleFiles = () => readdirSync(ruleDir).sort();
      const ownRules = RULES.map((rule) => `agent-surface-${rule}.mdc`);
      assert.deepEqual(ruleFiles(), ownRules);
      // The operator's own rule named like one of agent-surface's stays as written.
      writeFileSync(path.join(ruleDir, "core.mdc"), "the operator's core rule\n");
      run([...installArgs, "--category", "development"]);
      assert.deepEqual(ruleFiles(), ["core.mdc", ...ownRules].sort(), "cursor: a development install writes the same rule files");
      assert.equal(readFileSync(path.join(ruleDir, "core.mdc"), "utf8"), "the operator's core rule\n");
    }
    if (target === "opencode") {
      const openCodeConfig = JSON.parse(readFileSync(path.join(targetDest, ".opencode", "opencode.json"), "utf8"));
      assert.deepEqual(openCodeConfig.permission, { "*": "allow" });
      assert.equal(openCodeConfig.share, "disabled");
    }
    if (target === "kimi-code") {
      assert.equal(existsSync(path.join(targetDest, ".kimi-code", "config.toml")), false, "Kimi reads config.toml only from KIMI_CODE_HOME");
      assert.match(readFileSync(path.join(targetDest, "AGENTS.md"), "utf8"), /^## core\.md$/m);
      assert.equal(existsSync(path.join(targetDest, ".kimi-code", "AGENTS.md")), false, "the rules load once, from the shared root AGENTS.md");
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
      assert.match(readFileSync(path.join(targetDest, "AGENTS.md"), "utf8"), /^## core\.md$/m);
      assert.equal(existsSync(path.join(targetDest, "QWEN.md")), false, "the rules load once, from the shared root AGENTS.md");
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

disposableHome.restore();
console.log("install-live: ok");
