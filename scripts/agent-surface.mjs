#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { check, checkBossArtifactCoherence, checkCommands, checkGenerated, checkRules, commandPhases, createAjv, exportableCommands, formatAjvErrors, outputSourceKindError, readWorkflowJson, requireKnownSourceKind, validateWorkflowJson, validateWorkflowPatchManifests, workflowSchemaFiles } from "./agent-surface/check.mjs";
import { approximateTokens } from "./agent-surface/format.mjs";
import { directDirectories, directories, files, filesUnder } from "./agent-surface/fs-tree.mjs";
import { readFileIfExists, readJsonIfExists, readJsoncIfExists, removeTree } from "./agent-surface/io.mjs";
import { mergeJsoncRootObjectProperty, mergeKiloInstructionJsonc, parseJsoncResult } from "./agent-surface/jsonc.mjs";
import { YAML_MCP_FORMATS, mergeCodexMcpToml, mergeJsonMcpConfig, mergeYamlMcpConfig, optionalServiceMcpServers, renderMcpConfig } from "./agent-surface/merge.mjs";
import { normalizeExternalSkillFile } from "./agent-surface/postprocess.mjs";
import { commandVersion, gitLines, gitOutput, gitStagedGitlinkMap, gitSubmoduleStatusMap, gitValue } from "./agent-surface/proc.mjs";
import { packageVersion, readOptionalServices, readSourceKinds, relative, root } from "./agent-surface/registry.mjs";
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
import { argValue, argValues, canonicalJson, exists, fail, isPathInside, isSafeRelativePath, isSafeTargetName, requiredArgValue, safeFilename, safeTimestamp, sha256, splitArgValues, uniqueStrings } from "./agent-surface/util.mjs";

// Per-target generated output floors are race-free gross-drop tripwires, not
// exact bulk pins. Keep enough headroom for legitimate small count changes
// while still catching silent producer drops that representative path checks
// can miss.
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
// served_by links a large source-pack to the first-party MCP(s) that serve it just-in-time.
// Invariant: a served pack stays a pinned source-pack with NO skill_roots, so it is never
// mirrored into a host startup catalog (externalSkillRoots only emits skill/behavior packs);
// and every server it names is a real first-party mcp service.
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

function workflowRunDir(runId) {
  return path.join(process.cwd(), ".agent-surface", "workflows", runId);
}

function requiredSafeId(args, name) {
  const value = requiredArgValue(args, name);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(value)) fail(`unsafe ${name}: ${value}`);
  return value;
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

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(1);
});
