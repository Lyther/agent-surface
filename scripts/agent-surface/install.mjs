// Output materialization: `build` renders the full target set into dist/, and
// `install` plans + applies a target's outputs (with strict-sync stale removal,
// backups, and MCP/Kilo config merges) into a host root. Both drive the shared
// producer engine in targets.mjs; neither owns rendering or validation.
import { copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { exportableCommands, outputSourceKindError, requireKnownSourceKind } from "./check.mjs";
import { readFileIfExists, readJsonIfExists, removeTree } from "./io.mjs";
import { mergeJsoncRootObjectProperty, mergeKiloInstructionJsonc, parseJsoncResult } from "./jsonc.mjs";
import { YAML_MCP_FORMATS, mergeCodexMcpToml, mergeJsonMcpConfig, mergeYamlMcpConfig, optionalServiceMcpServers, renderMcpConfig } from "./merge.mjs";
import { packageVersion, readSourceKinds, relative, root } from "./registry.mjs";
import { readRules } from "./rules.mjs";
import { kiloRuleInstructionPaths, mcpConfigScopeAllows, outputAppliesToCategory, outputAppliesToScope, outputRootFor, selectedMcpServiceEntries, targetOutputs, targets } from "./targets.mjs";
import { argValue, argValues, exists, fail, isSafeRelativePath, isSafeTargetName, safeTimestamp, sha256, splitArgValues, uniqueStrings } from "./util.mjs";

export async function build(args) {
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

export async function install(args) {
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
    // The compiler only wires MCP *config* (the stdio entry points at ~/.local/bin/<bin>);
    // it never builds/links the server binaries (that stays in each MCP's install.sh, which
    // runs npm + build and, for synapse, a launchd service). Close the loop with an explicit
    // next step so a freshly wired host config never silently points at a missing binary.
    const wiredServers = uniqueStrings(
      plans.flatMap((plan) => plan.configMerges.flatMap((merge) => merge.addMcpServers ?? [])),
    );
    if (wiredServers.length > 0) {
      console.log(`MCP servers wired into host configs: ${wiredServers.join(", ")}`);
      console.log("  These run as stdio binaries from ~/.local/bin. If not linked yet, build + link them:");
      console.log("    npm run install:mcps   # first-party: synapse, grimoire");
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
