#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { check, checkCommands, checkGenerated, checkRules, checkSkills, commandPhases, exportableCatalog, exportableCommands } from "./agent-surface/check.mjs";
import { commandPhaseFromName } from "./agent-surface/commands.mjs";
import { doctor } from "./agent-surface/doctor.mjs";
import { runEvidence } from "./agent-surface/evidence.mjs";
import { directDirectories, files } from "./agent-surface/fs-tree.mjs";
import { build, install } from "./agent-surface/install.mjs";
import { root } from "./agent-surface/registry.mjs";
import { readSkills } from "./agent-surface/skills.mjs";
import { checkIgnores, checkSubagents } from "./agent-surface/source-primitives.mjs";
import { commandRelativeOutput, skillRelativeOutput, targets } from "./agent-surface/targets.mjs";
import { argValue, fail } from "./agent-surface/util.mjs";
import { workflow } from "./agent-surface/workflow.mjs";

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

  if (command === "skills") {
    await skillsList(args);
    return;
  }

  if (command === "check") {
    if (args[0] === "rules") {
      await checkRules(args.slice(1));
    } else if (args[0] === "commands") {
      await checkCommands(args.slice(1));
    } else if (args[0] === "skills") {
      await checkSkills(args.slice(1));
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
  agent-surface skills [--phase <phase>] [--json]
  agent-surface check
  agent-surface check rules [--scenario <name>]
  agent-surface check commands
  agent-surface check skills
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
    // Skills are DIRECTORIES, counted through the same loader everything else uses. Counting .md
    // files here would report a skill's companion references as if each were another skill.
    skills: (await readSkills()).length,
    subagents: (await files("subagents", [".md"])).length,
    mcps: (await files("mcps", [".json", ".toml", ".yaml", ".yml"])).length,
    ignores: (await files("ignores", [".ignore", ".gitignore", ".clineignore", ".md", ".txt"])).length,
    external: (await directDirectories(path.join(root, "external"))).length,
    schemas: (await files("schemas", [".json"])).length,
  };

  for (const [type, count] of Object.entries(counts)) {
    console.log(`${type}: ${count}`);
  }
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

async function skillsList(args) {
  const phase = argValue(args, "--phase");
  const asJson = args.includes("--json");
  if (phase && !commandPhases.has(phase)) fail(`unsupported skill phase: ${phase}`);

  let { skills } = await exportableCatalog();
  if (phase) skills = skills.filter((skill) => commandPhaseFromName(skill.name) === phase);
  const registry = {
    count: skills.length,
    skills: skills.map((skill) => skillRegistryEntry(skill)),
  };

  if (asJson) {
    console.log(JSON.stringify(registry, null, 2));
    return;
  }

  console.log(`skills: ${registry.count}${phase ? ` (phase: ${phase})` : ""}`);
  for (const skill of registry.skills) {
    console.log(`${skill.name} phase=${skill.phase} source=${skill.source}`);
  }
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
    model_invocation: false,
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

function skillRegistryEntry(skill) {
  return {
    name: skill.metadata.name,
    source: skill.relativePath,
    phase: commandPhaseFromName(skill.name),
    description: skill.metadata.description,
    model_invocation: true,
    metadata_source: "frontmatter",
    lazy_body: {
      type: "file",
      path: skill.relativePath,
      frontmatter_stripped: true,
    },
    targets: Object.fromEntries(
      Object.entries(targets)
        .filter(([, adapter]) => adapter.renderSkill)
        .map(([name, adapter]) => [name, skillRelativeOutput(adapter, skill, { target: name, scope: "user", mode: "registry" })]),
    ),
  };
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(1);
});
