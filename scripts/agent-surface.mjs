#!/usr/bin/env node

import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commandMetadataFields = new Set(["name", "aliases", "phase", "risk", "packs", "default_export", "approval_classes", "description"]);
const commandPhases = new Set(["observe", "decide", "build", "verify", "review", "arbitrate", "ship", "improve", "bootstrap", "game", "misc"]);
const commandRisks = new Set(["safe", "writes", "destructive", "security-sensitive", "deception-risk", "deployment"]);
const commandApprovalClasses = new Set(["network", "filesystem_destructive", "deployment", "database_mutation"]);

const targets = {
  cline: {
    label: "Cline workflows",
    outputRoot: ".clinerules/workflows",
    render: renderClineWorkflow,
    installRoot: installRootProjectOnly,
    installOutputRoot: ".clinerules/workflows",
  },
  antigravity: {
    label: "Antigravity workflows",
    outputRoot: "global_workflows",
    render: renderAntigravityWorkflow,
    installRoot: installRootAntigravity,
    installOutputRoot: "global_workflows",
  },
  "gemini-cli": {
    label: "Gemini CLI commands",
    outputRoot: ".gemini/commands",
    render: renderGeminiCommand,
    installRoot: installRootGemini,
    installOutputRoot: ".gemini/commands",
    outputName: geminiCommandOutputName,
  },
};

const ruleScenarios = {
  "generic-chat": {
    paths: [],
    targetTokens: 3000,
    hardTokens: 3500,
  },
  "python-source": {
    paths: ["src/example.py"],
    targetTokens: 6000,
    hardTokens: 7000,
  },
  "python-tooling": {
    paths: ["pyproject.toml"],
    targetTokens: 6000,
    hardTokens: 7000,
  },
  "rust-source": {
    paths: ["src/lib.rs"],
    targetTokens: 6000,
    hardTokens: 7000,
  },
  "go-ci": {
    paths: [".golangci.yml"],
    targetTokens: 6000,
    hardTokens: 7000,
  },
  "typescript-eslint": {
    paths: ["eslint.config.mjs"],
    targetTokens: 6000,
    hardTokens: 7000,
  },
  "shell-script": {
    paths: ["scripts/deploy.sh"],
    targetTokens: 6000,
    hardTokens: 7000,
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
];

const registrySchemaFiles = [
  { schema: "targets.schema.json", file: "registry/targets.json" },
  { schema: "artifacts.schema.json", file: "registry/artifacts.json" },
];

const workflowFixtureFiles = [
  { schema: "workflow.run.schema.json", file: "tests/fixtures/workflow/run.json" },
  { schema: "workflow.boss.schema.json", file: "tests/fixtures/workflow/boss-chore.json" },
  { schema: "workflow.worker.schema.json", file: "tests/fixtures/workflow/worker-chore.json" },
  { schema: "workflow.worker.schema.json", file: "tests/fixtures/workflow/worker-refactor.json" },
  { schema: "workflow.reviewer.schema.json", file: "tests/fixtures/workflow/reviewer-refactor.json" },
  { schema: "workflow.judger.schema.json", file: "tests/fixtures/workflow/judger-close.json" },
  { schema: "workflow.rescue.schema.json", file: "tests/fixtures/workflow/rescue-refactor.json" },
  { schema: "workflow.event.schema.json", file: "tests/fixtures/workflow/event.json" },
  { schema: "workflow.current.schema.json", file: "tests/fixtures/workflow/current.json" },
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

  if (command === "check") {
    if (args[0] === "rules") {
      await checkRules(args.slice(1));
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
  agent-surface check
  agent-surface check rules [--scenario <name>]
  agent-surface build --target <cline|antigravity|gemini-cli|all> [--pack default|all|<pack>] [--dry-run]
  agent-surface install --target <cline|antigravity|gemini-cli> [--pack default|all|<pack>] [--scope project|user] [--dest <path>] [--allow-scope-root] [--dry-run]
  agent-surface run --task <id> --class <class> --timeout <ms> --out <dir> -- <command...>
  agent-surface workflow doctor --run <run_id>
  agent-surface workflow apply --role <role> --run <run_id> --artifact <path>
  agent-surface workflow patch begin --run <run_id> --round <n> --task <id> --file <path> [--file <path>...]
  agent-surface workflow patch end --run <run_id> --round <n> --task <id>
  agent-surface workflow patch verify --run <run_id> --round <n> --task <id>
  agent-surface doctor
`);
}

async function inventory() {
  const counts = {
    rules: (await files("rules", [".md", ".mdc"])).length,
    commands: (await files("commands", [".md"])).length,
    skills: (await files("skills", [".md"])).length,
    subagents: (await files("subagents", [".md"])).length,
    hooks: (await files("hooks", [".md", ".json", ".js", ".mjs", ".sh"])).length,
    mcps: (await files("mcps", [".json", ".toml", ".yaml", ".yml"])).length,
    settings: (await files("settings", [".json", ".toml", ".yaml", ".yml"])).length,
    ignores: (await files("ignores", [".gitignore", ".clineignore", ".md", ".txt"])).length,
    plugins: (await files("plugins", [".json", ".md", ".toml", ".yaml", ".yml"])).length,
    schemas: (await files("schemas", [".json"])).length,
  };

  for (const [type, count] of Object.entries(counts)) {
    console.log(`${type}: ${count}`);
  }
}

async function check() {
  const errors = [];
  const commands = await readCommands();
  const commandFiles = commands.map((command) => command.file);
  const ruleFiles = await files("rules", [".md", ".mdc"]);
  const targetsConfig = JSON.parse(await readFile(path.join(root, "registry", "targets.json"), "utf8"));
  const artifactsConfig = JSON.parse(await readFile(path.join(root, "registry", "artifacts.json"), "utf8"));
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
  }

  for (const name of Object.keys(targets)) {
    if (!targetsConfig.in_scope[name]?.build_supported) {
      errors.push(`CLI build target is not marked build_supported in registry: ${name}`);
    }
  }

  for (const sourceType of artifactsConfig.source_types) {
    if (!(await exists(path.join(root, sourceType)))) {
      errors.push(`source type directory missing: ${sourceType}`);
    }
  }

  if (await exists(path.join(root, "commands", "ops-server.md"))) {
    errors.push("commands/ops-server.md is local/private and must not be imported");
  }

  await checkWorkflowSchemas(errors);
  await checkRegistrySchemas(errors);
  checkCommandMetadata(commands, errors);

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("check: ok");
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
  }
}

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

async function build(args) {
  const target = argValue(args, "--target") ?? "all";
  const pack = argValue(args, "--pack") ?? "default";
  const dryRun = args.includes("--dry-run");
  const selected = target === "all" ? Object.keys(targets) : [target];
  const commandFiles = await exportableCommands(pack);

  for (const item of selected) {
    if (!isSafeTargetName(item)) fail(`unsafe build target: ${item}`);
    if (!Object.hasOwn(targets, item)) fail(`unsupported build target: ${item}`);
  }

  if (!dryRun) {
    await rm(path.join(root, "dist", target === "all" ? "" : target), { recursive: true, force: true });
  }

  for (const item of selected) {
    const adapter = targets[item];

    const outputDir = path.join(root, "dist", item, adapter.outputRoot);
    let count = 0;

    for (const source of commandFiles) {
      const rendered = await adapter.render(source);
      const outputName = adapter.outputName ? adapter.outputName(source) : path.basename(source.file);
      const targetPath = path.join(outputDir, outputName);
      count += 1;

      if (dryRun) {
        console.log(`[dry-run] ${adapter.label}: ${source.relativePath} -> ${relative(targetPath)}`);
        continue;
      }

      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, rendered);
    }

    console.log(`${item}: ${count} command sources rendered (pack: ${pack})${dryRun ? " (dry-run)" : ""}`);
  }
}

async function install(args) {
  const target = requiredArgValue(args, "--target");
  const pack = argValue(args, "--pack") ?? "default";
  const scope = argValue(args, "--scope") ?? "project";
  const dryRun = args.includes("--dry-run");
  const allowScopeRoot = args.includes("--allow-scope-root");
  const dest = argValue(args, "--dest");
  const adapter = targets[target];

  if (!adapter) fail(`unsupported install target: ${target}`);
  if (!["project", "user"].includes(scope)) fail(`unsupported install scope: ${scope}`);
  if (!dryRun && !dest && !allowScopeRoot) {
    fail("live install requires explicit --dest or --allow-scope-root after reviewing --dry-run");
  }

  const installRoot = dest ? path.resolve(dest) : adapter.installRoot(scope);
  if (installRoot === path.parse(installRoot).root) fail("install root cannot be filesystem root");
  const plan = await installPlan(target, adapter, installRoot, scope, pack, dest ? "explicit --dest" : "scope-derived root");

  printInstallPlan(plan);
  if (plan.blocked.length > 0) {
    process.exitCode = 1;
    return;
  }

  if (!dryRun) {
    await applyInstallPlan(plan);
  }
}

async function installPlan(target, adapter, installRoot, scope, pack, rootSource) {
  const commandFiles = await exportableCommands(pack);
  const version = await packageVersion();
  const generatedAt = new Date().toISOString();
  const manifestPath = path.join(installRoot, ".agent-surface", `${target}-manifest.json`);
  const previousManifest = await readJsonIfExists(manifestPath);
  const writes = [];
  const managed = [];
  const blocked = [];

  for (const source of commandFiles) {
    const rendered = await adapter.render(source);
    const outputName = adapter.outputName ? adapter.outputName(source) : path.basename(source.file);
    const output = path.join(installRoot, adapter.installOutputRoot, outputName);
    const relativeOutput = path.relative(installRoot, output);
    const hash = sha256(rendered);
    if (!isSafeRelativePath(relativeOutput)) {
      blocked.push(`unsafe output path: ${relativeOutput}`);
      continue;
    }

    writes.push({ source: source.relativePath, output, relativeOutput, content: rendered, sha256: hash });
    managed.push({
      target,
      pack,
      scope,
      source: source.relativePath,
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

    const previous = previousManaged.get(item.relativeOutput);
    if (!previous) {
      blocked.push(`unmanaged existing file: ${item.relativeOutput}`);
      item.action = "blocked";
      continue;
    }

    if (!previous.sha256 || previous.sha256 !== currentHash) {
      blocked.push(`managed file changed since manifest: ${item.relativeOutput}`);
      item.action = "blocked";
      continue;
    }

    item.action = "overwrite";
  }

  const liveOutputs = new Set(managed.map((item) => item.output));
  const staleManaged = Array.isArray(previousManifest?.managed)
    ? previousManifest.managed
      .filter((item) => item?.managed_by === "agent-surface")
      .filter((item) => item?.target === target)
      .filter((item) => typeof item.output === "string")
      .filter((item) => !liveOutputs.has(item.output))
      .sort((left, right) => left.output.localeCompare(right.output))
    : [];
  const staleRemovals = staleManaged.map((item) => item.output);
  const staleRemovalActions = [];

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

    const currentHash = sha256(current);
    if (!item.sha256 || item.sha256 !== currentHash) {
      blocked.push(`stale managed file changed since manifest: ${item.output}`);
      staleRemovalActions.push({ output, relativeOutput: item.output, action: "blocked" });
      continue;
    }

    staleRemovalActions.push({ output, relativeOutput: item.output, action: "remove" });
  }

  const manifest = {
    target,
    pack,
    scope,
    generated_at: generatedAt,
    managed,
  };

  return {
    target,
    pack,
    scope,
    rootSource,
    installRoot,
    manifestPath,
    generatedAt,
    writes,
    staleRemovals,
    staleRemovalActions,
    blocked,
    manifest,
  };
}

function printInstallPlan(plan) {
  console.log(`target: ${plan.target}`);
  console.log(`pack: ${plan.pack}`);
  console.log(`scope: ${plan.scope}`);
  console.log(`root source: ${plan.rootSource}`);
  console.log(`root: ${plan.installRoot}`);
  console.log("planned writes:");
  for (const item of plan.writes) {
    console.log(`  ${path.relative(plan.installRoot, item.output)} <- ${item.source}`);
  }
  console.log("planned stale managed removals:");
  if (plan.staleRemovals.length === 0) {
    console.log("  none");
  } else {
    for (const item of plan.staleRemovals) console.log(`  ${item}`);
  }
  console.log("planned manifest:");
  console.log(`  ${path.relative(plan.installRoot, plan.manifestPath)}`);
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
  let backups = 0;

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
    if (item.action !== "remove") continue;
    await backupExisting(plan.installRoot, backupRoot, item.output);
    backups += 1;
    await rm(item.output, { force: true });
    removed += 1;
  }

  if (await exists(plan.manifestPath)) {
    await backupExisting(plan.installRoot, backupRoot, plan.manifestPath);
    backups += 1;
  }

  await mkdir(path.dirname(plan.manifestPath), { recursive: true });
  await writeFile(plan.manifestPath, `${JSON.stringify(plan.manifest, null, 2)}\n`);

  console.log("installed:");
  console.log(`  wrote: ${written}`);
  console.log(`  skipped unchanged: ${skipped}`);
  console.log(`  removed stale: ${removed}`);
  console.log(`  backups: ${backups === 0 ? "none" : path.relative(plan.installRoot, backupRoot)}`);
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
  checks.push(["gemini", commandVersion("gemini", ["--version"])]);
  checks.push(["claude", commandVersion("claude", ["--version"])]);
  checks.push(["codex", commandVersion("codex", ["--version"])]);
  checks.push(["opencode", commandVersion("opencode", ["--version"])]);
  checks.push(["gh", commandVersion("gh", ["--version"])]);

  for (const [name, result] of checks) {
    console.log(`${name}: ${result}`);
  }
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

  await validateWorkflowJson(path.join(runDir, "run.json"), schemas.get("workflow.run.schema.json"), errors);
  for (const [file, schemaName] of [
    ["boss.json", "workflow.boss.schema.json"],
    ["worker.json", "workflow.worker.schema.json"],
    ["reviewer.json", "workflow.reviewer.schema.json"],
    ["judger.json", "workflow.judger.schema.json"],
    ["rescue.json", "workflow.rescue.schema.json"],
  ]) {
    const artifact = path.join(runDir, file);
    if (await exists(artifact)) await validateWorkflowJson(artifact, schemas.get(schemaName), errors);
  }

  const eventsPath = path.join(runDir, "events.ndjson");
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
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`workflow doctor: ok (${path.relative(process.cwd(), runDir)})`);
}

async function workflowApply(args) {
  const role = requiredArgValue(args, "--role");
  const runId = requiredSafeId(args, "--run");
  const artifactArg = requiredArgValue(args, "--artifact");
  const runDir = workflowRunDir(runId);
  const artifactPath = path.resolve(artifactArg);
  const roleSchemas = {
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
    from: "REVIEWING",
    to: nextCommand ?? null,
    artifact: path.relative(runDir, artifactPath),
    artifact_hash: artifactHash,
    timestamp: new Date().toISOString(),
    summary: `Applied ${role} state update.`,
  });
  await writeFile(path.join(process.cwd(), ".agent-surface", "workflows", "current.json"), `${JSON.stringify({
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

async function renderGeminiCommand(source) {
  const body = source.body;
  const description = tomlString(source.metadata.description ?? firstHeading(body) ?? `Run ${source.name.replaceAll("-", " ")}.`);
  const prompt = tomlMultilineString(body);
  return `description = "${description}"\n\nprompt = ${prompt}\n`;
}

function geminiCommandOutputName(source) {
  const basename = source.name;
  const [category, ...rest] = basename.split("-");
  return path.join(category, `${rest.join("-") || category}.toml`);
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
    risk: "safe",
    packs: ["default"],
    default_export: true,
    approval_classes: [],
    description: null,
  };
  const frontmatterErrors = [];
  let body = text;

  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---\n", 4);
    if (end === -1) {
      frontmatterErrors.push("frontmatter not closed");
    } else {
      const parsed = parseSimpleFrontmatter(text.slice(4, end), frontmatterErrors);
      Object.assign(metadata, parsed);
      body = text.slice(end + 5).replace(/^\s+/, "");
    }
  }

  metadata.name ??= name;
  metadata.aliases ??= [];
  metadata.packs ??= metadata.default_export === false ? [] : ["default"];
  metadata.approval_classes ??= [];
  metadata.default_export ??= true;

  return {
    file,
    relativePath: relative(file),
    name,
    body,
    metadata,
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

async function exportableCommands(pack) {
  if (!isSafeTargetName(pack)) fail(`unsafe command pack: ${pack}`);
  const commands = await readCommands();
  const errors = [];
  checkCommandMetadata(commands, errors);
  if (errors.length > 0) fail(`command metadata invalid:\n${errors.join("\n")}`);
  const packs = commandPacks(commands);
  if (!packs.has(pack)) fail(`unknown command pack: ${pack}`);
  return commands.filter((command) => commandInPack(command, pack));
}

function commandInPack(command, pack) {
  if (pack === "all") return true;
  if (pack === "default") return command.metadata.default_export !== false;
  return command.metadata.default_export !== false || command.metadata.packs.includes(pack);
}

function commandPacks(commands) {
  const packs = new Set(["default", "all"]);
  for (const command of commands) {
    for (const pack of command.metadata.packs) packs.add(pack);
  }
  return packs;
}

function checkCommandMetadata(commands, errors) {
  const names = new Set();
  for (const command of commands) {
    for (const error of command.frontmatterErrors) errors.push(`${command.relativePath}: ${error}`);
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
    if (!commandRisks.has(command.metadata.risk)) errors.push(`${command.relativePath}: unsupported risk: ${command.metadata.risk}`);
    if (typeof command.metadata.default_export !== "boolean") errors.push(`${command.relativePath}: default_export must be boolean`);
    if (command.metadata.description !== null && typeof command.metadata.description !== "string") {
      errors.push(`${command.relativePath}: description must be a string`);
    }
    if (!Array.isArray(command.metadata.packs)) errors.push(`${command.relativePath}: packs must be an array`);
    if (!Array.isArray(command.metadata.approval_classes)) errors.push(`${command.relativePath}: approval_classes must be an array`);
    for (const pack of command.metadata.packs ?? []) {
      if (!isSafeTargetName(pack)) errors.push(`${command.relativePath}: unsafe pack name: ${pack}`);
    }
    for (const alias of command.metadata.aliases ?? []) {
      if (!isSafeTargetName(alias)) errors.push(`${command.relativePath}: unsafe alias: ${alias}`);
    }
    for (const approvalClass of command.metadata.approval_classes ?? []) {
      if (!commandApprovalClasses.has(approvalClass)) errors.push(`${command.relativePath}: unsupported approval class: ${approvalClass}`);
    }
    if (command.metadata.default_export === false && command.metadata.packs.includes("default")) {
      errors.push(`${command.relativePath}: default_export false cannot include default pack`);
    }
    if (command.metadata.default_export === false && command.metadata.packs.length === 0) {
      errors.push(`${command.relativePath}: quarantined command must declare at least one non-default pack`);
    }
  }
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
  } catch {
    return false;
  }
}

async function readJsonIfExists(file) {
  if (!(await exists(file))) return null;
  return JSON.parse(await readFile(file, "utf8"));
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

function approximateTokens(text) {
  return Math.ceil(text.length / 4);
}

function firstHeading(text) {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^#\s+(.+?)\s*$/);
    if (match) return match[1];
  }
  return null;
}

function yamlString(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replace(/\s+/g, " ").trim();
}

function tomlString(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replace(/\s+/g, " ").trim();
}

function tomlMultilineString(value) {
  if (!value.includes("'''")) return `'''${value}'''`;
  return JSON.stringify(value);
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

function installRootProjectOnly(scope) {
  if (scope !== "project") fail("this target supports --scope project only unless --dest is supplied");
  return process.cwd();
}

function installRootGemini(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

function installRootAntigravity(scope) {
  if (scope !== "user") fail("antigravity install supports --scope user only unless --dest is supplied");
  return path.join(os.homedir(), ".gemini", "antigravity");
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
