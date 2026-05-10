#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  agent-surface build --target <cline|antigravity|gemini-cli|all> [--dry-run]
  agent-surface install --target <cline|antigravity|gemini-cli> [--scope project|user] [--dest <path>] [--allow-scope-root] [--dry-run]
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
  };

  for (const [type, count] of Object.entries(counts)) {
    console.log(`${type}: ${count}`);
  }
}

async function check() {
  const errors = [];
  const commandFiles = await files("commands", [".md"]);
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
  }

  for (const sourceType of artifactsConfig.source_types) {
    if (!(await exists(path.join(root, sourceType)))) {
      errors.push(`source type directory missing: ${sourceType}`);
    }
  }

  if (await exists(path.join(root, "commands", "ops-server.md"))) {
    errors.push("commands/ops-server.md is local/private and must not be imported");
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("check: ok");
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
  const dryRun = args.includes("--dry-run");
  const selected = target === "all" ? Object.keys(targets) : [target];
  const commandFiles = await files("commands", [".md"]);

  if (!dryRun) {
    await rm(path.join(root, "dist", target === "all" ? "" : target), { recursive: true, force: true });
  }

  for (const item of selected) {
    const adapter = targets[item];
    if (!adapter) fail(`unsupported build target: ${item}`);

    const outputDir = path.join(root, "dist", item, adapter.outputRoot);
    let count = 0;

    for (const source of commandFiles) {
      const rendered = await adapter.render(source);
      const outputName = adapter.outputName ? adapter.outputName(source) : path.basename(source);
      const targetPath = path.join(outputDir, outputName);
      count += 1;

      if (dryRun) {
        console.log(`[dry-run] ${adapter.label}: ${relative(source)} -> ${relative(targetPath)}`);
        continue;
      }

      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, rendered);
    }

    console.log(`${item}: ${count} command sources rendered${dryRun ? " (dry-run)" : ""}`);
  }
}

async function install(args) {
  const target = requiredArgValue(args, "--target");
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
  const plan = await installPlan(target, adapter, installRoot, scope, dest ? "explicit --dest" : "scope-derived root");

  printInstallPlan(plan);
  if (plan.blocked.length > 0) {
    process.exitCode = 1;
    return;
  }

  if (!dryRun) {
    await applyInstallPlan(plan);
  }
}

async function installPlan(target, adapter, installRoot, scope, rootSource) {
  const commandFiles = await files("commands", [".md"]);
  const version = await packageVersion();
  const generatedAt = new Date().toISOString();
  const manifestPath = path.join(installRoot, ".agent-surface", `${target}-manifest.json`);
  const previousManifest = await readJsonIfExists(manifestPath);
  const writes = [];
  const managed = [];
  const blocked = [];

  for (const source of commandFiles) {
    const rendered = await adapter.render(source);
    const outputName = adapter.outputName ? adapter.outputName(source) : path.basename(source);
    const output = path.join(installRoot, adapter.installOutputRoot, outputName);
    const relativeOutput = path.relative(installRoot, output);
    const hash = sha256(rendered);
    if (!isSafeRelativePath(relativeOutput)) {
      blocked.push(`unsafe output path: ${relativeOutput}`);
      continue;
    }

    writes.push({ source: relative(source), output, relativeOutput, content: rendered, sha256: hash });
    managed.push({
      target,
      scope,
      source: relative(source),
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
    scope,
    generated_at: generatedAt,
    managed,
  };

  return {
    target,
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

async function renderClineWorkflow(source) {
  return readFile(source, "utf8");
}

async function renderAntigravityWorkflow(source) {
  const body = await readFile(source, "utf8");
  const description = yamlString(firstHeading(body) ?? `Run ${path.basename(source, ".md").replaceAll("-", " ")}.`);

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
  const body = await readFile(source, "utf8");
  const description = tomlString(firstHeading(body) ?? `Run ${path.basename(source, ".md").replaceAll("-", " ")}.`);
  const prompt = tomlMultilineString(body);
  return `description = "${description}"\n\nprompt = ${prompt}\n`;
}

function geminiCommandOutputName(source) {
  const basename = path.basename(source, ".md");
  const [category, ...rest] = basename.split("-");
  return path.join(category, `${rest.join("-") || category}.toml`);
}

async function files(dir, extensions) {
  const base = path.join(root, dir);
  if (!(await exists(base))) return [];

  const entries = await readdir(base, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(base, entry.name))
    .filter((file) => extensions.includes(path.extname(file)) || extensions.includes(path.basename(file)))
    .sort();
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
  return `"""${value.replaceAll('"""', '\\"\\"\\"')}"""`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isSafeRelativePath(file) {
  return file !== "" && !path.isAbsolute(file) && !file.split(path.sep).includes("..");
}

function safeTimestamp(value) {
  return value.replace(/[:.]/g, "-");
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

function argValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? fail(`missing value for ${name}`);
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
