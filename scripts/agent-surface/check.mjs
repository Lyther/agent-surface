// The validation layer behind the `check` command: registry/schema/producer coherence,
// source-kind + capability drift, external pins, served_by invariants, workflow fixtures,
// and generated-output well-formedness. Imports the data (targets/commands/rules/registry)
// it validates; the CLI dispatch calls check/checkGenerated/checkRules/checkCommands from here.
import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { readCommands } from "./commands.mjs";
import { approximateTokens } from "./format.mjs";
import { directDirectories, files, filesUnder } from "./fs-tree.mjs";
import { readFileIfExists } from "./io.mjs";
import { gitIgnoredPaths, gitStagedGitlinkMap, gitSubmoduleStatusMap } from "./proc.mjs";
import { readAssetCategories, readOptionalServices, readSourceKinds, relative, root } from "./registry.mjs";
import { vsCodeUserRoot } from "./roots.mjs";
import { readRules } from "./rules.mjs";
import { readSkills } from "./skills.mjs";
import { readSubagents, subagentValidationErrors } from "./source-primitives.mjs";
import { CODEX_PLUGIN_NAME, CODEX_PLUGIN_SCHEMA, generatedOutputMinimums, producerEmitsFor, sourceKindPolicy, targetOutputs, targetProducers, targets } from "./targets.mjs";
import { argValue, exists, fail, globMatches, isPathInside, isSafeTargetName, sha256 } from "./util.mjs";

export const commandMetadataFields = new Set(["name", "aliases", "phase", "description"]);
export const skillMetadataFields = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);

export const commandPrefixes = new Set(["arch", "boot", "dev", "lint", "ops", "qa", "ship", "stellaris", "verify", "workflow"]);

export const commandPhases = new Set(["observe", "decide", "build", "verify", "review", "arbitrate", "ship", "improve", "bootstrap", "game", "misc"]);

// This private operator command is intentionally excluded from Git and npm, but a
// maintainer checkout may still distribute its local copy to generated targets.
export const localCommandOverlays = new Set(["commands/ops-server.md"]);

export const workflowSchemaFiles = [
  "workflow.run.schema.json",
  "workflow.boss.schema.json",
  "workflow.worker.schema.json",
  "workflow.reviewer.schema.json",
  "workflow.judger.schema.json",
  "workflow.rescue.schema.json",
  "workflow.event.schema.json",
  "workflow.current.schema.json",
  "workflow.monitor.schema.json",
  "workflow.patch.schema.json",
];

export const registrySchemaFiles = [
  { schema: "targets.schema.json", file: "registry/targets.json" },
  { schema: "target-capabilities.schema.json", file: "registry/target-capabilities.json" },
  { schema: "artifacts.schema.json", file: "registry/artifacts.json" },
  { schema: "source-kinds.schema.json", file: "registry/source-kinds.json" },
  { schema: "optional-services.schema.json", file: "registry/optional-services.json" },
  { schema: "asset-category.schema.json", file: "registry/development-assets.json" },
  { schema: "asset-category.schema.json", file: "registry/cybersecurity-assets.json" },
  { schema: "asset-category.schema.json", file: "registry/private-secret.json" },
  { schema: "asset-category.schema.json", file: "registry/modding.json" },
  { schema: "legacy-owned.schema.json", file: "registry/legacy-owned.json" },
];

export const workflowFixtureFiles = [
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
  { schema: "workflow.monitor.schema.json", file: "tests/fixtures/workflow/monitor.json" },
  { schema: "workflow.patch.schema.json", file: "tests/fixtures/workflow/patch-verified.json" },
];

export const workflowRuntimeNames = new Set([
  "antigravity-cli",
  "antigravity-desktop",
  "claude-code",
  "cline",
  "codex",
  "codex-exec",
  "cursor-agent",
  "kilo-cli",
  "kilo-ide",
  "kimi-code",
  "opencode",
  "trae",
  "vscode",
  "goose",
  "grok-build",
  "kiro",
  "qoder",
  "qwen-code",
  "pi",
  "pool",
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

export const ruleScenarios = {
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

export async function check() {
  const errors = [];
  const commands = await readCommands();
  const skills = await readSkills();
  const commandFiles = commands.map((command) => command.file);
  const ruleFiles = await files("rules", [".md", ".mdc"]);
  const targetsConfig = JSON.parse(await readFile(path.join(root, "registry", "targets.json"), "utf8"));
  const artifactsConfig = JSON.parse(await readFile(path.join(root, "registry", "artifacts.json"), "utf8"));
  const sourceKindsConfig = await readSourceKinds();
  const banned = new Set(targetsConfig.out_of_scope);

  if (commandFiles.length === 0) errors.push("commands/ is empty");
  if (skills.length === 0) errors.push("skills/ is empty");
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

  await checkWorkflowSchemas(errors);
  await checkRegistrySchemas(errors);
  await checkAssetCategories(commands, skills, errors);
  await checkTargetCapabilities(targetsConfig, errors);
  await checkExternalServicePins(errors);
  await checkServedBy(errors);
  errors.push(...await subagentValidationErrors());
  checkCommandMetadata(commands, errors);
  checkSkillMetadata(skills, errors);
  const procedureNames = new Set();
  for (const procedure of [...skills, ...commands]) {
    if (procedureNames.has(procedure.name)) errors.push(`duplicate procedure name across skills/ and commands/: ${procedure.name}`);
    procedureNames.add(procedure.name);
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("check: ok");
}

async function checkAssetCategories(commands, skills, errors) {
  const categories = await readAssetCategories();
  const services = await readOptionalServices();
  const commandNames = new Set(commands.map((command) => command.name));
  const skillNames = new Set(skills.map((skill) => skill.name));
  const ruleNames = new Set((await readRules()).map((rule) => path.basename(rule.file, ".mdc")));
  const subagentNames = new Set((await readSubagents()).map((subagent) => subagent.metadata.name));
  const owners = new Map();

  for (const [categoryName, category] of Object.entries(categories)) {
    for (const [kind, known] of [
      ["commands", commandNames],
      ["skills", skillNames],
      ["rules", ruleNames],
      ["subagents", subagentNames],
      ["services", new Set(Object.keys(services.services))],
    ]) {
      for (const id of category[kind]) {
        const key = `${kind}:${id}`;
        const previous = owners.get(key);
        if (previous) errors.push(`asset ${key} belongs to both ${previous} and ${categoryName}`);
        owners.set(key, categoryName);
        const declaredLocalCommand = categoryName === "private"
          && kind === "commands"
          && localCommandOverlays.has(`commands/${id}.md`);
        if (!known.has(id) && !declaredLocalCommand) {
          errors.push(`${categoryName} asset category references unknown ${kind.slice(0, -1)}: ${id}`);
        }
      }
    }
  }
}

export function checkBossArtifactCoherence(data, source, errors) {
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
    if ((typeof task.parallel_group === "string" || task.isolation === "separate_worktree") && task.patch_required !== true) {
      errors.push(`${prefix}: parallel or separate-worktree tasks require patch_required=true`);
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

// Load commands and fail hard on invalid metadata. The build and install paths
// use this instead of readCommands directly so every generated surface starts
// from a validated command set.
export async function exportableCommands() {
  const allCommands = await readCommands();
  const ignored = gitIgnoredPaths(allCommands.map((command) => command.relativePath));
  const commands = allCommands.filter(
    (command) => !ignored.has(command.relativePath) || localCommandOverlays.has(command.relativePath),
  );
  const errors = [];
  checkCommandMetadata(commands, errors);
  if (errors.length > 0) fail(`command metadata invalid:\n${errors.join("\n")}`);
  return commands;
}

export async function exportableCatalog() {
  const commands = await exportableCommands();
  const skills = await readSkills();
  const errors = [];
  checkSkillMetadata(skills, errors);
  if (errors.length > 0) fail(`skill metadata invalid:\n${errors.join("\n")}`);
  return { commands, skills };
}

export function checkCommandMetadata(commands, errors) {
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

export function checkSkillMetadata(skills, errors) {
  const names = new Set();
  for (const skill of skills) {
    for (const error of skill.frontmatterErrors) errors.push(`${skill.relativePath}: ${error}`);
    if (!skill.hasFrontmatter) errors.push(`${skill.relativePath}: skill frontmatter missing`);
    if (names.has(skill.metadata.name)) errors.push(`duplicate skill metadata name: ${skill.metadata.name}`);
    names.add(skill.metadata.name);
    for (const field of Object.keys(skill.metadata)) {
      if (!skillMetadataFields.has(field)) errors.push(`${skill.relativePath}: unsupported metadata field: ${field}`);
    }
    if (typeof skill.metadata.name !== "string") errors.push(`${skill.relativePath}: name must be a string`);
    if (skill.metadata.name !== skill.name) errors.push(`${skill.relativePath}: metadata name must match directory name`);
    if (!isSafeTargetName(skill.metadata.name) || skill.metadata.name.length > 64) {
      errors.push(`${skill.relativePath}: invalid Agent Skill name`);
    }
    if (typeof skill.metadata.description !== "string" || skill.metadata.description.trim().length === 0) {
      errors.push(`${skill.relativePath}: description must be a non-empty string`);
    } else if (skill.metadata.description.length > 1024) {
      errors.push(`${skill.relativePath}: description exceeds 1024 characters`);
    }
  }
}

export async function checkCommands(_args) {
  const commands = await readCommands();
  const skills = await readSkills();
  const metadataErrors = [];
  const referenceErrors = [];

  checkCommandMetadata(commands, metadataErrors);
  collectCommandReferenceFindings([...skills, ...commands], referenceErrors);

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

export async function checkSkills(_args) {
  const skills = await readSkills();
  const commands = await readCommands();
  const metadataErrors = [];
  const referenceErrors = [];
  checkSkillMetadata(skills, metadataErrors);
  collectCommandReferenceFindings([...skills, ...commands], referenceErrors);

  console.log("skills:");
  console.log(`  files: ${skills.length}`);
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
  console.log("skills check: ok");
}

export async function checkExternalServicePins(errors) {
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

export async function checkGenerated(args) {
  const target = argValue(args, "--target") ?? "all";
  const selected = target === "all" ? Object.keys(targets) : [target];
  const catalog = await exportableCatalog();
  const sourceKindsConfig = await readSourceKinds();
  const rules = await readRules();
  const errors = [];

  for (const item of selected) {
    if (!isSafeTargetName(item)) fail(`unsafe generated target: ${item}`);
    if (!Object.hasOwn(targets, item)) fail(`unsupported generated target: ${item}`);
  }

  const outputsByTarget = new Map();
  for (const item of selected) {
    const adapter = targets[item];
    const outputs = await targetOutputs(adapter, catalog, { target: item, scope: "user", mode: "check" });
    outputsByTarget.set(item, outputs);
    const targetErrors = validateGeneratedTarget(item, outputs);
    const countErrors = validateGeneratedOutputCount(item, outputs);
    const sourceKindErrors = validateGeneratedSourceKinds(item, outputs, sourceKindsConfig);
    const fidelityErrors = await validateSkillResourceFidelity(outputs);
    const referenceErrors = validateScopedRuleReferences(outputs, rules);
    const failed = targetErrors.length + countErrors.length + sourceKindErrors.length + fidelityErrors.length + referenceErrors.length > 0;
    console.log(`${item}: generated outputs ${outputs.length} ${failed ? "failed" : "ok"}`);
    errors.push(...targetErrors.map((error) => `${item}: ${error}`));
    errors.push(...countErrors.map((error) => `${item}: ${error}`));
    errors.push(...sourceKindErrors);
    errors.push(...fidelityErrors.map((error) => `${item}: ${error}`));
    errors.push(...referenceErrors.map((error) => `${item}: ${error}`));
  }
  errors.push(...validateSharedSkillRootAgreement(outputsByTarget));

  if (errors.length > 0) {
    console.log("errors:");
    for (const error of errors) console.log(`  ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("generated check: ok");
}

export async function checkRegistrySchemas(errors) {
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

export async function checkRules(args) {
  const scenario = argValue(args, "--scenario");
  const selectedScenarios = scenario ? [scenario] : Object.keys(ruleScenarios);
  const rules = await readRules();
  const commandNames = new Set([
    ...(await readCommands()).map((command) => command.name),
    ...(await readSkills()).map((skill) => skill.name),
  ]);
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

export async function checkServedBy(errors) {
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

export function checkSourceKinds(sourceKindsConfig, artifactsConfig, errors) {
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

export async function checkTargetCapabilities(targetsConfig, errors) {
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

export async function checkWorkflowFixtures(ajv, schemas, errors) {
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

export async function checkWorkflowSchemas(errors) {
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

export function createAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

export function formatAjvErrors(errors) {
  return (errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
}

// Read a workflow artifact and validate it against its ajv schema, collecting
// (never throwing) parse/schema failures into `errors`. Shared by the check
// validators and the workflow doctor/apply paths.
export async function readWorkflowJson(file, validate, errors) {
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

// A skill's companion file is DELIVERED material, not rendered material: what arrives beside the
// installed skill has to be what the source says, byte for byte. Asserting the bytes instead of a
// heading means rewording a reference is free and silently truncating or transforming one is not.
export async function validateSkillResourceFidelity(outputs) {
  const errors = [];
  for (const output of outputs) {
    if (output.sourceKind !== "skills") continue;
    if (!/^skills[\\/]/.test(output.source) || output.source.endsWith("SKILL.md")) continue;
    const source = await readFileIfExists(path.join(root, output.source));
    if (source === null) {
      errors.push(`companion output ${output.relativeOutput} has no source file at ${output.source}`);
      continue;
    }
    if (source.toString("utf8") !== output.content) {
      errors.push(`companion output ${output.relativeOutput} does not match its source ${output.source}`);
    }
  }
  return errors;
}

// A scoped rule is delivered as a reference the reader decides to apply, so the reference has to
// carry the scope that decision needs — the rule's OWN description and globs, whatever they say —
// and must not re-emit frontmatter a host could mistake for its own directives.
export function validateScopedRuleReferences(outputs, rules) {
  const errors = [];
  const scoped = new Map(rules.filter((rule) => rule.alwaysApply === false).map((rule) => [rule.file, rule]));
  for (const output of outputs) {
    const rule = scoped.get(output.source);
    if (!rule || !/references[\\/]rules[\\/]/.test(output.relativeOutput)) continue;
    if (rule.description && !output.content.includes(rule.description)) {
      errors.push(`scoped reference ${output.relativeOutput} drops the rule's description`);
    }
    for (const glob of rule.globs) {
      if (!output.content.includes(glob)) errors.push(`scoped reference ${output.relativeOutput} drops the applicability glob ${glob}`);
    }
    // Frontmatter is a LEADING construct: a host reads `---` as metadata only when the document opens
    // with it. A `---` further down is an ordinary horizontal rule and rendering one is not a defect,
    // so only the opening delimiter is rejected.
    if (/^---\r?\n/.test(output.content)) {
      errors.push(`scoped reference ${output.relativeOutput} opens with frontmatter a host could read as directives`);
    }
  }
  return errors;
}

// `.agents/skills/` is one directory on disk that several targets install into, and identical
// content is what lets them coexist there — a divergence is a real install conflict, not a style
// difference.
//
// What this proves is exactly cross-target byte compatibility, and nothing more. Every target could
// agree on the same WRONG invocation guidance and pass: agreement is not correctness. It is the
// reason a shared file cannot carry host-specific syntax — because the hosts would then disagree —
// but whether the shared wording is good guidance is a question for review and task-shaped
// evaluation, not for this check.
export function validateSharedSkillRootAgreement(outputsByTarget) {
  const errors = [];
  const seen = new Map();
  for (const [target, outputs] of outputsByTarget) {
    for (const output of outputs) {
      if (!/^\.agents[\\/]skills[\\/]/.test(output.relativeOutput)) continue;
      const previous = seen.get(output.relativeOutput);
      if (!previous) {
        seen.set(output.relativeOutput, { target, content: output.content });
        continue;
      }
      if (previous.content !== output.content) {
        errors.push(`shared skill root conflict: ${target} and ${previous.target} emit different content for ${output.relativeOutput}`);
      }
    }
  }
  return errors;
}

export function validateGeneratedOutputCount(target, outputs) {
  const minimum = generatedOutputMinimums.get(target);
  if (minimum === undefined) return ["missing generated output minimum"];
  if (outputs.length >= minimum) return [];
  return [`generated output count ${outputs.length} below minimum ${minimum}`];
}

export function validateGeneratedSourceKinds(target, outputs, sourceKindsConfig) {
  const errors = [];
  for (const output of outputs) {
    const sourceKindError = outputSourceKindError(output, sourceKindsConfig);
    if (sourceKindError) {
      errors.push(`${target}: ${sourceKindError}`);
    }
  }
  return errors;
}

export function validateGeneratedTarget(target, outputs) {
  const errors = [];
  const byPath = new Map(outputs.map((output) => [output.relativeOutput, output]));

  const requirePath = (relativeOutput) => {
    if (!byPath.has(relativeOutput)) errors.push(`missing output ${relativeOutput}`);
    return byPath.get(relativeOutput);
  };

  // For a route that was RETIRED rather than renamed: the assertion is that nothing is emitted here.
  const requireAbsent = (relativeOutput) => {
    if (byPath.has(relativeOutput)) errors.push(`retired output still emitted: ${relativeOutput}`);
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
  const requireNotContains = (relativeOutput, pattern) => {
    const output = requirePath(relativeOutput);
    if (output && pattern.test(output.content)) errors.push(`${relativeOutput} unexpectedly contains ${pattern}`);
  };
  const skillFrontmatter = /^(?:\uFEFF)?---\r?\n/;

  if (outputs.length === 0) errors.push("no outputs generated");
  // Full-catalog targets must not silently drop the optional external packs. An export format is not
  // in that class: it packages a declared subset on purpose, and requiring the catalog there would
  // force the pilot package to carry material it deliberately excludes.
  for (const optionalPack of targets[target]?.buildOnly ? [] : ["external/sanyuan-skills/"]) {
    if (!outputs.some((output) => output.source.startsWith(optionalPack))) {
      errors.push(`optional skill pack is not distributed: ${optionalPack}`);
    }
  }

  if (target === "claude-code") {
    requireContains(path.join(".claude", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\ndescription: "[^"]+"\n---\n/);
    requireNotContains(path.join(".claude", "skills", "ops-flow", "SKILL.md"), /disable-model-invocation/);
    requireContains(path.join(".claude", "skills", "ops-nuke", "SKILL.md"), /disable-model-invocation: true/);
    requireContains(path.join(".claude", "skills", "ops-ask", "SKILL.md"), /^---\nname: ops-ask\ndescription: "[^"]+"\n---\n/);
  } else if (target === "codex") {
    // The companion files must be DELIVERED with the skill, which validateSkillResourceFidelity
    // checks against their sources for every target. Here: the body still points at one, so a
    // dangling reference in the shipped body is caught rather than only a missing file.
    requireContains(path.join(".agents", "skills", "ops-swarm", "SKILL.md"), /references\/runtime-catalog\.md/);
    requireContains(path.join(".agents", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join(".agents", "skills", "ops-flow", "agents", "openai.yaml"), /allow_implicit_invocation: true/);
    requireContains(path.join(".agents", "skills", "ops-nuke", "SKILL.md"), /^---\nname: ops-nuke\n/);
    requireContains(path.join(".agents", "skills", "ops-nuke", "agents", "openai.yaml"), /allow_implicit_invocation: false/);
    requireContains(path.join(".agents", "skills", "ops-ask", "agents", "openai.yaml"), /allow_implicit_invocation: true/);
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
    requireContains(path.join(".agents", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join(".agents", "skills", "ops-nuke", "SKILL.md"), /disable-model-invocation: true/);
  } else if (target === "grok-build") {
    requireContains(path.join(".grok", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join(".grok", "skills", "redteam-boundary-policy", "SKILL.md"), skillFrontmatter);
    requireContains(path.join(".grok", "config.toml"), /^\[ui\]$/m);
    requireContains(path.join(".grok", "config.toml"), /^permission_mode = "always-approve"$/m);
    requireContains(path.join(".grok", "config.toml"), /^\[mcp_servers\.synapse\]$/m);
  } else if (target === "dsh") {
    requireContains(path.join(".dsh", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    if (outputs.some((output) => output.source.startsWith("commands/"))) {
      errors.push("DSH must not emit unstable command/profile surfaces");
    }
  } else if (target === "pi") {
    requireContains(path.join(".pi", "agent", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join(".pi", "agent", "AGENTS.md"), /agent-surface Pi rules/);
    requireContains(path.join(".pi", "agent", "skills", "ctf-web", "SKILL.md"), skillFrontmatter);
  } else if (target === "pool") {
    requireContains(path.join(".config", "poolside", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join(".config", "poolside", ".poolside"), /agent-surface Poolside rules/);
    requireContains(path.join(".config", "poolside", "skills", "redteam-boundary-policy", "SKILL.md"), skillFrontmatter);
  } else if (target === "cline") {
    requirePath(path.join(".cline", "skills", "ops-flow", "SKILL.md"));
    requirePath(path.join("Documents", "Cline", "Workflows", "ops-nuke.md"));
    requireContains(path.join("Documents", "Cline", "Rules", "agent-surface.md"), /agent-surface Cline global rules/);
    requireContains(path.join(".cline", "agents", "boss.yaml"), /^---\nname: boss\n/);
    const mcp = requireJson(path.join(".cline", "data", "settings", "cline_mcp_settings.json"));
    if (mcp && mcp.mcpServers?.synapse?.command !== "~/.local/bin/synapse-bridge") {
      errors.push("Cline synapse MCP must use the first-party local bridge binary");
    }
    if (byPath.has(path.join(".cline", "mcp.json"))) {
      errors.push("Cline must not emit the obsolete .cline/mcp.json route");
    }
    requireContains(".clineignore", /agent-surface canonical AI-tool ignore baseline/);
  } else if (target === "kilo") {
    requirePath(path.join(".kilo", "skills", "ops-flow", "SKILL.md"));
    requirePath(path.join(".config", "kilo", "commands", "ops-nuke.md"));
    requireContains(path.join(".config", "kilo", "agents", "boss.md"), /^---\ndescription: "/);
    requireContains(path.join(".config", "kilo", "kilo.jsonc"), /"\.\/rules\/00-precedence-and-safety\.md"/);
    requireContains(path.join(".config", "kilo", "rules", "00-precedence-and-safety.md"), /Precedence and Safety/);
    requireContains(path.join(".config", "kilo", "references", "rules", "10-python.md"), /Scoped agent-surface reference/);
    if (byPath.has(path.join(".config", "kilo", "AGENTS.md"))) {
      errors.push("Kilo must not emit AGENTS.md when kilo.jsonc instruction rules are generated");
    }
    requireContains(".kilocodeignore", /agent-surface canonical AI-tool ignore baseline/);
  } else if (target === "kimi-code") {
    requireContains(path.join("skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\ndescription: "[^"]+"\n---\n/);
    requireNotContains(path.join("skills", "ops-flow", "SKILL.md"), /disableModelInvocation/);
    requireContains(path.join("skills", "ops-nuke", "SKILL.md"), /type: flow\ndisableModelInvocation: true/);
    requireContains("AGENTS.md", /agent-surface Kimi Code rules/);
    requireContains(path.join("agents", "boss.md"), /^---\nname: boss\n/);
    requireContains(path.join("agents", "boss.md"), /^ {2}- "Read"$/m);
    requireContains(path.join("agents", "worker.md"), /^ {2}- "\*"$/m);
    requireContains("config.toml", /^default_permission_mode = "auto"$/m);
    requireContains("config.toml", /^merge_all_available_skills = true$/m);
    const mcp = requireJson("mcp.json");
    if (mcp && mcp.mcpServers?.synapse?.command !== "~/.local/bin/synapse-bridge") {
      errors.push("Kimi Code synapse MCP must use the first-party local bridge binary");
    }
    if (mcp?.mcpServers?.synapse && Object.hasOwn(mcp.mcpServers.synapse, "type")) {
      errors.push("Kimi Code MCP entries must let the runtime infer stdio transport");
    }
  } else if (target === "qoder") {
    requireContains(path.join(".qoder", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join(".qoder", "commands", "ops-nuke.md"), /^---\nname: ops-nuke\n/);
    requireContains(path.join(".qoder", "AGENTS.md"), /agent-surface Qoder rules/);
    requireContains(path.join(".qoder", "agents", "boss.md"), /^---\nname: boss\n/);
    const settings = requireJson(path.join(".qoder", "settings.json"));
    if (settings?.general?.defaultPermissionMode !== "bypass_permissions") {
      errors.push("Qoder must default to bypass_permissions");
    }
    if (settings?.mcpServers?.synapse && Object.hasOwn(settings.mcpServers.synapse, "type")) {
      errors.push("Qoder stdio MCP entries must omit type");
    }
  } else if (target === "qwen-code") {
    requireContains(path.join(".qwen", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join(".qwen", "commands", "ops-nuke.md"), /^---\ndescription: "/);
    requireContains(path.join(".qwen", "QWEN.md"), /agent-surface Qwen Code rules/);
    requireContains(path.join(".qwen", "agents", "boss.md"), /^---\nname: boss\n/);
    const settings = requireJson(path.join(".qwen", "settings.json"));
    if (settings?.tools?.approvalMode !== "yolo") errors.push("Qwen Code must default to yolo approval mode");
    if (settings?.mcpServers?.synapse && Object.hasOwn(settings.mcpServers.synapse, "type")) {
      errors.push("Qwen Code stdio MCP entries must omit type");
    }
  } else if (target === "kiro") {
    requireContains(path.join(".kiro", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join(".kiro", "steering", "command-ops-nuke.md"), /^---\ninclusion: manual\n---/);
    requireContains(path.join(".kiro", "steering", "00-precedence-and-safety.md"), /^---\ninclusion: always\n---/);
    requireContains(path.join(".kiro", "agents", "boss.md"), /^---\nname: boss\n/);
    requireContains(path.join(".kiro", "agents", "boss.md"), /file:\/\/~\/\.kiro\/steering\/\*\*\/\*\.md/);
    requireContains(path.join(".kiro", "settings", "permissions.yaml"), /^rules:\n  - capability: all\n    effect: allow\n$/);
    const mcp = requireJson(path.join(".kiro", "settings", "mcp.json"));
    if (mcp?.mcpServers?.synapse && Object.hasOwn(mcp.mcpServers.synapse, "type")) {
      errors.push("Kiro stdio MCP entries must omit type");
    }
  } else if (target === "antigravity") {
    requireContains(path.join("config", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join("antigravity", "global_workflows", "ops-nuke.md"), /^---\ndescription: "/);
  } else if (target === "antigravity-cli") {
    const plugin = requireJson(path.join("antigravity-cli", "plugins", "agent-surface", "plugin.json"));
    if (plugin && plugin.name !== "agent-surface") errors.push("Antigravity CLI plugin name must be agent-surface");
    requireContains(path.join("antigravity-cli", "plugins", "agent-surface", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join("antigravity-cli", "plugins", "agent-surface", "agents", "boss.md"), /^---\nname: boss\n/);
    requireContains(path.join("antigravity-cli", "plugins", "agent-surface", "rules", "00-precedence-and-safety.md"), /Antigravity CLI plugin rule/);
    // Antigravity CLI documents slash invocation; the generic renderer's `$name` default is Codex's.
    requireContains(path.join("antigravity-cli", "plugins", "agent-surface", "skills", "ops-nuke", "SKILL.md"), /Use explicit invocation: `\/ops-nuke`\./);
    requirePath(path.join("antigravity-cli", "plugins", "agent-surface", "references", "rules", "10-python.md"));
  } else if (target === "cursor") {
    requirePath(path.join(".cursor", "skills", "ops-flow", "SKILL.md"));
    requirePath(path.join(".cursor", "commands", "ops-nuke.md"));
    requireContains(path.join(".cursor", "agents", "boss.md"), /^---\nname: boss\n/);
    requirePath(path.join(".cursor", "rules", "00-precedence-and-safety.mdc"));
    requireContains(".cursorignore", /agent-surface canonical AI-tool ignore baseline/);
  } else if (target === "droid") {
    requirePath(path.join(".factory", "skills", "ops-flow", "SKILL.md"));
    requirePath(path.join(".factory", "commands", "ops-nuke.md"));
    requireContains(path.join(".factory", "droids", "boss.md"), /^---\nname: boss\n/);
    requireContains(path.join(".factory", "AGENTS.md"), /agent-surface Droid rules/);
    const mcp = requireJson(path.join(".factory", "mcp.json"));
    if (mcp && mcp.mcpServers?.synapse?.command !== "~/.local/bin/synapse-bridge") {
      errors.push("Droid synapse MCP must use the first-party local bridge binary");
    }
    if (mcp && mcp.mcpServers?.grimoire?.command !== "~/.local/bin/grimoire-server") {
      errors.push("Droid grimoire MCP must use the first-party local server binary");
    }
  } else if (target === "copilot") {
    const userRoot = vsCodeUserRoot("Code", { scope: "user" });
    requirePath(path.join(".copilot", "skills", "ops-flow", "SKILL.md"));
    // Copilot CLI documents slash invocation, so its manual skills must not print Codex's `$name`.
    requireContains(path.join(".copilot", "skills", "ops-nuke", "SKILL.md"), /Use explicit invocation: `\/ops-nuke`\./);
    requireContains(path.join(".copilot", "copilot-instructions.md"), /agent-surface GitHub Copilot instructions/);
    requireContains(path.join(".copilot", "agents", "boss.agent.md"), /^---\nname: boss\n/);
    const mcp = requireJson(path.join(".copilot", "mcp-config.json"));
    if (mcp?.mcpServers?.synapse?.type !== "stdio") {
      errors.push("Copilot CLI stdio MCP entries must use the standard stdio type");
    }
    requireContains(path.join(userRoot, "instructions", "agent-surface-copilot.instructions.md"), /^---\ndescription: "agent-surface Copilot global instructions"\napplyTo: "\*\*"/);
  } else if (target === "vscode") {
    const userRoot = vsCodeUserRoot("Code", { scope: "user" });
    requirePath(path.join(".agents", "skills", "ops-flow", "SKILL.md"));
    requireContains(path.join(userRoot, "instructions", "agent-surface.instructions.md"), /^---\ndescription: "agent-surface VS Code instructions"\napplyTo: "\*\*"/);
    // Manual workflows reach VS Code as explicit-only Agent Skills, not prompt files: 1.116 does not
    // load prompt files in Agent Host sessions, and `disable-model-invocation` is how it is told to
    // keep a skill manual. The absent-path assertion is the point — a prompt file here would mean
    // the dead route came back. This asserts what is GENERATED; discovery and invocation by a live
    // VS Code session are a separate claim and are not established by this check.
    requireContains(path.join(".agents", "skills", "ops-nuke", "SKILL.md"), /disable-model-invocation: true/);
    requireAbsent(path.join(userRoot, "prompts", "ops-nuke.md"));
  } else if (target === "opencode") {
    requireContains(path.join(".config", "opencode", "AGENTS.md"), /agent-surface global OpenCode rules/);
    requirePath(path.join(".config", "opencode", "skills", "ops-flow", "SKILL.md"));
    requirePath(path.join(".config", "opencode", "commands", "ops-nuke.md"));
    requireContains(path.join(".config", "opencode", "agents", "boss.md"), /^---\ndescription: "/);
  } else if (target === "trae") {
    requireContains(path.join(".trae", "user_rules.md"), /agent-surface Trae user rules/);
    requirePath(path.join(".trae", "skills", "ops-flow", "SKILL.md"));
    requireContains(path.join(".trae-cn", "agents", "boss.md"), /^---\nname: boss\n/);
    requireContains(path.join(".trae", "traecli.toml"), /^approval_policy = "never"$/m);
    requireContains(path.join(".trae", "traecli.toml"), /^default_permissions = ":danger-full-access"$/m);
    requireContains(path.join(".trae", "traecli.toml"), /^\[mcp_servers\.synapse\]$/m);
  } else if (target === "windsurf") {
    requirePath(path.join(".codeium", "windsurf", "skills", "ops-flow", "SKILL.md"));
    requirePath(path.join(".codeium", "windsurf", "global_workflows", "ops-nuke.md"));
    requireContains(path.join(".codeium", "windsurf", "memories", "global_rules.md"), /agent-surface Windsurf rules/);
    requireContains(path.join(".codeium", "windsurf", "skills", "ctf-osint", "SKILL.md"), skillFrontmatter);
  } else if (target === "zed") {
    requireContains(path.join(".agents", "skills", "ops-flow", "SKILL.md"), /^---\nname: ops-flow\n/);
    requireContains(path.join(".config", "zed", "AGENTS.md"), /agent-surface Zed rules/);
    requireContains(path.join(".agents", "skills", "redteam-boundary-policy", "SKILL.md"), skillFrontmatter);
  } else if (target === "codex-plugin") {
    // An exported package is only portable if its manifest is VALID. `$schema` is a required const
    // in the published manifest schema, and a host that validates on install rejects a manifest
    // without it — the defect this check exists to keep from recurring. Emitting a host-specific
    // manifest copy instead of a valid portable one is how that mistake gets papered over, so the
    // retired overlay path is asserted absent rather than merely left unwritten.
    const manifest = requireJson(path.join("plugins", CODEX_PLUGIN_NAME, "plugin.json"));
    if (manifest && manifest.$schema !== CODEX_PLUGIN_SCHEMA) {
      errors.push(`portable plugin manifest must declare ${CODEX_PLUGIN_SCHEMA}`);
    }
    if (manifest && manifest.name !== CODEX_PLUGIN_NAME) errors.push(`portable plugin manifest name must be ${CODEX_PLUGIN_NAME}`);
    requireAbsent(path.join("plugins", CODEX_PLUGIN_NAME, ".codex-plugin", "plugin.json"));
    const marketplace = requireJson(path.join(".agents", "plugins", "marketplace.json"));
    if (marketplace && marketplace.plugins?.[0]?.source !== `./plugins/${CODEX_PLUGIN_NAME}`) {
      errors.push("marketplace manifest must point at the packaged plugin directory, relative to the marketplace root");
    }
  }

  return errors;
}

export async function validateWorkflowJson(file, validate, errors) {
  if (!(await exists(file))) return;
  await readWorkflowJson(file, validate, errors);
}

export async function validateWorkflowPatchManifests(runDir, validate, errors) {
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

export function outputSourceKindError(output, sourceKindsConfig) {
  if (!output.sourceKind) return `output ${output.relativeOutput} has no source kind`;
  if (!sourceKindPolicy(sourceKindsConfig, output.sourceKind)) {
    return `output ${output.relativeOutput} has unknown source kind: ${output.sourceKind}`;
  }
  return null;
}

export function requireKnownSourceKind(output, sourceKindsConfig, errors) {
  const error = outputSourceKindError(output, sourceKindsConfig);
  if (error) errors.push(error);
}

export function collectCommandReferenceFindings(commands, errors) {
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

export function collectRuleReferenceFindings(rule, commandNames, errors, warnings) {
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
      warnings.push(`${rule.file}: procedure reference not present in skills/ or commands/: ${match[1]}`);
    }
  }
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

export function commandReferences(text) {
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

export function isCommandLikeReference(name, names, aliases) {
  if (names.has(name) || aliases.has(name)) return true;
  if (!name.includes("-")) return false;
  return commandPrefixes.has(name.split("-")[0]);
}
