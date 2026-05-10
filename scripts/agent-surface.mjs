#!/usr/bin/env node

import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const targets = {
  cline: {
    label: "Cline workflows",
    outputRoot: ".clinerules/workflows",
    render: renderClineWorkflow,
  },
  antigravity: {
    label: "Antigravity workflows",
    outputRoot: "global_workflows",
    render: renderAntigravityWorkflow,
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
    await check();
    return;
  }

  if (command === "build") {
    await build(args);
    return;
  }

  fail(`unknown command: ${command}`);
}

function printHelp() {
  console.log(`agent-surface

Usage:
  agent-surface inventory
  agent-surface check
  agent-surface build --target <cline|antigravity|all> [--dry-run]
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

async function build(args) {
  const target = argValue(args, "--target") ?? "all";
  const dryRun = args.includes("--dry-run");
  const selected = target === "all" ? Object.keys(targets) : [target];
  const commandFiles = await files("commands", [".md"]);

  for (const item of selected) {
    const adapter = targets[item];
    if (!adapter) fail(`unsupported build target: ${item}`);

    const outputDir = path.join(root, "dist", item, adapter.outputRoot);
    let count = 0;

    if (!dryRun) {
      await rm(outputDir, { recursive: true, force: true });
    }

    for (const source of commandFiles) {
      const rendered = await adapter.render(source);
      const targetPath = path.join(outputDir, path.basename(source));
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

function argValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? fail(`missing value for ${name}`);
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
