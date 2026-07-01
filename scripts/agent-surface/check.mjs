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
import { directDirectories, directories, files, filesUnder } from "./fs-tree.mjs";
import { readFileIfExists } from "./io.mjs";
import { readOptionalServices, readSourceKinds, relative, root } from "./registry.mjs";
import { gitStagedGitlinkMap, gitSubmoduleStatusMap } from "./proc.mjs";
import { readRules } from "./rules.mjs";
import { subagentValidationErrors } from "./source-primitives.mjs";
import { generatedOutputMinimums, producerEmitsFor, sourceKindPolicy, targetOutputs, targetProducers, targets } from "./targets.mjs";
import { argValue, exists, fail, globMatches, isPathInside, isSafeTargetName, sha256 } from "./util.mjs";

export const commandMetadataFields = new Set(["name", "aliases", "phase", "description"]);

export const commandPrefixes = new Set(["arch", "boot", "dev", "lint", "ops", "qa", "ship", "stellaris", "verify", "workflow"]);

export const commandPhases = new Set(["observe", "decide", "build", "verify", "review", "arbitrate", "ship", "improve", "bootstrap", "game", "misc"]);

export const workflowSchemaFiles = [
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

export const registrySchemaFiles = [
  { schema: "targets.schema.json", file: "registry/targets.json" },
  { schema: "target-capabilities.schema.json", file: "registry/target-capabilities.json" },
  { schema: "artifacts.schema.json", file: "registry/artifacts.json" },
  { schema: "source-kinds.schema.json", file: "registry/source-kinds.json" },
  { schema: "optional-services.schema.json", file: "registry/optional-services.json" },
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
  const commands = await readCommands();
  const errors = [];
  checkCommandMetadata(commands, errors);
  if (errors.length > 0) fail(`command metadata invalid:\n${errors.join("\n")}`);
  return commands;
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

export async function checkCommands(_args) {
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
      warnings.push(`${rule.file}: command reference not present in commands/: ${match[1]}`);
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
