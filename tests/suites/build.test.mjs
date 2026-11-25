#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { vsCodeUserRoot } from "../../scripts/agent-surface/roots.mjs";
import { readSkills } from "../../scripts/agent-surface/skills.mjs";
import { subagentOutputs } from "../../scripts/agent-surface/source-primitives.mjs";
import { codexOpenAiAgentPolicyOutput, externalSkillOutputs, produceSkillOutputs, targets } from "../../scripts/agent-surface/targets.mjs";
import {
  assertCodexAgentTomlParses,
  disposableCheckout,
  files,
  hasLocalOpsServerSkill,
  ownTempRoot, root, run, status,
} from "../lib/helpers.mjs";

const buildAll = run(["build", "--target", "all"]);
const generated = files(path.join(root, "dist"));

// A deprecated target leaves `all` visibly, and build refuses it by name instead of writing rules its
// host cannot load (contract, Selection and Compatibility).
assert.match(buildAll, /^windsurf: excluded from --target all \(deprecated; not buildable\)$/m);
assert.equal(existsSync(path.join(root, "dist", "windsurf")), false, "an all-target build writes no deprecated target");
const windsurfBuild = status(["build", "--target", "windsurf"]);
assert.notEqual(windsurfBuild.status, 0);
assert.match(windsurfBuild.stderr, /windsurf is not buildable/);
assert.equal(existsSync(path.join(root, "dist", "windsurf")), false, "a refused build writes nothing");
assert.ok(existsSync(path.join(root, "dist", "codex")), "a refused build leaves the existing dist in place");

// Served anthropic packs must not leak into host skill catalogs.
assert.equal(generated.some((file) => file.includes(`${path.sep}agent-surface-cybersecurity${path.sep}`)), false);
assert.equal(generated.some((file) => file.includes(`${path.sep}conducting-cloud-penetration-testing${path.sep}`)), false);
const anthropicCybersecuritySkillRoot = path.join(root, "external", "anthropic-cybersecurity-skills", "skills");
if (existsSync(anthropicCybersecuritySkillRoot)) {
  const skillNames = readdirSync(anthropicCybersecuritySkillRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(path.join(anthropicCybersecuritySkillRoot, entry.name, "SKILL.md")))
    .map((entry) => entry.name);
  assert.notEqual(skillNames.length, 0);
  for (const skillName of skillNames) {
    assert.equal(
      generated.some((file) => file.includes(`${path.sep}${skillName}${path.sep}SKILL.md`) || file.endsWith(`${path.sep}${skillName}.md`)),
      false,
      `served skill leaked into dist: ${skillName}`,
    );
  }
}

assert.match(run(["check", "generated"]), /generated check: ok/);
assertCodexAgentTomlParses();

const mustExist = [
  ["claude-code", path.join(".claude", "skills", "workflow-runtime", "SKILL.md")],
  ["claude-code", path.join(".claude", "skills", "dev-spec", "SKILL.md")],
  ["claude-code", path.join(".claude", "skills", "arch-contract", "SKILL.md")],
  ["codex", path.join(".agents", "skills", "workflow-runtime", "SKILL.md")],
  ["codex", path.join(".agents", "skills", "dev-core", "SKILL.md")],
  ["codex", path.join(".agents", "skills", "arch-contract", "SKILL.md")],
  ["codex", path.join(".codex", "AGENTS.md")],
  ["cline", path.join(".cline", "skills", "verify-readiness", "SKILL.md")],
  ["cline", path.join("Documents", "Cline", "Rules", "agent-surface.md")],
  ["cline", path.join(".cline", "agents", "explorer.yaml")],
  ["kilo", path.join(".config", "kilo", "kilo.jsonc")],
  ["kilo", path.join(".kilo", "skills", "verify-readiness", "SKILL.md")],
  ["kimi-code", path.join("skills", "workflow-runtime", "SKILL.md")],
  ["kimi-code", "AGENTS.md"],
  ["kimi-code", path.join("agents", "explorer.md")],
  ["kimi-code", "config.toml"],
  ["kimi-code", "mcp.json"],
  ["dsh", path.join(".dsh", "skills", "workflow-runtime", "SKILL.md")],
  ["qoder", path.join(".qoder", "skills", "workflow-runtime", "SKILL.md")],
  ["qoder", path.join(".qoder", "agents", "explorer.md")],
  ["qoder", path.join(".qoder", "settings.json")],
  ["qwen-code", path.join(".qwen", "skills", "workflow-runtime", "SKILL.md")],
  ["qwen-code", path.join(".qwen", "agents", "explorer.md")],
  ["qwen-code", path.join(".qwen", "settings.json")],
  ["kiro", path.join(".kiro", "skills", "workflow-runtime", "SKILL.md")],
  ["kiro", path.join(".kiro", "agents", "explorer.md")],
  ["kiro", path.join(".kiro", "settings", "mcp.json")],
  ["kiro", path.join(".kiro", "settings", "permissions.yaml")],
  ["copilot", path.join(".copilot", "agents", "explorer.agent.md")],
  ["copilot", path.join(".copilot", "mcp-config.json")],
  ["antigravity-cli", path.join("antigravity-cli", "plugins", "agent-surface", "plugin.json")],
  ["trae", path.join(".trae-cn", "agents", "explorer.md")],
  ["trae", path.join(".trae", "skills", "workflow-runtime", "SKILL.md")],
  ["trae", path.join(".trae", "user_rules.md")],
  ["trae-cn", path.join(".trae-cn", "agents", "explorer.md")],
  ["trae-cn", path.join(".trae-cn", "skills", "workflow-runtime", "SKILL.md")],
  ["trae-cn", path.join(".trae-cn", "user_rules", "agent-surface-core.md")],
  ["trae-cli", path.join(".trae", "agents", "explorer.md")],
  ["trae-cli", path.join(".trae", "skills", "workflow-runtime", "SKILL.md")],
  ["trae-cli", path.join(".trae", "traecli.toml")],
  ["trae-cli", path.join(".trae", "rules", "agent-surface-core.md")],
  ["grok-build", path.join(".grok", "agents", "explorer.md")],
  ["grok-build", path.join(".grok", "AGENTS.md")],
  ["openhands", path.join(".openhands", "mcp.json")],
  ["goose", path.join(".config", "goose", "config.yaml")],
];
for (const [target, rel] of mustExist) {
  assert.equal(
    generated.some((file) => file.endsWith(path.join("dist", target, rel))),
    true,
    `missing build output: ${target}/${rel}`,
  );
}
const antigravityPlugin = JSON.parse(readFileSync(
  path.join(root, "dist", "antigravity-cli", "antigravity-cli", "plugins", "agent-surface", "plugin.json"),
  "utf8",
));
assert.deepEqual(Object.keys(antigravityPlugin).sort(), ["description", "name"]);
const antigravityRules = path.join(root, "dist", "antigravity-cli", "antigravity-cli", "plugins", "agent-surface", "rules");
const antigravityRuleFiles = readdirSync(antigravityRules);
assert.ok(antigravityRuleFiles.length > 0, "antigravity-cli plugin has rules");
for (const file of antigravityRuleFiles) {
  assert.match(readFileSync(path.join(antigravityRules, file), "utf8"), /^---\ntrigger: always_on\n---\n/, `antigravity-cli rule trigger: ${file}`);
}
assert.equal(generated.some((file) => file.includes(`${path.sep}gemini-cli${path.sep}`)), false);
assert.equal(generated.some((file) => file.includes(`${path.sep}vscodium${path.sep}`)), false);
assert.equal(generated.some((file) => file.includes(`${path.sep}qa-sec${path.sep}`) || file.endsWith(`${path.sep}qa-sec.md`)), false);
assert.equal(generated.some((file) => file.includes(`${path.sep}verify-spec${path.sep}`) || file.endsWith(`${path.sep}verify-spec.md`)), false);
assert.equal(generated.some((file) => file.includes(`${path.sep}arch-api${path.sep}`) || file.endsWith(`${path.sep}arch-api.md`)), false);
assert.equal(generated.some((file) => file.includes(`${path.sep}arch-model${path.sep}`) || file.endsWith(`${path.sep}arch-model.md`)), false);
assert.equal(generated.some((file) => file.includes(`${path.sep}.claude${path.sep}commands${path.sep}`)), false);
for (const target of [
  "antigravity",
  "antigravity-cli",
  "claude-code",
  "cline",
  "codex",
  "copilot",
  "cursor",
  "deepagents",
  "droid",
  "dsh",
  "goose",
  "grok-build",
  "kiro",
  "kilo",
  "kimi-code",
  "opencode",
  "openhands",
  "pi",
  "pool",
  "qoder",
  "qwen-code",
  "trae",
  "trae-cn",
  "trae-cli",
  "vscode",
  "zed",
]) {
  const targetFiles = generated.filter((file) => file.includes(`${path.sep}dist${path.sep}${target}${path.sep}`));
  if (hasLocalOpsServerSkill) {
    const opsServer = targetFiles.find((file) => file.endsWith(`${path.sep}ops-server${path.sep}SKILL.md`));
    assert.ok(opsServer, `${target}: private ops-server skill missing`);
    assert.doesNotMatch(readFileSync(opsServer, "utf8"), /^disable-model-invocation:/m);
  }
  assert.equal(
    targetFiles.some((file) => file.includes(`${path.sep}book-study${path.sep}SKILL.md`)),
    true,
    `${target}: optional sanyuan-skills pack missing`,
  );
  assert.equal(
    targetFiles.some((file) => file.includes(`${path.sep}archify${path.sep}SKILL.md`)),
    true,
    `${target}: optional archify pack missing`,
  );
  assert.equal(
    targetFiles.some((file) => file.includes(`${path.sep}archify${path.sep}bin${path.sep}archify.mjs`)),
    true,
    `${target}: optional archify CLI missing`,
  );
  assert.equal(
    targetFiles.some((file) => file.includes(`${path.sep}archify${path.sep}assets${path.sep}template.html`)),
    true,
    `${target}: optional archify template missing`,
  );
}

const claudeOpsAsk = readFileSync(path.join(root, "dist", "claude-code", ".claude", "skills", "ops-ask", "SKILL.md"), "utf8");
const claudeOpsNuke = readFileSync(path.join(root, "dist", "claude-code", ".claude", "skills", "ops-nuke", "SKILL.md"), "utf8");
assert.doesNotMatch(claudeOpsAsk, /^disable-model-invocation:/m);
assert.match(claudeOpsNuke, /^disable-model-invocation: true$/m);
const codexOpsAskPolicy = readFileSync(path.join(root, "dist", "codex", ".agents", "skills", "ops-ask", "agents", "openai.yaml"), "utf8");
assert.match(codexOpsAskPolicy, /^  allow_implicit_invocation: true$/m);
assert.match(readFileSync(path.join(root, "dist", "codex", ".agents", "skills", "ops-nuke", "SKILL.md"), "utf8"), /^---\nname: ops-nuke\n/);
assert.match(readFileSync(path.join(root, "dist", "codex", ".agents", "skills", "ops-nuke", "SKILL.md"), "utf8"), /^disable-model-invocation: true$/m);
assert.match(readFileSync(path.join(root, "dist", "codex", ".agents", "skills", "ops-nuke", "agents", "openai.yaml"), "utf8"), /^  allow_implicit_invocation: false$/m);
assert.equal(existsSync(path.join(root, "dist", "codex", ".codex", "skills", "ops-nuke", "SKILL.md")), false);
const canonicalOpsAsk = readFileSync(path.join(root, "skills", "ops-ask", "SKILL.md"), "utf8");
assert.equal(claudeOpsAsk, canonicalOpsAsk);
assert.equal(readFileSync(path.join(root, "dist", "kimi-code", "skills", "ops-ask", "SKILL.md"), "utf8"), canonicalOpsAsk);
assert.match(
  readFileSync(path.join(root, "dist", "deepagents", ".deepagents", "agent", "skills", "ops-nuke", "SKILL.md"), "utf8"),
  /^disable-model-invocation: true$/m,
);

// Claude Code gets one always-on document that CLAUDE.md imports, and Codex one AGENTS.md; each carries
// every rule whole. Nothing lands in .claude/rules, which VS Code also reads, and no rule is a reference.
const claudeRules = readFileSync(path.join(root, "dist", "claude-code", ".claude", "agent-surface", "rules.md"), "utf8");
const codexInstructions = readFileSync(path.join(root, "dist", "codex", ".codex", "AGENTS.md"), "utf8");
const ruleSources = readdirSync(path.join(root, "rules")).filter((name) => name.endsWith(".md")).sort();
assert.ok(ruleSources.length > 0, "rules/ holds rule sources");
for (const name of ruleSources) {
  const ruleText = readFileSync(path.join(root, "rules", name), "utf8").trim();
  for (const [label, document] of [["claude-code", claudeRules], ["codex", codexInstructions]]) {
    assert.ok(document.includes(`## ${name}\n\n${ruleText}\n`), `${label}: the rules document carries ${name} whole`);
  }
}
assert.equal(existsSync(path.join(root, "dist", "claude-code", ".claude", "agent-surface", "references")), false);
assert.equal(existsSync(path.join(root, "dist", "claude-code", ".claude", "rules")), false);

// The substitute-policy contract lands in the verify-test skill.
const codexVerifyTest = readFileSync(path.join(root, "dist", "codex", ".agents", "skills", "verify-test", "SKILL.md"), "utf8");
assert.match(codexVerifyTest, /No substitute-backed proof of a replaced boundary/);

const kiloPreviewConfig = JSON.parse(readFileSync(path.join(root, "dist", "kilo", ".config", "kilo", "kilo.jsonc"), "utf8"));
assert.deepEqual(kiloPreviewConfig.permission, { "*": "allow" });
assert.equal(kiloPreviewConfig.share, "disabled");
assert.equal(Object.hasOwn(kiloPreviewConfig, "skills"), false);

const ignoresCheck = run(["check", "ignores"]);
assert.match(ignoresCheck, /ignores check: ok/);
assert.match(ignoresCheck, /emitters 3 \(cline, cursor, kilo\)/);

// Every role runs with the session's tools and permissions, as it does with the session's model and
// permission mode: Claude Code ranks a definition's `model`, `inherit` included, above
// CLAUDE_CODE_SUBAGENT_MODEL, an unset `permissionMode` inherits the session's mode, and a turn cap stops
// a subagent mid-task. Kiro alone keeps a wildcard and an allow rule, which leave a subagent at the parent
// session's policy because Kiro applies the stricter of the two.
const accessField = /^(?:tools|disallowedTools|permission|permissions|readonly|sandbox_mode|approvalMode|capabilityMode|mcpInheritance)\s*[:=]/m;
for (const [target, adapter] of Object.entries(targets)) {
  for (const output of await subagentOutputs(adapter)) {
    const header = output.content.split(/\n(?:---|developer_instructions = )/, 1)[0];
    assert.doesNotMatch(header, /^model\s*[:=]/m, `${target} pins a model in ${output.relativeOutput}`);
    assert.doesNotMatch(header, /^permissionMode\s*:/m, `${target} pins a permission mode in ${output.relativeOutput}`);
    assert.doesNotMatch(header, /^(?:maxTurns|steps)\s*:/m, `${target} caps the turns in ${output.relativeOutput}`);
    if (target === "kiro") {
      assert.match(header, /^tools: \["\*"\]\npermissions:\n {2}rules:\n {4}- capability: all\n {6}effect: allow$/m, output.relativeOutput);
    } else {
      assert.doesNotMatch(header, accessField, `${target} sets tools or permissions in ${output.relativeOutput}`);
    }
  }
}

const roleNames = async (target) => (await subagentOutputs(targets[target])).map((output) => path.basename(output.source, ".md")).sort();
// Droid's built-in explorer and worker run on its light and medium subagent models, and a custom droid of
// the same name replaces the built-in and runs on the parent's model (droid 1.12.1), so neither is generated.
assert.deepEqual(await roleNames("droid"), ["researcher", "reviewer", "specifier", "verifier"]);
assert.deepEqual(await roleNames("deepagents"), ["explorer", "researcher", "reviewer", "specifier", "verifier", "worker"]);

// First-party MCP auto-wire across host config families (sample of each shape).
const mcpAbs = {
  synapse: "~/.local/bin/synapse-bridge",
  grimoire: "~/.local/bin/grimoire-server",
};
const jsonMcpHosts = [
  [path.join(root, "dist", "droid", ".factory", "mcp.json"), "mcpServers"],
  [path.join(root, "dist", "claude-code", ".claude.json"), "mcpServers"],
  [path.join(root, "dist", "cline", ".cline", "data", "settings", "cline_mcp_settings.json"), "mcpServers"],
  [path.join(root, "dist", "kimi-code", "mcp.json"), "mcpServers"],
  [path.join(root, "dist", "qoder", ".qoder", "settings.json"), "mcpServers"],
  [path.join(root, "dist", "qwen-code", ".qwen", "settings.json"), "mcpServers"],
  [path.join(root, "dist", "kiro", ".kiro", "settings", "mcp.json"), "mcpServers"],
  [path.join(root, "dist", "copilot", ".copilot", "mcp-config.json"), "mcpServers"],
  [path.join(root, "dist", "cursor", ".cursor", "mcp.json"), "mcpServers"],
  [path.join(root, "dist", "openhands", ".openhands", "mcp.json"), "mcpServers"],
  [path.join(root, "dist", "pi", ".pi", "agent", "mcp.json"), "mcpServers"],
  [path.join(root, "dist", "vscode", vsCodeUserRoot("Code", { scope: "user" }), "mcp.json"), "servers"],
  [path.join(root, "dist", "zed", ".config", "zed", "settings.json"), "context_servers"],
];
for (const [file, rootKey] of jsonMcpHosts) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  const servers = parsed[rootKey];
  assert.equal(servers.synapse.command, mcpAbs.synapse, file);
  assert.equal(servers.grimoire.command, mcpAbs.grimoire, file);
  assert.equal(Object.hasOwn(servers, "agentmemory"), false, file);
  // Only a host whose MCP client advertises roots it cannot serve opts Synapse out of roots routing.
  const rootsOptOut = path.relative(path.join(root, "dist"), file).split(path.sep)[0] === "openhands" ? { SYNAPSE_ROOTS: "ignore" } : undefined;
  assert.deepEqual(servers.synapse.env, rootsOptOut, file);
  assert.equal(Object.hasOwn(servers.grimoire, "env"), false, file);
}
const kimiMcp = JSON.parse(readFileSync(path.join(root, "dist", "kimi-code", "mcp.json"), "utf8"));
assert.equal(Object.hasOwn(kimiMcp.mcpServers.synapse, "type"), false);
const copilotMcp = JSON.parse(readFileSync(path.join(root, "dist", "copilot", ".copilot", "mcp-config.json"), "utf8"));
assert.equal(copilotMcp.mcpServers.synapse.type, "stdio");
assert.doesNotMatch(
  readFileSync(path.join(root, "dist", "kimi-code", "skills", "ops-flow", "SKILL.md"), "utf8"),
  /^disableModelInvocation:/m,
);
assert.match(readFileSync(path.join(root, "dist", "kimi-code", "skills", "ops-nuke", "SKILL.md"), "utf8"), /^type: flow$/m);
assert.match(readFileSync(path.join(root, "dist", "kimi-code", "skills", "ops-nuke", "SKILL.md"), "utf8"), /^disableModelInvocation: true$/m);
assert.match(
  readFileSync(path.join(root, "dist", "kimi-code", "config.toml"), "utf8"),
  /^default_permission_mode = "auto"$/m,
);
assert.match(
  readFileSync(path.join(root, "dist", "kimi-code", "config.toml"), "utf8"),
  /^merge_all_available_skills = true$/m,
);
const kiloMcp = JSON.parse(readFileSync(path.join(root, "dist", "kilo", ".config", "kilo", "kilo.jsonc"), "utf8"));
assert.deepEqual(kiloMcp.mcp.synapse.command, [mcpAbs.synapse]);
assert.deepEqual(kiloMcp.mcp.grimoire.command, [mcpAbs.grimoire]);
const codexMcp = readFileSync(path.join(root, "dist", "codex", ".codex", "config.toml"), "utf8");
assert.match(codexMcp, /^approval_policy = "never"$/m);
assert.match(codexMcp, /^sandbox_mode = "danger-full-access"$/m);
assert.match(codexMcp, /\[mcp_servers\.synapse\]/);
assert.match(codexMcp, /^\[mcp_servers\.synapse\]\n(?:[^[\n].*\n)*default_tools_approval_mode = "approve"$/m, "Codex runs Synapse's tools under approval_policy never");
assert.match(codexMcp, /\[mcp_servers\.grimoire\]/);
const grokConfig = readFileSync(path.join(root, "dist", "grok-build", ".grok", "config.toml"), "utf8");
assert.match(grokConfig, /^\[ui\]$/m);
assert.match(grokConfig, /^permission_mode = "always-approve"$/m);
assert.match(grokConfig, /\[mcp_servers\.synapse\]/);
assert.match(grokConfig, /\[mcp_servers\.grimoire\]/);
const qoderSettings = JSON.parse(readFileSync(path.join(root, "dist", "qoder", ".qoder", "settings.json"), "utf8"));
assert.equal(qoderSettings.general.defaultPermissionMode, "bypass_permissions");
assert.equal(qoderSettings.skills.loadFromAgentsDirectory, false);
const qwenSettings = JSON.parse(readFileSync(path.join(root, "dist", "qwen-code", ".qwen", "settings.json"), "utf8"));
assert.equal(qwenSettings.tools.approvalMode, "yolo");
const traeCliConfig = readFileSync(path.join(root, "dist", "trae-cli", ".trae", "traecli.toml"), "utf8");
assert.match(traeCliConfig, /^approval_policy = "never"$/m);
assert.match(traeCliConfig, /^default_permissions = ":danger-full-access"$/m);
assert.match(traeCliConfig, /^\[mcp_servers\.synapse\]$/m);
assert.match(
  readFileSync(path.join(root, "dist", "kiro", ".kiro", "settings", "permissions.yaml"), "utf8"),
  /^rules:\n  - capability: all\n    effect: allow\n$/,
);
const gooseMcp = readFileSync(path.join(root, "dist", "goose", ".config", "goose", "config.yaml"), "utf8");
assert.match(gooseMcp, /^ {2}grimoire:/m);
assert.match(gooseMcp, /cmd: ~\/\.local\/bin\/grimoire-server/);

const mcpsDefaultPlan = run(["install", "--target", "qwen-code", "--dest", "/tmp/agent-surface-f001", "--category", "mcps", "--dry-run"]);
assert.match(mcpsDefaultPlan, /MCP \+= grimoire, synapse/);

const targetsRegistry = JSON.parse(readFileSync(path.join(root, "registry", "targets.json"), "utf8"));
const generatedCheck = run(["check", "generated"]);
for (const target of Object.keys(targetsRegistry.in_scope)) {
  assert.match(generatedCheck, new RegExp(`^${target}: generated outputs \\d+ ok$`, "m"));
}
assert.match(run(["check", "subagents"]), /subagents check: ok/);

// The subagent cases rewrite a tracked source, so they run in a disposable checkout; the build
// cases there need the populated packs.
const subagentSandbox = disposableCheckout({ linkSubmodules: true });
const subagentSourcePath = path.join(subagentSandbox.root, "subagents", "explorer.md");
const subagentSourceOriginal = readFileSync(subagentSourcePath, "utf8");
try {
  writeFileSync(subagentSourcePath, subagentSourceOriginal.replace(/description:.*\n/, ""));
  const invalidSubagent = subagentSandbox.status(["check", "subagents"]);
  assert.equal(invalidSubagent.status, 1);
  assert.match(`${invalidSubagent.stdout}${invalidSubagent.stderr}`, /missing required field description/);
} finally {
  writeFileSync(subagentSourcePath, subagentSourceOriginal);
}

subagentSandbox.remove();
run(["build", "--target", "all"]);

// ---- a skill is a package: its companion files travel with it ------------------------
// The loader and every directory-shaped adapter must carry the material a SKILL.md references, or a
// relative reference resolves only in the source checkout and breaks everywhere it is installed.
{
  const skills = await readSkills();
  const swarm = skills.find((skill) => skill.name === "ops-swarm");
  assert.ok(swarm.resources.length > 0, "the pilot skill carries companion files");
  for (const resource of swarm.resources) {
    assert.ok(!resource.resourcePath.includes("\\"), `resource paths are POSIX-spelled for the body to reference: ${resource.resourcePath}`);
    assert.equal(typeof resource.text, "string");
  }
  // Every reference the body names must be a file that actually ships with it.
  // Backtick or Markdown-link spelling; the contract is that what the body points at is carried.
  const referenced = [...new Set([...swarm.text.matchAll(/(?:\]\(|`)(references\/[^)`\s]+)(?:\)|`)/g)].map((match) => match[1]))];
  assert.ok(referenced.length > 0, "the pilot body points at its companions");
  const carried = new Set(swarm.resources.map((resource) => resource.resourcePath));
  for (const reference of referenced) assert.ok(carried.has(reference), `${reference} is referenced by the body and carried with it`);

  // The executable bit is part of "preserve the file", and it is decided by the producer rather than
  // at write time — so it is asserted where it is decided. No shipped companion is executable today,
  // which is exactly why this uses constructed inputs rather than claiming an end-to-end script.
  const adapter = targets.codex;
  const probe = {
    name: "probe-skill", relativePath: "skills/probe-skill/SKILL.md", text: "", body: "", metadata: { description: "d" },
    resources: [
      { relativePath: "skills/probe-skill/references/note.md", resourcePath: "references/note.md", text: "note", executable: false },
      { relativePath: "skills/probe-skill/scripts/run.sh", resourcePath: "scripts/run.sh", text: "#!/bin/sh\n", executable: true },
    ],
  };
  const produced = await produceSkillOutputs(adapter, [probe], { scope: "user", mode: "build", categoryFilter: null });
  const byOutput = new Map(produced.map((output) => [output.relativeOutput, output]));
  const skillDir = path.join(".agents", "skills", "probe-skill");
  assert.ok(byOutput.has(path.join(skillDir, "SKILL.md")), "the skill itself is still produced");
  assert.equal(byOutput.get(path.join(skillDir, "references", "note.md"))?.content, "note", "a companion is emitted beside its skill with its own content");
  assert.equal(byOutput.get(path.join(skillDir, "references", "note.md"))?.mode, 0o644, "an ordinary companion declares 0644 so a lost execute bit is reset");
  assert.equal(byOutput.get(path.join(skillDir, "scripts", "run.sh"))?.mode, 0o755, "an executable companion declares the mode that keeps it runnable");

  // A metadata sidecar is not a skill directory: Codex's agents/openai.yaml gets no companions.
  assert.ok(
    produced.every((output) => !output.relativeOutput.startsWith(path.join(skillDir, "agents", "references"))),
    "a sidecar beside the skill carries no companions of its own",
  );
}

{
  // The policy sidecar puts the description under `short_description: >-`. A folded block carries
  // its scalar literally, so an escape written into it survives into the parsed value: a backslash
  // doubles and a quote grows a slash. The check is a real parse, because only the parser decides
  // what the host reads. No shipped description contains either character today, which is why the
  // generated corpus cannot catch this.
  for (const description of [
    String.raw`Escalate to NT AUTHORITY\SYSTEM.`,
    'Say "hi" before running.',
    String.raw`A path C:\Users and a "quote".`,
  ]) {
    const source = { name: "probe-skill", relativePath: "skills/probe-skill/SKILL.md", body: "", metadata: { description } };
    const output = codexOpenAiAgentPolicyOutput(source, path.join(".agents", "skills"), true);
    assert.equal(parseYaml(output.content).interface.short_description, description, `the folded block round-trips ${JSON.stringify(description)} unchanged`);
  }
  // Folding is still the reason the block exists: a description spanning lines arrives as one line.
  const folded = codexOpenAiAgentPolicyOutput(
    { name: "probe-skill", relativePath: "skills/probe-skill/SKILL.md", body: "", metadata: { description: "  First line\n\n  second   line  " } },
    path.join(".agents", "skills"),
    false,
  );
  assert.equal(parseYaml(folded.content).interface.short_description, "First line second line", "surrounding and interior whitespace folds to single spaces");
}

// An external pack's executable companion keeps its bit through both writers: a 0755 source that
// lands 0644 fails with EACCES when run. Skipped on win32, which has no POSIX mode bits.
const externalScriptRoot = path.join(root, "external", "sanyuan-skills", "skills", "skill-forge");
if (process.platform !== "win32" && existsSync(externalScriptRoot)) {
  const executableSource = path.join(externalScriptRoot, "scripts", "init_skill.py");
  const plainSource = path.join(externalScriptRoot, "SKILL.md");
  assert.notEqual(statSync(executableSource).mode & 0o111, 0, "the pack source is executable");
  assert.equal(statSync(plainSource).mode & 0o111, 0, "and its SKILL.md is not");
  const skillTail = path.join("skills", "skill-forge");
  const modeOf = (file) => statSync(file).mode & 0o777;
  const builtSkill = path.join(root, "dist", "antigravity-cli", "antigravity-cli", "plugins", "agent-surface", skillTail);
  assert.equal(modeOf(path.join(builtSkill, "scripts", "init_skill.py")), 0o755, "a built external companion stays executable");
  assert.equal(modeOf(path.join(builtSkill, "SKILL.md")), 0o644, "a built external document stays 0644");
  // The producer declares the non-executable mode too, so an install over a copy that was once
  // executable resets it instead of keeping the stale bit.
  const externalOutputs = await externalSkillOutputs(targets["antigravity-cli"], { scope: "user", mode: "build", categoryFilter: null });
  const declared = (suffix) => externalOutputs.find((output) => output.relativeOutput.endsWith(path.join(skillTail, suffix)))?.mode;
  assert.equal(declared(path.join("scripts", "init_skill.py")), 0o755, "an executable external companion declares 0755");
  assert.equal(declared("SKILL.md"), 0o644, "a non-executable external file declares 0644");

  const installDest = ownTempRoot("external-mode")("dest");
  const installed = status(["install", "--target", "antigravity-cli", "--dest", installDest, "--scope", "user", "--category", "development"]);
  assert.equal(installed.status, 0, `${installed.stdout}${installed.stderr}`);
  const installedSkill = files(installDest).find((file) => file.endsWith(path.join(skillTail, "scripts", "init_skill.py")));
  assert.ok(installedSkill, "the external skill installs under --dest");
  assert.equal(modeOf(installedSkill), 0o755, "an installed external companion stays executable");
  assert.equal(modeOf(path.join(path.dirname(path.dirname(installedSkill)), "SKILL.md")), 0o644, "an installed external document stays 0644");
}

console.log("build: ok");
