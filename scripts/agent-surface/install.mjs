// Output materialization: `build` renders the full target set into dist/, and
// `install` plans + applies a target's outputs (with strict-sync stale removal
// and MCP/Kilo config merges) into a host root. Both drive the shared producer
// engine in targets.mjs; neither owns rendering or validation.
import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { exportableCatalog, outputSourceKindError, requireKnownSourceKind } from "./check.mjs";
import {
  collectMissingRequired, CredentialPromptCancelled, credentialStatus, ensureSecretIgnored,
  envExampleContent, formatCredentialPlan, formatMissingCredentialError, missingRequiredKeys,
  readEnvFile, resolveEnvFilePath, secretIgnorePatterns, writeEnvValues,
} from "./credentials.mjs";
import { readFileIfExists, readJsonIfExists, removeTree } from "./io.mjs";
import { mergeKiloInstructionJsonc, parseJsoncResult, setJsoncRootProperty } from "./jsonc.mjs";
import { provisioningDecision, runProvisioning } from "./provision-exec.mjs";
import { formatProvisioningPlan, launchNameOf, PLATFORM, provisioningActions, provisioningStatus, unrecipedRequired } from "./provision.mjs";
import { assertJsonPropertyType, isMcpLauncherCommand, MCP_ENV_LAUNCHER, mcpLauncherInvocation, mergeCodexMcpToml, mergeJsonMcpConfig, mergeKiroPermissions, mergeYamlMcpConfig, optionalServiceMcpServers, renderMcpConfig, YAML_MCP_FORMATS } from "./merge.mjs";
import { assetCategoryFor, assetCategoryNames, packageVersion, readAssetCategories, readSourceKinds, relative, root, selectedAssetCategories } from "./registry.mjs";
import { readRules } from "./rules.mjs";
import { adapterMcpConfigs, kiloRuleInstructionPaths, mcpConfigRootProperties, mcpConfigScopeAllows, outputAppliesToCategory, outputAppliesToScope, outputRootFor, retiredInstallTargets, selectedMcpServiceEntries, targetOutputs, targets } from "./targets.mjs";
import { argValue, argValues, fail, isPathInside, isSafeRelativePath, isSafeTargetName, splitArgValues, uniqueStrings } from "./util.mjs";

export async function build(args) {
  const target = argValue(args, "--target") ?? "all";
  const dryRun = args.includes("--dry-run");

  if (target !== "all") {
    if (!isSafeTargetName(target)) fail(`unsafe build target: ${target}`);
    if (!Object.hasOwn(targets, target)) fail(`unsupported build target: ${target}`);
  }

  const selected = target === "all" ? Object.keys(targets) : [target];
  const catalog = await exportableCatalog();

  if (!dryRun) {
    await removeTree(path.join(root, "dist", target === "all" ? "" : target));
  }

  for (const item of selected) {
    const adapter = targets[item];
    const sourceKindsConfig = await readSourceKinds();
    const outputs = await targetOutputs(adapter, catalog, { target: item, scope: "user", mode: "build" });
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
  const allTargetsSelected = installTargetsIncludeAll(args);
  const scope = argValue(args, "--scope") ?? "project";
  const dryRun = args.includes("--dry-run");
  const allowScopeRoot = args.includes("--allow-scope-root");
  const dest = argValue(args, "--dest");
  const categoryFilter = installCategoryFilter(args);
  const optionalServices = optionalServiceFilter(args);
  const agentName = argValue(args, "--agent") ?? "agent";
  // Resolve the credential env-file ONCE so the installer validates and the launcher loads exactly
  // the same file, independent of the launch working directory. Project scope keeps it beside the
  // target (dest or cwd); user scope uses the per-user config path; --credentials-file overrides
  // (NOT --env-file: Node claims that flag during bootstrap before the CLI can parse it). This
  // absolute path is both classified against (below) and baked into each wrapped server's launch
  // args, so install-validated credentials are the credentials the MCP process actually receives.
  const credentialEnvRoot = dest ? path.resolve(dest) : process.cwd();
  const envFilePath = resolveEnvFilePath({
    scope,
    installRoot: credentialEnvRoot,
    envFileArg: argValue(args, "--credentials-file"),
  });

  if (!["project", "user"].includes(scope)) fail(`unsupported install scope: ${scope}`);
  if (!isSafeTargetName(agentName)) fail(`unsafe --agent: ${agentName}`);
  if (optionalServices && !categoryFilter?.has("mcps") && selectedAssetCategories(categoryFilter).size === 0) {
    fail("--service requires --category mcps or an asset category");
  }
  if (!dryRun && !dest && !allowScopeRoot) {
    fail("live install requires explicit --dest or --allow-scope-root after reviewing --dry-run");
  }

  const planContext = { selectedTargets, allTargetsSelected, scope, dest, agentName, categoryFilter, optionalServices, envFilePath };
  const plans = await buildInstallPlans(planContext);

  // One credential plan drives interactive and headless installs. Reads existing values
  // (process env, then the scope's .env), classifies each selected MCP service's keys, and
  // never surfaces values — only names and the file path reach the plan/logs.
  const credentials = await resolveInstallCredentials({ args, scope, categoryFilter, optionalServices, agentName, envFilePath, installRoot: credentialEnvRoot });

  // Detect (read-only) the executable prerequisites and runtime floors of the MCP services this
  // install will ACTUALLY WIRE, so the plan shows what would be installed and the install can
  // establish anything missing before it writes config. Service *selection* is broader than what a
  // category-filtered run wires (an `--category external` skills install writes no MCP config at
  // all), and provisioning a server nobody is wiring would block the run over an irrelevant gap.
  const provisioning = resolveProvisioning({ serviceEntries: wiredServiceEntries(plans, credentials.serviceEntries), args });

  const blocked = plans.flatMap((plan) => plan.blocked.map((item) => `${plan.target}: ${item}`));
  // A category-filtered install must do real work across the selection: if no selected target
  // has any writes or config merges, the whole run is a no-op and fails (individual
  // non-applicable targets are informational, but "nothing installable anywhere" is an error).
  const runBlocker = categoryFilter && plans.every((plan) => plan.writes.length === 0 && plan.configMerges.length === 0)
    ? `no selected targets have installable outputs for categories: ${[...categoryFilter].sort().join(", ")}`
    : null;
  // Headless installs never prompt: a missing REQUIRED credential is an explicit failure that
  // names the variables and the expected file. Interactive installs prompt instead (below).
  const credentialBlocker = credentials.interactive ? null : formatMissingCredentialError(credentials.status, credentials.envFilePath);
  // A required prerequisite with no recipe for this platform can never be provisioned here (e.g.
  // Synapse/Grimoire on native Windows, whose installers need a POSIX shell). That drops the
  // affected SERVICE from wiring and makes the run report non-zero — it does not stop the install,
  // which would let one unavailable MCP server block a user's skills and rules. Optional gaps never
  // affect anything.
  const unprovisionable = provisioning.blockers.length > 0
    ? `missing required prerequisites with no ${PLATFORM} recipe: ${provisioning.blockers.map((item) => `${item.service}/${item.id}`).join(", ")}`
    : null;
  for (const plan of plans) {
    printInstallPlan(plan);
  }
  printCredentialPlan(credentials);
  printProvisioningPlan(provisioning);
  if (runBlocker) console.log(`install blocked: ${runBlocker}`);
  if (credentialBlocker) console.log(`install blocked: ${credentialBlocker}`);
  if (unprovisionable) {
    console.log(`mcp prerequisites unmet: ${unprovisionable}`);
    process.exitCode = 1; // reported here; the apply phase drops those services and continues
  }
  if (blocked.length > 0 || runBlocker || credentialBlocker) {
    process.exitCode = 1;
    return;
  }

  if (!dryRun) {
    const credentialResult = await applyInteractiveCredentials(credentials, { scope });
    if (!credentialResult.ok) {
      console.log(`install blocked: ${credentialResult.error}`);
      process.exitCode = 1;
      return;
    }
    // Establish prerequisites BEFORE writing any config, so a host config is never wired against a
    // missing binary. A service whose required prerequisite cannot be established is excluded from
    // wiring (its existing config is preserved); the run then reports non-zero.
    const established = await establishPrerequisites({ provisioning, planContext });
    // A service whose prerequisites could not be established is dropped from wiring, not fatal to
    // the run: the rest of the install still applies and the run reports non-zero.
    if (established.error) {
      console.log(`mcp prerequisites unmet: ${established.error}`);
      process.exitCode = 1;
    }
    const applyPlans = established.plans;
    // Materialize the shared env wrapper BEFORE writing any config that launches through it, so a
    // wrapped server is never switched onto a launcher that does not exist yet. Keyless-only
    // installs skip this entirely, preserving their existing direct launch path untouched — as does
    // Windows, where the wrapper is the pinned node.exe itself and there is no stub to write.
    if (installUsesEnvLauncher(applyPlans)) {
      try {
        const launcher = await materializeMcpLauncher();
        console.log(`mcp launcher: materialized ${launcher} (install Node pinned)`);
      } catch (error) {
        console.log(`install blocked: could not materialize the MCP env launcher (${error.message}); existing config left unchanged`);
        process.exitCode = 1;
        return;
      }
    }
    for (const plan of applyPlans) {
      await applyInstallPlan(plan);
    }
    // The compiler wires MCP *config* and can now provision the *binaries* those configs launch
    // (the prerequisites established above). Report the wired servers so a freshly wired host config
    // is never silently pointing at something the user did not expect.
    const wiredServers = uniqueStrings(
      applyPlans.flatMap((plan) => plan.configMerges.flatMap((merge) => merge.addMcpServers ?? [])),
    );
    if (wiredServers.length > 0) {
      console.log(`MCP servers wired into host configs: ${wiredServers.join(", ")}`);
      // Wired servers WITHOUT a provisioning recipe are not auto-installed — name them explicitly so a
      // freshly wired config never silently points at a stdio binary the user still has to install.
      const provisionedIds = new Set(provisioning.status.map((service) => service.id));
      const manualServers = wiredServers.filter((id) => !provisionedIds.has(id));
      if (manualServers.length > 0) {
        console.log(`  Install these stdio binaries onto PATH yourself (no provisioning recipe): ${manualServers.join(", ")}`);
      }
    }
    // A partial provisioning failure preserves the successful services' wiring but signals non-zero
    // so callers (CI, scripts) notice the requested services were not all completed.
    if (established.failed && established.failed.size > 0) process.exitCode = 1;
  }
}

// Build every selected target's plan (retired cleanup adapters first on a full user-scope run), then
// apply cross-plan conflict + live-output protection. `excludeServices` drops the given MCP service
// ids from all config merges — used to skip wiring a service whose prerequisites could not be
// provisioned, without disturbing any other service or the failed service's existing config.
async function buildInstallPlans(context) {
  const { selectedTargets, allTargetsSelected, scope, dest, agentName, categoryFilter, optionalServices, envFilePath } = context;
  const excludeServices = context.excludeServices ?? null;
  const launchWiring = context.launchWiring ?? null;
  const options = { agentName, categoryFilter, optionalServices, envFilePath, excludeServices, launchWiring };
  const plans = [];
  if (allTargetsSelected && scope === "user" && categoryFilter === null && optionalServices === null) {
    for (const [target, adapter] of Object.entries(retiredInstallTargets)) {
      const installRoot = dest ? path.resolve(dest) : adapter.installRoot(scope);
      plans.push(await installPlan(target, adapter, installRoot, scope, dest ? "explicit --dest" : "scope-derived root", options));
    }
  }
  for (const target of selectedTargets) {
    const adapter = targets[target];
    if (!adapter) fail(`unsupported install target: ${target}`);
    const installRoot = dest ? path.resolve(dest) : adapter.installRoot(scope);
    if (installRoot === path.parse(installRoot).root) fail("install root cannot be filesystem root");
    plans.push(await installPlan(target, adapter, installRoot, scope, dest ? "explicit --dest" : "scope-derived root", options));
  }
  addCrossPlanInstallConflicts(plans);
  protectCrossPlanLiveOutputs(plans);
  return plans;
}

function installTargetsIncludeAll(args) {
  return splitArgValues([...argValues(args, "--target"), ...argValues(args, "--runtime")]).includes("all");
}

function addCrossPlanInstallConflicts(plans) {
  const planned = new Map();
  for (const plan of plans) {
    const outputs = [
      ...plan.writes.map((item) => ({ output: item.output, relativeOutput: item.relativeOutput, content: item.content })),
      ...plan.configMerges.map((item) => ({ output: item.output, relativeOutput: item.relativeOutput, content: item.content ?? null })),
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

function protectCrossPlanLiveOutputs(plans) {
  const live = new Set(plans.flatMap((plan) => [
    ...plan.writes.map((item) => item.output),
    ...plan.configMerges.map((item) => item.output),
  ]));
  for (const plan of plans) {
    for (const item of plan.staleRemovalActions) {
      if (item.action === "remove" && live.has(item.output)) item.action = "retain";
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
  if (values.length === 0) return null;
  // `all` retains the full general sync; sensitive and specialized assets stay opt-in.
  if (values.includes("all")) return null;
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
    ...assetCategoryNames,
  ]);
  const selected = new Set(values);
  for (const value of selected) {
    if (!known.has(value)) fail(`unsupported install category: ${value}`);
  }
  const assetCategories = selectedAssetCategories(selected);
  if (assetCategories.size > 0 && assetCategories.size !== selected.size) {
    fail("asset categories cannot be mixed with output categories; run them as separate installs");
  }
  return selected;
}

function optionalServiceFilter(args) {
  const values = splitArgValues(argValues(args, "--service"));
  return values.length > 0 ? new Set(values) : null;
}

async function resolveInstallCredentials({ args, scope, categoryFilter, optionalServices, agentName, envFilePath, installRoot }) {
  // Classify against the SAME env-file the wrapper will load at launch (resolved once by the
  // caller), so install-validated credentials are exactly the ones the MCP process receives.
  const serviceEntries = await selectedMcpServiceEntries(true, {
    mode: "install", scope, categoryFilter, optionalServices, agentName,
  });
  const status = credentialStatus(serviceEntries, { fileValues: await readEnvFile(envFilePath), processEnv: process.env });
  // Interactive only when a real TTY is attached and the caller did not pass -y.
  const interactive = process.stdin.isTTY === true && !args.includes("-y");
  return { status, serviceEntries, envFilePath, installRoot, interactive };
}

function printCredentialPlan(credentials) {
  if (credentials.status.length === 0) return; // no credentialed MCP service selected
  console.log("mcp credentials:");
  console.log(`  file: ${credentials.envFilePath}`);
  for (const line of formatCredentialPlan(credentials.status)) console.log(line);
}

// Read-only prerequisite detection for the selected MCP services (shares the credential service
// selection). `blockers` are missing REQUIRED prerequisites with no recipe for this platform; the
// rest are surfaced as an install plan the apply phase can act on. Never runs anything.
// The MCP services this install will write into at least one host config — the plans are the
// authority, since category/scope filtering happens while they are built. Returns the matching
// [id, service] entries in selection order; empty when the run wires no MCP at all.
export function wiredServiceEntries(plans, serviceEntries) {
  const wired = new Set();
  for (const plan of plans) {
    for (const merge of plan.configMerges ?? []) {
      const entries = merge.kind === "kilo" ? merge.mcpEntries : merge.entries;
      for (const [id] of entries ?? []) wired.add(id);
    }
  }
  return serviceEntries.filter(([id]) => wired.has(id));
}

function resolveProvisioning({ serviceEntries, args }) {
  const status = provisioningStatus(serviceEntries);
  return {
    serviceEntries,
    status,
    blockers: unrecipedRequired(status),
    actions: provisioningActions(status),
    interactive: process.stdin.isTTY === true && !args.includes("-y"),
    authorized: args.includes("-y"),
  };
}

function printProvisioningPlan(provisioning) {
  if (provisioning.status.length === 0) return; // no provisioned MCP service selected
  console.log("mcp prerequisites:");
  for (const line of formatProvisioningPlan(provisioning.status)) console.log(line);
}

// Ask once (interactive only) before running any recipe. Names sources + elevation; never a secret.
// Ctrl+C is treated as "no" so an unattended abort never authorizes installs.
function confirmProvisioning(actions) {
  const sources = uniqueStrings(actions.map((action) => action.source));
  const elevated = actions.some((action) => action.elevation);
  console.log(`provisioning: ${actions.length} prerequisite step(s) to install: ${sources.join(", ")}${elevated ? " (requires elevation/sudo)" : ""}`);
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const finish = (value) => { rl.close(); resolve(value); };
    rl.question("proceed with prerequisite installation? [y/N] ", (answer) => finish(/^y(es)?$/i.test(answer.trim())));
    rl.on("SIGINT", () => finish(false));
  });
}

// Map each wired service to the absolute path provisioning resolved for its launch binary — matched
// Build the launch wiring per wired service from provisioning's resolved paths — the same "carry
// resolved paths into the launch config" principle used for the command, extended to launch args:
//   - `command`: when the service's ORIGINAL launch command is a bare name, the absolute path of the
//     prerequisite whose resolved binary matches it (by basename), so the config points at the real
//     executable regardless of the host's PATH. Service entries are already env-wrapped for
//     credentialed services (command = launcher, real command after "--"), so the original command is
//     read back out of the wrapper args.
//   - `args`: for each prerequisite that declares `launch_arg` (e.g. the browser → `--executablePath`),
//     the flag followed by that prerequisite's resolved absolute path, so a server that must be told
//     which binary to drive (e.g. chrome-devtools-mcp against system Chromium) gets it.
// targets.mjs substitutes the command only for a bare command and appends the args; a path command is
// a harmless no-op. Returns null when there is nothing to wire.
function resolveLaunchWiring(status, serviceEntries) {
  const byId = new Map(serviceEntries);
  const invocation = mcpLauncherInvocation();
  const wiring = {};
  for (const service of status) {
    const server = byId.get(service.id)?.mcp?.server;
    if (!server || typeof server.command !== "string") continue;
    const original = isMcpLauncherCommand(server.command, invocation) && Array.isArray(server.args)
      ? server.args[server.args.indexOf("--") + 1]
      : server.command;
    if (typeof original !== "string") continue;
    const commandBase = launchNameOf(original);
    const entry = {};
    // Match on the launch NAME so a Windows binary (npx.cmd, uv.exe) still matches its registry
    // command; on POSIX this is a plain basename comparison.
    const cmdMatch = service.prerequisites.find(
      (prereq) => prereq.resolvedPath && launchNameOf(prereq.resolvedPath) === commandBase,
    );
    if (cmdMatch) entry.command = cmdMatch.resolvedPath;
    const args = [];
    for (const prereq of service.prerequisites) {
      if (prereq.launchArg && prereq.resolvedPath) args.push(prereq.launchArg, prereq.resolvedPath);
    }
    if (args.length > 0) entry.args = args;
    if (entry.command || entry.args) wiring[service.id] = entry;
  }
  return Object.keys(wiring).length > 0 ? wiring : null;
}

// Establish missing prerequisites before any config is written, then rebuild the plans so the wired
// config carries the resolved absolute launch paths. Returns { plans, failed, error }.
//
// An unestablished prerequisite drops THAT service's wiring (its existing config is preserved) and
// reports a non-zero run — it never fails the whole install. One MCP server whose binary is absent
// must not stop a user's skills and rules from installing, and on a platform with no recipe at all
// (Synapse/Grimoire on native Windows) the opposite policy would make the tool refuse to run.
async function establishPrerequisites({ provisioning, planContext }) {
  const decision = provisioningDecision({
    actions: provisioning.actions,
    blockers: provisioning.blockers,
    interactive: provisioning.interactive,
    authorized: provisioning.authorized,
    dryRun: false,
  });
  // The services that cannot be wired right now, and why — computed from detection rather than the
  // decision so it covers both "no recipe here" and "not authorized to run one".
  const unestablished = () => new Set(
    provisioning.status
      .filter((service) => service.prerequisites.some((prereq) => !prereq.satisfied && !prereq.optional))
      .map((service) => service.id),
  );
  if (decision.kind === "block") {
    const skipped = await skipUnestablished(planContext, unestablished());
    // A no-recipe blocker was already named in the plan phase (which also set the exit code); only
    // the "not authorized to install" case adds information here.
    if (decision.reason !== "needs-authorization") return skipped;
    return { ...skipped, error: `prerequisites missing; re-run with -y to install them, or install manually: ${formatProvisioningPlan(provisioning.status).join("; ").trim()}` };
  }

  // finalStatus is the detection the wiring is proven against: the post-recipe re-detection when
  // recipes run, else the initial (already-satisfied) detection. Its resolved absolute paths are what
  // the launch config carries, so a freshly installed binary is launched by path, not by bare name.
  let finalStatus = provisioning.status;
  let failed = null;
  const runRecipes = () => {
    const result = runProvisioning(provisioning.serviceEntries, { repoRoot: root, onLog: (line) => console.log(line) });
    finalStatus = result.after;
    if (result.failed.size > 0) failed = result.failed;
  };
  if (decision.kind === "confirm") {
    const authorized = await confirmProvisioning(provisioning.actions);
    if (!authorized && decision.mustAuthorize) {
      return {
        ...(await skipUnestablished(planContext, unestablished())),
        error: "prerequisite installation declined; required prerequisites remain missing",
      };
    }
    if (authorized) runRecipes(); // declined-but-only-optional falls through and wires as-is
  } else if (decision.kind === "install") {
    runRecipes();
  }
  // decision.kind === "proceed": nothing to run; finalStatus stays the initial detection.

  if (failed) {
    console.log(`provisioning: could not establish prerequisites for ${[...failed].sort().join(", ")}; skipping their config (existing config preserved)`);
  }
  const launchWiring = resolveLaunchWiring(finalStatus, provisioning.serviceEntries);
  const rebuilt = await buildInstallPlans({ ...planContext, excludeServices: failed ?? undefined, launchWiring });
  return { plans: rebuilt, failed };
}

// Rebuild the plans without the services whose prerequisites could not be established, so the rest
// of the install still applies and their existing config is left exactly as it was. No launch
// wiring is resolved: nothing here was provisioned.
async function skipUnestablished(planContext, skipped) {
  if (skipped.size > 0) {
    console.log(`provisioning: skipping config for ${[...skipped].sort().join(", ")} (existing config preserved)`);
  }
  return { plans: await buildInstallPlans({ ...planContext, excludeServices: skipped }), failed: skipped };
}

async function applyInteractiveCredentials(credentials, { scope }) {
  if (!credentials.interactive || missingRequiredKeys(credentials.status).length === 0) return { ok: true };
  let collected = {};
  try {
    collected = await collectMissingRequired(credentials.status);
  } catch (err) {
    if (!(err instanceof CredentialPromptCancelled)) throw err;
    // Ctrl+C during entry: collect nothing and fall through to the missing-required gate below,
    // which blocks the install consistently (rather than wiring a service without its secrets).
    console.log("credentials: entry cancelled");
  }
  if (Object.keys(collected).length > 0) {
    const written = await writeEnvValues(credentials.envFilePath, collected);
    // Project secrets live inside the checkout, so keep the ACTUAL secret file (default .env or a
    // custom --credentials-file) out of Git and the package.
    if (scope === "project") {
      const patterns = secretIgnorePatterns(credentials.envFilePath, credentials.installRoot);
      if (patterns.length > 0) await ensureSecretIgnored(credentials.installRoot, patterns);
    }
    const saved = [...written.appended, ...written.filled];
    if (saved.length > 0) console.log(`credentials: saved ${saved.join(", ")} to ${credentials.envFilePath}`);
    if (written.unencodable.length > 0) {
      console.log(`credentials: could not encode ${written.unencodable.join(", ")}; set them in the environment or edit ${credentials.envFilePath}`);
    }
    credentials.status = credentialStatus(credentials.serviceEntries, {
      fileValues: await readEnvFile(credentials.envFilePath),
      processEnv: process.env,
    });
  }
  const stillMissing = formatMissingCredentialError(credentials.status, credentials.envFilePath);
  if (stillMissing) {
    // Leave a fillable template, then fail rather than wire a service missing its required keys.
    await writeFile(`${credentials.envFilePath}.example`, envExampleContent(credentials.status)).catch(() => { /* best effort */ });
    return { ok: false, error: stillMissing };
  }
  return { ok: true };
}

// A wrapped server's config launches through the shared env wrapper. Detect whether any wired
// server actually uses it, so the POSIX launcher stub is materialized only when it is genuinely
// needed (keyless synapse/grimoire installs never touch it). On Windows the wrapper is the pinned
// node.exe already on disk, so nothing is materialized and this reports false.
function installUsesEnvLauncher(plans, invocation = mcpLauncherInvocation()) {
  if (invocation.command !== MCP_ENV_LAUNCHER) return false;
  for (const plan of plans) {
    for (const merge of plan.configMerges ?? []) {
      const entries = merge.kind === "kilo" ? merge.mcpEntries : merge.entries;
      for (const [, service] of entries ?? []) {
        if (isMcpLauncherCommand(service?.mcp?.server?.command, invocation)) return true;
      }
    }
  }
  return false;
}

const shQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

// POSIX only (see mcpLauncherInvocation): materialize the shared env-loader wrapper into
// ~/.local/bin as a tiny shell script that PINS the
// Node executable validated at install time (process.execPath). An IDE launches MCP servers with a
// minimal PATH, so a `#!/usr/bin/env node` wrapper would fail to find Node (exit 127); the pinned
// absolute path avoids that. The wrapper execs the shipped, self-contained launcher .mjs.
// Regenerated every install so a moved package or upgraded Node is picked up. The destination
// tracks os.homedir() — the same $HOME the generated config's "~" resolves against — so the wrapper
// always lands exactly where the config points (tests isolate via a disposable HOME, not an override).
async function materializeMcpLauncher() {
  const binDir = path.join(os.homedir(), ".local", "bin");
  const target = path.join(binDir, "agent-surface-mcp-env");
  const launcherJs = path.join(path.dirname(fileURLToPath(import.meta.url)), "mcp-env-launch.mjs");
  const content = [
    "#!/bin/sh",
    "# agent-surface MCP env-loader wrapper — pins the Node validated at install so an IDE-launched",
    "# MCP (minimal PATH) still resolves it. Regenerated on each install.",
    `exec ${shQuote(process.execPath)} ${shQuote(launcherJs)} "$@"`,
    "",
  ].join("\n");
  await mkdir(binDir, { recursive: true });
  await writeFile(target, content, { mode: 0o755 });
  await chmod(target, 0o755).catch(() => { /* best effort on platforms without POSIX modes */ });
  return target;
}

async function installPlan(target, adapter, installRoot, scope, rootSource, options = {}) {
  const categoryFilter = options.categoryFilter ?? null;
  const optionalServices = options.optionalServices ?? null;
  const excludeServices = options.excludeServices ?? null;
  const launchWiring = options.launchWiring ?? null;
  const catalog = await exportableCatalog();
  const sourceKindsConfig = await readSourceKinds();
  const version = await packageVersion();
  const generatedAt = new Date().toISOString();
  const manifestPath = path.join(installRoot, ".agent-surface", `${target}-manifest.json`);
  const blocked = [];
  const manifestRouteError = await installPathError(installRoot, manifestPath, "manifest path");
  if (manifestRouteError) blocked.push(manifestRouteError);
  const previousManifest = manifestRouteError ? null : await readJsonIfExists(manifestPath);
  const legacyOwnership = await readLegacyOwnership(target);
  const outputs = (await targetOutputs(adapter, catalog, {
    target,
    scope,
    mode: "install",
    agentName: options.agentName ?? "agent",
    categoryFilter,
    optionalServices,
    excludeServices,
    launchWiring,
    envFilePath: options.envFilePath ?? null,
  })).filter((output) => outputAppliesToCategory(output, categoryFilter));
  const writes = [];
  const managed = [];
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
    if (!isSafeRelativePath(relativeOutput)) {
      blocked.push(`unsafe output path: ${relativeOutput}`);
      continue;
    }

    writes.push({ source: item.source, output, relativeOutput, content: item.content });
    managed.push({
      target,
      source: item.source,
      output: relativeOutput,
      version,
      asset_category: item.assetCategory ?? undefined,
    });
  }

  for (const item of writes) {
    const routeError = await installPathError(installRoot, item.output, `managed output ${item.relativeOutput}`);
    if (routeError) {
      blocked.push(routeError);
      item.action = "blocked";
      continue;
    }
    const current = await readFileIfExists(item.output);
    if (current === null) {
      item.action = "write";
      continue;
    }

    if (current.toString("utf8") === item.content) {
      item.action = "skip";
      continue;
    }

    item.action = "write";
  }

  const partialInstall = categoryFilter !== null || optionalServices !== null;
  const liveOutputs = new Set(managed.map((item) => item.output));
  const previousFileEntries = manifestFileEntries(previousManifest, target);
  const selectedCategories = selectedAssetCategories(categoryFilter);
  const staleExternalManaged = categoryFilter?.has("external")
    ? previousFileEntries.filter(
      (item) => item.asset_category === undefined
        && /^external[\\/]/.test(item.source)
        && !liveOutputs.has(item.output),
    )
    : [];
  const staleCategoryManaged = selectedCategories.size > 0
    ? previousFileEntries.filter(
      (item) => selectedCategories.has(item.asset_category) && !liveOutputs.has(item.output),
    )
    : [];
  const partialStaleManaged = [...new Map(
    [...staleExternalManaged, ...staleCategoryManaged].map((item) => [item.output, item]),
  ).values()];
  const staleManaged = !partialInstall
    ? [...previousFileEntries, ...legacyOwnership.files]
      .filter((item) => !liveOutputs.has(item.output))
      .sort((left, right) => left.output.localeCompare(right.output))
    : partialStaleManaged.sort((left, right) => left.output.localeCompare(right.output));
  const staleManagedOutputs = new Set(staleManaged.map((item) => item.output));
  const staleRemovalActions = [];
  const configMerges = [];
  const previousConfigEntries = manifestConfigEntries(previousManifest);
  const ownedConfigEntries = [...previousConfigEntries, ...legacyOwnership.config_entries];
  const categoryRegistry = await readAssetCategories();
  const pruneMcpCategories = mcpPruneCategories(categoryFilter, optionalServices);
  const liveConfigRoutes = new Set();
  const configRouteContext = {
    target,
    scope,
    mode: "install",
    agentName: options.agentName ?? "agent",
    relocateExternalRoutes: rootSource === "explicit --dest",
    categoryFilter,
    optionalServices,
    excludeServices,
    launchWiring,
    envFilePath: options.envFilePath ?? null,
  };
  // Only exact adapter-declared paths and formats authorize config cleanup.
  const declaredConfigRoutes = [
    ...adapterMcpConfigs(adapter),
    ...(adapter.cleanupConfigRoutes ?? []),
  ].map((mcpConfig) => ({
    relativeOutput: outputRootFor(mcpConfig.relativeOutput, configRouteContext),
    format: mcpConfig.format,
  }));
  const categorySelectsMcp = selectedCategories.size > 0 && (
    (await selectedMcpServiceEntries(true, configRouteContext)).length > 0
    || ownedConfigEntries.some((entry) => entry.ids.some(
      (id) => selectedCategories.has(configEntryAssetCategory(entry, id, categoryRegistry)),
    ))
  );
  const categorySelectsRules = [...selectedCategories].some(
    (category) => categoryRegistry[category].rules.length > 0,
  );
  if (target === "kilo" && (!categoryFilter || categoryFilter.has("rules") || categoryFilter.has("mcps") || categorySelectsMcp || categorySelectsRules)) {
    const merge = await kiloConfigMerge(installRoot, scope, {
      includeInstructions: !categoryFilter || categoryFilter.has("rules") || categorySelectsRules,
      includeMcp: !categoryFilter || categoryFilter.has("mcps") || categorySelectsMcp,
      includeRootProperties: !categoryFilter,
      categoryFilter,
      optionalServices,
      excludeServices,
      launchWiring,
    });
    liveConfigRoutes.add(configEntryKey(merge.relativeOutput, merge.format));
    declaredConfigRoutes.push(merge);
    const prepared = await prepareKiloConfigMerge(merge, ownedConfigEntries, pruneMcpCategories, categoryRegistry);
    if (!isEmptyConfigNoop(prepared)) configMerges.push(prepared);
  } else if (!categoryFilter || categoryFilter.has("mcps") || categorySelectsMcp) {
    for (const mcpConfig of adapterMcpConfigs(adapter).filter((item) => mcpConfigScopeAllows(item, scope))) {
      const merge = await mcpConfigMerge(mcpConfig, installRoot, scope, {
        ...configRouteContext,
      });
      liveConfigRoutes.add(configEntryKey(merge.relativeOutput, merge.format));
      declaredConfigRoutes.push(merge);
      const prepared = await prepareMcpConfigMerge(merge, ownedConfigEntries, pruneMcpCategories, categoryRegistry);
      if (!isEmptyConfigNoop(prepared)) configMerges.push(prepared);
    }
  }

  const pruneObsoleteConfigRoutes = !partialInstall;
  if (pruneObsoleteConfigRoutes) {
    await addObsoleteConfigRouteMerges(
      configMerges,
      ownedConfigEntries,
      liveConfigRoutes,
      declaredConfigRoutes,
      legacyOwnership.config_entries,
      installRoot,
    );
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
    const routeError = await installPathError(installRoot, output, `stale managed output ${item.output}`);
    if (routeError) {
      blocked.push(routeError);
      continue;
    }
    const current = await readFileIfExists(output);
    if (current === null) {
      staleRemovalActions.push({ output, relativeOutput: item.output, action: "missing" });
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

  const retainedManaged = partialInstall
    ? previousFileEntries
      .filter((item) => !liveOutputs.has(item.output) && !staleManagedOutputs.has(item.output))
    : [];
  const manifestManaged = [...retainedManaged, ...managed].sort((left, right) => left.output.localeCompare(right.output));
  const nextConfigEntries = mergedManifestConfigEntries(
    previousConfigEntries,
    configMerges,
    pruneObsoleteConfigRoutes ? liveConfigRoutes : null,
  );
  const manifest = {
    target,
    scope,
    generated_at: generatedAt,
    managed: manifestManaged,
    config_entries: nextConfigEntries,
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
    staleRemovalActions,
    configMerges,
    blocked,
    notApplicableCategories,
    nonApplicable: nonApplicable.sort((left, right) => left.localeCompare(right)),
    manifest,
  };
}

async function readLegacyOwnership(target) {
  const legacy = await readJsonIfExists(path.join(root, "registry", "legacy-owned.json")) ?? {};
  return {
    files: Array.isArray(legacy.files)
      ? legacy.files
        .filter((item) => typeof item?.output === "string")
        .filter((item) => item.target === undefined || item.target === target)
        .map((item) => ({
          target,
          source: typeof item.source === "string" ? item.source : "",
          output: item.output,
          version: typeof item.version === "string" ? item.version : undefined,
        }))
      : [],
    config_entries: Array.isArray(legacy.config_entries)
      ? legacy.config_entries
        .filter((item) => item.target === undefined || item.target === target)
        .filter((item) => typeof item?.path === "string" && typeof item?.format === "string" && Array.isArray(item?.ids))
        .map((item) => ({
          path: item.path,
          format: item.format,
          ids: uniqueStrings(item.ids.filter((id) => typeof id === "string")),
        }))
        .filter((item) => item.ids.length > 0)
      : [],
  };
}

function manifestFileEntries(manifest, target) {
  if (!Array.isArray(manifest?.managed)) return [];
  return manifest.managed
    .filter((item) => typeof item?.output === "string")
    .filter((item) => item.target === undefined || item.target === target)
    .map((item) => ({
      target,
      source: typeof item.source === "string" ? item.source : "",
      output: item.output,
      version: typeof item.version === "string" ? item.version : undefined,
      asset_category: typeof item.asset_category === "string" ? item.asset_category : undefined,
    }));
}

function manifestConfigEntries(manifest) {
  if (!Array.isArray(manifest?.config_entries)) return [];
  return manifest.config_entries
    .filter((item) => typeof item?.path === "string" && typeof item?.format === "string" && Array.isArray(item?.ids))
    .map((item) => {
      const ids = uniqueStrings(item.ids.filter((id) => typeof id === "string"));
      const assetCategories = Object.fromEntries(
        Object.entries(item.asset_categories ?? {}).filter(
          ([id, category]) => ids.includes(id) && typeof category === "string",
        ),
      );
      return {
        path: item.path,
        format: item.format,
        ids,
        ...(Object.keys(assetCategories).length > 0 ? { asset_categories: assetCategories } : {}),
      };
    })
    .filter((item) => item.ids.length > 0);
}

function mcpPruneCategories(categoryFilter, optionalServices) {
  if (optionalServices !== null) return new Set();
  if (categoryFilter === null) return null;
  if (categoryFilter.has("mcps")) return new Set([null]);
  return selectedAssetCategories(categoryFilter);
}

function mcpEntryAssetCategories(entries, categories) {
  return Object.fromEntries(entries.flatMap(([id]) => {
    const category = assetCategoryFor(categories, "services", id);
    return category === null ? [] : [[id, category]];
  }));
}

function configEntryAssetCategory(entry, id, categories) {
  return entry.asset_categories?.[id] ?? assetCategoryFor(categories, "services", id);
}

function previousConfigIds(entries, relativeOutput, format, pruneCategories, categories) {
  return uniqueStrings(
    entries
      .filter((entry) => entry.path === relativeOutput && entry.format === format)
      .flatMap((entry) => entry.ids.filter(
        (id) => pruneCategories === null
          || pruneCategories.has(configEntryAssetCategory(entry, id, categories)),
      )),
  );
}

function groupedConfigEntries(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    const key = configEntryKey(entry.path, entry.format);
    const current = grouped.get(key);
    if (current) {
      current.ids = uniqueStrings([...current.ids, ...entry.ids]);
      current.asset_categories = { ...current.asset_categories, ...entry.asset_categories };
    } else {
      grouped.set(key, {
        ...entry,
        ids: [...entry.ids],
        ...(entry.asset_categories ? { asset_categories: { ...entry.asset_categories } } : {}),
      });
    }
  }
  return [...grouped.values()].sort((left, right) => configEntryKey(left.path, left.format).localeCompare(configEntryKey(right.path, right.format)));
}

async function addObsoleteConfigRouteMerges(
  configMerges,
  ownedConfigEntries,
  liveConfigRoutes,
  declaredConfigRoutes,
  legacyConfigEntries,
  installRoot,
) {
  const mergeIndexesByPath = new Map(configMerges.map((merge, index) => [merge.relativeOutput, index]));
  const obsoleteRoutes = groupedConfigEntries(ownedConfigEntries)
    .filter((entry) => !liveConfigRoutes.has(configEntryKey(entry.path, entry.format)));
  const declaredRouteKeys = new Set(declaredConfigRoutes.map((route) => configEntryKey(route.relativeOutput, route.format)));
  const legacyRouteKeys = new Set(legacyConfigEntries.map((entry) => configEntryKey(entry.path, entry.format)));

  for (const entry of obsoleteRoutes) {
    const liveIdsAtPath = new Set(configMerges
      .filter((merge) => merge.relativeOutput === entry.path)
      .flatMap((merge) => (merge.kind === "kilo" ? merge.mcpEntries : merge.entries) ?? [])
      .map(([id]) => id));
    const staleEntry = { ...entry, ids: entry.ids.filter((id) => !liveIdsAtPath.has(id)) };
    if (staleEntry.ids.length === 0) continue;
    const routeKey = configEntryKey(entry.path, entry.format);
    const cleanupDeclared = declaredRouteKeys.has(routeKey) || legacyRouteKeys.has(routeKey);
    const existingIndex = mergeIndexesByPath.get(entry.path);
    if (existingIndex !== undefined) {
      const liveMerge = configMerges[existingIndex];
      configMerges[existingIndex] = mergeObsoleteConfigRoute(
        liveMerge,
        staleEntry,
        staleEntry.format === liveMerge.format || cleanupDeclared,
      );
      continue;
    }

    const safetyRoot = configRouteSafetyRoot(entry.path, path.isAbsolute(entry.path), installRoot);
    const output = path.isAbsolute(entry.path) ? path.normalize(entry.path) : path.join(installRoot, entry.path);
    let info;
    try {
      info = await lstat(output);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (!info) continue;
    if (!info.isFile()) {
      configMerges.push({
        kind: "mcp",
        action: "blocked",
        relativeOutput: entry.path,
        error: `obsolete MCP config route is not a regular file: ${entry.path}`,
      });
      continue;
    }
    if (!cleanupDeclared) {
      configMerges.push({
        kind: "mcp",
        action: "blocked",
        relativeOutput: entry.path,
        error: `obsolete MCP config route is not declared for cleanup: ${entry.path} (${entry.format})`,
      });
      continue;
    }
    const prepared = await prepareMcpConfigMerge({
      kind: "mcp",
      output,
      relativeOutput: entry.path,
      format: staleEntry.format,
      entries: [],
      allowAbsoluteOutput: path.isAbsolute(entry.path),
      safetyRoot,
    }, [staleEntry], null, {});
    if (isEmptyConfigNoop(prepared)) continue;
    mergeIndexesByPath.set(entry.path, configMerges.length);
    configMerges.push(prepared);
  }
}

function mergeObsoleteConfigRoute(merge, entry, editContent) {
  if (merge.action === "blocked") return merge;
  let content = merge.content;
  try {
    if (editContent) content = mergeMcpConfigContent(content, entry.format, [], entry.ids);
  } catch (error) {
    return { ...merge, action: "blocked", error: `${entry.path}: ${error.message}` };
  }

  const changed = content !== merge.content;
  return {
    ...merge,
    action: changed && merge.action === "skip" ? "merge" : merge.action,
    removeMcpServers: changed
      ? uniqueStrings([...(merge.removeMcpServers ?? []), ...entry.ids])
      : (merge.removeMcpServers ?? []),
    removeIds: uniqueStrings([...(merge.removeIds ?? []), ...entry.ids]),
    content,
  };
}

function mergedManifestConfigEntries(previousEntries, configMerges, liveConfigRoutes = null) {
  const next = new Map(previousEntries.map((entry) => [configEntryKey(entry.path, entry.format), {
    ...entry,
    ids: [...entry.ids],
    ...(entry.asset_categories ? { asset_categories: { ...entry.asset_categories } } : {}),
  }]));
  if (liveConfigRoutes) {
    for (const key of next.keys()) {
      if (!liveConfigRoutes.has(key)) next.delete(key);
    }
  }
  for (const merge of configMerges) {
    const entry = manifestConfigEntryFromMerge(merge);
    if (!entry) continue;
    const key = configEntryKey(entry.path, entry.format);
    const previous = next.get(key) ?? { ids: [] };
    const removed = new Set(merge.removeIds ?? []);
    const ids = uniqueStrings([
      ...previous.ids.filter((id) => !removed.has(id)),
      ...entry.ids,
    ]).sort();
    const assetCategories = { ...(previous.asset_categories ?? {}) };
    for (const id of removed) delete assetCategories[id];
    for (const id of entry.ids) {
      if (entry.asset_categories?.[id]) assetCategories[id] = entry.asset_categories[id];
      else delete assetCategories[id];
    }
    if (ids.length === 0) {
      next.delete(key);
    } else {
      next.set(key, {
        path: entry.path,
        format: entry.format,
        ids,
        ...(Object.keys(assetCategories).length > 0 ? { asset_categories: assetCategories } : {}),
      });
    }
  }
  return [...next.values()].sort((left, right) => configEntryKey(left.path, left.format).localeCompare(configEntryKey(right.path, right.format)));
}

function manifestConfigEntryFromMerge(merge) {
  if (!["mcp", "kilo"].includes(merge.kind) || typeof merge.format !== "string") return null;
  const entries = merge.kind === "kilo" ? merge.mcpEntries : merge.entries;
  const ids = uniqueStrings((entries ?? []).map(([id]) => id));
  const assetCategories = Object.fromEntries(ids.flatMap((id) => (
    typeof merge.assetCategories?.[id] === "string" ? [[id, merge.assetCategories[id]]] : []
  )));
  return {
    path: merge.relativeOutput,
    format: merge.format,
    ids,
    ...(Object.keys(assetCategories).length > 0 ? { asset_categories: assetCategories } : {}),
  };
}

function configEntryKey(relativeOutput, format) {
  return `${relativeOutput}\0${format}`;
}

function isEmptyConfigNoop(merge) {
  if (!merge || merge.action === "blocked") return false;
  if (merge.kind === "mcp") {
    return merge.entries.length === 0
      && (merge.removeIds ?? []).length === 0
      && Object.keys(merge.rootProperties ?? {}).length === 0;
  }
  if (merge.kind === "kilo") {
    return merge.instructions.length === 0
      && merge.legacyInstructions.length === 0
      && merge.mcpEntries.length === 0
      && (merge.removeIds ?? []).length === 0;
  }
  return false;
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
  console.log("planned stale managed removals:");
  if (removes.length === 0) {
    console.log("  none");
  } else {
    for (const item of removes) console.log(`  ${item}`);
  }
  const retained = plan.staleRemovalActions
    .filter((item) => item.action === "retain")
    .map((item) => item.relativeOutput);
  console.log("planned stale managed paths retained by active targets:");
  if (retained.length === 0) {
    console.log("  none");
  } else {
    for (const item of retained) console.log(`  ${item}`);
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
        const removeServers = item.removeMcpServers ?? [];
        if (addServers.length > 0) console.log(`  ${item.relativeOutput} MCP += ${addServers.join(", ")}`);
        if (removeServers.length > 0) console.log(`  ${item.relativeOutput} MCP -= ${removeServers.join(", ")}`);
        for (const [property, value] of Object.entries(item.rootProperties ?? {})) {
          console.log(`  ${item.relativeOutput} ${property} := ${JSON.stringify(value)}`);
        }
        if (addServers.length === 0 && removeServers.length === 0 && Object.keys(item.rootProperties ?? {}).length === 0) {
          console.log(`  ${item.relativeOutput} MCP unchanged`);
        }
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
      for (const [property, value] of Object.entries(item.rootProperties ?? {})) {
        console.log(`  ${item.relativeOutput} ${property} := ${JSON.stringify(value)}`);
      }
      if (addInstructions.length === 0
        && removeInstructions.length === 0
        && addMcpServers.length === 0
        && Object.keys(item.rootProperties ?? {}).length === 0) {
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
  let written = 0;
  let skipped = 0;
  let removed = 0;
  let configMerges = 0;

  await mkdir(plan.installRoot, { recursive: true });

  for (const item of plan.writes) {
    if (item.action === "skip") {
      skipped += 1;
      continue;
    }

    const routeError = await installPathError(plan.installRoot, item.output, `managed output ${item.relativeOutput}`);
    if (routeError) fail(routeError);
    await mkdir(path.dirname(item.output), { recursive: true });
    const postMkdirRouteError = await installPathError(plan.installRoot, item.output, `managed output ${item.relativeOutput}`);
    if (postMkdirRouteError) fail(postMkdirRouteError);
    await writeFile(item.output, item.content);
    written += 1;
  }

  for (const item of plan.staleRemovalActions) {
    if (item.action !== "remove") continue;
    const routeError = await installPathError(plan.installRoot, item.output, `stale managed output ${item.relativeOutput}`);
    if (routeError) fail(routeError);
    await rm(item.output, { force: true });
    removed += 1;
  }

  for (const item of plan.configMerges) {
    const result = await applyConfigMerge(item);
    configMerges += result.changed ? 1 : 0;
  }

  const manifestRouteError = await installPathError(plan.installRoot, plan.manifestPath, "manifest path");
  if (manifestRouteError) fail(manifestRouteError);
  await mkdir(path.dirname(plan.manifestPath), { recursive: true });
  const postMkdirManifestRouteError = await installPathError(plan.installRoot, plan.manifestPath, "manifest path");
  if (postMkdirManifestRouteError) fail(postMkdirManifestRouteError);
  const manifestTmp = `${plan.manifestPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(manifestTmp, `${JSON.stringify(plan.manifest, null, 2)}\n`, { flag: "wx" });
    await rename(manifestTmp, plan.manifestPath);
  } finally {
    await rm(manifestTmp, { force: true });
  }

  console.log("installed:");
  console.log(`  wrote: ${written}`);
  console.log(`  skipped unchanged: ${skipped}`);
  console.log(`  removed stale: ${removed}`);
  console.log(`  config merges: ${configMerges}`);
}

async function mcpConfigMerge(mcpConfig, installRoot, scope, context) {
  const entries = mcpConfig.includeServices === false
    ? []
    : await selectedMcpServiceEntries(mcpConfig.defaultEnabled, context);
  const relativeOutput = outputRootFor(mcpConfig.relativeOutput, { ...context, scope });
  const absoluteOutput = path.isAbsolute(relativeOutput);
  const safetyRoot = configRouteSafetyRoot(relativeOutput, mcpConfig.allowAbsoluteOutput === true, installRoot);
  return {
    kind: "mcp",
    output: absoluteOutput ? path.normalize(relativeOutput) : path.join(installRoot, relativeOutput),
    relativeOutput,
    format: mcpConfig.format,
    entries,
    assetCategories: mcpEntryAssetCategories(entries, await readAssetCategories()),
    rootProperties: context.categoryFilter ? {} : mcpConfigRootProperties(mcpConfig, { ...context, scope }),
    replaceRootProperties: mcpConfig.replaceRootProperties ?? [],
    allowAbsoluteOutput: mcpConfig.allowAbsoluteOutput === true,
    excludeServices: context.excludeServices ?? null,
    safetyRoot,
  };
}

async function prepareMcpConfigMerge(merge, previousConfigEntries, pruneCategories, categories) {
  if (!merge.safetyRoot) {
    return { ...merge, action: "blocked", error: `unsafe MCP config path: ${merge.relativeOutput}` };
  }
  const routeError = await installPathError(merge.safetyRoot, merge.output, `MCP config ${merge.relativeOutput}`);
  if (routeError) return { ...merge, action: "blocked", error: routeError };

  const currentIds = merge.entries.map(([id]) => id).sort();
  const previousIds = previousConfigIds(previousConfigEntries, merge.relativeOutput, merge.format, pruneCategories, categories);
  // A service excluded because its prerequisites failed this run is a pure no-op: not added (it is
  // already absent from currentIds) and never pruned, so its existing config survives untouched.
  const removeIds = previousIds.filter((id) => !currentIds.includes(id) && !merge.excludeServices?.has(id));
  const existing = await readFileIfExists(merge.output);
  const addMcpServers = currentIds;
  const removeMcpServers = removeIds;
  if (existing === null) {
    if (merge.entries.length === 0 && Object.keys(merge.rootProperties ?? {}).length === 0) {
      return { ...merge, action: "skip", addMcpServers: [], removeMcpServers, removeIds, content: "" };
    }
    const content = renderMcpConfig(merge.format, merge.entries, merge.rootProperties);
    return {
      ...merge,
      action: "write",
      addMcpServers,
      removeMcpServers,
      removeIds,
      content,
    };
  }

  const text = existing.toString("utf8");
  let content;
  try {
    content = mergeMcpConfigContent(
      text,
      merge.format,
      merge.entries,
      removeIds,
      merge.rootProperties,
      merge.replaceRootProperties,
    );
  } catch (error) {
    const priorFormats = uniqueStrings(previousConfigEntries
      .filter((entry) => entry.path === merge.relativeOutput && entry.format !== merge.format)
      .map((entry) => entry.format))
      .sort();
    if (priorFormats.length > 0) {
      return {
        ...merge,
        action: "blocked",
        error: `config format migration required for ${merge.relativeOutput}: ${priorFormats.join(", ")} -> ${merge.format}; existing file is incompatible with the current format (${error.message})`,
      };
    }
    return { ...merge, action: "blocked", error: `${merge.relativeOutput}: ${error.message}` };
  }
  if (content === text) return { ...merge, action: "skip", addMcpServers: [], removeMcpServers: [], removeIds, content };
  return { ...merge, action: "merge", addMcpServers, removeMcpServers, removeIds, content };
}

function configRouteSafetyRoot(configPath, allowAbsoluteOutput, installRoot) {
  if (!path.isAbsolute(configPath)) return isSafeRelativePath(configPath) ? installRoot : null;
  if (!allowAbsoluteOutput) return null;
  const trustedRoots = uniqueStrings([
    os.homedir(),
    process.env.APPDATA,
  ].filter((value) => typeof value === "string" && value.length > 0).map((value) => path.resolve(value)));
  const normalized = path.resolve(configPath);
  return trustedRoots.find((trustedRoot) => isPathInside(trustedRoot, normalized)) ?? null;
}

async function installPathError(safetyRoot, candidate, label) {
  const normalizedRoot = path.resolve(safetyRoot);
  const normalizedCandidate = path.resolve(candidate);
  if (!isPathInside(normalizedRoot, normalizedCandidate)) {
    return `${label} escapes its install root: ${candidate}`;
  }

  const relativePath = path.relative(normalizedRoot, normalizedCandidate);
  const components = relativePath === "" ? [] : relativePath.split(path.sep);
  const paths = [normalizedRoot];
  let current = normalizedRoot;
  for (const component of components) {
    current = path.join(current, component);
    paths.push(current);
  }

  for (const [index, item] of paths.entries()) {
    let info;
    try {
      info = await lstat(item);
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      return `${label} cannot be inspected safely: ${error.message}`;
    }
    if (info.isSymbolicLink()) {
      return `${label} traverses symbolic link: ${item}`;
    }
    if (index < paths.length - 1 && !info.isDirectory()) {
      return `${label} has a non-directory ancestor: ${item}`;
    }
  }
  return null;
}

function mergeMcpConfigContent(
  text,
  format,
  entries,
  removeIds,
  rootProperties = {},
  replaceRootProperties = [],
) {
  if (format === "kiro-permissions") return mergeKiroPermissions(text, rootProperties);
  if (format === "codex-toml") return mergeCodexMcpToml(text, entries, removeIds, rootProperties);
  if (YAML_MCP_FORMATS.has(format)) return mergeYamlMcpConfig(text, format, entries, removeIds);
  return mergeJsonMcpConfig(text, format, entries, removeIds, rootProperties, replaceRootProperties);
}

async function kiloConfigMerge(installRoot, scope, options = {}) {
  const relativeOutput = scope === "user" ? path.join(".config", "kilo", "kilo.jsonc") : "kilo.jsonc";
  const includeInstructions = options.includeInstructions !== false;
  const includeMcp = options.includeMcp === true;
  const includeRootProperties = options.includeRootProperties === true;
  const instructions = includeInstructions
    ? await kiloRuleInstructionPaths(scope, {
      mode: "install",
      categoryFilter: options.categoryFilter ?? null,
    })
    : [];
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
  // Every always-on rule path this installer can manage, across all categories. A full general
  // install (no category/service filter) prunes the category rule FILES, so it must also drop
  // their now-dangling instruction entries instead of only appending — otherwise kilo.jsonc keeps
  // pointing at removed `.kilo/rules/*.md` files after `general -> development -> general`.
  const managedRuleInstructions = (await readRules())
    .filter((rule) => rule.alwaysApply !== false)
    .map((rule) => `${legacyRuleRoot}/${path.basename(rule.file, ".mdc")}.md`);
  const pruneStaleInstructions = includeInstructions && !options.categoryFilter && !options.optionalServices;
  const mcpEntries = includeMcp
    ? await selectedMcpServiceEntries(true, {
      mode: "install",
      categoryFilter: options.categoryFilter ?? null,
      optionalServices: options.optionalServices ?? null,
      excludeServices: options.excludeServices ?? null,
      launchWiring: options.launchWiring ?? null,
      envFilePath: options.envFilePath ?? null,
    })
    : [];
  return {
    kind: "kilo",
    output: path.join(installRoot, relativeOutput),
    relativeOutput,
    format: "local-command-map",
    instructions,
    legacyInstructions: includeInstructions ? legacyInstructions : [],
    managedRuleInstructions,
    pruneStaleInstructions,
    rootProperties: includeRootProperties
      ? { permission: { "*": "allow" }, share: "disabled" }
      : {},
    mcpEntries,
    excludeServices: options.excludeServices ?? null,
    assetCategories: mcpEntryAssetCategories(mcpEntries, await readAssetCategories()),
    safetyRoot: installRoot,
  };
}

async function applyConfigMerge(merge) {
  if (merge.action === "skip") return { changed: false };
  if (merge.action === "blocked") fail(merge.error);
  const routeError = await installPathError(merge.safetyRoot, merge.output, `config ${merge.relativeOutput}`);
  if (routeError) fail(routeError);
  await mkdir(path.dirname(merge.output), { recursive: true });
  const postMkdirRouteError = await installPathError(merge.safetyRoot, merge.output, `config ${merge.relativeOutput}`);
  if (postMkdirRouteError) fail(postMkdirRouteError);
  await writeFile(merge.output, merge.content);
  return { changed: true };
}

async function prepareKiloConfigMerge(merge, previousConfigEntries, pruneCategories, categories) {
  if (!isSafeRelativePath(merge.relativeOutput)) {
    return { ...merge, action: "blocked", error: `unsafe Kilo config path: ${merge.relativeOutput}` };
  }
  const routeError = await installPathError(merge.safetyRoot, merge.output, `Kilo config ${merge.relativeOutput}`);
  if (routeError) return { ...merge, action: "blocked", error: routeError };

  const currentMcpIds = merge.mcpEntries.map(([id]) => id).sort();
  const previousMcpIds = previousConfigIds(previousConfigEntries, merge.relativeOutput, merge.format, pruneCategories, categories);
  // Never prune a service excluded for failed provisioning — leave its existing entry untouched.
  const removeMcpIds = previousMcpIds.filter((id) => !currentMcpIds.includes(id) && !merge.excludeServices?.has(id));
  const existing = await readFileIfExists(merge.output);
  if (existing === null) {
    const content = {
      $schema: "https://app.kilo.ai/config.json",
      ...merge.rootProperties,
    };
    if (merge.instructions.length > 0) content.instructions = merge.instructions;
    if (merge.mcpEntries.length > 0) content.mcp = optionalServiceMcpServers(merge.mcpEntries, "local-command-map");
    return {
      ...merge,
      action: "write",
      addInstructions: merge.instructions,
      removeInstructions: [],
      addMcpServers: currentMcpIds,
      removeMcpServers: removeMcpIds,
      removeIds: removeMcpIds,
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
  try {
    for (const [property, value] of Object.entries(merge.rootProperties)) {
      if (Object.hasOwn(parsed.value, property)) assertJsonPropertyType(property, parsed.value[property], value);
    }
  } catch (error) {
    return { ...merge, action: "blocked", error: `${merge.relativeOutput}: ${error.message}` };
  }

  let content = text;
  let missing = [];
  let remove = [];
  if (merge.instructions.length > 0) {
    const instructions = Object.hasOwn(parsed.value, "instructions") ? parsed.value.instructions : [];
    if (!Array.isArray(instructions)) {
      return { ...merge, action: "blocked", error: `${merge.relativeOutput}: instructions must be an array` };
    }
    if (!instructions.every((item) => typeof item === "string")) {
      return { ...merge, action: "blocked", error: `${merge.relativeOutput}: instructions must contain only strings` };
    }
    missing = merge.instructions.filter((item) => !instructions.includes(item));
    remove = merge.legacyInstructions.filter((item) => instructions.includes(item));
    if (merge.pruneStaleInstructions) {
      const keep = new Set(merge.instructions);
      const stale = merge.managedRuleInstructions.filter((item) => instructions.includes(item) && !keep.has(item));
      if (stale.length > 0) remove = [...new Set([...remove, ...stale])];
    }
    if (missing.length > 0 || remove.length > 0) {
      content = mergeKiloInstructionJsonc(content, missing, remove);
    }
  }

  const addMcpServers = merge.mcpEntries
    .map(([id]) => id)
    .filter((id) => parsed.value.mcp?.[id] === undefined);
  if (merge.mcpEntries.length > 0 || removeMcpIds.length > 0) {
    try {
      content = mergeJsonMcpConfig(content, merge.format, merge.mcpEntries, removeMcpIds);
    } catch (error) {
      return { ...merge, action: "blocked", error: `${merge.relativeOutput}: ${error.message}` };
    }
  }
  try {
    for (const [property, value] of Object.entries(merge.rootProperties)) {
      content = setJsoncRootProperty(content, property, value);
    }
  } catch (error) {
    return { ...merge, action: "blocked", error: `${merge.relativeOutput}: ${error.message}` };
  }

  if (content === text) {
    return { ...merge, action: "skip", addInstructions: [], removeInstructions: [], addMcpServers: [], removeMcpServers: [], removeIds: removeMcpIds };
  }

  return { ...merge, action: "merge", addInstructions: missing, removeInstructions: remove, addMcpServers, removeMcpServers: removeMcpIds, removeIds: removeMcpIds, content };
}
