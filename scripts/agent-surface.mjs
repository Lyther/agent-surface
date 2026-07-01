#!/usr/bin/env node

import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { approximateTokens, tomlMultilineString, tomlString, yamlString } from "./agent-surface/format.mjs";
import { mergeJsoncRootObjectProperty, mergeKiloInstructionJsonc, parseJsoncResult } from "./agent-surface/jsonc.mjs";
import {
  checkIgnores,
  checkSubagents,
  ignoreOutputs,
  subagentOutputs,
  subagentValidationErrors,
} from "./agent-surface/source-primitives.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commandMetadataFields = new Set(["name", "aliases", "phase", "description"]);
const commandPrefixes = new Set(["arch", "boot", "dev", "lint", "ops", "qa", "ship", "stellaris", "verify", "workflow"]);
const commandPhases = new Set(["observe", "decide", "build", "verify", "review", "arbitrate", "ship", "improve", "bootstrap", "game", "misc"]);

const targets = {
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

// Per-target generated output floors are race-free gross-drop tripwires, not
// exact bulk pins. Keep enough headroom for legitimate small count changes
// while still catching silent producer drops that representative path checks
// can miss.
const generatedOutputMinimums = new Map([
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

const ruleScenarios = {
  "generic-chat": {
    paths: [],
    targetTokens: 10000,
    hardTokens: 12000,
  },
  "python-source": {
    paths: ["src/example.py"],
    targetTokens: 10000,
    hardTokens: 12000,
  },
  "python-tooling": {
    paths: ["pyproject.toml"],
    targetTokens: 10000,
    hardTokens: 12000,
  },
  "rust-source": {
    paths: ["src/lib.rs"],
    targetTokens: 10000,
    hardTokens: 12000,
  },
  "go-ci": {
    paths: [".golangci.yml"],
    targetTokens: 10000,
    hardTokens: 12000,
  },
  "typescript-eslint": {
    paths: ["eslint.config.mjs"],
    targetTokens: 10000,
    hardTokens: 12000,
  },
  "shell-script": {
    paths: ["scripts/deploy.sh"],
    targetTokens: 10000,
    hardTokens: 12000,
  },
  "security-exploit": {
    paths: ["exploit.py", "ctf/chall/pwn.c", "findings/pentest.md", ".garak.toml"],
    targetTokens: 10000,
    hardTokens: 12000,
  },
  "ordinary-patch": {
    paths: ["patches/fix-build-regression.patch"],
    targetTokens: 10000,
    hardTokens: 12000,
  },
};

const workflowSchemaFiles = [
  "workflow.run.schema.json",
  "workflow.boss.schema.json",
  "workflow.worker.schema.json",
  "workflow.reviewer.schema.json",
  "workflow.judger.schema.json",
  "workflow.rescue.schema.json",
  "workflow.event.schema.json",
  "workflow.current.schema.json",
  "workflow.patch.schema.json",
];

const registrySchemaFiles = [
  { schema: "targets.schema.json", file: "registry/targets.json" },
  { schema: "target-capabilities.schema.json", file: "registry/target-capabilities.json" },
  { schema: "artifacts.schema.json", file: "registry/artifacts.json" },
  { schema: "source-kinds.schema.json", file: "registry/source-kinds.json" },
  { schema: "optional-services.schema.json", file: "registry/optional-services.json" },
];

const workflowFixtureFiles = [
  { schema: "workflow.run.schema.json", file: "tests/fixtures/workflow/run.json" },
  { schema: "workflow.boss.schema.json", file: "tests/fixtures/workflow/boss-chore.json" },
  { schema: "workflow.boss.schema.json", file: "tests/fixtures/workflow/boss-rich.json" },
  { schema: "workflow.reviewer.schema.json", file: "tests/fixtures/workflow/reviewer-rich.json" },
  { schema: "workflow.judger.schema.json", file: "tests/fixtures/workflow/judger-rich.json" },
  { schema: "workflow.rescue.schema.json", file: "tests/fixtures/workflow/rescue-rich.json" },
  { schema: "workflow.worker.schema.json", file: "tests/fixtures/workflow/worker-chore.json" },
  { schema: "workflow.worker.schema.json", file: "tests/fixtures/workflow/worker-blocked.json" },
  { schema: "workflow.worker.schema.json", file: "tests/fixtures/workflow/worker-blocked-legacy.json" },
  { schema: "workflow.worker.schema.json", file: "tests/fixtures/workflow/worker-refactor.json" },
  { schema: "workflow.reviewer.schema.json", file: "tests/fixtures/workflow/reviewer-refactor.json" },
  { schema: "workflow.judger.schema.json", file: "tests/fixtures/workflow/judger-close.json" },
  { schema: "workflow.rescue.schema.json", file: "tests/fixtures/workflow/rescue-refactor.json" },
  { schema: "workflow.event.schema.json", file: "tests/fixtures/workflow/event.json" },
  { schema: "workflow.current.schema.json", file: "tests/fixtures/workflow/current.json" },
  { schema: "workflow.patch.schema.json", file: "tests/fixtures/workflow/patch-verified.json" },
];

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "inventory") {
    await inventory();
    return;
  }

  if (command === "commands") {
    await commandsList(args);
    return;
  }

  if (command === "check") {
    if (args[0] === "rules") {
      await checkRules(args.slice(1));
    } else if (args[0] === "commands") {
      await checkCommands(args.slice(1));
    } else if (args[0] === "generated") {
      await checkGenerated(args.slice(1));
    } else if (args[0] === "ignores") {
      await checkIgnores(targets);
    } else if (args[0] === "subagents") {
      await checkSubagents();
    } else {
      await check();
    }
    return;
  }

  if (command === "build") {
    await build(args);
    return;
  }

  if (command === "install") {
    await install(args);
    return;
  }

  if (command === "run") {
    await runEvidence(args);
    return;
  }

  if (command === "workflow") {
    await workflow(args);
    return;
  }

  if (command === "doctor") {
    await doctor();
    return;
  }

  fail(`unknown command: ${command}`);
}

function printHelp() {
  console.log(`agent-surface

Usage:
  agent-surface inventory
  agent-surface commands [--phase <phase>] [--json]
  agent-surface check
  agent-surface check rules [--scenario <name>]
  agent-surface check commands
  agent-surface check generated [--target <target|all>]
  agent-surface check ignores
  agent-surface check subagents
  agent-surface build --target <target|all> [--dry-run]
  agent-surface install --target <target>[,<target>...] [--runtime <runtime>[,<runtime>...]] [--category <category>[,<category>...]] [--scope project|user] [--dest <path>] [--allow-scope-root] [--dry-run]
  agent-surface run --task <id> --class <class> --timeout <ms> --out <dir> -- <command...>
  agent-surface doctor
  agent-surface workflow doctor --run <run_id>
  agent-surface workflow apply --role <role> --run <run_id> --artifact <path>
  agent-surface workflow patch begin --run <run_id> --round <n> --task <id> --file <path> [--file <path>...]
  agent-surface workflow patch end --run <run_id> --round <n> --task <id>
  agent-surface workflow patch verify --run <run_id> --round <n> --task <id>
`);
}

async function inventory() {
  const counts = {
    rules: (await files("rules", [".md", ".mdc"])).length,
    commands: (await files("commands", [".md"])).length,
    skills: (await files("skills", [".md"])).length,
    subagents: (await files("subagents", [".md"])).length,
    mcps: (await files("mcps", [".json", ".toml", ".yaml", ".yml"])).length,
    settings: (await files("settings", [".json", ".toml", ".yaml", ".yml"])).length,
    ignores: (await files("ignores", [".ignore", ".gitignore", ".clineignore", ".md", ".txt"])).length,
    plugins: (await files("plugins", [".json", ".md", ".toml", ".yaml", ".yml"])).length,
    external: (await directDirectories(path.join(root, "external"))).length,
    schemas: (await files("schemas", [".json"])).length,
  };

  for (const [type, count] of Object.entries(counts)) {
    console.log(`${type}: ${count}`);
  }
}

function gitSubmoduleStatusMap() {
  const result = spawnSync("git", ["submodule", "status"], { encoding: "utf8", cwd: root });
  if (result.status !== 0 || !result.stdout) return new Map();
  const map = new Map();
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^[+\-U ]?([0-9a-f]{40})\s+(\S+)/);
    if (match) map.set(match[2], match[1]);
  }
  return map;
}

function gitStagedGitlinkMap() {
  const result = spawnSync("git", ["ls-files", "--stage", "external"], { encoding: "utf8", cwd: root });
  if (result.status !== 0 || !result.stdout) return new Map();
  const map = new Map();
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^160000 ([0-9a-f]{40}) \d+\t(.+)$/);
    if (match) map.set(match[2], match[1]);
  }
  return map;
}

// Recursive removal of large generated trees (tens of thousands of files) can hit
// transient ENOTEMPTY/EBUSY/EPERM on some filesystems; retry with backoff so a
// build/install is not flaky on the dist cleanup step.
async function removeTree(target) {
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function checkExternalServicePins(errors) {
  const registry = await readOptionalServices();
  const submodules = gitSubmoduleStatusMap();
  const staged = gitStagedGitlinkMap();
  for (const [name, service] of Object.entries(registry.services)) {
    if (typeof service.path !== "string" || typeof service.commit !== "string") continue;
    const required = service.optional === false || service.status === "required";
    const pin = service.commit.slice(0, 8);
    const submoduleSha = submodules.get(service.path);
    const stagedSha = staged.get(service.path);
    if (submoduleSha === undefined && stagedSha === undefined) {
      const message = `external service ${name} (${service.path}) is not a registered submodule; pin ${pin} not verifiable`;
      if (required) errors.push(`required ${message}`);
      else console.error(`warning: ${message}`);
      continue;
    }
    if (submoduleSha !== undefined && submoduleSha !== service.commit) {
      errors.push(`external service ${name} (${service.path}) at ${submoduleSha.slice(0, 8)} but pinned ${pin}`);
    }
    // Required packs must be pinned by a committed gitlink, not just a present
    // working tree, or a fresh clone would silently build without them.
    if (required) {
      if (stagedSha === undefined) {
        errors.push(`required external service ${name} (${service.path}) has no committed submodule gitlink (working-tree only); pin ${pin} not verifiable`);
      } else if (stagedSha !== service.commit) {
        errors.push(`required external service ${name} (${service.path}) committed gitlink ${stagedSha.slice(0, 8)} but pinned ${pin}`);
      }
    }
  }
}

// served_by links a large source-pack to the first-party MCP(s) that serve it just-in-time.
// Invariant: a served pack stays a pinned source-pack with NO skill_roots, so it is never
// mirrored into a host startup catalog (externalSkillRoots only emits skill/behavior packs);
// and every server it names is a real first-party mcp service.
async function checkServedBy(errors) {
  const registry = await readOptionalServices();
  const services = registry.services;
  const catalogPacks = new Set(
    Object.entries(services)
      .filter(([, s]) => ["skill-pack", "behavior-pack"].includes(s.kind) && Array.isArray(s.skill_roots))
      .map(([id]) => id),
  );
  for (const [id, service] of Object.entries(services)) {
    if (!Object.hasOwn(service, "served_by")) continue;
    const servedBy = service.served_by;
    if (!Array.isArray(servedBy) || servedBy.length === 0) {
      errors.push(`served pack ${id} has an empty served_by`);
      continue;
    }
    if (service.kind !== "source-pack") errors.push(`served pack ${id} must be kind "source-pack" (got "${service.kind}")`);
    if (service.skill_roots !== undefined) errors.push(`served pack ${id} must not declare skill_roots; it is served just-in-time, not mirrored into a catalog`);
    if (typeof service.commit !== "string") errors.push(`served pack ${id} must be pinned with a commit`);
    if (catalogPacks.has(id)) errors.push(`served pack ${id} must not also emit a native skill catalog`);
    for (const serverId of servedBy) {
      const server = services[serverId];
      if (!server) errors.push(`served pack ${id} references unknown server "${serverId}" in served_by`);
      else if (server.kind !== "mcp" || server.first_party !== true) errors.push(`served pack ${id} server "${serverId}" must be a first-party mcp service`);
    }
  }
}

async function check() {
  const errors = [];
  const commands = await readCommands();
  const commandFiles = commands.map((command) => command.file);
  const ruleFiles = await files("rules", [".md", ".mdc"]);
  const targetsConfig = JSON.parse(await readFile(path.join(root, "registry", "targets.json"), "utf8"));
  const artifactsConfig = JSON.parse(await readFile(path.join(root, "registry", "artifacts.json"), "utf8"));
  const sourceKindsConfig = await readSourceKinds();
  const banned = new Set(targetsConfig.out_of_scope);

  if (commandFiles.length === 0) errors.push("commands/ is empty");
  if (ruleFiles.length === 0) errors.push("rules/ is empty");

  for (const name of ["AGENTS.md", "GEMINI.md"]) {
    if (commandFiles.some((file) => path.basename(file) === name)) {
      errors.push(`${name} must not be imported as a command source`);
    }
  }

  for (const name of banned) {
    if (await exists(path.join(root, "adapters", name))) {
      errors.push(`out-of-scope adapter exists: ${name}`);
    }
  }

  for (const dir of await directories(root)) {
    const name = path.basename(dir);
    if (name === "legacy") errors.push(`legacy directory must not exist: ${relative(dir)}`);
  }

  for (const dir of await directDirectories(path.join(root, "adapters"))) {
    const name = path.basename(dir);
    if (name === "adapters") continue;
    if (banned.has(name)) errors.push(`out-of-scope adapter exists: ${name}`);
    if (!Object.hasOwn(targetsConfig.in_scope, name)) errors.push(`adapter missing from registry: ${name}`);
  }

  for (const name of Object.keys(targetsConfig.in_scope)) {
    if (!(await exists(path.join(root, "adapters", name)))) {
      errors.push(`registry target missing adapter directory: ${name}`);
    }
    const implemented = Object.hasOwn(targets, name);
    if (targetsConfig.in_scope[name].build_supported && !implemented) {
      errors.push(`registry target marks build_supported without CLI adapter: ${name}`);
    }
    if (targetsConfig.in_scope[name].install_supported && !implemented) {
      errors.push(`registry target marks install_supported without CLI adapter: ${name}`);
    }
    if (implemented) {
      // renders records emitted target surface classes (not one-to-one source
      // directories). Producers, not hand-maintained adapter prose, are the
      // source of truth for whether a target actually emits a token.
      const declared = producerEmitsFor(targets[name]);
      const registered = targetsConfig.in_scope[name].renders ?? [];
      for (const token of registered) {
        if (!declared.has(token)) errors.push(`registry target ${name} declares renders token not emitted by producer: ${token}`);
      }
      for (const token of declared) {
        if (!registered.includes(token)) errors.push(`producer for ${name} emits renders token not declared in registry: ${token}`);
      }
    }
  }

  for (const name of Object.keys(targets)) {
    if (!targetsConfig.in_scope[name]?.build_supported) {
      errors.push(`CLI build target is not marked build_supported in registry: ${name}`);
    }
  }

  checkSourceKinds(sourceKindsConfig, artifactsConfig, errors);

  if (await exists(path.join(root, "commands", "ops-server.md"))) {
    errors.push("commands/ops-server.md is local/private and must not be imported");
  }

  await checkWorkflowSchemas(errors);
  await checkRegistrySchemas(errors);
  await checkTargetCapabilities(targetsConfig, errors);
  await checkExternalServicePins(errors);
  await checkServedBy(errors);
  errors.push(...await subagentValidationErrors());
  checkCommandMetadata(commands, errors);

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("check: ok");
}

let sourceKindsCache;
async function readSourceKinds() {
  if (sourceKindsCache !== undefined) return sourceKindsCache;
  sourceKindsCache = JSON.parse(await readFile(path.join(root, "registry", "source-kinds.json"), "utf8"));
  return sourceKindsCache;
}

let optionalServicesCache;
async function readOptionalServices() {
  if (optionalServicesCache !== undefined) return optionalServicesCache;
  optionalServicesCache = JSON.parse(await readFile(path.join(root, "registry", "optional-services.json"), "utf8"));
  return optionalServicesCache;
}

function sourceKindPolicy(sourceKindsConfig, sourceKind) {
  return sourceKind ? sourceKindsConfig.source_kinds[sourceKind] : null;
}

function outputSourceKindError(output, sourceKindsConfig) {
  if (!output.sourceKind) return `output ${output.relativeOutput} has no source kind`;
  if (!sourceKindPolicy(sourceKindsConfig, output.sourceKind)) {
    return `output ${output.relativeOutput} has unknown source kind: ${output.sourceKind}`;
  }
  return null;
}

function checkSourceKinds(sourceKindsConfig, artifactsConfig, errors) {
  const sourceKinds = new Set(Object.keys(sourceKindsConfig.source_kinds));
  for (const [name, policy] of Object.entries(sourceKindsConfig.source_kinds)) {
    if (!artifactsConfig.source_types.includes(policy.source_dir)) {
      errors.push(`source kind ${name} points at source_dir missing from registry/artifacts.json: ${policy.source_dir}`);
    }
    if (!Array.isArray(policy.install_scopes) || policy.install_scopes.length === 0) {
      errors.push(`source kind ${name} must declare at least one install scope`);
    }
    if (policy.scope === "project" && policy.install_scopes.includes("user")) {
      errors.push(`source kind ${name} is project scope but declares user install scope`);
    }
  }

  for (const [targetName, adapter] of Object.entries(targets)) {
    for (const producer of targetProducers(adapter)) {
      if (!producer.sourceKind) {
        errors.push(`target ${targetName} producer ${producer.id} has no source kind`);
      } else if (!sourceKinds.has(producer.sourceKind)) {
        errors.push(`target ${targetName} producer ${producer.id} has unknown source kind: ${producer.sourceKind}`);
      }
    }
  }
}

async function checkWorkflowSchemas(errors) {
  const schemas = new Map();
  const ajv = createAjv();

  for (const name of workflowSchemaFiles) {
    const file = path.join(root, "schemas", name);
    if (!(await exists(file))) {
      errors.push(`workflow schema missing: schemas/${name}`);
      continue;
    }

    let schema;
    try {
      schema = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      errors.push(`workflow schema is not valid JSON: schemas/${name}: ${error.message}`);
      continue;
    }

    if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
      errors.push(`workflow schema missing draft 2020-12 marker: schemas/${name}`);
    }
    if (schema.type !== "object") {
      errors.push(`workflow schema must describe an object: schemas/${name}`);
    }

    schemas.set(name, schema);
    try {
      ajv.addSchema(schema, name);
    } catch (error) {
      errors.push(`workflow schema failed to compile: schemas/${name}: ${error.message}`);
    }
  }

  await checkWorkflowFixtures(ajv, schemas, errors);
}

async function checkRegistrySchemas(errors) {
  for (const fixture of registrySchemaFiles) {
    const schemaFile = path.join(root, "schemas", fixture.schema);
    const dataFile = path.join(root, fixture.file);

    if (!(await exists(schemaFile))) {
      errors.push(`registry schema missing: schemas/${fixture.schema}`);
      continue;
    }

    let schema;
    let data;
    try {
      schema = JSON.parse(await readFile(schemaFile, "utf8"));
      data = JSON.parse(await readFile(dataFile, "utf8"));
    } catch (error) {
      errors.push(`registry validation input is not valid JSON: ${fixture.file}: ${error.message}`);
      continue;
    }

    const ajv = createAjv();
    const validate = ajv.compile(schema);
    if (!validate(data)) {
      errors.push(`${fixture.file}: ${formatAjvErrors(validate.errors)}`);
    }
  }
}

async function checkTargetCapabilities(targetsConfig, errors) {
  let capabilities;
  try {
    capabilities = JSON.parse(await readFile(path.join(root, "registry", "target-capabilities.json"), "utf8"));
  } catch (error) {
    errors.push(`target capabilities registry is not valid JSON: ${error.message}`);
    return;
  }

  const implementedTargets = Object.keys(targetsConfig.in_scope).sort();
  const capabilityTargets = Object.keys(capabilities.targets ?? {}).sort();
  for (const name of implementedTargets) {
    if (!capabilityTargets.includes(name)) errors.push(`target capabilities missing implemented target: ${name}`);
  }
  for (const name of capabilityTargets) {
    if (!implementedTargets.includes(name)) errors.push(`target capabilities include unknown target: ${name}`);
  }

  for (const name of implementedTargets) {
    const targetCapability = capabilities.targets?.[name];
    if (!targetCapability) continue;
    const registryTokens = [...(targetsConfig.in_scope[name].renders ?? [])].sort();
    const capabilityTokens = [...(targetCapability.generated_render_tokens ?? [])].sort();
    if (registryTokens.join("\0") !== capabilityTokens.join("\0")) {
      errors.push(
        `target capabilities generated_render_tokens drift for ${name}: expected ${registryTokens.join(", ")}, got ${capabilityTokens.join(", ")}`,
      );
    }
  }
}

async function checkWorkflowFixtures(ajv, schemas, errors) {
  for (const fixture of workflowFixtureFiles) {
    const schema = schemas.get(fixture.schema);
    const file = path.join(root, fixture.file);

    if (!schema) continue;
    if (!(await exists(file))) {
      errors.push(`workflow fixture missing: ${fixture.file}`);
      continue;
    }

    let data;
    try {
      data = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      errors.push(`workflow fixture is not valid JSON: ${fixture.file}: ${error.message}`);
      continue;
    }

    const validate = ajv.getSchema(fixture.schema) ?? ajv.compile(schema);
    if (!validate(data)) {
      errors.push(`${fixture.file}: ${formatAjvErrors(validate.errors)}`);
    }
    if (fixture.schema === "workflow.boss.schema.json") {
      checkBossArtifactCoherence(data, fixture.file, errors);
    }
  }
}

function checkBossArtifactCoherence(data, source, errors) {
  if (!data || !Array.isArray(data.tasks)) return;

  for (const task of data.tasks) {
    const taskId = typeof task.task_id === "string" ? task.task_id : "<unknown>";
    const prefix = `${source}: task ${taskId}`;

    if (task.isolation === "serial_required" && typeof task.parallel_group === "string") {
      errors.push(`${prefix}: serial_required tasks must not set parallel_group`);
    }
    if (task.isolation === "serial_required" && task.subagent_suitable === true) {
      errors.push(`${prefix}: serial_required tasks must not set subagent_suitable=true`);
    }
    if (typeof task.parallel_group === "string" && task.subagent_suitable === true) {
      errors.push(`${prefix}: parallel_group and subagent_suitable=true are mutually exclusive fan-out modes`);
    }

    const runtime = task.suggested_runtime;
    if (typeof runtime === "string" && !workflowRuntimeNames.has(runtime)) {
      errors.push(`${prefix}: suggested_runtime is not in the workflow runtime taxonomy: ${runtime}`);
    }

    if (task.subagent_suitable !== true) continue;
    if (typeof runtime !== "string" || runtime === "unspecified") {
      errors.push(`${prefix}: subagent_suitable=true requires a concrete suggested_runtime`);
    }
  }
}

const workflowRuntimeNames = new Set([
  "antigravity-cli",
  "antigravity-desktop",
  "claude-code",
  "cline",
  "codex",
  "codex-exec",
  "cursor-agent",
  "kilo-cli",
  "kilo-ide",
  "opencode",
  "trae",
  "vscode",
  "goose",
  "grok-build",
  "pi",
  "pool",
  "vscodium",
  "windsurf",
  "zed",
  "current-session",
  "deepagents",
  "droid",
  "copilot",
  "ollama-api",
  "ollama-cli",
  "ollama-cloud",
  "unspecified",
]);

function createAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

function formatAjvErrors(errors) {
  return (errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
}

async function checkRules(args) {
  const scenario = argValue(args, "--scenario");
  const selectedScenarios = scenario ? [scenario] : Object.keys(ruleScenarios);
  const rules = await readRules();
  const commandNames = new Set((await files("commands", [".md"])).map((file) => path.basename(file, ".md")));
  const errors = [];
  const warnings = [];

  for (const name of selectedScenarios) {
    if (!Object.hasOwn(ruleScenarios, name)) {
      fail(`unknown rules scenario: ${name}`);
    }
  }

  for (const rule of rules) {
    for (const error of rule.frontmatterErrors) errors.push(`${rule.file}: ${error}`);
    if (rule.alwaysApply === false && rule.globs.length === 0) {
      errors.push(`${rule.file}: non-always rule must declare globs`);
    }
    collectRuleReferenceFindings(rule, commandNames, errors, warnings);
  }

  console.log("rules:");
  console.log(`  files: ${rules.length}`);
  console.log(`  frontmatter: ${errors.some((error) => error.includes("frontmatter")) ? "failed" : "ok"}`);

  for (const name of selectedScenarios) {
    const config = ruleScenarios[name];
    const attached = rules.filter((rule) => rule.alwaysApply || config.paths.some((item) => rule.globs.some((glob) => globMatches(glob, item))));
    const tokens = attached.reduce((sum, rule) => sum + approximateTokens(rule.text), 0);
    const status = tokens > config.hardTokens ? "fail" : tokens > config.targetTokens ? "warn" : "ok";

    if (tokens > config.hardTokens) {
      errors.push(`${name}: attached rule budget ${tokens} exceeds hard cap ${config.hardTokens}`);
    } else if (tokens > config.targetTokens) {
      warnings.push(`${name}: attached rule budget ${tokens} exceeds target ${config.targetTokens}`);
    }

    console.log(`${name}:`);
    console.log(`  attached: ${attached.map((rule) => rule.file).join(", ")}`);
    console.log(`  approx_tokens: ${tokens}`);
    console.log(`  target_tokens: ${config.targetTokens}`);
    console.log(`  hard_tokens: ${config.hardTokens}`);
    console.log(`  status: ${status}`);
  }

  if (warnings.length > 0) {
    console.log("warnings:");
    for (const warning of warnings) console.log(`  ${warning}`);
  }

  if (errors.length > 0) {
    console.log("errors:");
    for (const error of errors) console.log(`  ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("rules check: ok");
}

async function commandsList(args) {
  const phase = argValue(args, "--phase");
  const asJson = args.includes("--json");
  if (phase && !commandPhases.has(phase)) fail(`unsupported command phase: ${phase}`);

  let commands = await exportableCommands();
  if (phase) commands = commands.filter((command) => command.metadata.phase === phase);

  const registry = commandRegistry(commands, { phase });

  if (asJson) {
    console.log(JSON.stringify(registry, null, 2));
    return;
  }

  console.log(`commands: ${registry.count}${phase ? ` (phase: ${phase})` : ""}`);
  for (const command of registry.commands) {
    const aliases = command.aliases.length > 0 ? ` aliases=${command.aliases.join(",")}` : "";
    console.log(`${command.name} phase=${command.phase} source=${command.source}${aliases}`);
  }
}

async function checkCommands(_args) {
  const commands = await readCommands();
  const metadataErrors = [];
  const referenceErrors = [];

  checkCommandMetadata(commands, metadataErrors);
  collectCommandReferenceFindings(commands, referenceErrors);

  console.log("commands:");
  console.log(`  files: ${commands.length}`);
  console.log(`  explicit_metadata: ${commands.filter((command) => command.hasFrontmatter).length}`);
  console.log(`  metadata: ${metadataErrors.length > 0 ? "failed" : "ok"}`);
  console.log(`  references: ${referenceErrors.length > 0 ? "failed" : "ok"}`);

  const errors = [
    ...metadataErrors.map((error) => `metadata: ${error}`),
    ...referenceErrors.map((error) => `reference: ${error}`),
  ];

  if (errors.length > 0) {
    console.log("errors:");
    for (const error of errors) console.log(`  ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("commands check: ok");
}

async function checkGenerated(args) {
  const target = argValue(args, "--target") ?? "all";
  const selected = target === "all" ? Object.keys(targets) : [target];
  const commandFiles = await exportableCommands();
  const sourceKindsConfig = await readSourceKinds();
  const errors = [];

  for (const item of selected) {
    if (!isSafeTargetName(item)) fail(`unsafe generated target: ${item}`);
    if (!Object.hasOwn(targets, item)) fail(`unsupported generated target: ${item}`);
  }

  for (const item of selected) {
    const adapter = targets[item];
    const outputs = await targetOutputs(adapter, commandFiles, { target: item, scope: "user", mode: "check" });
    const targetErrors = validateGeneratedTarget(item, outputs);
    const countErrors = validateGeneratedOutputCount(item, outputs);
    const sourceKindErrors = validateGeneratedSourceKinds(item, outputs, sourceKindsConfig);
    const failed = targetErrors.length + countErrors.length + sourceKindErrors.length > 0;
    console.log(`${item}: generated outputs ${outputs.length} ${failed ? "failed" : "ok"}`);
    errors.push(...targetErrors.map((error) => `${item}: ${error}`));
    errors.push(...countErrors.map((error) => `${item}: ${error}`));
    errors.push(...sourceKindErrors);
  }

  if (errors.length > 0) {
    console.log("errors:");
    for (const error of errors) console.log(`  ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("generated check: ok");
}

function validateGeneratedOutputCount(target, outputs) {
  const minimum = generatedOutputMinimums.get(target);
  if (minimum === undefined) return ["missing generated output minimum"];
  if (outputs.length >= minimum) return [];
  return [`generated output count ${outputs.length} below minimum ${minimum}`];
}

function validateGeneratedSourceKinds(target, outputs, sourceKindsConfig) {
  const errors = [];
  for (const output of outputs) {
    const sourceKindError = outputSourceKindError(output, sourceKindsConfig);
    if (sourceKindError) {
      errors.push(`${target}: ${sourceKindError}`);
    }
  }
  return errors;
}

function validateGeneratedTarget(target, outputs) {
  const errors = [];
  const byPath = new Map(outputs.map((output) => [output.relativeOutput, output]));

  const requirePath = (relativeOutput) => {
    if (!byPath.has(relativeOutput)) errors.push(`missing output ${relativeOutput}`);
    return byPath.get(relativeOutput);
  };

  const requireJson = (relativeOutput) => {
    const output = requirePath(relativeOutput);
    if (!output) return null;
    try {
      return JSON.parse(output.content);
    } catch (error) {
      errors.push(`${relativeOutput} is not valid JSON: ${error.message}`);
      return null;
    }
  };

  const requireContains = (relativeOutput, pattern) => {
    const output = requirePath(relativeOutput);
    if (output && !pattern.test(output.content)) errors.push(`${relativeOutput} missing ${pattern}`);
  };
  const skillFrontmatter = /^(?:\uFEFF)?---\r?\n/;

  if (outputs.length === 0) errors.push("no outputs generated");

  if (target === "claude-code") {
    requirePath(path.join(".claude", "commands", "ops", "flow.md"));
  } else if (target === "codex") {
    requireContains(path.join(".agents", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join(".agents", "skills", "ops-flow", "agents", "openai.yaml"), /allow_implicit_invocation: false/);
    requireContains(path.join(".codex", "agents", "boss.toml"), /^name = "boss"\n/);
    requireContains(path.join(".codex", "AGENTS.md"), /agent-surface global Codex rules/);
  } else if (target === "deepagents") {
    requireContains(path.join(".deepagents", "agent", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join(".deepagents", "agent", "AGENTS.md"), /agent-surface Deep Agents Code rules/);
    requireContains(path.join(".deepagents", "agent", "agents", "worker", "AGENTS.md"), /^---\nname: worker\n/);
    if (byPath.has(path.join(".deepagents", "agent", "agents", "boss", "AGENTS.md"))) {
      errors.push("Deep Agents must not emit read-only subagents as unrestricted AGENTS.md subagents");
    }
  } else if (target === "goose") {
    requireContains(path.join("recipes", "ops-flow.yaml"), /^version: "1\.0\.0"\n/);
    requireContains(path.join("recipes", "ops-flow.yaml"), /^instructions: \|$/m);
  } else if (target === "grok-build") {
    requireContains(path.join(".grok", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join(".grok", "skills", "red-team-command-doctrine", "SKILL.md"), skillFrontmatter);
  } else if (target === "pi") {
    requireContains(path.join(".pi", "agent", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join(".pi", "agent", "AGENTS.md"), /agent-surface Pi rules/);
    requireContains(path.join(".pi", "agent", "skills", "offensive-osint", "SKILL.md"), skillFrontmatter);
  } else if (target === "pool") {
    requireContains(path.join(".config", "poolside", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join(".config", "poolside", ".poolside"), /agent-surface Poolside rules/);
    requireContains(path.join(".config", "poolside", "skills", "redteam-web-detail-pack", "SKILL.md"), skillFrontmatter);
  } else if (target === "cline") {
    requirePath(path.join(".cline", "data", "workflows", "ops-flow.md"));
    requireContains(path.join(".cline", "rules", "agent-surface.md"), /agent-surface Cline global rules/);
    requireContains(".clineignore", /agent-surface canonical AI-tool ignore baseline/);
  } else if (target === "kilo") {
    requirePath(path.join(".config", "kilo", "commands", "ops-flow.md"));
    requireContains(path.join(".config", "kilo", "agents", "boss.md"), /^---\ndescription: "/);
    requireContains(path.join(".config", "kilo", "kilo.jsonc"), /"\.\/rules\/00-precedence-and-safety\.md"/);
    requireContains(path.join(".config", "kilo", "rules", "00-precedence-and-safety.md"), /Precedence and Safety/);
    requireContains(path.join(".config", "kilo", "references", "rules", "10-python.md"), /Scoped agent-surface reference/);
    if (byPath.has(path.join(".config", "kilo", "AGENTS.md"))) {
      errors.push("Kilo must not emit AGENTS.md when kilo.jsonc instruction rules are generated");
    }
    requireContains(".kilocodeignore", /agent-surface canonical AI-tool ignore baseline/);
  } else if (target === "antigravity") {
    requireContains(path.join("global_workflows", "ops-flow.md"), /^---\ndescription: "/);
  } else if (target === "antigravity-cli") {
    const plugin = requireJson(path.join("config", "plugins", "agent-surface", "plugin.json"));
    if (plugin && plugin.name !== "agent-surface") errors.push("Antigravity CLI plugin name must be agent-surface");
    requireContains(path.join("config", "plugins", "agent-surface", "skills", "ops-flow.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join("config", "plugins", "agent-surface", "agents", "boss.md"), /^---\nname: boss\n/);
    requireContains(path.join("config", "plugins", "agent-surface", "rules", "00-precedence-and-safety.md"), /Antigravity CLI plugin rule/);
    requireContains(path.join("config", "plugins", "agent-surface", "references", "rules", "10-python.md"), /Scoped agent-surface reference/);
  } else if (target === "cursor") {
    requirePath(path.join(".cursor", "commands", "ops-flow.md"));
    requireContains(path.join(".cursor", "agents", "boss.md"), /^---\nname: boss\n/);
    requirePath(path.join(".cursor", "rules", "00-precedence-and-safety.mdc"));
    requireContains(".cursorignore", /agent-surface canonical AI-tool ignore baseline/);
  } else if (target === "droid") {
    requirePath(path.join(".factory", "commands", "ops-flow.md"));
    requireContains(path.join(".factory", "droids", "boss.md"), /^---\nname: boss\n/);
    requireContains(path.join(".factory", "AGENTS.md"), /agent-surface Droid rules/);
    const mcp = requireJson(path.join(".factory", "mcp.json"));
    if (mcp && mcp.mcpServers?.synapse?.command !== "~/.local/bin/synapse-bridge") {
      errors.push("Droid synapse MCP must use the first-party local bridge binary");
    }
    if (mcp && mcp.mcpServers?.grimoire?.command !== "~/.local/bin/grimoire-server") {
      errors.push("Droid grimoire MCP must use the first-party local server binary");
    }
    if (outputs.some((output) => output.relativeOutput.startsWith(path.join(".factory", "skills") + path.sep))) {
      requireContains(path.join(".factory", "skills", "karpathy-guidelines", "SKILL.md"), skillFrontmatter);
    }
  } else if (target === "copilot") {
    requireContains(path.join("instructions", "agent-surface-copilot.instructions.md"), /^---\ndescription: "agent-surface Copilot global instructions"\napplyTo: "\*\*"/);
  } else if (target === "vscode") {
    requireContains(path.join("instructions", "agent-surface.instructions.md"), /^---\ndescription: "agent-surface VS Code instructions"\napplyTo: "\*\*"/);
    requireContains(path.join("prompts", "agent-surface.prompt.md"), /^---\ndescription: "Route a task to the lightest safe agent-surface path"/);
  } else if (target === "vscodium") {
    requireContains(path.join("instructions", "agent-surface.instructions.md"), /^---\ndescription: "agent-surface VSCodium instructions"\napplyTo: "\*\*"/);
    requireContains(path.join("prompts", "agent-surface.prompt.md"), /^---\ndescription: "Route a task to the lightest safe agent-surface path"/);
  } else if (target === "opencode") {
    requireContains(path.join(".config", "opencode", "AGENTS.md"), /agent-surface global OpenCode rules/);
    requirePath(path.join(".config", "opencode", "commands", "ops-flow.md"));
    requireContains(path.join(".config", "opencode", "agents", "boss.md"), /^---\ndescription: "/);
  } else if (target === "trae") {
    requireContains(path.join(".trae", "user_rules.md"), /agent-surface Trae user rules/);
  } else if (target === "windsurf") {
    requirePath(path.join(".codeium", "windsurf", "global_workflows", "ops-flow.md"));
    requireContains(path.join(".codeium", "windsurf", "memories", "global_rules.md"), /agent-surface Windsurf rules/);
    requireContains(path.join(".codeium", "windsurf", "skills", "osint-methodology", "SKILL.md"), skillFrontmatter);
  } else if (target === "zed") {
    requireContains(path.join(".agents", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join(".config", "zed", "AGENTS.md"), /agent-surface Zed rules/);
    requireContains(path.join(".agents", "skills", "redteam-api-detail-pack", "SKILL.md"), skillFrontmatter);
  }

  return errors;
}

async function build(args) {
  const target = argValue(args, "--target") ?? "all";
  const dryRun = args.includes("--dry-run");

  if (target !== "all") {
    if (!isSafeTargetName(target)) fail(`unsafe build target: ${target}`);
    if (!Object.hasOwn(targets, target)) fail(`unsupported build target: ${target}`);
  }

  const selected = target === "all" ? Object.keys(targets) : [target];
  const commandFiles = await exportableCommands();

  if (!dryRun) {
    await removeTree(path.join(root, "dist", target === "all" ? "" : target));
  }

  for (const item of selected) {
    const adapter = targets[item];
    const sourceKindsConfig = await readSourceKinds();
    const outputs = await targetOutputs(adapter, commandFiles, { target: item, scope: "user", mode: "build" });
    const sourceKindErrors = [];
    for (const output of outputs) {
      requireKnownSourceKind(output, sourceKindsConfig, sourceKindErrors);
    }
    if (sourceKindErrors.length > 0) fail(sourceKindErrors.join("; "));

    for (const output of outputs) {
      const targetPath = path.join(root, "dist", item, output.relativeOutput);
      if (dryRun) {
        console.log(`[dry-run] ${adapter.label}: ${output.source} -> ${relative(targetPath)}`);
        continue;
      }

      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, output.content);
    }

    console.log(`${item}: ${outputs.length} outputs rendered${dryRun ? " (dry-run)" : ""}`);
  }
}

async function install(args) {
  const selectedTargets = selectedInstallTargets(args);
  const scope = argValue(args, "--scope") ?? "project";
  const dryRun = args.includes("--dry-run");
  const allowScopeRoot = args.includes("--allow-scope-root");
  const dest = argValue(args, "--dest");
  const categoryFilter = installCategoryFilter(args);
  const optionalServices = optionalServiceFilter(args);
  const agentName = argValue(args, "--agent") ?? "agent";

  if (!["project", "user"].includes(scope)) fail(`unsupported install scope: ${scope}`);
  if (!isSafeTargetName(agentName)) fail(`unsafe --agent: ${agentName}`);
  if (optionalServices && !categoryFilter?.has("mcps")) {
    fail("--service currently applies only to --category mcps");
  }
  if (!dryRun && !dest && !allowScopeRoot) {
    fail("live install requires explicit --dest or --allow-scope-root after reviewing --dry-run");
  }

  const plans = [];
  for (const target of selectedTargets) {
    const adapter = targets[target];
    if (!adapter) fail(`unsupported install target: ${target}`);
    const installRoot = dest ? path.resolve(dest) : adapter.installRoot(scope);
    if (installRoot === path.parse(installRoot).root) fail("install root cannot be filesystem root");
    plans.push(await installPlan(target, adapter, installRoot, scope, dest ? "explicit --dest" : "scope-derived root", {
      agentName,
      categoryFilter,
      optionalServices,
      multiTarget: selectedTargets.length > 1,
    }));
  }
  addCrossPlanInstallConflicts(plans);

  const blocked = plans.flatMap((plan) => plan.blocked.map((item) => `${plan.target}: ${item}`));
  for (const plan of plans) {
    printInstallPlan(plan);
  }
  if (blocked.length > 0) {
    process.exitCode = 1;
    return;
  }

  if (!dryRun) {
    for (const plan of plans) {
      await applyInstallPlan(plan);
    }
  }
}

function addCrossPlanInstallConflicts(plans) {
  const planned = new Map();
  for (const plan of plans) {
    const outputs = [
      ...plan.writes.map((item) => ({ output: item.output, relativeOutput: item.relativeOutput, content: item.content })),
      ...plan.configMerges.map((item) => ({ output: item.output, relativeOutput: item.relativeOutput, content: null })),
    ];
    for (const item of outputs) {
      const previous = planned.get(item.output);
      if (!previous) {
        planned.set(item.output, { target: plan.target, plan, relativeOutput: item.relativeOutput, content: item.content });
        continue;
      }
      if (item.content !== null && previous.content !== null && item.content === previous.content) continue;
      plan.blocked.push(`output ${item.relativeOutput} also planned by ${previous.target}`);
      previous.plan.blocked.push(`output ${previous.relativeOutput} also planned by ${plan.target}`);
    }
  }
}

function selectedInstallTargets(args) {
  const values = splitArgValues([...argValues(args, "--target"), ...argValues(args, "--runtime")]);
  if (values.length === 0) fail("missing required --target or --runtime");
  if (values.includes("all")) return Object.keys(targets);
  const selected = uniqueStrings(values);
  for (const target of selected) {
    if (!isSafeTargetName(target)) fail(`unsafe install target: ${target}`);
    if (!Object.hasOwn(targets, target)) fail(`unsupported install target: ${target}`);
  }
  return selected;
}

function installCategoryFilter(args) {
  const values = splitArgValues([...argValues(args, "--category"), ...argValues(args, "--categories")]);
  if (values.length === 0 || values.includes("all")) return null;
  const known = new Set([
    "commands",
    "commands-as-workflows",
    "skills",
    "rules",
    "instructions",
    "prompts",
    "subagents",
    "ignores",
    "plugins",
    "external",
    "mcps",
    "recipes",
  ]);
  const selected = new Set(values);
  for (const value of selected) {
    if (!known.has(value)) fail(`unsupported install category: ${value}`);
  }
  return selected;
}

function optionalServiceFilter(args) {
  const values = splitArgValues(argValues(args, "--service"));
  return values.length > 0 ? new Set(values) : null;
}

function splitArgValues(values) {
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

async function installPlan(target, adapter, installRoot, scope, rootSource, options = {}) {
  const categoryFilter = options.categoryFilter ?? null;
  const optionalServices = options.optionalServices ?? null;
  const commandFiles = await exportableCommands();
  const sourceKindsConfig = await readSourceKinds();
  const version = await packageVersion();
  const generatedAt = new Date().toISOString();
  const manifestPath = path.join(installRoot, ".agent-surface", `${target}-manifest.json`);
  const previousManifest = await readJsonIfExists(manifestPath);
  const outputs = (await targetOutputs(adapter, commandFiles, {
    target,
    scope,
    mode: "install",
    agentName: options.agentName ?? "agent",
    categoryFilter,
    optionalServices,
  })).filter((output) => outputAppliesToCategory(output, categoryFilter));
  const writes = [];
  const managed = [];
  const blocked = [];
  const nonApplicable = [];

  for (const item of outputs) {
    const sourceKindError = outputSourceKindError(item, sourceKindsConfig);
    if (sourceKindError) {
      blocked.push(sourceKindError);
      continue;
    }
    if (!outputAppliesToScope(item, scope, sourceKindsConfig)) {
      nonApplicable.push(item.relativeOutput);
      continue;
    }
    const output = path.join(installRoot, item.relativeOutput);
    const relativeOutput = path.relative(installRoot, output);
    const hash = sha256(item.content);
    if (!isSafeRelativePath(relativeOutput)) {
      blocked.push(`unsafe output path: ${relativeOutput}`);
      continue;
    }

    writes.push({ source: item.source, output, relativeOutput, content: item.content, sha256: hash });
    managed.push({
      target,
      source: item.source,
      output: relativeOutput,
      sha256: hash,
      managed_by: "agent-surface",
      version,
    });
  }

  const previousManaged = new Map(
    Array.isArray(previousManifest?.managed)
      ? previousManifest.managed
        .filter((item) => item?.managed_by === "agent-surface")
        .filter((item) => item?.target === target)
        .filter((item) => typeof item.output === "string")
        .map((item) => [item.output, item])
      : [],
  );

  for (const item of writes) {
    const current = await readFileIfExists(item.output);
    if (current === null) {
      item.action = "write";
      continue;
    }

    const currentHash = sha256(current);
    if (currentHash === item.sha256) {
      item.action = "skip";
      continue;
    }

    item.action = "overwrite";
  }

  const partialInstall = categoryFilter !== null || optionalServices !== null;
  const liveOutputs = new Set(managed.map((item) => item.output));
  const staleManaged = !partialInstall && Array.isArray(previousManifest?.managed)
    ? previousManifest.managed
      .filter((item) => item?.managed_by === "agent-surface")
      .filter((item) => item?.target === target)
      .filter((item) => typeof item.output === "string")
      .filter((item) => !liveOutputs.has(item.output))
      .sort((left, right) => left.output.localeCompare(right.output))
    : [];
  const staleRemovals = staleManaged.map((item) => item.output);
  const staleRemovalActions = [];
  const configMerges = [];
  if (target === "kilo" && (!categoryFilter || categoryFilter.has("rules") || categoryFilter.has("mcps"))) {
    configMerges.push(await prepareKiloConfigMerge(await kiloConfigMerge(installRoot, scope, {
      includeInstructions: !categoryFilter || categoryFilter.has("rules"),
      includeMcp: !categoryFilter || categoryFilter.has("mcps"),
      categoryFilter,
      optionalServices,
    })));
  } else if (adapter.mcpConfig && (!categoryFilter || categoryFilter.has("mcps")) && mcpConfigScopeAllows(adapter.mcpConfig, scope)) {
    const merge = await mcpConfigMerge(adapter, installRoot, scope, {
      target,
      scope,
      mode: "install",
      agentName: options.agentName ?? "agent",
      categoryFilter,
      optionalServices,
    });
    if (merge) configMerges.push(await prepareMcpConfigMerge(merge));
  }

  for (const item of configMerges) {
    if (item.action === "blocked") blocked.push(item.error);
  }

  for (const item of staleManaged) {
    if (!isSafeRelativePath(item.output)) {
      blocked.push(`unsafe stale managed path: ${item.output}`);
      continue;
    }

    const output = path.join(installRoot, item.output);
    const current = await readFileIfExists(output);
    if (current === null) {
      staleRemovalActions.push({ output, relativeOutput: item.output, action: "missing" });
      continue;
    }

    if (typeof item.sha256 === "string" && sha256(current) !== item.sha256) {
      staleRemovalActions.push({ output, relativeOutput: item.output, action: "keep" });
      continue;
    }

    staleRemovalActions.push({ output, relativeOutput: item.output, action: "remove" });
  }

  let notApplicableCategories = null;
  if (categoryFilter && writes.length === 0 && configMerges.length === 0 && nonApplicable.length === 0) {
    const message = `no installable outputs for categories: ${[...categoryFilter].sort().join(", ")}`;
    // In a multi-target install (e.g. `--target all --category mcps`) a target with no
    // applicable surface is non-applicable, not a failure — only the whole run's generated
    // targets need to succeed. A single explicit target keeps the informative hard error.
    if (options.multiTarget) notApplicableCategories = message;
    else blocked.push(message);
  }

  const retainedManaged = partialInstall && Array.isArray(previousManifest?.managed)
    ? previousManifest.managed
      .filter((item) => item?.managed_by === "agent-surface")
      .filter((item) => item?.target === target)
      .filter((item) => typeof item.output === "string")
      .filter((item) => !liveOutputs.has(item.output))
    : [];
  const manifestManaged = [...retainedManaged, ...managed].sort((left, right) => left.output.localeCompare(right.output));
  const manifest = {
    target,
    scope,
    generated_at: generatedAt,
    managed: manifestManaged,
  };

  return {
    target,
    scope,
    rootSource,
    installRoot,
    manifestPath,
    generatedAt,
    categories: categoryFilter ? [...categoryFilter].sort() : null,
    services: optionalServices ? [...optionalServices].sort() : null,
    writes,
    staleRemovals,
    staleRemovalActions,
    configMerges,
    blocked,
    notApplicableCategories,
    nonApplicable: nonApplicable.sort((left, right) => left.localeCompare(right)),
    manifest,
  };
}

function outputAppliesToScope(output, scope, sourceKindsConfig) {
  const policy = sourceKindPolicy(sourceKindsConfig, output.sourceKind);
  if (!policy) return false;
  return policy.install_scopes.includes(scope);
}

function outputAppliesToCategory(output, categoryFilter) {
  if (!categoryFilter) return true;
  return categoryFilter.has(output.renderKind) || categoryFilter.has(output.sourceKind);
}

// Every generated output must declare a source kind and that kind must be
// defined in the registry. Missing/unknown source kinds are checked in generated
// validation and install planning; this helper exists for call sites that do not
// already validate the output through those paths.
function requireKnownSourceKind(output, sourceKindsConfig, errors) {
  const error = outputSourceKindError(output, sourceKindsConfig);
  if (error) errors.push(error);
}

function printInstallPlan(plan) {
  console.log(`target: ${plan.target}`);
  console.log(`scope: ${plan.scope}`);
  if (plan.categories) console.log(`categories: ${plan.categories.join(", ")}`);
  if (plan.services) console.log(`services: ${plan.services.join(", ")}`);
  console.log(`root source: ${plan.rootSource}`);
  console.log(`root: ${plan.installRoot}`);
  console.log("planned writes:");
  for (const item of plan.writes) {
    console.log(`  ${path.relative(plan.installRoot, item.output)} <- ${item.source}`);
  }
  const removes = plan.staleRemovalActions.filter((item) => item.action === "remove" || item.action === "missing").map((item) => item.relativeOutput);
  const keeps = plan.staleRemovalActions.filter((item) => item.action === "keep").map((item) => item.relativeOutput);
  console.log("planned stale managed removals:");
  if (removes.length === 0) {
    console.log("  none");
  } else {
    for (const item of removes) console.log(`  ${item}`);
  }
  if (keeps.length > 0) {
    console.log("kept user-modified (not removed):");
    for (const item of keeps) console.log(`  ${item}`);
  }
  console.log("planned manifest:");
  console.log(`  ${path.relative(plan.installRoot, plan.manifestPath)}`);
  console.log("planned config merges:");
  if (plan.configMerges.length === 0) {
    console.log("  none");
  } else {
    for (const item of plan.configMerges) {
      if (item.kind === "mcp") {
        const addServers = item.addMcpServers ?? [];
        console.log(`  ${item.relativeOutput} MCP += ${addServers.length > 0 ? addServers.join(", ") : "unchanged"}`);
        continue;
      }
      const addInstructions = item.addInstructions ?? item.instructions;
      const removeInstructions = item.removeInstructions ?? [];
      const addMcpServers = item.addMcpServers ?? [];
      if (addInstructions.length > 0) {
        console.log(`  ${item.relativeOutput} instructions += ${addInstructions.join(", ")}`);
      }
      if (removeInstructions.length > 0) {
        console.log(`  ${item.relativeOutput} instructions -= ${removeInstructions.join(", ")}`);
      }
      if (addMcpServers.length > 0) {
        console.log(`  ${item.relativeOutput} MCP += ${addMcpServers.join(", ")}`);
      }
      if (addInstructions.length === 0 && removeInstructions.length === 0 && addMcpServers.length === 0) {
        console.log(`  ${item.relativeOutput} config unchanged`);
      }
    }
  }
  if (plan.nonApplicable && plan.nonApplicable.length > 0) {
    console.log("non-applicable at this scope:");
    for (const item of plan.nonApplicable) console.log(`  ${item} (project-scope only)`);
  }
  if (plan.notApplicableCategories) {
    console.log(`not applicable: ${plan.notApplicableCategories}`);
  }
  console.log("blocked:");
  if (plan.blocked.length === 0) {
    console.log("  none");
  } else {
    for (const item of plan.blocked) console.log(`  ${item}`);
  }
}

async function applyInstallPlan(plan) {
  const backupRoot = path.join(plan.installRoot, ".agent-surface", "backups", safeTimestamp(plan.generatedAt));
  let written = 0;
  let skipped = 0;
  let removed = 0;
  let kept = 0;
  let backups = 0;
  let configMerges = 0;

  await mkdir(plan.installRoot, { recursive: true });

  for (const item of plan.writes) {
    if (item.action === "skip") {
      skipped += 1;
      continue;
    }

    if (item.action === "overwrite") {
      await backupExisting(plan.installRoot, backupRoot, item.output);
      backups += 1;
    }

    await mkdir(path.dirname(item.output), { recursive: true });
    await writeFile(item.output, item.content);
    written += 1;
  }

  for (const item of plan.staleRemovalActions) {
    if (item.action === "keep") {
      kept += 1;
      continue;
    }
    if (item.action !== "remove") continue;
    if (!(await exists(item.output))) continue;
    await backupExisting(plan.installRoot, backupRoot, item.output);
    backups += 1;
    await rm(item.output, { force: true });
    removed += 1;
  }

  if (await exists(plan.manifestPath)) {
    await backupExisting(plan.installRoot, backupRoot, plan.manifestPath);
    backups += 1;
  }

  for (const item of plan.configMerges) {
    const result = await applyConfigMerge(plan.installRoot, backupRoot, item);
    backups += result.backup ? 1 : 0;
    configMerges += result.changed ? 1 : 0;
  }

  await mkdir(path.dirname(plan.manifestPath), { recursive: true });
  const manifestTmp = `${plan.manifestPath}.tmp`;
  await writeFile(manifestTmp, `${JSON.stringify(plan.manifest, null, 2)}\n`);
  await rename(manifestTmp, plan.manifestPath);

  console.log("installed:");
  console.log(`  wrote: ${written}`);
  console.log(`  skipped unchanged: ${skipped}`);
  console.log(`  removed stale: ${removed}`);
  if (kept > 0) console.log(`  kept user-modified: ${kept}`);
  console.log(`  config merges: ${configMerges}`);
  console.log(`  backups: ${backups === 0 ? "none" : path.relative(plan.installRoot, backupRoot)}`);
}

async function mcpConfigMerge(adapter, installRoot, scope, context) {
  const entries = await selectedMcpServiceEntries(adapter.mcpConfig.defaultEnabled, context);
  if (entries.length === 0) return null;
  const relativeOutput = outputRootFor(adapter.mcpConfig.relativeOutput, { ...context, scope });
  return {
    kind: "mcp",
    output: path.join(installRoot, relativeOutput),
    relativeOutput,
    format: adapter.mcpConfig.format,
    entries,
  };
}

async function prepareMcpConfigMerge(merge) {
  if (!isSafeRelativePath(merge.relativeOutput)) {
    return { ...merge, action: "blocked", error: `unsafe MCP config path: ${merge.relativeOutput}` };
  }

  const existing = await readFileIfExists(merge.output);
  const addMcpServers = merge.entries.map(([id]) => id);
  if (existing === null) {
    return {
      ...merge,
      action: "write",
      addMcpServers,
      content: renderMcpConfig(merge.format, merge.entries),
    };
  }

  const text = existing.toString("utf8");
  let content;
  try {
    if (merge.format === "codex-toml") {
      content = mergeCodexMcpToml(text, merge.entries);
    } else if (YAML_MCP_FORMATS.has(merge.format)) {
      content = mergeYamlMcpConfig(text, merge.format, merge.entries);
    } else {
      content = mergeJsonMcpConfig(text, merge.format, merge.entries);
    }
  } catch (error) {
    return { ...merge, action: "blocked", error: `${merge.relativeOutput}: ${error.message}` };
  }
  if (content === text) return { ...merge, action: "skip", addMcpServers: [], content };
  return { ...merge, action: "merge", addMcpServers, content };
}

// Merge the agent-surface-owned MCP servers key into a JSON/JSONC host config. The merge
// preserves all other top-level keys and their comments; the merged key's object value is
// re-serialized (replaceJsoncValue), so comments INSIDE the merged key (e.g. inside an
// existing mcpServers block) are dropped. This is an accepted tradeoff: the synapse entry
// is agent-surface-owned and the merged value is fully regenerated, while user-owned
// sibling servers under the same key are preserved by value. Bad config shapes block
// rather than clobber.
function mergeJsonMcpConfig(text, format, entries) {
  const parsed = parseJsoncResult(text);
  if (!parsed.ok) throw new Error(`invalid JSON/JSONC: ${parsed.error.message}`);
  if (parsed.value === null || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    throw new Error("config must be an object");
  }
  const key = mcpConfigRootKey(format);
  const current = parsed.value[key] ?? {};
  if (current === null || typeof current !== "object" || Array.isArray(current)) {
    throw new Error(`${key} must be an object`);
  }
  return mergeJsoncRootObjectProperty(text, key, optionalServiceMcpServers(entries, format));
}

function mcpConfigRootKey(format) {
  if (format === "vscode-servers") return "servers";
  if (format === "zed-context-servers") return "context_servers";
  if (format === "local-command-map") return "mcp";
  return "mcpServers";
}

const YAML_MCP_FORMATS = new Set(["goose-extensions", "poolside-mcp"]);
function yamlMcpRootKey(format) {
  return format === "goose-extensions" ? "extensions" : "mcp_servers";
}

// One server's block, relative (name header at col 0, fields at col 2). Block style only.
function yamlMcpServerEntry(format, id, service) {
  const server = service.mcp?.server;
  if (!server || typeof server !== "object") fail(`optional service ${id} is missing an MCP server contract`);
  const args = `[${(server.args ?? []).map((a) => JSON.stringify(String(a))).join(", ")}]`;
  if (format === "goose-extensions") {
    return [`${id}:`, `  name: ${id}`, `  type: stdio`, `  cmd: ${server.command}`, `  args: ${args}`, `  enabled: true`, `  timeout: 300`];
  }
  return [`${id}:`, `  command: ${server.command}`, `  args: ${args}`];
}

function renderYamlMcpConfig(format, entries) {
  const rootKey = yamlMcpRootKey(format);
  const body = entries.flatMap(([id, service]) => yamlMcpServerEntry(format, id, service).map((l) => `  ${l}`));
  return `${rootKey}:\n${body.join("\n")}\n`;
}

// Non-destructive merge of agent-surface-owned MCP servers into a BLOCK-style YAML mapping
// under `rootKey`. Preserves every other key, comment, and sibling server. Owned servers are
// replaced in place (idempotent). Refuses (throws → blocked) on tabs or a flow/inline rootKey
// value so we never corrupt an unexpected shape rather than guess.
function mergeYamlMcpConfig(text, format, entries) {
  if (text.includes("\t")) throw new Error("YAML indented with tabs; refusing to edit");
  const rootKey = yamlMcpRootKey(format);
  const owned = new Map(entries.map(([id, service]) => [id, yamlMcpServerEntry(format, id, service)]));
  const ownedIds = [...owned.keys()];
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const renderOwned = (indent) => ownedIds.flatMap((id) => owned.get(id).map((l) => (l === "" ? "" : " ".repeat(indent) + l)));

  const headerRe = new RegExp(`^${rootKey}:[ \\t]*(#.*)?$`);
  const inlineRe = new RegExp(`^${rootKey}:[ \\t]*\\S`);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) { headerIdx = i; break; }
    if (inlineRe.test(lines[i])) throw new Error(`${rootKey} is not a block mapping`);
  }

  if (headerIdx === -1) {
    const base = text.length === 0 ? "" : (text.endsWith("\n") ? text : text + eol);
    return `${base}${rootKey}:${eol}${renderOwned(2).join(eol)}${eol}`;
  }

  // Block body extent + child indent.
  let end = lines.length;
  let childIndent = null;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) { end = i; break; }
    if (childIndent === null) childIndent = indent;
  }
  if (childIndent === null) childIndent = 2;

  const ownedKeyRe = new RegExp(`^${" ".repeat(childIndent)}(${ownedIds.join("|")}):[ \\t]*(#.*)?$`);
  const body = lines.slice(headerIdx + 1, end);
  const kept = [];
  for (let i = 0; i < body.length;) {
    if (ownedKeyRe.test(body[i])) {
      i++; // drop owned child + its deeper sub-block (re-added at end)
      while (i < body.length && (body[i].trim() === "" || (body[i].length - body[i].trimStart().length) > childIndent)) i++;
      continue;
    }
    kept.push(body[i]);
    i++;
  }
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  const result = [...lines.slice(0, headerIdx + 1), ...kept, ...renderOwned(childIndent), ...lines.slice(end)];
  let out = result.join(eol);
  if (text.endsWith("\n") && !out.endsWith(eol)) out += eol;
  return out;
}

function mergeCodexMcpToml(text, entries) {
  const ids = entries.map(([id]) => id);
  const cleaned = stripCodexMcpTomlBlocks(text, ids);
  const block = entries.map(([id, service]) => renderCodexMcpServer(id, service)).join("\n").trimEnd();
  const joiner = cleaned.trim().length === 0 ? "" : "\n\n";
  return `${cleaned.trimEnd()}${joiner}${block}\n`;
}

function stripCodexMcpTomlBlocks(text, ids) {
  const sections = new Set(ids.flatMap((id) => [`[mcp_servers.${id}]`, `[mcp_servers.${id}.env]`]));
  const lines = text.split(/\r?\n/);
  const out = [];
  let skipping = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (sections.has(trimmed)) {
      skipping = true;
      // drop an orphan comment line sitting directly above the removed section header so
      // a hand-commented synapse entry doesn't leave a dangling #comment after re-merge.
      // Only comment lines are removed; blank lines are left (the \n{3,} cleanup below
      // collapses any excess spacing).
      while (out.length > 0 && out[out.length - 1].trim().startsWith("#")) out.pop();
      continue;
    }
    if (skipping && /^\[.+\]$/.test(trimmed) && !sections.has(trimmed)) {
      skipping = false;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}$/u, "\n\n");
}

async function kiloConfigMerge(installRoot, scope, options = {}) {
  const relativeOutput = scope === "user" ? path.join(".config", "kilo", "kilo.jsonc") : "kilo.jsonc";
  const includeInstructions = options.includeInstructions !== false;
  const includeMcp = options.includeMcp === true;
  const instructions = includeInstructions ? await kiloRuleInstructionPaths(scope) : [];
  const legacyRuleRoot = scope === "user" ? "./rules" : ".kilo/rules";
  const legacyScopedRuleInstructions = (await readRules())
    .filter((rule) => rule.alwaysApply === false)
    .map((rule) => `${legacyRuleRoot}/${path.basename(rule.file, ".mdc")}.md`);
  const legacyLanguageRuleInstructions = [
    "10-lang-python",
    "11-lang-rust",
    "12-lang-go",
    "13-lang-typescript",
    "14-lang-shell",
  ].map((name) => `${legacyRuleRoot}/${name}.md`);
  const legacyInstructions = [
    `${legacyRuleRoot}/agent-surface.md`,
    `${legacyRuleRoot}/00-core.md`,
    ...legacyScopedRuleInstructions,
    ...legacyLanguageRuleInstructions,
  ];
  return {
    kind: "kilo",
    output: path.join(installRoot, relativeOutput),
    relativeOutput,
    instructions,
    legacyInstructions: includeInstructions ? legacyInstructions : [],
    mcpEntries: includeMcp
      ? await selectedMcpServiceEntries(true, {
        categoryFilter: options.categoryFilter ?? null,
        optionalServices: options.optionalServices ?? null,
      })
      : [],
  };
}

async function applyConfigMerge(installRoot, backupRoot, merge) {
  if (merge.action === "skip") return { changed: false, backup: false };
  if (merge.action === "blocked") fail(merge.error);
  const existing = await readFileIfExists(merge.output);
  if (existing !== null) await backupExisting(installRoot, backupRoot, merge.output);
  await mkdir(path.dirname(merge.output), { recursive: true });
  await writeFile(merge.output, merge.content);
  return { changed: true, backup: existing !== null };
}

async function prepareKiloConfigMerge(merge) {
  if (!isSafeRelativePath(merge.relativeOutput)) {
    return { ...merge, action: "blocked", error: `unsafe Kilo config path: ${merge.relativeOutput}` };
  }

  const existing = await readFileIfExists(merge.output);
  if (existing === null) {
    const content = {
      $schema: "https://app.kilo.ai/config.json",
    };
    if (merge.instructions.length > 0) content.instructions = merge.instructions;
    if (merge.mcpEntries.length > 0) content.mcp = optionalServiceMcpServers(merge.mcpEntries, "local-command-map");
    return {
      ...merge,
      action: "write",
      addInstructions: merge.instructions,
      removeInstructions: [],
      addMcpServers: merge.mcpEntries.map(([id]) => id),
      content: `${JSON.stringify(content, null, 2)}\n`,
    };
  }

  const text = existing.toString("utf8");
  const parsed = parseJsoncResult(text);
  if (!parsed.ok) {
    return { ...merge, action: "blocked", error: `${merge.relativeOutput}: invalid JSONC: ${parsed.error.message}` };
  }
  if (parsed.value === null || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return { ...merge, action: "blocked", error: `${merge.relativeOutput}: config must be an object` };
  }

  let content = text;
  let missing = [];
  let remove = [];
  if (merge.instructions.length > 0) {
    const instructions = parsed.value.instructions ?? [];
    if (!Array.isArray(instructions)) {
      return { ...merge, action: "blocked", error: `${merge.relativeOutput}: instructions must be an array` };
    }
    if (!instructions.every((item) => typeof item === "string")) {
      return { ...merge, action: "blocked", error: `${merge.relativeOutput}: instructions must contain only strings` };
    }
    missing = merge.instructions.filter((item) => !instructions.includes(item));
    remove = merge.legacyInstructions.filter((item) => instructions.includes(item));
    if (missing.length > 0 || remove.length > 0) {
      content = mergeKiloInstructionJsonc(content, missing, remove);
    }
  }

  const addMcpServers = merge.mcpEntries
    .map(([id]) => id)
    .filter((id) => parsed.value.mcp?.[id] === undefined);
  if (merge.mcpEntries.length > 0) {
    try {
      content = mergeJsoncRootObjectProperty(content, "mcp", optionalServiceMcpServers(merge.mcpEntries, "local-command-map"));
    } catch (error) {
      return { ...merge, action: "blocked", error: `${merge.relativeOutput}: ${error.message}` };
    }
  }

  if (content === text) {
    return { ...merge, action: "skip", addInstructions: [], removeInstructions: [], addMcpServers: [] };
  }

  return { ...merge, action: "merge", addInstructions: missing, removeInstructions: remove, addMcpServers, content };
}

async function backupExisting(installRoot, backupRoot, file) {
  const relativeOutput = path.relative(installRoot, file);
  if (!isSafeRelativePath(relativeOutput)) fail(`refusing to back up unsafe path: ${relativeOutput}`);
  const backupPath = path.join(backupRoot, relativeOutput);
  await mkdir(path.dirname(backupPath), { recursive: true });
  await copyFile(file, backupPath);
}

async function doctor() {
  const checks = [];
  checks.push(["node", process.version]);
  checks.push(["source", root]);
  checks.push(["cwd", process.cwd()]);
  checks.push(["commands", String((await files("commands", [".md"])).length)]);
  checks.push(["rules", String((await files("rules", [".md", ".mdc"])).length)]);
  checks.push(["git", commandVersion("git", ["--version"])]);
  checks.push(["cline-dir", (await exists(path.join(os.homedir(), ".cline"))) ? "present" : "missing"]);
  checks.push([
    "antigravity-workflows",
    (await exists(path.join(os.homedir(), ".gemini", "antigravity", "global_workflows"))) ? "present" : "missing",
  ]);
  checks.push(["claude", commandVersion("claude", ["--version"])]);
  checks.push(["codex", commandVersion("codex", ["--version"])]);
  checks.push(["kilo", commandVersion("kilo", ["--version"])]);
  checks.push(["kilo-config", await kiloConfigStatus()]);
  checks.push(["opencode", commandVersion("opencode", ["--version"])]);
  checks.push(["gh", commandVersion("gh", ["--version"])]);

  // First-party MCP health (binaries linked, index/sidecar present, grimoire index fresh vs pin).
  const bin = path.join(os.homedir(), ".local", "bin");
  checks.push(["grimoire-server", (await exists(path.join(bin, "grimoire-server"))) ? "linked" : "missing (npm run install:grimoire)"]);
  checks.push(["grimoire-index", await grimoireIndexStatus()]);
  checks.push(["synapse-bridge", (await exists(path.join(bin, "synapse-bridge"))) ? "linked" : "missing (npm run install:synapse)"]);
  checks.push(["synapse-sidecar", (await exists(path.join(os.homedir(), ".synapse", "sidecar.json"))) ? "present" : "missing (autostarts on first use)"]);

  for (const [name, result] of checks) {
    console.log(`${name}: ${result}`);
  }
}

// grimoire index freshness: the runtime compares against the installed manifest (it can't see
// the repo), so doctor closes the loop by comparing the installed manifest's pinned commit
// against the repo registry pin and flagging drift before runtime use.
async function grimoireIndexStatus() {
  const dir = path.join(os.homedir(), ".grimoire");
  if (!(await exists(path.join(dir, "index.sqlite"))) || !(await exists(path.join(dir, "manifest.json")))) {
    return "missing (npm run install:grimoire)";
  }
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")); }
  catch { return "stale: unreadable manifest (npm run install:grimoire)"; }
  const registry = await readOptionalServices();
  for (const pack of manifest.packs ?? []) {
    const pin = registry.services?.[pack.serviceId]?.commit;
    if (pin && pack.commit !== pin) {
      return `stale: ${pack.serviceId} installed ${String(pack.commit).slice(0, 8)} but repo pins ${String(pin).slice(0, 8)} (npm run install:grimoire)`;
    }
  }
  return `ok (${String(manifest.packs?.[0]?.commit ?? "").slice(0, 8) || "no packs"})`;
}

async function runEvidence(args) {
  const separator = args.indexOf("--");
  if (separator === -1 || separator === args.length - 1) {
    fail("run requires -- before the command to execute");
  }

  const options = args.slice(0, separator);
  const command = args[separator + 1];
  const commandArgs = args.slice(separator + 2);
  const taskId = requiredArgValue(options, "--task");
  const klass = requiredArgValue(options, "--class");
  const timeoutMs = Number(requiredArgValue(options, "--timeout"));
  const outDir = path.resolve(requiredArgValue(options, "--out"));
  const allowedClasses = new Set(["read_only", "build_test", "network", "filesystem_destructive", "deployment", "database_mutation"]);
  const approval = approvalForClass(klass, options);

  if (!allowedClasses.has(klass)) fail(`unsupported command class: ${klass}`);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) fail("--timeout must be a positive integer");
  if (!approval.approved) {
    fail(`command class ${klass} requires explicit approval via --approved ${klass} or AGENT_SURFACE_APPROVED_CLASSES`);
  }

  await mkdir(outDir, { recursive: true });

  const startedAt = new Date();
  const startedStamp = safeTimestamp(startedAt.toISOString());
  const basename = `${startedStamp}-${safeFilename(taskId)}`;
  const started = Date.now();
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  const durationMs = Date.now() - started;
  const stdoutRaw = result.stdout ?? "";
  const stderrRaw = result.stderr ?? (result.error ? `${result.error.message}\n` : "");
  const stdoutRedacted = redactEvidenceText(stdoutRaw);
  const stderrRedacted = redactEvidenceText(stderrRaw);
  const cmdRaw = [command, ...commandArgs];
  const cmdRedacted = cmdRaw.map((part) => redactEvidenceText(part));
  const stdout = stdoutRedacted.text;
  const stderr = stderrRedacted.text;
  const stdoutPath = path.join(outDir, `${basename}.stdout.log`);
  const stderrPath = path.join(outDir, `${basename}.stderr.log`);
  const evidencePath = path.join(outDir, `${basename}.evidence.json`);
  const exitCode = typeof result.status === "number" ? result.status : result.error?.code === "ETIMEDOUT" ? 124 : 1;
  const evidence = {
    task_id: taskId,
    class: klass,
    cmd: cmdRedacted.map((part) => part.text),
    cmd_hash_raw: `sha256:${sha256(JSON.stringify(cmdRaw))}`,
    cwd: process.cwd(),
    approval,
    timeout_ms: timeoutMs,
    exit_code: exitCode,
    signal: result.signal ?? null,
    timed_out: result.error?.code === "ETIMEDOUT",
    started_at: startedAt.toISOString(),
    duration_ms: durationMs,
    tree_hash: gitValue(["rev-parse", "HEAD^{tree}"]),
    stdout_ref: path.relative(process.cwd(), stdoutPath),
    stdout_hash: `sha256:${sha256(stdout)}`,
    stdout_raw_hash: `sha256:${sha256(stdoutRaw)}`,
    stdout_raw_stored: false,
    stderr_ref: path.relative(process.cwd(), stderrPath),
    stderr_hash: `sha256:${sha256(stderr)}`,
    stderr_raw_hash: `sha256:${sha256(stderrRaw)}`,
    stderr_raw_stored: false,
    redaction: {
      applied: stdoutRedacted.applied || stderrRedacted.applied || cmdRedacted.some((part) => part.applied),
      patterns: [...new Set([...stdoutRedacted.patterns, ...stderrRedacted.patterns, ...cmdRedacted.flatMap((part) => part.patterns)])],
    },
  };

  await writeFile(stdoutPath, stdout);
  await writeFile(stderrPath, stderr);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(`evidence: ${evidence.stdout_ref}`);
  console.log(`metadata: ${path.relative(process.cwd(), evidencePath)}`);
  console.log(`exit_code: ${exitCode}`);
  process.exitCode = exitCode;
}

async function workflow(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === "doctor") {
    await workflowDoctor(rest);
    return;
  }
  if (subcommand === "apply") {
    await workflowApply(rest);
    return;
  }
  if (subcommand === "patch") {
    await workflowPatch(rest);
    return;
  }
  fail("workflow requires doctor, apply, or patch");
}

async function workflowDoctor(args) {
  const runId = requiredSafeId(args, "--run");
  const runDir = workflowRunDir(runId);
  const errors = [];
  const schemas = await workflowSchemaValidators(errors);
  const requiredFiles = ["run.json", "events.ndjson"];

  for (const file of requiredFiles) {
    if (!(await exists(path.join(runDir, file)))) errors.push(`missing workflow file: ${file}`);
  }

  const runData = await readWorkflowJson(path.join(runDir, "run.json"), schemas.get("workflow.run.schema.json"), errors);
  const bossArtifact = path.join(runDir, "boss.json");
  if (await exists(bossArtifact)) {
    const boss = await readWorkflowJson(bossArtifact, schemas.get("workflow.boss.schema.json"), errors);
    checkBossArtifactCoherence(boss, path.relative(process.cwd(), bossArtifact), errors);
  }
  for (const [file, schemaName] of [
    ["worker.json", "workflow.worker.schema.json"],
    ["reviewer.json", "workflow.reviewer.schema.json"],
    ["judger.json", "workflow.judger.schema.json"],
    ["rescue.json", "workflow.rescue.schema.json"],
  ]) {
    const artifact = path.join(runDir, file);
    if (await exists(artifact)) await validateWorkflowJson(artifact, schemas.get(schemaName), errors);
  }
  await validateWorkflowPatchManifests(runDir, schemas.get("workflow.patch.schema.json"), errors);

  const eventsPath = path.join(runDir, "events.ndjson");
  let lastTransition = null;
  if (await exists(eventsPath)) {
    const text = await readFile(eventsPath, "utf8");
    let previousHash = null;
    for (const [index, line] of text.split(/\r?\n/).filter(Boolean).entries()) {
      let event;
      try {
        event = JSON.parse(line);
      } catch (error) {
        errors.push(`events.ndjson:${index + 1}: invalid JSON: ${error.message}`);
        continue;
      }
      const validate = schemas.get("workflow.event.schema.json");
      if (validate && !validate(event)) errors.push(`events.ndjson:${index + 1}: ${formatAjvErrors(validate.errors)}`);
      if (event.prev_event_hash !== previousHash) {
        errors.push(`events.ndjson:${index + 1}: prev_event_hash does not match previous event`);
      }
      const { event_hash: eventHash, ...eventWithoutHash } = event;
      const computedHash = `sha256:${sha256(canonicalJson(eventWithoutHash))}`;
      if (eventHash !== computedHash) {
        errors.push(`events.ndjson:${index + 1}: event_hash does not match event content`);
      }
      previousHash = event.event_hash;
      if ("to" in event) lastTransition = event;
    }
  }

  // The run ledger is the source of truth for routing. If the most recent
  // recorded transition advanced the route, run.json.workflow_next_command must
  // match it; otherwise the next-command pointer is lagging the accepted ledger
  // (e.g. a role wrote its artifact but `workflow apply` never synced run.json).
  if (runData && lastTransition && runData.status === "active") {
    const ledgerNext = runData.workflow_next_command ?? null;
    const transitionTo = lastTransition.to ?? null;
    if (ledgerNext !== transitionTo) {
      errors.push(
        `run.json.workflow_next_command (${JSON.stringify(ledgerNext)}) lags the latest transition in events.ndjson (to=${JSON.stringify(transitionTo)}); run \`agent-surface workflow apply\` after the owning role to advance the ledger`,
      );
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`workflow doctor: ok (${path.relative(process.cwd(), runDir)})`);
}

async function validateWorkflowPatchManifests(runDir, validate, errors) {
  const patchRoot = path.join(runDir, "rounds");
  if (!(await exists(patchRoot))) return;
  const manifests = (await filesUnder(patchRoot, [".json"]))
    .filter((file) => path.basename(file).endsWith(".patch.json"));

  for (const manifestPath of manifests) {
    const manifest = await readWorkflowJson(manifestPath, validate, errors);
    if (!manifest) continue;
    const manifestRef = path.relative(runDir, manifestPath);

    for (const key of ["patch_ref", "name_status_ref"]) {
      if (!manifest[key]) continue;
      const refPath = path.resolve(process.cwd(), manifest[key]);
      if (!isPathInside(runDir, refPath)) {
        errors.push(`${manifestRef}: ${key} must stay inside workflow run directory`);
      }
      if (!(await exists(refPath))) {
        errors.push(`${manifestRef}: ${key} target missing: ${manifest[key]}`);
      }
    }

    if (manifest.patch_ref && manifest.patch_hash) {
      const patchPath = path.resolve(process.cwd(), manifest.patch_ref);
      const patchContent = await readFileIfExists(patchPath);
      if (patchContent !== null) {
        const actualHash = `sha256:${sha256(patchContent)}`;
        if (actualHash !== manifest.patch_hash) {
          errors.push(`${manifestRef}: patch_hash does not match patch_ref content`);
        }
      }
    }
  }
}

async function workflowApply(args) {
  const role = requiredArgValue(args, "--role");
  const runId = requiredSafeId(args, "--run");
  const artifactArg = requiredArgValue(args, "--artifact");
  const runDir = workflowRunDir(runId);
  const artifactPath = path.resolve(artifactArg);
  const roleSchemas = {
    "workflow-boss": "workflow.boss.schema.json",
    "dev-feature": "workflow.worker.schema.json",
    "dev-fix": "workflow.worker.schema.json",
    "dev-chore": "workflow.worker.schema.json",
    "dev-refactor": "workflow.worker.schema.json",
    "workflow-reviewer": "workflow.reviewer.schema.json",
    "workflow-judger": "workflow.judger.schema.json",
    "workflow-rescue": "workflow.rescue.schema.json",
  };
  const schemaName = roleSchemas[role] ?? fail(`unsupported workflow apply role: ${role}`);
  const errors = [];
  const schemas = await workflowSchemaValidators(errors);
  const runPath = path.join(runDir, "run.json");

  if (!isPathInside(runDir, artifactPath)) fail("artifact must be inside the workflow run directory");

  const runData = await readWorkflowJson(runPath, schemas.get("workflow.run.schema.json"), errors);
  const artifact = await readWorkflowJson(artifactPath, schemas.get(schemaName), errors);
  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  if (artifact.run_id !== runId || artifact.workflow?.run_id !== runId) fail("artifact run_id does not match --run");
  if (artifact.workflow?.owner !== role) fail("artifact owner does not match --role");

  const artifactHash = `sha256:${sha256(await readFile(artifactPath))}`;
  const fromCommand = runData.workflow_next_command ?? null;
  const nextCommand = artifact.workflow.next_command ?? null;
  const update = artifact.run_state_update ?? {};
  const moved = new Set([
    ...(update.accepted_task_ids ?? []),
    ...(update.rework_task_ids ?? []),
    ...(update.deferred_task_ids ?? []),
    ...(update.closed_task_ids ?? []),
  ]);

  runData.current_round = Math.max(runData.current_round, artifact.round_id);
  runData.workflow_next_command = nextCommand;
  runData.active_task_ids = uniqueStrings((runData.active_task_ids ?? []).filter((taskId) => !moved.has(taskId)));
  if (role === "workflow-boss" && artifact.run_state && Array.isArray(artifact.run_state.active_task_ids)) {
    runData.active_task_ids = uniqueStrings(artifact.run_state.active_task_ids);
  }
  runData.accepted_task_ids = uniqueStrings([...(runData.accepted_task_ids ?? []), ...(update.accepted_task_ids ?? [])]);
  runData.rework_task_ids = uniqueStrings([...(runData.rework_task_ids ?? []), ...(update.rework_task_ids ?? [])]);
  runData.deferred_task_ids = uniqueStrings([...(runData.deferred_task_ids ?? []), ...(update.deferred_task_ids ?? [])]);
  runData.closed_task_ids = uniqueStrings([...(runData.closed_task_ids ?? []), ...(update.closed_task_ids ?? [])]);
  runData.last_artifact_hashes = {
    ...(runData.last_artifact_hashes ?? {}),
    [role]: artifactHash,
  };
  if (role === "workflow-judger" && ["MERGE", "MERGE_PARTIAL"].includes(artifact.final_verdict) && nextCommand === "workflow-close") {
    runData.workflow_next_command = "workflow-close";
  }

  const runValidate = schemas.get("workflow.run.schema.json");
  if (runValidate && !runValidate(runData)) {
    fail(`updated run.json failed schema validation: ${formatAjvErrors(runValidate.errors)}`);
  }

  await writeFile(runPath, `${JSON.stringify(runData, null, 2)}\n`);
  const eventHash = await appendWorkflowEvent(runDir, {
    event_id: `${safeFilename(role)}-${Date.now()}`,
    run_id: runId,
    round_id: artifact.round_id,
    role,
    from: fromCommand,
    to: nextCommand ?? null,
    artifact: path.relative(runDir, artifactPath),
    artifact_hash: artifactHash,
    timestamp: new Date().toISOString(),
    summary: `Applied ${role} state update.`,
  });
  await writeFile(path.join(path.dirname(runDir), "current.json"), `${JSON.stringify({
    schema_version: "workflow.current.v1",
    run_id: runData.status === "active" ? runId : null,
    workflow_dir: runData.status === "active" ? path.relative(process.cwd(), runDir) : null,
    updated_at: new Date().toISOString(),
  }, null, 2)}\n`);

  console.log(`workflow apply: ok (${role})`);
  console.log(`run: ${path.relative(process.cwd(), runPath)}`);
  console.log(`event_hash: ${eventHash}`);
}

async function workflowPatch(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === "begin") {
    await workflowPatchBegin(rest);
    return;
  }
  if (subcommand === "end") {
    await workflowPatchEnd(rest);
    return;
  }
  if (subcommand === "verify") {
    await workflowPatchVerify(rest);
    return;
  }
  fail("workflow patch requires begin, end, or verify");
}

async function workflowPatchBegin(args) {
  const context = workflowPatchContext(args);
  const filescope = argValues(args, "--file");
  if (filescope.length === 0) fail("workflow patch begin requires at least one --file");
  for (const file of filescope) {
    if (!isSafeRelativePath(file)) fail(`unsafe --file: ${file}`);
  }

  await mkdir(context.patchDir, { recursive: true });
  const preTreeHash = await buildWorktreeTree(filescope);
  const manifest = {
    schema_version: "workflow.patch.v1",
    run_id: context.runId,
    round_id: context.roundId,
    task_id: context.taskId,
    filescope: uniqueStrings(filescope),
    pre_tree_hash: preTreeHash,
    pre_head: gitValue(["rev-parse", "HEAD"]) ?? null,
    started_at: new Date().toISOString(),
    status: "begun",
  };

  await writeFile(context.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`patch begin: ${path.relative(process.cwd(), context.manifestPath)}`);
  console.log(`pre_tree_hash: ${preTreeHash}`);
}

async function workflowPatchEnd(args) {
  const context = workflowPatchContext(args);
  const manifest = await readPatchManifest(context.manifestPath);
  const postTreeHash = await buildWorktreeTree(manifest.filescope);
  const patch = gitOutput(["diff", "--binary", "--full-index", manifest.pre_tree_hash, postTreeHash, "--", ...manifest.filescope]);
  const nameStatus = gitOutput(["diff", "--name-status", manifest.pre_tree_hash, postTreeHash, "--", ...manifest.filescope]);
  const changedFiles = parseNameStatusFiles(nameStatus);
  const patchHash = `sha256:${sha256(patch)}`;
  const updated = {
    ...manifest,
    post_tree_hash: postTreeHash,
    patch_ref: path.relative(process.cwd(), context.patchPath),
    patch_hash: patchHash,
    name_status_ref: path.relative(process.cwd(), context.nameStatusPath),
    changed_files: changedFiles,
    completed_at: new Date().toISOString(),
    status: "ended",
  };

  await writeFile(context.patchPath, patch);
  await writeFile(context.nameStatusPath, nameStatus);
  await writeFile(context.manifestPath, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`patch end: ${path.relative(process.cwd(), context.patchPath)}`);
  console.log(`patch_hash: ${patchHash}`);
  console.log(`changed_files: ${changedFiles.length}`);
}

async function workflowPatchVerify(args) {
  const context = workflowPatchContext(args);
  const manifest = await readPatchManifest(context.manifestPath);
  if (manifest.status !== "ended") fail("patch manifest is not ended");
  const currentPatch = await readFile(context.patchPath, "utf8");
  const currentHash = `sha256:${sha256(currentPatch)}`;
  if (currentHash !== manifest.patch_hash) fail("patch hash mismatch");
  const postTreeHash = await buildWorktreeTree(manifest.filescope);
  if (postTreeHash !== manifest.post_tree_hash) fail("current worktree no longer matches patch post_tree_hash");

  const whitespace = spawnSync("git", ["diff", "--check", manifest.pre_tree_hash, manifest.post_tree_hash, "--", ...manifest.filescope], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (whitespace.status !== 0) fail(`patch has whitespace errors:\n${whitespace.stdout}${whitespace.stderr}`);

  const applyCheck = await verifyPatchApplies(manifest.pre_tree_hash, context.patchPath);
  const verified = {
    ...manifest,
    applies_cleanly: applyCheck,
    verified_at: new Date().toISOString(),
    status: "verified",
  };

  await writeFile(context.manifestPath, `${JSON.stringify(verified, null, 2)}\n`);
  console.log(`patch verify: ok (${path.relative(process.cwd(), context.patchPath)})`);
}

async function workflowSchemaValidators(errors) {
  const schemas = new Map();
  const ajv = createAjv();

  for (const name of workflowSchemaFiles) {
    const schemaPath = path.join(root, "schemas", name);
    let schema;
    try {
      schema = JSON.parse(await readFile(schemaPath, "utf8"));
      ajv.addSchema(schema, name);
      schemas.set(name, ajv.getSchema(name));
    } catch (error) {
      errors.push(`workflow schema failed to load: schemas/${name}: ${error.message}`);
    }
  }

  return schemas;
}

function workflowPatchContext(args) {
  const runId = requiredSafeId(args, "--run");
  const roundId = Number(requiredArgValue(args, "--round"));
  const taskId = requiredSafeId(args, "--task");
  if (!Number.isInteger(roundId) || roundId < 0) fail("--round must be a non-negative integer");
  const roundName = `round-${String(roundId).padStart(3, "0")}`;
  const patchDir = path.join(workflowRunDir(runId), "rounds", roundName, "patches");
  const basename = safeFilename(taskId);
  return {
    runId,
    roundId,
    taskId,
    patchDir,
    manifestPath: path.join(patchDir, `${basename}.patch.json`),
    patchPath: path.join(patchDir, `${basename}.patch`),
    nameStatusPath: path.join(patchDir, `${basename}.name-status.txt`),
  };
}

async function readPatchManifest(file) {
  if (!(await exists(file))) fail(`patch manifest missing: ${path.relative(process.cwd(), file)}`);
  const manifest = JSON.parse(await readFile(file, "utf8"));
  if (manifest.schema_version !== "workflow.patch.v1") fail("unsupported patch manifest schema");
  if (!Array.isArray(manifest.filescope) || manifest.filescope.length === 0) fail("patch manifest missing filescope");
  return manifest;
}

async function buildWorktreeTree(filescope) {
  const files = await gitLines(["ls-files", "--cached", "--others", "--exclude-standard", "--", ...filescope]);
  const indexPath = path.join(await mkdtemp(path.join(os.tmpdir(), "agent-surface-index-")), "index");
  const env = { ...process.env, GIT_INDEX_FILE: indexPath };

  try {
    gitOutput(["read-tree", "--empty"], env);
    for (const file of files) {
      if (!isSafeRelativePath(file)) fail(`unsafe git path: ${file}`);
      const absolute = path.join(process.cwd(), file);
      const fileStat = await stat(absolute).catch(() => null);
      if (!fileStat?.isFile()) continue;
      const blob = gitOutput(["hash-object", "-w", "--", file], env).trim();
      const mode = fileStat.mode & 0o111 ? "100755" : "100644";
      gitOutput(["update-index", "--add", "--cacheinfo", `${mode},${blob},${file}`], env);
    }
    return gitOutput(["write-tree"], env).trim();
  } finally {
    await rm(path.dirname(indexPath), { recursive: true, force: true });
  }
}

async function verifyPatchApplies(preTreeHash, patchPath) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agent-surface-apply-"));
  const indexDir = await mkdtemp(path.join(os.tmpdir(), "agent-surface-apply-index-"));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(indexDir, "index") };
  try {
    gitOutput(["read-tree", preTreeHash], env);
    gitOutput(["--work-tree", tempDir, "checkout-index", "-a", "-f"], env);
    const init = spawnSync("git", ["init"], {
      cwd: tempDir,
      encoding: "utf8",
    });
    if (init.status !== 0) fail(`git init failed for patch check:\n${init.stdout}${init.stderr}`);
    const result = spawnSync("git", ["apply", "--check", patchPath], {
      cwd: tempDir,
      encoding: "utf8",
    });
    if (result.status !== 0) fail(`patch does not apply cleanly:\n${result.stdout}${result.stderr}`);
    return true;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await rm(indexDir, { recursive: true, force: true });
  }
}

function parseNameStatusFiles(text) {
  const files = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split(/\t+/);
    files.push(...parts.slice(1));
  }
  return uniqueStrings(files.filter(Boolean));
}

async function validateWorkflowJson(file, validate, errors) {
  if (!(await exists(file))) return;
  await readWorkflowJson(file, validate, errors);
}

async function readWorkflowJson(file, validate, errors) {
  let data;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    errors.push(`${path.relative(process.cwd(), file)}: invalid JSON: ${error.message}`);
    return null;
  }

  if (validate && !validate(data)) {
    errors.push(`${path.relative(process.cwd(), file)}: ${formatAjvErrors(validate.errors)}`);
  }
  return data;
}

function workflowRunDir(runId) {
  return path.join(process.cwd(), ".agent-surface", "workflows", runId);
}

function requiredSafeId(args, name) {
  const value = requiredArgValue(args, name);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(value)) fail(`unsafe ${name}: ${value}`);
  return value;
}

function uniqueStrings(values) {
  return [...new Set(values)].sort();
}

async function appendWorkflowEvent(runDir, event) {
  const eventsPath = path.join(runDir, "events.ndjson");
  const previousHash = await lastWorkflowEventHash(eventsPath);
  const withPrevious = {
    ...event,
    prev_event_hash: previousHash,
  };
  const eventHash = `sha256:${sha256(canonicalJson(withPrevious))}`;
  const fullEvent = {
    ...withPrevious,
    event_hash: eventHash,
  };
  await writeFile(eventsPath, `${await readFileIfExists(eventsPath) ?? ""}${JSON.stringify(fullEvent)}\n`);
  return eventHash;
}

async function lastWorkflowEventHash(eventsPath) {
  const current = await readFileIfExists(eventsPath);
  if (current === null) return null;
  const lines = current.toString("utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return null;
  try {
    const event = JSON.parse(lines.at(-1));
    return typeof event.event_hash === "string" ? event.event_hash : null;
  } catch {
    return null;
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isPathInside(parent, candidate) {
  const relativePath = path.relative(parent, candidate);
  return relativePath === "" || isSafeRelativePath(relativePath);
}

async function renderClineWorkflow(source) {
  return source.body;
}

async function renderKiloWorkflow(source) {
  return source.body;
}

async function renderClaudeCommand(source) {
  return source.body;
}

function renderClaudeSubagent(source) {
  const mapped = claudeSubagentAccess(source.metadata.access);
  return [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
    `tools: ${mapped.tools}`,
    `model: ${source.metadata.model}`,
    `maxTurns: ${mapped.maxTurns}`,
    "---",
    "",
    source.body.trim(),
    "",
  ].join("\n");
}

function renderKiloSubagent(source) {
  const mapped = kiloSubagentAccess(source.metadata.access);
  const lines = [
    "---",
    `description: "${yamlString(source.metadata.description)}"`,
    "mode: subagent",
  ];
  if (source.metadata.model !== "inherit") lines.push(`model: ${source.metadata.model}`);
  lines.push(
    "permission:",
    `  edit: ${mapped.edit}`,
    `  bash: ${mapped.bash}`,
    `steps: ${mapped.steps}`,
    "---",
    "",
    source.body.trim(),
    "",
  );
  return lines.join("\n");
}

function renderCursorSubagent(source) {
  return [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
    `model: ${source.metadata.model}`,
    `readonly: ${cursorSubagentReadonly(source.metadata.access)}`,
    "is_background: false",
    "---",
    "",
    source.body.trim(),
    "",
  ].join("\n");
}

function cursorSubagentReadonly(access) {
  if (access === "read-only") return true;
  if (access === "read-write-shell") return false;
  // Cursor `readonly` is binary: it blocks edits and state-changing shell together,
  // so it cannot express read-write without shell. Refuse rather than silently grant shell.
  fail(`cursor subagent access ${access} is not representable; use read-only or read-write-shell`);
}

function renderGeminiSubagent(source) {
  const tools = geminiSubagentAccess(source.metadata.access);
  return [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
    `model: ${source.metadata.model}`,
    "tools:",
    ...tools.map((tool) => `  - ${tool}`),
    "---",
    "",
    source.body.trim(),
    "",
  ].join("\n");
}

function renderDroidSubagent(source) {
  const tools = droidSubagentAccess(source.metadata.access);
  return [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
    `model: ${source.metadata.model}`,
    "tools:",
    ...tools.map((tool) => `  - ${tool}`),
    "---",
    "",
    source.body.trim(),
    "",
  ].join("\n");
}

function renderCodexSubagent(source) {
  const lines = [
    `name = "${tomlString(source.metadata.name)}"`,
    `description = "${tomlString(source.metadata.description)}"`,
    `sandbox_mode = "${codexSubagentSandboxMode(source.metadata.access)}"`,
  ];
  if (source.metadata.model !== "inherit") lines.push(`model = "${tomlString(source.metadata.model)}"`);
  lines.push(
    "",
    `developer_instructions = ${tomlMultilineString(source.body.trim())}`,
    "",
  );
  return lines.join("\n");
}

function renderDeepAgentsSubagent(source) {
  const lines = [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
  ];
  if (source.metadata.model !== "inherit") lines.push(`model: ${source.metadata.model}`);
  lines.push(
    "---",
    "",
    source.body.trim(),
    "",
  );
  return lines.join("\n");
}

function renderOpenCodeSubagent(source) {
  const mapped = opencodeSubagentAccess(source.metadata.access);
  const lines = [
    "---",
    `description: "${yamlString(source.metadata.description)}"`,
    "mode: subagent",
  ];
  if (source.metadata.model !== "inherit") lines.push(`model: ${source.metadata.model}`);
  lines.push(
    "permission:",
    `  edit: ${mapped.edit}`,
    `  bash: ${mapped.bash}`,
    "---",
    "",
    source.body.trim(),
    "",
  );
  return lines.join("\n");
}

function claudeSubagentAccess(access) {
  if (access === "read-only") return { tools: "Read, Glob, Grep", maxTurns: 20 };
  if (access === "read-write") return { tools: "Read, Glob, Grep, Edit, Write", maxTurns: 30 };
  if (access === "read-write-shell") return { tools: "Read, Glob, Grep, Edit, Write, Bash", maxTurns: 40 };
  fail(`unsupported subagent access: ${access}`);
}

function codexSubagentSandboxMode(access) {
  if (access === "read-only") return "read-only";
  if (access === "read-write-shell") return "workspace-write";
  // Codex sandbox modes do not separate file writes from shell execution.
  // Refuse the intermediate tier instead of silently granting command access.
  if (access === "read-write") fail("codex subagent access read-write is not representable; use read-only or read-write-shell");
  fail(`unsupported subagent access: ${access}`);
}

function kiloSubagentAccess(access) {
  if (access === "read-only") return { edit: "deny", bash: "deny", steps: 20 };
  if (access === "read-write") return { edit: "ask", bash: "deny", steps: 30 };
  if (access === "read-write-shell") return { edit: "ask", bash: "ask", steps: 40 };
  fail(`unsupported subagent access: ${access}`);
}

function geminiSubagentAccess(access) {
  const readOnly = ["glob", "grep_search", "list_directory", "read_file", "read_many_files"];
  if (access === "read-only") return readOnly;
  const readWrite = [...readOnly, "replace", "write_file"];
  if (access === "read-write") return readWrite;
  if (access === "read-write-shell") return [...readWrite, "run_shell_command"];
  fail(`unsupported subagent access: ${access}`);
}

function droidSubagentAccess(access) {
  const readOnly = ["Read", "LS", "Grep", "Glob"];
  if (access === "read-only") return readOnly;
  const readWrite = [...readOnly, "Create", "Edit", "ApplyPatch"];
  if (access === "read-write") return readWrite;
  if (access === "read-write-shell") return [...readWrite, "Execute"];
  fail(`unsupported subagent access: ${access}`);
}

function opencodeSubagentAccess(access) {
  if (access === "read-only") return { edit: "deny", bash: "deny" };
  if (access === "read-write") return { edit: "ask", bash: "deny" };
  if (access === "read-write-shell") return { edit: "ask", bash: "ask" };
  fail(`unsupported subagent access: ${access}`);
}

async function renderCursorCommand(source) {
  return source.body;
}

async function renderDroidCommand(source) {
  return source.body;
}

async function renderOpenCodeCommand(source) {
  return source.body;
}

async function renderWindsurfWorkflow(source) {
  return source.body;
}

async function renderSharedAgentSkill(source) {
  return renderSkillMarkdown(source, {
    invocationPrefix: null,
    generatedFor: "Codex and Zed",
    hostInstruction: `For explicit invocation, use the current host's Agent Skill syntax, such as \`$${source.name}\` in Codex or \`/${source.name}\` in Zed. Treat slash-command syntax below as portable command documentation unless the host supports it directly.`,
  });
}

async function renderGrokBuildSkill(source) {
  return renderSkillMarkdown(source, {
    invocationPrefix: "/",
    generatedFor: "Grok Build",
    hostInstruction: "Grok exposes user-invocable skills as slash commands; use this skill when the task matches its description.",
  });
}

async function renderPiSkill(source) {
  return renderSkillMarkdown(source, {
    invocationPrefix: "/skill:",
    generatedFor: "Pi",
    hostInstruction: "Pi loads Agent Skills from .pi and .agents skill roots; select this skill when the task matches its description.",
  });
}

async function renderPoolSkill(source) {
  return renderSkillMarkdown(source, {
    invocationPrefix: "/skills",
    generatedFor: "Poolside",
    hostInstruction: "Poolside can auto-apply local skills when the SKILL.md description matches the task; use the skills menu for explicit selection.",
  });
}

async function renderGooseRecipe(source) {
  const description = yamlString(source.metadata.description ?? firstHeading(source.body) ?? `Run ${source.name.replaceAll("-", " ")}.`);
  return [
    'version: "1.0.0"',
    `title: "agent-surface ${yamlString(source.name)}"`,
    `description: "${description}"`,
    "instructions: |",
    yamlLiteralBlock(source.body.trim(), "  "),
    "prompt: |",
    yamlLiteralBlock(`Run the ${source.name} agent-surface recipe.`, "  "),
    "",
  ].join("\n");
}

async function renderDeepAgentsSkill(source) {
  return renderSkillMarkdown(source, {
    invocationPrefix: null,
    generatedFor: "Deep Agents Code",
    hostInstruction: "Deep Agents discovers this skill from its frontmatter and reads it when the task matches the description.",
  });
}

function renderSkillMarkdown(source, options = {}) {
  const invocationPrefix = Object.hasOwn(options, "invocationPrefix") ? options.invocationPrefix : "$";
  const generatedFor = options.generatedFor ?? "agent-surface skill";
  const description = yamlString(source.metadata.description ?? firstHeading(source.body) ?? `Run ${source.name.replaceAll("-", " ")}.`);
  const hostInstruction = options.hostInstruction ?? `Invoke \`${invocationPrefix}${source.name}\` when this skill is needed.`;
  return [
    "---",
    `name: ${source.name}`,
    `description: "${description}"`,
    "---",
    "",
    `# ${source.name}`,
    "",
    invocationPrefix === null ? "Use this skill when its description matches the task." : `Use explicit invocation: \`${invocationPrefix}${source.name}\`.`,
    `This skill is generated by agent-surface from \`${source.relativePath}\` for ${generatedFor}.`,
    hostInstruction,
    "",
    source.body,
  ].join("\n");
}

async function renderAntigravityWorkflow(source) {
  const body = source.body;
  const description = yamlString(source.metadata.description ?? firstHeading(body) ?? `Run ${source.name.replaceAll("-", " ")}.`);

  if (body.startsWith("---\n")) {
    const frontmatterEnd = body.indexOf("\n---\n", 4);
    if (frontmatterEnd !== -1) {
      const frontmatter = body.slice(4, frontmatterEnd);
      if (/^description:/m.test(frontmatter)) return body;
      return body.replace(/^---\n/, `---\ndescription: "${description}"\n`);
    }
  }

  return `---\ndescription: "${description}"\n---\n\n${body}`;
}

async function codexOpenAiAgentOutput(source) {
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

function antigravityCliSkillOutputName(source) {
  return `${source.name}.md`;
}

async function renderAntigravityCliSkill(source) {
  return renderSkillMarkdown(source, {
    invocationPrefix: "/",
    generatedFor: "Antigravity CLI plugin skill",
    hostInstruction: "Invoke this skill from Antigravity CLI after the agent-surface plugin is installed and enabled.",
  });
}

async function codexStaticOutputs(_commands, context) {
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

async function deepagentsStaticOutputs(_commands, context) {
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

async function clineStaticOutputs(_commands, context) {
  return [
    {
      source: "rules/*.mdc",
      relativeOutput: path.join(outputRootFor(clineRuleRoot, context), "agent-surface.md"),
      content: await renderInstructionDocument("agent-surface Cline global rules", "Cline rules"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join(outputRootFor(clineRuleRoot, context), "references", "rules")),
  ];
}

async function kiloStaticOutputs(_commands, context) {
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

async function antigravityCliStaticOutputs(commands, context) {
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

function renderAntigravityCliRuleDocument(rule) {
  return [
    `# ${path.basename(rule.file, ".mdc")}`,
    "",
    `> Antigravity CLI plugin rule. Generated by agent-surface from \`${rule.file}\`.`,
    "",
    stripFrontmatter(rule.text).trim(),
    "",
  ].join("\n");
}

async function cursorStaticOutputs() {
  const rules = await readRules();
  return rules.map((rule) => ({
    source: rule.file,
    relativeOutput: path.join(".cursor", "rules", path.basename(rule.file)),
    content: rule.text,
  }));
}

async function droidStaticOutputs(_commands, context) {
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

function droidInstructionPath(context) {
  return context.scope === "user" ? path.join(".factory", "AGENTS.md") : "AGENTS.md";
}

function droidConfigRoot(_context) {
  return ".factory";
}

async function grokBuildStaticOutputs(_commands, context) {
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

async function piStaticOutputs(_commands, context) {
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

async function poolStaticOutputs(_commands, context) {
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

async function windsurfStaticOutputs(_commands, context) {
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

async function zedStaticOutputs(_commands, context) {
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

function mcpConfigScopeAllows(mcpConfig, scope) {
  return !mcpConfig.scopes || mcpConfig.scopes.includes(scope);
}

async function optionalMcpOutputs(adapter, context) {
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

async function selectedMcpServiceEntries(defaultEnabled, context) {
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

function renderMcpConfig(format, entries) {
  if (YAML_MCP_FORMATS.has(format)) return renderYamlMcpConfig(format, entries);
  const servers = optionalServiceMcpServers(entries, format);
  if (format === "codex-toml") {
    return entries.map(([id, service]) => renderCodexMcpServer(id, service)).join("\n");
  }
  if (format === "vscode-servers") return `${JSON.stringify({ servers }, null, 2)}\n`;
  if (format === "zed-context-servers") return `${JSON.stringify({ context_servers: servers }, null, 2)}\n`;
  if (format === "local-command-map") return `${JSON.stringify({ mcp: servers }, null, 2)}\n`;
  return `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`;
}

function optionalServiceMcpServers(entries, format) {
  const servers = {};
  for (const [id, service] of entries) servers[id] = optionalServiceMcpServer(service, format);
  return servers;
}

function optionalServiceMcpServer(service, format = "mcpServers") {
  const server = service.mcp?.server;
  if (!server || typeof server !== "object" || Array.isArray(server)) {
    fail(`optional service ${service.path} is missing an MCP server contract`);
  }
  if (format === "local-command-map") {
    return {
      type: "local",
      command: [server.command, ...(server.args ?? [])],
      enabled: true,
    };
  }
  return {
    type: server.type,
    command: server.command,
    args: server.args ?? [],
  };
}

function renderCodexMcpServer(id, service) {
  const server = optionalServiceMcpServer(service);
  const lines = [
    `[mcp_servers.${id}]`,
    `command = "${tomlString(server.command)}"`,
    `args = [${server.args.map((arg) => `"${tomlString(arg)}"`).join(", ")}]`,
    "",
  ];
  return lines.join("\n");
}

const MAX_EXTERNAL_FILE_BYTES = 1_000_000;
const MAX_EXTERNAL_TOTAL_BYTES = 200_000_000;
const MAX_EXTERNAL_FILES = 50_000;

async function externalSkillOutputs(adapter, context) {
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
        content: await readFile(file, "utf8"),
      });
    }
  }

  return outputs;
}

async function externalSkillRoots() {
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

async function expandSkillRoot(item) {
  if (typeof item !== "string" || item.length === 0) fail("external skill root must be a non-empty string");
  if (item.includes("*") && !item.endsWith("/*")) fail(`external skill root wildcard must be a trailing /*: ${item}`);
  if (item.endsWith("/*")) {
    const base = safeExternalPath(item.slice(0, -2));
    return directDirectories(base);
  }
  return [safeExternalPath(item)];
}

function safeExternalPath(item) {
  if (!isSafeRelativePath(item) || !item.startsWith("external/")) fail(`unsafe external skill root: ${item}`);
  return path.join(root, item);
}

async function copilotStaticOutputs(_commands, context) {
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

async function vscodeStaticOutputs(_commands, context) {
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

async function vscodiumStaticOutputs(_commands, context) {
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

async function opencodeStaticOutputs(_commands, context) {
  return [
    {
      source: "rules/*.mdc",
      relativeOutput: opencodeInstructionPath(context),
      content: await renderInstructionDocument("AGENTS.md - agent-surface global OpenCode rules", "OpenCode global instructions"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join(opencodeConfigRoot(context), "references", "rules")),
  ];
}

async function traeStaticOutputs(_commands, context) {
  return [
    {
      source: "rules/*.mdc",
      relativeOutput: path.join(".trae", "user_rules.md"),
      content: await renderInstructionDocument("agent-surface Trae user rules", "Trae user rules"),
    },
    ...await scopedRuleReferenceOutputs(context, path.join(".trae", "references", "rules")),
  ];
}

async function renderInstructionDocument(title, subtitle) {
  const rules = (await readRules()).filter((rule) => rule.alwaysApply !== false);
  return [
    `# ${title}`,
    "",
    `> ${subtitle}. Generated by agent-surface from always-on \`rules/*.mdc\`. Scoped language rules are emitted as separate reference files.`,
    "",
    ...rules.flatMap((rule) => [
      `## ${path.basename(rule.file)}`,
      "",
      stripFrontmatter(rule.text).trim(),
      "",
    ]),
  ].join("\n");
}

async function scopedRuleReferenceOutputs(_context, outputRoot) {
  const rules = (await readRules()).filter((rule) => rule.alwaysApply === false);
  return rules.map((rule) => ({
    sourceKind: "rules",
    renderKind: "rules",
    source: rule.file,
    relativeOutput: path.join(outputRoot, `${path.basename(rule.file, ".mdc")}.md`),
    content: renderScopedRuleReferenceDocument(rule),
  }));
}

function renderScopedRuleReferenceDocument(rule) {
  return [
    `# ${path.basename(rule.file, ".mdc")}`,
    "",
    `> Scoped agent-surface reference. Generated from \`${rule.file}\`. Attach this rule only when the current project files match its frontmatter globs.`,
    "",
    stripFrontmatter(rule.text).trim(),
    "",
  ].join("\n");
}

function renderKiloRuleDocument(rule) {
  return [
    `# ${path.basename(rule.file, ".mdc")}`,
    "",
    `> Kilo custom rule. Generated by agent-surface from \`${rule.file}\`.`,
    "",
    stripFrontmatter(rule.text).trim(),
    "",
  ].join("\n");
}

async function renderVsCodeInstructionDocument(title, target) {
  return [
    "---",
    `description: "${yamlString(title)}"`,
    'applyTo: "**"',
    "---",
    "",
    await renderInstructionDocument(title, `${target} global instruction file`),
  ].join("\n");
}

async function renderVsCodePromptDocument() {
  const flow = (await readCommands()).find((command) => command.name === "ops-flow");
  return [
    "---",
    'description: "Route a task to the lightest safe agent-surface path"',
    'name: "agent-surface-flow"',
    'agent: "agent"',
    "---",
    "",
    flow?.body ?? "Route this task to the lightest safe agent-surface path.",
    "",
  ].join("\n");
}

function stripFrontmatter(text) {
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---\n", 4);
  return end === -1 ? text : text.slice(end + 5);
}

function groupedMarkdownCommandOutputName(source) {
  const [category, ...rest] = source.name.split("-");
  return path.join(category, `${rest.join("-") || category}.md`);
}

function flatMarkdownCommandOutputName(source) {
  return `${source.name}.md`;
}

function gooseRecipeOutputName(source) {
  return `${source.name}.yaml`;
}

function codexSkillOutputName(source) {
  return path.join(source.name, "SKILL.md");
}

async function files(dir, extensions) {
  const base = path.join(root, dir);
  if (!(await exists(base))) return [];

  return filesUnder(base, extensions);
}

async function filesUnder(base, extensions) {
  const out = [];
  const entries = await readdir(base, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "dist" || entry.name === "node_modules" || entry.name === ".agent-surface") continue;
    const full = path.join(base, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await filesUnder(full, extensions)));
      continue;
    }
    if (entry.isFile() && (extensions.includes(path.extname(full)) || extensions.includes(path.basename(full)))) {
      out.push(full);
    }
  }
  return out.sort();
}

async function readCommands() {
  const commandFiles = await files("commands", [".md"]);
  const commands = [];

  for (const file of commandFiles) {
    const text = await readFile(file, "utf8");
    commands.push(parseCommand(file, text));
  }

  return commands;
}

function parseCommand(file, text) {
  const name = path.basename(file, ".md");
  const metadata = {
    name,
    aliases: [],
    phase: commandPhaseFromName(name),
    description: null,
  };
  const frontmatterErrors = [];
  let body = text;
  let hasFrontmatter = false;

  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---\n", 4);
    if (end === -1) {
      frontmatterErrors.push("frontmatter not closed");
    } else {
      hasFrontmatter = true;
      const parsed = parseSimpleFrontmatter(text.slice(4, end), frontmatterErrors);
      Object.assign(metadata, parsed);
      body = text.slice(end + 5).replace(/^\s+/, "");
    }
  }

  metadata.name ??= name;
  metadata.aliases ??= [];

  return {
    file,
    relativePath: relative(file),
    name,
    body,
    metadata,
    hasFrontmatter,
    frontmatterErrors,
  };
}

function parseSimpleFrontmatter(text, errors) {
  const out = {};
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const scalar = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*?)\s*$/);
    if (!scalar) {
      errors.push(`unsupported frontmatter line: ${line}`);
      continue;
    }

    const [, key, rawValue] = scalar;
    if (rawValue === "") {
      const values = [];
      for (let itemIndex = index + 1; itemIndex < lines.length; itemIndex += 1) {
        const item = lines[itemIndex].match(/^\s+-\s*(.*?)\s*$/);
        if (!item) break;
        values.push(parseFrontmatterScalar(item[1]));
        index = itemIndex;
      }
      out[key] = values;
      continue;
    }

    out[key] = parseFrontmatterScalar(rawValue);
  }
  return out;
}

function parseFrontmatterScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseJsonc(text, label) {
  const result = parseJsoncResult(text);
  if (result.ok) return result.value;
  fail(`${label}: invalid JSONC: ${result.error.message}`);
}

async function exportableCommands() {
  const commands = await readCommands();
  const errors = [];
  checkCommandMetadata(commands, errors);
  if (errors.length > 0) fail(`command metadata invalid:\n${errors.join("\n")}`);
  return commands;
}

function commandRegistry(commands) {
  return {
    count: commands.length,
    commands: commands.map(commandRegistryEntry),
  };
}

function commandRegistryEntry(command) {
  return {
    name: command.metadata.name,
    source: command.relativePath,
    aliases: command.metadata.aliases,
    phase: command.metadata.phase,
    description: command.metadata.description,
    metadata_source: command.hasFrontmatter ? "frontmatter" : "inferred",
    lazy_body: {
      type: "file",
      path: command.relativePath,
      frontmatter_stripped: true,
    },
    targets: Object.fromEntries(
      Object.entries(targets)
        .filter(([, adapter]) => adapter.renderCommand)
        .map(([name, adapter]) => [name, commandRelativeOutput(adapter, command, { target: name, scope: "user", mode: "registry" })]),
    ),
  };
}

async function targetOutputs(adapter, commands, context) {
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

// Each adapter renders through an ordered list of producers. `commands` covers
// per-command outputs plus any additionalCommandOutputs; `static` is the opaque
// non-command bucket (rules, instructions, prompts, plugin packages, context
// docs). New source primitives append their own producer here in later phases.
function targetProducers(adapter) {
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

function producerEmitsFor(adapter) {
  const emits = new Set();
  for (const producer of targetProducers(adapter)) {
    for (const token of producer.emits ?? []) emits.add(token);
  }
  return emits;
}

function producerDefaultRenderKind(producer) {
  return producer.emits?.length === 1 ? producer.emits[0] : producer.id;
}

async function produceCommandOutputs(adapter, commands, context) {
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

function commandRelativeOutput(adapter, command, context) {
  return path.join(outputRootFor(adapter.commandOutputRoot, context), adapter.commandOutputName ? adapter.commandOutputName(command, context) : path.basename(command.file));
}

function outputRootFor(value, context) {
  return typeof value === "function" ? value(context) : value;
}

function checkCommandMetadata(commands, errors) {
  const names = new Set();
  for (const command of commands) {
    for (const error of command.frontmatterErrors) errors.push(`${command.relativePath}: ${error}`);
    if (!command.hasFrontmatter) errors.push(`${command.relativePath}: command frontmatter missing`);
    if (names.has(command.metadata.name)) errors.push(`duplicate command metadata name: ${command.metadata.name}`);
    names.add(command.metadata.name);
    for (const field of Object.keys(command.metadata)) {
      if (!commandMetadataFields.has(field)) errors.push(`${command.relativePath}: unsupported metadata field: ${field}`);
    }
    if (typeof command.metadata.name !== "string") errors.push(`${command.relativePath}: name must be a string`);
    if (command.metadata.name !== command.name) errors.push(`${command.relativePath}: metadata name must match filename`);
    if (!isSafeTargetName(command.metadata.name)) errors.push(`${command.relativePath}: unsafe metadata name`);
    if (!Array.isArray(command.metadata.aliases)) errors.push(`${command.relativePath}: aliases must be an array`);
    if (!commandPhases.has(command.metadata.phase)) errors.push(`${command.relativePath}: unsupported phase: ${command.metadata.phase}`);
    if (command.metadata.description !== null && typeof command.metadata.description !== "string") {
      errors.push(`${command.relativePath}: description must be a string`);
    }
    for (const alias of command.metadata.aliases ?? []) {
      if (!isSafeTargetName(alias)) errors.push(`${command.relativePath}: unsafe alias: ${alias}`);
    }
  }
}

function collectCommandReferenceFindings(commands, errors) {
  const names = new Set(commands.map((command) => command.metadata.name));
  const aliases = new Set(commands.flatMap((command) => command.metadata.aliases ?? []));
  const seen = new Set();

  for (const command of commands) {
    for (const reference of commandReferences(command.body)) {
      if (!isCommandLikeReference(reference.name, names, aliases)) continue;
      if (names.has(reference.name) || aliases.has(reference.name)) continue;
      const key = `${command.relativePath}:${reference.name}:${reference.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      errors.push(`${command.relativePath}:${reference.line}: unresolved command reference ${reference.raw}`);
    }
  }

  const aliasOwners = new Map();
  for (const command of commands) {
    for (const alias of command.metadata.aliases ?? []) {
      if (names.has(alias)) errors.push(`${command.relativePath}: alias collides with command name: ${alias}`);
      const owner = aliasOwners.get(alias);
      if (owner) errors.push(`${command.relativePath}: alias duplicates ${owner}: ${alias}`);
      aliasOwners.set(alias, command.relativePath);
    }
  }

}

function commandReferences(text) {
  const references = [];
  const patterns = [
    /(?<![\w/])\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?![\w/-])/g,
    /`\/?([a-z][a-z0-9]*(?:-[a-z0-9]+)*)`/g,
    /\[([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\]/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      references.push({
        name: match[1],
        raw: match[0],
        line: lineNumberAt(text, match.index ?? 0),
      });
    }
  }

  return references;
}

function isCommandLikeReference(name, names, aliases) {
  if (names.has(name) || aliases.has(name)) return true;
  if (!name.includes("-")) return false;
  return commandPrefixes.has(name.split("-")[0]);
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function commandPhaseFromName(name) {
  const prefix = name.split("-")[0];
  const map = {
    arch: "decide",
    boot: "observe",
    dev: "build",
    flow: "decide",
    lint: "verify",
    ops: "improve",
    qa: "review",
    ship: "ship",
    stellaris: "game",
    verify: "verify",
    workflow: "arbitrate",
  };
  return map[prefix] ?? "misc";
}

async function directories(base) {
  if (!(await exists(base))) return [];

  const out = [];
  const entries = await readdir(base, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === ".git" || entry.name === "dist" || entry.name === "node_modules") continue;
    const full = path.join(base, entry.name);
    out.push(full, ...(await directories(full)));
  }
  return out;
}

async function directDirectories(base) {
  if (!(await exists(base))) return [];

  const entries = await readdir(base, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(base, entry.name))
    .sort();
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function readJsonIfExists(file) {
  if (!(await exists(file))) return null;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    fail(`failed to parse JSON at ${relative(file)}: ${error.message}`);
  }
}

async function readJsoncIfExists(file) {
  if (!(await exists(file))) return null;
  return parseJsonc(await readFile(file, "utf8"), path.relative(root, file));
}

async function readFileIfExists(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readRules() {
  const ruleFiles = await files("rules", [".mdc"]);
  const rules = [];

  for (const file of ruleFiles) {
    const text = await readFile(file, "utf8");
    rules.push(parseRule(file, text));
  }

  return rules;
}

function parseRule(file, text) {
  const out = {
    file: relative(file),
    text,
    description: null,
    alwaysApply: null,
    globs: [],
    frontmatterErrors: [],
  };

  if (!text.startsWith("---\n")) {
    out.frontmatterErrors.push("frontmatter missing");
    return out;
  }

  const end = text.indexOf("\n---\n", 4);
  if (end === -1) {
    out.frontmatterErrors.push("frontmatter not closed");
    return out;
  }

  const lines = text.slice(4, end).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const description = line.match(/^description:\s*"?(.*?)"?\s*$/);
    if (description) {
      out.description = description[1];
      continue;
    }

    const alwaysApply = line.match(/^alwaysApply:\s*(true|false)\s*$/);
    if (alwaysApply) {
      out.alwaysApply = alwaysApply[1] === "true";
      continue;
    }

    if (line.match(/^globs:\s*$/)) {
      for (let globIndex = index + 1; globIndex < lines.length; globIndex += 1) {
        const glob = lines[globIndex].match(/^\s+-\s*"?(.*?)"?\s*$/);
        if (!glob) break;
        out.globs.push(glob[1]);
        index = globIndex;
      }
    }
  }

  if (!out.description) out.frontmatterErrors.push("frontmatter description missing");
  if (out.alwaysApply === null) out.frontmatterErrors.push("frontmatter alwaysApply missing");
  return out;
}

function collectRuleReferenceFindings(rule, commandNames, errors, warnings) {
  const fatalPatterns = [
    ["mentally verified", /mentally verified/i],
    ["stale golangci action", /golangci-lint-action@v6/],
    ["stale golangci version", /v1\.63\.4/],
    ["stale typescript-eslint project true", /parserOptions:\s*\{[\s\S]{0,160}project:\s*true/],
    ["typed-dict laundering example", /return\s+json\.loads\(path\.read_text\(\)\)/],
    ["npm install zod dependency mutation", /npm install zod/],
    ["unscoped go install latest", /^go install\s+\S+@latest/m],
  ];
  const warningPatterns = [
    ["absolute wording", /ZERO TOLERANCE/],
    ["absolute prohibition wording", /ABSOLUTE PROHIBITIONS/],
    ["law wording", /These are laws/],
    ["do-not-submit wording", /DO NOT SUBMIT/],
    ["code-only dominance", /ONLY code blocks/],
    ["mock ban", /Mocks\/spies\/stubs\s*\|\s*Banned/],
    ["env-only secret rule", /Secrets:\s*`?\.env\b/],
    ["no-exceptions wording", /No exceptions\./],
    ["module exception hierarchy", /Every module should define its own exception hierarchy/],
    ["public function test absolutism", /Every public function must have at least one test/],
    ["doc example absolutism", /All doc comments must have examples/],
    ["duplicate crate absolutism", /No duplicate crate versions/],
    ["errgroup absolutism", /Always Use errgroup/],
  ];
  const commandRefPattern = /`((?:arch|boot|dev|lint|ops|qa|ship|stellaris|verify|workflow)-[a-z0-9-]+)`/g;

  for (const [label, pattern] of fatalPatterns) {
    if (pattern.test(rule.text)) errors.push(`${rule.file}: ${label}`);
  }

  for (const [label, pattern] of warningPatterns) {
    if (pattern.test(rule.text)) warnings.push(`${rule.file}: ${label}`);
  }

  for (const match of rule.text.matchAll(commandRefPattern)) {
    if (!commandNames.has(match[1])) {
      warnings.push(`${rule.file}: command reference not present in commands/: ${match[1]}`);
    }
  }
}

function globMatches(glob, file) {
  if (glob === file) return true;
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**/", "\0DOUBLE_STAR_SLASH\0")
    .replaceAll("**", "\0DOUBLE_STAR\0")
    .replaceAll("*", "[^/]*")
    .replaceAll("\0DOUBLE_STAR_SLASH\0", "(?:.*/)?")
    .replaceAll("\0DOUBLE_STAR\0", ".*");
  return new RegExp(`^${escaped}$`).test(file);
}

function firstHeading(text) {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^#\s+(.+?)\s*$/);
    if (match) return match[1];
  }
  return null;
}

function yamlBlockString(value) {
  return value.replace(/\s+/g, " ").trim().replaceAll('"', '\\"');
}

function yamlLiteralBlock(value, indent) {
  const lines = String(value).replace(/\s+$/u, "").split(/\r?\n/);
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) return `${indent}`;
  return lines.map((line) => `${indent}${line}`).join("\n");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isSafeRelativePath(file) {
  return file !== "" && !path.isAbsolute(file) && !file.split(/[\\/]+/).includes("..");
}

function isSafeTargetName(target) {
  return typeof target === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(target);
}

function safeTimestamp(value) {
  return value.replace(/[:.]/g, "-");
}

function safeFilename(value) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

function redactEvidenceText(value) {
  const patterns = [];
  let text = value;
  const replacements = [
    {
      name: "authorization-header",
      pattern: /(Authorization:\s*(?:Bearer|Basic)\s+)[^\s\r\n]+/gi,
      replacement: "$1[REDACTED]",
    },
    {
      name: "cookie-header",
      pattern: /(Cookie:\s*)[^\r\n]+/gi,
      replacement: "$1[REDACTED]",
    },
    {
      name: "secret-assignment",
      pattern: /\b(api[_-]?key|secret|token|password|passwd|pwd)\b(\s*[:=]\s*)(["']?)[^\s'"]+\3/gi,
      replacement: "$1$2$3[REDACTED]$3",
    },
    {
      name: "private-key-block",
      pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      replacement: "[REDACTED PRIVATE KEY]",
    },
    {
      name: "url-credential",
      pattern: /:\/\/[^\/\s:@]+:[^\/\s:@]+@/g,
      replacement: "://[REDACTED]@",
    },
  ];

  for (const replacement of replacements) {
    const next = text.replace(replacement.pattern, replacement.replacement);
    if (next !== text) {
      patterns.push(replacement.name);
      text = next;
    }
  }

  return { text, applied: patterns.length > 0, patterns };
}

function approvalForClass(klass, options) {
  const approvalRequired = !new Set(["read_only", "build_test"]).has(klass);
  if (!approvalRequired) {
    return { required: false, approved: true, sources: [] };
  }

  const approvedArgs = new Set(argValues(options, "--approved"));
  const approvedEnv = new Set((process.env.AGENT_SURFACE_APPROVED_CLASSES ?? "").split(",").map((item) => item.trim()).filter(Boolean));
  const sources = [];

  if (approvedArgs.has(klass) || approvedArgs.has("all")) sources.push("--approved");
  if (approvedEnv.has(klass) || approvedEnv.has("all")) sources.push("AGENT_SURFACE_APPROVED_CLASSES");

  return {
    required: true,
    approved: sources.length > 0,
    sources,
  };
}

async function packageVersion() {
  const metadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  return metadata.version;
}

function installRootGoose(scope) {
  // user → ~ (so MCP reaches ~/.config/goose/config.yaml); project → cwd (recipes in ./recipes).
  return scope === "user" ? os.homedir() : process.cwd();
}

function installRootHomeOnly(scope) {
  if (scope !== "user") fail("this target supports --scope user only unless --dest is supplied");
  return os.homedir();
}

function installRootClaude(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

function installRootCodex(scope) {
  if (scope !== "user") fail("codex install supports --scope user only unless --dest is supplied");
  return os.homedir();
}

function installRootDeepagents(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

function installRootGrokBuild(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

function installRootPi(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

function installRootPool(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

function installRootOpencode(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

function installRootCline(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

function installRootKilo(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

function installRootDroid(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

function installRootAntigravity(scope) {
  if (scope !== "user") fail("antigravity install supports --scope user only unless --dest is supplied");
  return path.join(os.homedir(), ".gemini", "antigravity");
}

function installRootAntigravityCli(scope) {
  if (scope !== "user") fail("antigravity-cli install supports --scope user only unless --dest is supplied");
  return path.join(os.homedir(), ".gemini");
}

function installRootVsCode(scope) {
  if (scope !== "user") fail("vscode install supports --scope user only unless --dest is supplied");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Code", "User");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Code", "User");
  return path.join(os.homedir(), ".config", "Code", "User");
}

function installRootVscodium(scope) {
  if (scope !== "user") fail("vscodium install supports --scope user only unless --dest is supplied");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "VSCodium", "User");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "VSCodium", "User");
  return path.join(os.homedir(), ".config", "VSCodium", "User");
}

function installRootWindsurf(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

function installRootZed(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

function claudeMcpPath(context) {
  return context.scope === "user" ? ".claude.json" : ".mcp.json";
}

async function kiloConfigStatus() {
  const configDir = path.join(os.homedir(), ".config", "kilo");
  if (!(await exists(configDir))) return "missing";

  const metadata = await readJsonIfExists(path.join(configDir, "package.json"));
  const pluginVersion = metadata?.dependencies?.["@kilocode/plugin"] ?? metadata?.devDependencies?.["@kilocode/plugin"];
  const config = await readJsoncIfExists(path.join(configDir, "kilo.jsonc"));
  const instructions = Array.isArray(config?.instructions) ? config.instructions : [];
  const markers = [];
  if (pluginVersion) markers.push(`plugin ${pluginVersion}`);
  if (await exists(path.join(configDir, "AGENTS.md"))) markers.push("AGENTS.md");
  if (await exists(path.join(configDir, "commands"))) markers.push("commands");
  if (instructions.includes("./rules/00-precedence-and-safety.md")) markers.push("rules configured");
  return markers.length > 0 ? `present (${markers.join(", ")})` : "present";
}

function clineWorkflowRoot(context) {
  return context.scope === "user" ? path.join(".cline", "data", "workflows") : path.join(".clinerules", "workflows");
}

function deepagentsSkillRoot(context) {
  return context.scope === "user"
    ? path.join(".deepagents", context.agentName ?? "agent", "skills")
    : path.join(".deepagents", "skills");
}

function deepagentsInstructionPath(context) {
  return context.scope === "user"
    ? path.join(".deepagents", context.agentName ?? "agent", "AGENTS.md")
    : path.join(".deepagents", "AGENTS.md");
}

function deepagentsAgentRoot(context) {
  return context.scope === "user"
    ? path.join(".deepagents", context.agentName ?? "agent", "agents")
    : path.join(".deepagents", "agents");
}

function deepagentsConfigRoot(context) {
  return context.scope === "user" ? path.join(".deepagents", context.agentName ?? "agent") : ".deepagents";
}

function deepagentsSubagentOutputName(source) {
  return path.join(source.metadata.name, "AGENTS.md");
}

function deepagentsMcpPath() {
  return path.join(".deepagents", ".mcp.json");
}

function grokBuildSkillRoot() {
  return path.join(".grok", "skills");
}

function piSkillRoot(context) {
  return context.scope === "user" ? path.join(".pi", "agent", "skills") : path.join(".pi", "skills");
}

function piInstructionPath(context) {
  return context.scope === "user" ? path.join(".pi", "agent", "AGENTS.md") : "AGENTS.md";
}

function piConfigRoot(context) {
  return context.scope === "user" ? path.join(".pi", "agent") : ".pi";
}

function poolSkillRoot(context) {
  return context.scope === "user" ? path.join(".config", "poolside", "skills") : path.join(".poolside", "skills");
}

function poolInstructionPath(context) {
  return context.scope === "user" ? path.join(".config", "poolside", ".poolside") : "AGENTS.md";
}

function poolConfigRoot(context) {
  return context.scope === "user" ? path.join(".config", "poolside") : ".poolside";
}

function clineRuleRoot(context) {
  return context.scope === "user" ? path.join(".cline", "rules") : ".clinerules";
}

function clineMcpPath(context) {
  return context.scope === "user" ? path.join(".cline", "mcp.json") : path.join(".cline", "mcp.json");
}

function kiloWorkflowRoot(context) {
  return context.scope === "user" ? path.join(".config", "kilo", "commands") : path.join(".kilo", "commands");
}

function kiloConfigPath(scope) {
  return scope === "user" ? path.join(".config", "kilo", "kilo.jsonc") : "kilo.jsonc";
}

function kiloInstructionPath(context) {
  return context.scope === "user" ? path.join(".config", "kilo", "AGENTS.md") : "AGENTS.md";
}

function kiloRuleRoot(context) {
  return context.scope === "user" ? path.join(".config", "kilo", "rules") : path.join(".kilo", "rules");
}

function kiloRuleReferenceRoot(context) {
  return context.scope === "user"
    ? path.join(".config", "kilo", "references", "rules")
    : path.join(".kilo", "references", "rules");
}

function kiloAgentRoot(context) {
  return context.scope === "user" ? path.join(".config", "kilo", "agents") : path.join(".kilo", "agents");
}

function opencodeCommandRoot(context) {
  return context.scope === "user" ? path.join(".config", "opencode", "commands") : path.join(".opencode", "commands");
}

function opencodeAgentRoot(context) {
  return context.scope === "user" ? path.join(".config", "opencode", "agents") : path.join(".opencode", "agents");
}

function opencodeInstructionPath(context) {
  return context.scope === "user" ? path.join(".config", "opencode", "AGENTS.md") : "AGENTS.md";
}

function opencodeConfigRoot(context) {
  return context.scope === "user" ? path.join(".config", "opencode") : ".opencode";
}

function opencodeMcpPath(context) {
  return path.join(opencodeConfigRoot(context), "opencode.json");
}

function windsurfWorkflowRoot(context) {
  return context.scope === "user" ? path.join(".codeium", "windsurf", "global_workflows") : path.join(".windsurf", "workflows");
}

function windsurfConfigRoot(context) {
  return context.scope === "user" ? path.join(".codeium", "windsurf") : ".windsurf";
}

function windsurfMcpPath(context) {
  return context.scope === "user"
    ? path.join(".codeium", "windsurf", "mcp_config.json")
    : path.join(".windsurf", "mcp_config.json");
}

function windsurfRulePath(context) {
  return context.scope === "user"
    ? path.join(".codeium", "windsurf", "memories", "global_rules.md")
    : path.join(".devin", "rules", "agent-surface.md");
}

function windsurfSkillRoot(context) {
  return context.scope === "user" ? path.join(".codeium", "windsurf", "skills") : path.join(".windsurf", "skills");
}

function zedSkillRoot() {
  return path.join(".agents", "skills");
}

function zedInstructionPath(context) {
  return context.scope === "user" ? path.join(".config", "zed", "AGENTS.md") : "AGENTS.md";
}

function zedConfigRoot(context) {
  return context.scope === "user" ? path.join(".config", "zed") : ".zed";
}

function zedMcpPath(context) {
  return path.join(zedConfigRoot(context), "settings.json");
}

async function kiloRuleInstructionPaths(scope) {
  const ruleNames = (await readRules())
    .filter((rule) => rule.alwaysApply !== false)
    .map((rule) => path.basename(rule.file, ".mdc"));
  const prefix = scope === "user" ? "./rules" : ".kilo/rules";
  return ruleNames.map((name) => `${prefix}/${name}.md`);
}

function commandVersion(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) return "missing";
  const output = `${result.stdout}${result.stderr}`.trim().split(/\r?\n/)[0];
  return output || `exit ${result.status}`;
}

function gitValue(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function gitOutput(args, env = process.env) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    fail(`git ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

async function gitLines(args) {
  return gitOutput(args).split(/\r?\n/).filter(Boolean);
}

function argValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? fail(`missing value for ${name}`);
}

function argValues(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1] ?? fail(`missing value for ${name}`);
    values.push(value);
    index += 1;
  }
  return values;
}

function requiredArgValue(args, name) {
  return argValue(args, name) ?? fail(`missing required ${name}`);
}

function relative(file) {
  return path.relative(root, file);
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(1);
});
