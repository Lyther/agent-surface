// The heart of the compiler: the per-target adapter table + the producers that turn source
// (commands/rules/subagents/skills/mcp) into per-target outputs. Imports render/roots/merge/
// postprocess; the install + check layers import targets/targetOutputs/producers from here.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { directDirectories, filesUnder } from "./fs-tree.mjs";
import { optionalServiceMcpServers, renderMcpConfig } from "./merge.mjs";
import { normalizeExternalSkillFile } from "./postprocess.mjs";
import { readOptionalServices, relative, root } from "./registry.mjs";
import { firstHeading, renderAntigravityCliRuleDocument, renderAntigravityCliSkill, renderAntigravityWorkflow, renderClaudeCommand, renderClaudeSubagent, renderClineWorkflow, renderCodexSubagent, renderCursorCommand, renderCursorSubagent, renderDeepAgentsSkill, renderDeepAgentsSubagent, renderDroidCommand, renderDroidSubagent, renderGeminiSubagent, renderGooseRecipe, renderGrokBuildSkill, renderInstructionDocument, renderKiloRuleDocument, renderKiloSubagent, renderKiloWorkflow, renderOpenCodeCommand, renderOpenCodeSubagent, renderPiSkill, renderPoolSkill, renderScopedRuleReferenceDocument, renderSharedAgentSkill, renderVsCodeInstructionDocument, renderVsCodePromptDocument, renderWindsurfWorkflow } from "./render.mjs";
import { antigravityCliSkillOutputName, claudeMcpPath, clineMcpPath, clineRuleRoot, clineWorkflowRoot, codexSkillOutputName, deepagentsAgentRoot, deepagentsConfigRoot, deepagentsInstructionPath, deepagentsMcpPath, deepagentsSkillRoot, deepagentsSubagentOutputName, droidConfigRoot, droidInstructionPath, flatMarkdownCommandOutputName, gooseRecipeOutputName, grokBuildSkillRoot, groupedMarkdownCommandOutputName, installRootAntigravity, installRootAntigravityCli, installRootClaude, installRootCline, installRootCodex, installRootDeepagents, installRootDroid, installRootGoose, installRootGrokBuild, installRootHomeOnly, installRootKilo, installRootOpencode, installRootPi, installRootPool, installRootVsCode, installRootVscodium, installRootWindsurf, installRootZed, kiloAgentRoot, kiloConfigPath, kiloRuleReferenceRoot, kiloRuleRoot, kiloWorkflowRoot, opencodeAgentRoot, opencodeCommandRoot, opencodeConfigRoot, opencodeInstructionPath, opencodeMcpPath, piConfigRoot, piInstructionPath, piSkillRoot, poolConfigRoot, poolInstructionPath, poolSkillRoot, windsurfConfigRoot, windsurfMcpPath, windsurfRulePath, windsurfSkillRoot, windsurfWorkflowRoot, zedConfigRoot, zedInstructionPath, zedMcpPath, zedSkillRoot } from "./roots.mjs";
import { readRules } from "./rules.mjs";
import { ignoreOutputs, subagentOutputs } from "./source-primitives.mjs";
import { exists, fail, isSafeRelativePath } from "./util.mjs";

export const targets = {
  "claude-code": {
    label: "Claude Code commands and subagents",
    commandRenders: ["commands"],
    subagentRenders: ["subagents"],
    subagentTarget: "claude-code",
    subagentOutputRoot: ".claude/agents",
    externalSkillOutputRoot: ".claude/skills",
    commandOutputRoot: ".claude/commands",
    renderCommand: renderClaudeCommand,
    renderSubagent: renderClaudeSubagent,
    installRoot: installRootClaude,
    commandOutputName: groupedMarkdownCommandOutputName,
    mcpConfig: {
      relativeOutput: claudeMcpPath,
      format: "mcpServers",
      defaultEnabled: true,
    },
  },
  codex: {
    label: "Codex skills, custom agents, and global instructions",
    commandRenders: ["skills"],
    subagentRenders: ["subagents"],
    subagentTarget: "codex",
    subagentOutputRoot: path.join(".codex", "agents"),
    subagentOutputExtension: ".toml",
    externalSkillOutputRoot: path.join(".agents", "skills"),
    staticRenders: ["rules"],
    commandOutputRoot: ".agents/skills",
    renderCommand: renderSharedAgentSkill,
    renderSubagent: renderCodexSubagent,
    installRoot: installRootCodex,
    commandOutputName: codexSkillOutputName,
    additionalCommandOutputs: [codexOpenAiAgentOutput],
    staticOutputs: codexStaticOutputs,
    mcpConfig: {
      relativeOutput: () => path.join(".codex", "config.toml"),
      format: "codex-toml",
      defaultEnabled: true,
    },
  },
  deepagents: {
    label: "Deep Agents Code skills, instructions, subagents, and MCP",
    commandRenders: ["skills"],
    subagentRenders: ["subagents"],
    subagentTarget: "deepagents",
    subagentOutputRoot: deepagentsAgentRoot,
    subagentOutputName: deepagentsSubagentOutputName,
    externalSkillOutputRoot: deepagentsSkillRoot,
    staticRenders: ["rules"],
    commandOutputRoot: deepagentsSkillRoot,
    renderCommand: renderDeepAgentsSkill,
    renderSubagent: renderDeepAgentsSubagent,
    installRoot: installRootDeepagents,
    commandOutputName: codexSkillOutputName,
    staticOutputs: deepagentsStaticOutputs,
    mcpConfig: {
      relativeOutput: deepagentsMcpPath,
      format: "mcpServers",
      defaultEnabled: true,
    },
  },
  goose: {
    label: "Goose reusable recipes and MCP",
    commandRenders: ["recipes"],
    commandOutputRoot: "recipes",
    commandOutputName: gooseRecipeOutputName,
    renderCommand: renderGooseRecipe,
    installRoot: installRootGoose,
    // Recipes are project-oriented (./recipes) and must never land in $HOME on a user
    // install; user scope installs only the user-global MCP config. Build still emits recipes.
    commandInstallScopes: ["project"],
    mcpConfig: {
      // Goose MCP lives in the user-global config.yaml (`extensions:`), so it is user-scope
      // only; recipes stay project-oriented. Use `--category mcps` for a clean user wire.
      relativeOutput: () => path.join(".config", "goose", "config.yaml"),
      format: "goose-extensions",
      defaultEnabled: true,
      scopes: ["user"],
    },
  },
  "grok-build": {
    label: "Grok Build skills and project instructions",
    commandRenders: ["skills"],
    staticRenders: ["rules"],
    commandOutputRoot: grokBuildSkillRoot,
    commandOutputName: codexSkillOutputName,
    externalSkillOutputRoot: grokBuildSkillRoot,
    renderCommand: renderGrokBuildSkill,
    installRoot: installRootGrokBuild,
    staticOutputs: grokBuildStaticOutputs,
    mcpConfig: {
      relativeOutput: () => path.join(".grok", "settings.json"),
      format: "mcpServers",
      defaultEnabled: true,
    },
  },
  pi: {
    label: "Pi skills and instructions",
    commandRenders: ["skills"],
    staticRenders: ["rules"],
    commandOutputRoot: piSkillRoot,
    commandOutputName: codexSkillOutputName,
    externalSkillOutputRoot: piSkillRoot,
    renderCommand: renderPiSkill,
    installRoot: installRootPi,
    staticOutputs: piStaticOutputs,
  },
  pool: {
    label: "Poolside skills and instructions",
    commandRenders: ["skills"],
    staticRenders: ["rules"],
    commandOutputRoot: poolSkillRoot,
    commandOutputName: codexSkillOutputName,
    externalSkillOutputRoot: poolSkillRoot,
    renderCommand: renderPoolSkill,
    installRoot: installRootPool,
    staticOutputs: poolStaticOutputs,
    mcpConfig: {
      relativeOutput: (context) => context.scope === "user"
        ? path.join(".config", "poolside", "settings.yaml")
        : path.join(".poolside", "settings.yaml"),
      format: "poolside-mcp",
      defaultEnabled: true,
    },
  },
  cline: {
    label: "Cline workflows and rules",
    commandRenders: ["commands-as-workflows"],
    staticRenders: ["rules"],
    commandOutputRoot: clineWorkflowRoot,
    renderCommand: renderClineWorkflow,
    installRoot: installRootCline,
    ignoreFilename: ".clineignore",
    staticOutputs: clineStaticOutputs,
    mcpConfig: {
      relativeOutput: clineMcpPath,
      format: "mcpServers",
      defaultEnabled: true,
    },
  },
  kilo: {
    label: "Kilo workflows, instructions, and subagents",
    commandRenders: ["commands-as-workflows"],
    subagentRenders: ["subagents"],
    subagentTarget: "kilo",
    subagentOutputRoot: kiloAgentRoot,
    staticRenders: ["rules"],
    commandOutputRoot: kiloWorkflowRoot,
    renderCommand: renderKiloWorkflow,
    renderSubagent: renderKiloSubagent,
    installRoot: installRootKilo,
    ignoreFilename: ".kilocodeignore",
    staticOutputs: kiloStaticOutputs,
    mcpConfig: {
      relativeOutput: kiloConfigPath,
      format: "local-command-map",
      defaultEnabled: true,
      emitOutput: false,
    },
  },
  antigravity: {
    label: "Antigravity workflows",
    commandRenders: ["commands-as-workflows"],
    commandOutputRoot: "global_workflows",
    renderCommand: renderAntigravityWorkflow,
    installRoot: installRootAntigravity,
  },
  "antigravity-cli": {
    label: "Antigravity CLI plugin",
    commandRenders: ["skills"],
    subagentRenders: ["subagents"],
    subagentTarget: "antigravity-cli",
    subagentOutputRoot: path.join("config", "plugins", "agent-surface", "agents"),
    externalSkillOutputRoot: path.join("config", "plugins", "agent-surface", "skills"),
    staticRenders: ["plugins", "rules"],
    commandOutputRoot: path.join("config", "plugins", "agent-surface", "skills"),
    commandOutputName: antigravityCliSkillOutputName,
    renderCommand: renderAntigravityCliSkill,
    renderSubagent: renderGeminiSubagent,
    installRoot: installRootAntigravityCli,
    staticOutputs: antigravityCliStaticOutputs,
    mcpConfig: {
      relativeOutput: () => path.join("config", "plugins", "agent-surface", "mcp_config.json"),
      format: "mcpServers",
      defaultEnabled: true,
    },
  },
  cursor: {
    label: "Cursor global commands, rules, and subagents",
    commandRenders: ["commands"],
    subagentRenders: ["subagents"],
    subagentTarget: "cursor",
    subagentOutputRoot: ".cursor/agents",
    staticRenders: ["rules"],
    commandOutputRoot: ".cursor/commands",
    renderCommand: renderCursorCommand,
    renderSubagent: renderCursorSubagent,
    installRoot: installRootHomeOnly,
    ignoreFilename: ".cursorignore",
    staticOutputs: cursorStaticOutputs,
    mcpConfig: {
      relativeOutput: () => path.join(".cursor", "mcp.json"),
      format: "mcpServers",
      defaultEnabled: true,
    },
  },
  droid: {
    label: "Factory Droid commands, instructions, droids, and optional external assets",
    commandRenders: ["commands"],
    subagentRenders: ["subagents"],
    subagentTarget: "droid",
    subagentOutputRoot: path.join(".factory", "droids"),
    externalSkillOutputRoot: path.join(".factory", "skills"),
    staticRenders: ["rules"],
    commandOutputRoot: path.join(".factory", "commands"),
    renderCommand: renderDroidCommand,
    renderSubagent: renderDroidSubagent,
    installRoot: installRootDroid,
    staticOutputs: droidStaticOutputs,
    mcpConfig: {
      relativeOutput: () => path.join(".factory", "mcp.json"),
      format: "mcpServers",
      defaultEnabled: true,
    },
  },
  copilot: {
    label: "GitHub Copilot global instructions",
    staticRenders: ["instructions"],
    installRoot: installRootVsCode,
    staticOutputs: copilotStaticOutputs,
  },
  vscode: {
    label: "VS Code user prompt and instruction files",
    staticRenders: ["instructions", "prompts"],
    installRoot: installRootVsCode,
    staticOutputs: vscodeStaticOutputs,
    mcpConfig: {
      relativeOutput: () => "mcp.json",
      format: "vscode-servers",
      defaultEnabled: true,
    },
  },
  vscodium: {
    label: "VSCodium user prompt and instruction files",
    staticRenders: ["instructions", "prompts"],
    installRoot: installRootVscodium,
    staticOutputs: vscodiumStaticOutputs,
    mcpConfig: {
      relativeOutput: () => "mcp.json",
      format: "vscode-servers",
      defaultEnabled: true,
    },
  },
  opencode: {
    label: "OpenCode commands, agents, and global instructions",
    commandRenders: ["commands"],
    subagentRenders: ["subagents"],
    subagentTarget: "opencode",
    subagentOutputRoot: opencodeAgentRoot,
    commandOutputRoot: opencodeCommandRoot,
    renderCommand: renderOpenCodeCommand,
    renderSubagent: renderOpenCodeSubagent,
    staticRenders: ["rules"],
    installRoot: installRootOpencode,
    staticOutputs: opencodeStaticOutputs,
    mcpConfig: {
      relativeOutput: opencodeMcpPath,
      format: "local-command-map",
      defaultEnabled: true,
    },
  },
  trae: {
    label: "Trae global user rules",
    staticRenders: ["rules"],
    installRoot: installRootHomeOnly,
    staticOutputs: traeStaticOutputs,
    mcpConfig: {
      relativeOutput: () => path.join(".trae", "mcp.json"),
      format: "mcpServers",
      defaultEnabled: true,
    },
  },
  windsurf: {
    label: "Windsurf workflows, rules, and skills",
    commandRenders: ["commands-as-workflows"],
    staticRenders: ["rules"],
    commandOutputRoot: windsurfWorkflowRoot,
    commandOutputName: flatMarkdownCommandOutputName,
    externalSkillOutputRoot: windsurfSkillRoot,
    renderCommand: renderWindsurfWorkflow,
    installRoot: installRootWindsurf,
    staticOutputs: windsurfStaticOutputs,
    mcpConfig: {
      relativeOutput: windsurfMcpPath,
      format: "mcpServers",
      defaultEnabled: true,
    },
  },
  zed: {
    label: "Zed skills and instructions",
    commandRenders: ["skills"],
    staticRenders: ["rules"],
    commandOutputRoot: zedSkillRoot,
    commandOutputName: codexSkillOutputName,
    externalSkillOutputRoot: zedSkillRoot,
    renderCommand: renderSharedAgentSkill,
    installRoot: installRootZed,
    staticOutputs: zedStaticOutputs,
    mcpConfig: {
      relativeOutput: zedMcpPath,
      format: "zed-context-servers",
      defaultEnabled: true,
    },
  },
};

export const generatedOutputMinimums = new Map([
  ["claude-code", 250],
  ["codex", 300],
  ["deepagents", 250],
  ["goose", 50],
  ["grok-build", 250],
  ["pi", 250],
  ["pool", 250],
  ["cline", 50],
  ["kilo", 60],
  ["antigravity", 50],
  ["antigravity-cli", 250],
  ["cursor", 60],
  ["droid", 250],
  ["copilot", 1],
  ["vscode", 1],
  ["vscodium", 1],
  ["opencode", 55],
  ["trae", 1],
  ["windsurf", 250],
  ["zed", 250],
]);

export const MAX_EXTERNAL_FILE_BYTES = 1_000_000;

export const MAX_EXTERNAL_TOTAL_BYTES = 200_000_000;

export const MAX_EXTERNAL_FILES = 50_000;

export function targetProducers(adapter) {
  const producers = [];
  if (adapter.renderCommand || (adapter.additionalCommandOutputs?.length ?? 0) > 0) {
    producers.push({ id: "commands", sourceKind: "commands", emits: adapter.commandRenders ?? ["commands"], produce: (commands, context) => produceCommandOutputs(adapter, commands, context) });
  }
  if (adapter.staticOutputs) {
    producers.push({ id: "static", sourceKind: "rules", emits: adapter.staticRenders ?? [], produce: (commands, context) => adapter.staticOutputs(commands, context) });
  }
  if (adapter.externalSkillOutputRoot) {
    producers.push({ id: "external-skills", sourceKind: "external", emits: ["external"], produce: (_commands, context) => externalSkillOutputs(adapter, context) });
  }
  if (adapter.subagentOutputRoot && adapter.renderSubagent) {
    producers.push({ id: "subagents", sourceKind: "subagents", emits: adapter.subagentRenders ?? ["subagents"], produce: (commands, context) => subagentOutputs(adapter, context) });
  }
  if (adapter.ignoreFilename) {
    producers.push({ id: "ignores", sourceKind: "ignores", emits: ["ignores"], produce: () => ignoreOutputs(adapter) });
  }
  if (adapter.mcpConfig) {
    producers.push({ id: "mcps", sourceKind: "external", emits: ["mcps"], produce: (_commands, context) => optionalMcpOutputs(adapter, context) });
  }
  return producers;
}

export async function targetOutputs(adapter, commands, context) {
  const outputs = [];

  for (const producer of targetProducers(adapter)) {
    const produced = await producer.produce(commands, context);
    outputs.push(...produced.map((output) => ({
      ...output,
      producerId: producer.id,
      sourceKind: output.sourceKind ?? producer.sourceKind,
      renderKind: output.renderKind ?? producerDefaultRenderKind(producer),
    })));
  }

  const seen = new Map();
  for (const output of outputs) {
    if (!isSafeRelativePath(output.relativeOutput)) fail(`unsafe generated output path: ${output.relativeOutput}`);
    const previous = seen.get(output.relativeOutput);
    if (previous) {
      fail(
        `duplicate generated output path: ${output.relativeOutput} (${previous.producerId}:${previous.source} and ${output.producerId}:${output.source})`,
      );
    }
    seen.set(output.relativeOutput, output);
  }

  return outputs.sort((left, right) => left.relativeOutput.localeCompare(right.relativeOutput));
}

export function producerEmitsFor(adapter) {
  const emits = new Set();
  for (const producer of targetProducers(adapter)) {
    for (const token of producer.emits ?? []) emits.add(token);
  }
  return emits;
}

export function producerDefaultRenderKind(producer) {
  return producer.emits?.length === 1 ? producer.emits[0] : producer.id;
}

export async function produceCommandOutputs(adapter, commands, context) {
  // Some adapters restrict where their command artifacts may be *installed* (e.g. Goose
  // recipes are project-only) even though the adapter also has a user-global surface (MCP).
  // Build (dist inspection) is never gated; only live install writes are.
  if (adapter.commandInstallScopes && context.mode === "install" && !adapter.commandInstallScopes.includes(context.scope)) {
    return [];
  }
  const outputs = [];
  for (const command of commands) {
    if (adapter.renderCommand) {
      outputs.push({
        source: command.relativePath,
        relativeOutput: commandRelativeOutput(adapter, command, context),
        content: await adapter.renderCommand(command, context),
      });
    }

    for (const buildOutput of adapter.additionalCommandOutputs ?? []) {
      outputs.push(await buildOutput(command, context));
    }
  }
  return outputs;
}

export async function externalSkillOutputs(adapter, context) {
  if (!adapter.externalSkillOutputRoot) return [];
  // External assets are part of the default distribution: a full install (no category
  // filter) generates them so strict-sync keeps in-scope packs and prunes de-scoped ones.
  // Only skip when an explicit category filter excludes "external".
  if (context.mode === "install" && context.categoryFilter && !context.categoryFilter.has("external")) return [];
  const outputs = [];
  const roots = await externalSkillRoots();
  const outputRoot = outputRootFor(adapter.externalSkillOutputRoot, context);
  const textExtensions = [".md", ".mdx", ".json", ".yaml", ".yml", ".toml", ".txt", ".sh", ".py", ".js", ".ts", ".ps1"];

  let totalBytes = 0;
  for (const { root: sourceRoot, serviceName, required } of roots) {
    const skillName = path.basename(sourceRoot);
    const skillFiles = await filesUnder(sourceRoot, textExtensions);
    for (const file of skillFiles) {
      if (outputs.length >= MAX_EXTERNAL_FILES) {
        const detail = `external skill output cap reached (${MAX_EXTERNAL_FILES} files)`;
        if (required) fail(`${detail}; required pack ${serviceName} would be truncated`);
        console.error(`warning: ${detail}; further files skipped`);
        return outputs;
      }
      const size = (await stat(file)).size;
      if (size > MAX_EXTERNAL_FILE_BYTES) {
        const detail = `oversized external file (${size} bytes): ${relative(file)}`;
        if (required) fail(`required pack ${serviceName}: ${detail}`);
        console.error(`warning: skipping ${detail}`);
        continue;
      }
      if (totalBytes + size > MAX_EXTERNAL_TOTAL_BYTES) {
        const detail = `external skill total-size cap reached (${MAX_EXTERNAL_TOTAL_BYTES} bytes)`;
        if (required) fail(`${detail}; required pack ${serviceName} would be truncated`);
        console.error(`warning: ${detail}; remaining files skipped`);
        return outputs;
      }
      totalBytes += size;
      const relativeFile = path.relative(sourceRoot, file);
      outputs.push({
        sourceKind: "external",
        renderKind: "external",
        source: relative(file),
        relativeOutput: path.join(outputRoot, skillName, relativeFile),
        content: normalizeExternalSkillFile(relativeFile, await readFile(file, "utf8"), skillName),
      });
    }
  }

  return outputs;
}

export async function optionalMcpOutputs(adapter, context) {
  if (adapter.mcpConfig.emitOutput === false) return [];
  if (context.mode === "install" && adapter.mcpConfig.installMode !== "write") return [];
  if (!mcpConfigScopeAllows(adapter.mcpConfig, context.scope)) return [];

  const entries = await selectedMcpServiceEntries(adapter.mcpConfig.defaultEnabled, context);
  if (entries.length === 0) return [];

  return [{
    sourceKind: "external",
    renderKind: "mcps",
    source: "registry/optional-services.json",
    relativeOutput: outputRootFor(adapter.mcpConfig.relativeOutput, context),
    content: renderMcpConfig(adapter.mcpConfig.format, entries),
  }];
}

export async function selectedMcpServiceEntries(defaultEnabled, context) {
  const explicitMcp = context.categoryFilter?.has("mcps") || context.optionalServices;
  if (!defaultEnabled && !explicitMcp) return [];

  const registry = await readOptionalServices();
  // Opt-in contract: external/secret-bearing MCPs are included ONLY when named explicitly
  // via --service. `--category mcps` alone (no --service) selects first-party MCPs only —
  // it must never auto-add agentmemory or any other non-first-party server.
  const entries = Object.entries(registry.services)
    .filter(([, service]) => service.kind === "mcp")
    .filter(([id]) => !context.optionalServices || context.optionalServices.has(id))
    .filter(([, service]) => context.optionalServices || service.first_party === true);
  if (context.optionalServices) {
    const known = new Set(entries.map(([id]) => id));
    for (const id of context.optionalServices) {
      if (!known.has(id)) fail(`missing optional MCP service: ${id}`);
    }
  }
  return entries.sort(([left], [right]) => left.localeCompare(right));
}

export async function externalSkillRoots() {
  const registry = await readOptionalServices();
  const candidates = [];

  for (const [serviceName, service] of Object.entries(registry.services)) {
    if (!["skill-pack", "behavior-pack"].includes(service.kind)) continue;
    const required = service.optional === false || service.status === "required";
    for (const item of service.skill_roots ?? []) {
      for (const dir of await expandSkillRoot(item)) {
        candidates.push({ root: dir, serviceName, required });
      }
    }
  }

  const seen = new Set();
  const existing = [];
  for (const candidate of candidates) {
    const rel = relative(candidate.root);
    if (seen.has(rel)) continue;
    if (await exists(path.join(candidate.root, "SKILL.md"))) {
      seen.add(rel);
      existing.push(candidate);
    }
  }
  // Required packs first so a total-size cap can never silently drop a required
  // pack in favor of an optional one; ties resolved by path for determinism.
  return existing.sort(
    (left, right) =>
      Number(right.required) - Number(left.required) || relative(left.root).localeCompare(relative(right.root)),
  );
}

export async function expandSkillRoot(item) {
  if (typeof item !== "string" || item.length === 0) fail("external skill root must be a non-empty string");
  if (item.includes("*") && !item.endsWith("/*")) fail(`external skill root wildcard must be a trailing /*: ${item}`);
  if (item.endsWith("/*")) {
    const base = safeExternalPath(item.slice(0, -2));
    return directDirectories(base);
  }
  return [safeExternalPath(item)];
}

export function safeExternalPath(item) {
  if (!isSafeRelativePath(item) || !item.startsWith("external/")) fail(`unsafe external skill root: ${item}`);
  return path.join(root, item);
}

export function outputRootFor(value, context) {
  return typeof value === "function" ? value(context) : value;
}

export function outputAppliesToScope(output, scope, sourceKindsConfig) {
  const policy = sourceKindPolicy(sourceKindsConfig, output.sourceKind);
  if (!policy) return false;
  return policy.install_scopes.includes(scope);
}

export function outputAppliesToCategory(output, categoryFilter) {
  if (!categoryFilter) return true;
  return categoryFilter.has(output.renderKind) || categoryFilter.has(output.sourceKind);
}

export async function scopedRuleReferenceOutputs(_context, outputRoot) {
  const rules = (await readRules()).filter((rule) => rule.alwaysApply === false);
  return rules.map((rule) => ({
    sourceKind: "rules",
    renderKind: "rules",
    source: rule.file,
    relativeOutput: path.join(outputRoot, `${path.basename(rule.file, ".mdc")}.md`),
    content: renderScopedRuleReferenceDocument(rule),
  }));
}

export async function kiloRuleInstructionPaths(scope) {
  const ruleNames = (await readRules())
    .filter((rule) => rule.alwaysApply !== false)
    .map((rule) => path.basename(rule.file, ".mdc"));
  const prefix = scope === "user" ? "./rules" : ".kilo/rules";
  return ruleNames.map((name) => `${prefix}/${name}.md`);
}

export function commandRelativeOutput(adapter, command, context) {
  return path.join(outputRootFor(adapter.commandOutputRoot, context), adapter.commandOutputName ? adapter.commandOutputName(command, context) : path.basename(command.file));
}

export async function codexOpenAiAgentOutput(source) {
  const description = yamlBlockString(source.metadata.description ?? firstHeading(source.body) ?? `Run ${source.name.replaceAll("-", " ")}.`);
  return {
    source: source.relativePath,
    relativeOutput: path.join(".agents", "skills", source.name, "agents", "openai.yaml"),
    content: [
      "interface:",
      `  display_name: "${source.name}"`,
      "  short_description: >-",
      `    ${description}`,
      "policy:",
      "  allow_implicit_invocation: false",
      "",
    ].join("\n"),
  };
}

export function mcpConfigScopeAllows(mcpConfig, scope) {
  return !mcpConfig.scopes || mcpConfig.scopes.includes(scope);
}

export async function antigravityCliStaticOutputs(commands, context) {
  const metadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const rules = await readRules();
  const alwaysApplyRules = rules.filter((rule) => rule.alwaysApply !== false);
  return [
    {
      sourceKind: "commands",
      renderKind: "plugins",
      source: "package.json",
      relativeOutput: path.join("config", "plugins", "agent-surface", "plugin.json"),
      content: `${JSON.stringify({
        name: "agent-surface",
        version: metadata.version,
        description: "Portable agent-surface command, skill, subagent, and rule pack generated from Lyther/agent-surface.",
      }, null, 2)}\n`,
    },
    {
      sourceKind: "commands",
      renderKind: "plugins",
      source: "README.md",
      relativeOutput: path.join("config", "plugins", "agent-surface", "README.md"),
      content: [
        "# agent-surface Antigravity CLI plugin",
        "",
        "Generated plugin package for Antigravity CLI.",
        "",
        "Validate with `agy plugin validate ~/.gemini/config/plugins/agent-surface`, then enable with `agy plugin enable agent-surface` after installation.",
        "",
        `Packaged skills: ${commands.length}`,
        "",
      ].join("\n"),
    },
    ...alwaysApplyRules.map((rule) => ({
      sourceKind: "rules",
      renderKind: "rules",
      source: rule.file,
      relativeOutput: path.join("config", "plugins", "agent-surface", "rules", `${path.basename(rule.file, ".mdc")}.md`),
      content: renderAntigravityCliRuleDocument(rule),
    })),
    ...await scopedRuleReferenceOutputs(
      context,
      path.join("config", "plugins", "agent-surface", "references", "rules"),
    ),
  ];
}

export async function clineStaticOutputs(_commands, context) {
  return [
    {
      source: "rules/*.mdc",
      relativeOutput: path.join(outputRootFor(clineRuleRoot, context), "agent-surface.md"),
      content: await renderInstructionDocument("agent-surface Cline global rules", "Cline rules"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join(outputRootFor(clineRuleRoot, context), "references", "rules")),
  ];
}

export async function codexStaticOutputs(_commands, context) {
  return [
    {
      source: "rules/*.mdc",
      renderKind: "rules",
      relativeOutput: path.join(".codex", "AGENTS.md"),
      content: await renderInstructionDocument("AGENTS.md - agent-surface global Codex rules", "Codex global instructions"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join(".codex", "references", "rules")),
  ];
}

export async function copilotStaticOutputs(_commands, context) {
  return [
    {
      sourceKind: "rules",
      renderKind: "instructions",
      source: "rules/*.mdc",
      relativeOutput: path.join("instructions", "agent-surface-copilot.instructions.md"),
      content: await renderVsCodeInstructionDocument("agent-surface Copilot global instructions", "copilot"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join("instructions", "references", "rules")),
  ];
}

export async function cursorStaticOutputs() {
  const rules = await readRules();
  return rules.map((rule) => ({
    source: rule.file,
    relativeOutput: path.join(".cursor", "rules", path.basename(rule.file)),
    content: rule.text,
  }));
}

export async function deepagentsStaticOutputs(_commands, context) {
  return [
    {
      source: "rules/*.mdc",
      renderKind: "rules",
      relativeOutput: deepagentsInstructionPath(context),
      content: await renderInstructionDocument("AGENTS.md - agent-surface Deep Agents Code rules", "Deep Agents Code instructions"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join(deepagentsConfigRoot(context), "references", "rules")),
  ];
}

export async function droidStaticOutputs(_commands, context) {
  return [
    {
      source: "rules/*.mdc",
      renderKind: "rules",
      relativeOutput: droidInstructionPath(context),
      content: await renderInstructionDocument("AGENTS.md - agent-surface Droid rules", "Droid instructions"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join(droidConfigRoot(context), "references", "rules")),
  ];
}

export async function grokBuildStaticOutputs(_commands, context) {
  if (context.scope === "user") return [];
  return [
    {
      source: "rules/*.mdc",
      renderKind: "rules",
      relativeOutput: "AGENTS.md",
      content: await renderInstructionDocument("AGENTS.md - agent-surface Grok Build rules", "Grok Build project instructions"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join(".grok", "references", "rules")),
  ];
}

export async function kiloStaticOutputs(_commands, context) {
  const rules = await readRules();
  const alwaysApplyRules = rules.filter((rule) => rule.alwaysApply !== false);
  const scopedRules = rules.filter((rule) => rule.alwaysApply === false);
  const firstPartyMcpEntries = await selectedMcpServiceEntries(true, {
    categoryFilter: null,
    optionalServices: null,
  });
  const outputs = [
    ...alwaysApplyRules.map((rule) => ({
      source: rule.file,
      relativeOutput: path.join(kiloRuleRoot(context), `${path.basename(rule.file, ".mdc")}.md`),
      content: renderKiloRuleDocument(rule),
    })),
  ];
  if (context.mode !== "install") {
    const kiloConfig = {
      $schema: "https://app.kilo.ai/config.json",
      instructions: await kiloRuleInstructionPaths(context.scope),
    };
    if (firstPartyMcpEntries.length > 0) {
      kiloConfig.mcp = optionalServiceMcpServers(firstPartyMcpEntries, "local-command-map");
    }
    outputs.unshift({
      source: "rules/*.mdc",
      relativeOutput: kiloConfigPath(context.scope),
      content: `${JSON.stringify(kiloConfig, null, 2)}\n`,
    });
  }
  outputs.push(...scopedRules.map((rule) => ({
    source: rule.file,
    relativeOutput: path.join(kiloRuleReferenceRoot(context), `${path.basename(rule.file, ".mdc")}.md`),
    content: renderScopedRuleReferenceDocument(rule),
  })));
  return outputs;
}

export async function opencodeStaticOutputs(_commands, context) {
  return [
    {
      source: "rules/*.mdc",
      relativeOutput: opencodeInstructionPath(context),
      content: await renderInstructionDocument("AGENTS.md - agent-surface global OpenCode rules", "OpenCode global instructions"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join(opencodeConfigRoot(context), "references", "rules")),
  ];
}

export async function piStaticOutputs(_commands, context) {
  return [
    {
      source: "rules/*.mdc",
      renderKind: "rules",
      relativeOutput: piInstructionPath(context),
      content: await renderInstructionDocument("AGENTS.md - agent-surface Pi rules", "Pi instructions"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join(piConfigRoot(context), "references", "rules")),
  ];
}

export async function poolStaticOutputs(_commands, context) {
  return [
    {
      source: "rules/*.mdc",
      renderKind: "rules",
      relativeOutput: poolInstructionPath(context),
      content: await renderInstructionDocument("agent-surface Poolside rules", "Poolside instructions"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join(poolConfigRoot(context), "references", "rules")),
  ];
}

export async function traeStaticOutputs(_commands, context) {
  return [
    {
      source: "rules/*.mdc",
      relativeOutput: path.join(".trae", "user_rules.md"),
      content: await renderInstructionDocument("agent-surface Trae user rules", "Trae user rules"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join(".trae", "references", "rules")),
  ];
}

export async function vscodeStaticOutputs(_commands, context) {
  return [
    {
      sourceKind: "rules",
      renderKind: "instructions",
      source: "rules/*.mdc",
      relativeOutput: path.join("instructions", "agent-surface.instructions.md"),
      content: await renderVsCodeInstructionDocument("agent-surface VS Code instructions", "vscode"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join("instructions", "references", "rules")),
    {
      sourceKind: "commands",
      renderKind: "prompts",
      source: "commands/ops-flow.md",
      relativeOutput: path.join("prompts", "agent-surface.prompt.md"),
      content: await renderVsCodePromptDocument(),
    },
  ];
}

export async function vscodiumStaticOutputs(_commands, context) {
  return [
    {
      sourceKind: "rules",
      renderKind: "instructions",
      source: "rules/*.mdc",
      relativeOutput: path.join("instructions", "agent-surface.instructions.md"),
      content: await renderVsCodeInstructionDocument("agent-surface VSCodium instructions", "vscodium"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join("instructions", "references", "rules")),
    {
      sourceKind: "commands",
      renderKind: "prompts",
      source: "commands/ops-flow.md",
      relativeOutput: path.join("prompts", "agent-surface.prompt.md"),
      content: await renderVsCodePromptDocument(),
    },
  ];
}

export async function windsurfStaticOutputs(_commands, context) {
  return [
    {
      source: "rules/*.mdc",
      renderKind: "rules",
      relativeOutput: windsurfRulePath(context),
      content: await renderInstructionDocument("agent-surface Windsurf rules", "Windsurf instructions"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join(windsurfConfigRoot(context), "references", "rules")),
  ];
}

export async function zedStaticOutputs(_commands, context) {
  return [
    {
      source: "rules/*.mdc",
      renderKind: "rules",
      relativeOutput: zedInstructionPath(context),
      content: await renderInstructionDocument("AGENTS.md - agent-surface Zed rules", "Zed instructions"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join(zedConfigRoot(context), "references", "rules")),
  ];
}

export function yamlBlockString(value) {
  return value.replace(/\s+/g, " ").trim().replaceAll('"', '\\"');
}

export function sourceKindPolicy(sourceKindsConfig, sourceKind) {
  return sourceKind ? sourceKindsConfig.source_kinds[sourceKind] : null;
}
