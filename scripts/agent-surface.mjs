#!/usr/bin/env node

import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { readCommands } from "./agent-surface/commands.mjs";
import { approximateTokens } from "./agent-surface/format.mjs";
import { directDirectories, directories, files, filesUnder } from "./agent-surface/fs-tree.mjs";
import { mergeJsoncRootObjectProperty, mergeKiloInstructionJsonc, parseJsoncResult } from "./agent-surface/jsonc.mjs";
import { YAML_MCP_FORMATS, mergeCodexMcpToml, mergeJsonMcpConfig, mergeYamlMcpConfig, optionalServiceMcpServers, renderMcpConfig } from "./agent-surface/merge.mjs";
import { normalizeExternalSkillFile } from "./agent-surface/postprocess.mjs";
import { commandVersion, gitLines, gitOutput, gitStagedGitlinkMap, gitSubmoduleStatusMap, gitValue } from "./agent-surface/proc.mjs";
import { readOptionalServices, readSourceKinds, relative, root } from "./agent-surface/registry.mjs";
import { antigravityCliSkillOutputName, claudeMcpPath, clineMcpPath, clineRuleRoot, clineWorkflowRoot, codexSkillOutputName, deepagentsAgentRoot, deepagentsConfigRoot, deepagentsInstructionPath, deepagentsMcpPath, deepagentsSkillRoot, deepagentsSubagentOutputName, droidConfigRoot, droidInstructionPath, flatMarkdownCommandOutputName, gooseRecipeOutputName, grokBuildSkillRoot, groupedMarkdownCommandOutputName, installRootAntigravity, installRootAntigravityCli, installRootClaude, installRootCline, installRootCodex, installRootDeepagents, installRootDroid, installRootGoose, installRootGrokBuild, installRootHomeOnly, installRootKilo, installRootOpencode, installRootPi, installRootPool, installRootVsCode, installRootVscodium, installRootWindsurf, installRootZed, kiloAgentRoot, kiloConfigPath, kiloRuleReferenceRoot, kiloRuleRoot, kiloWorkflowRoot, opencodeAgentRoot, opencodeCommandRoot, opencodeConfigRoot, opencodeInstructionPath, opencodeMcpPath, piConfigRoot, piInstructionPath, piSkillRoot, poolConfigRoot, poolInstructionPath, poolSkillRoot, windsurfConfigRoot, windsurfMcpPath, windsurfRulePath, windsurfSkillRoot, windsurfWorkflowRoot, zedConfigRoot, zedInstructionPath, zedMcpPath, zedSkillRoot } from "./agent-surface/roots.mjs";
import { firstHeading, renderAntigravityCliRuleDocument, renderAntigravityCliSkill, renderAntigravityWorkflow, renderClaudeCommand, renderClaudeSubagent, renderClineWorkflow, renderCodexSubagent, renderCursorCommand, renderCursorSubagent, renderDeepAgentsSkill, renderDeepAgentsSubagent, renderDroidCommand, renderDroidSubagent, renderGeminiSubagent, renderGooseRecipe, renderGrokBuildSkill, renderInstructionDocument, renderKiloRuleDocument, renderKiloSubagent, renderKiloWorkflow, renderOpenCodeCommand, renderOpenCodeSubagent, renderPiSkill, renderPoolSkill, renderScopedRuleReferenceDocument, renderSharedAgentSkill, renderVsCodeInstructionDocument, renderVsCodePromptDocument, renderWindsurfWorkflow } from "./agent-surface/render.mjs";
import { readRules } from "./agent-surface/rules.mjs";
import { commandRelativeOutput, generatedOutputMinimums, kiloRuleInstructionPaths, mcpConfigScopeAllows, outputAppliesToCategory, outputAppliesToScope, outputRootFor, producerEmitsFor, selectedMcpServiceEntries, sourceKindPolicy, targetOutputs, targetProducers, targets } from "./agent-surface/targets.mjs";
import {
  checkIgnores,
  checkSubagents,
  ignoreOutputs,
  subagentOutputs,
  subagentValidationErrors,
} from "./agent-surface/source-primitives.mjs";
import { exists, fail, isSafeRelativePath, sha256 } from "./agent-surface/util.mjs";

const commandMetadataFields = new Set(["name", "aliases", "phase", "description"]);
const commandPrefixes = new Set(["arch", "boot", "dev", "lint", "ops", "qa", "ship", "stellaris", "verify", "workflow"]);
const commandPhases = new Set(["observe", "decide", "build", "verify", "review", "arbitrate", "ship", "improve", "bootstrap", "game", "misc"]);

// Per-target generated output floors are race-free gross-drop tripwires, not
// exact bulk pins. Keep enough headroom for legitimate small count changes
// while still catching silent producer drops that representative path checks
// can miss.
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
    }));
  }
  addCrossPlanInstallConflicts(plans);

  const blocked = plans.flatMap((plan) => plan.blocked.map((item) => `${plan.target}: ${item}`));
  // A category-filtered install must do real work across the selection: if no selected target
  // has any writes or config merges, the whole run is a no-op and fails (individual
  // non-applicable targets are informational, but "nothing installable anywhere" is an error).
  const runBlocker = categoryFilter && plans.every((plan) => plan.writes.length === 0 && plan.configMerges.length === 0)
    ? `no selected targets have installable outputs for categories: ${[...categoryFilter].sort().join(", ")}`
    : null;
  for (const plan of plans) {
    printInstallPlan(plan);
  }
  if (runBlocker) console.log(`install blocked: ${runBlocker}`);
  if (blocked.length > 0 || runBlocker) {
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

  // Per-target: record non-applicability as informational. Whether the *run* fails is decided
  // at the call site (a run with no installable outputs anywhere is the error, not one target).
  let notApplicableCategories = null;
  if (categoryFilter && writes.length === 0 && configMerges.length === 0 && nonApplicable.length === 0) {
    notApplicableCategories = `no installable outputs for categories: ${[...categoryFilter].sort().join(", ")}`;
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

// Each adapter renders through an ordered list of producers. `commands` covers
// per-command outputs plus any additionalCommandOutputs; `static` is the opaque
// non-command bucket (rules, instructions, prompts, plugin packages, context
// docs). New source primitives append their own producer here in later phases.
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

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(1);
});
