// Output materialization: `build` renders the full target set into dist/, and
// `install` plans + applies a target's outputs (with strict-sync stale removal
// and MCP/Kilo config merges) into a host root. Both drive the shared producer
// engine in targets.mjs; neither owns rendering or validation.
import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { exportableCatalog, outputSourceKindError, requireKnownSourceKind } from "./check.mjs";
import {
  collectMissingRequired, CredentialPromptCancelled, credentialStatus, ensureSecretIgnored,
  formatCredentialPlan, formatMissingCredentialError, missingRequiredKeys,
  readEnvFile, resolveEnvFilePath, secretIgnorePatterns, writeEnvExample, writeEnvValues,
} from "./credentials.mjs";
import { readFileIfExists, readJsonIfExists, removeTree } from "./io.mjs";
import { mergeKiloInstructionJsonc, parseJsoncResult, setJsoncRootProperty } from "./jsonc.mjs";
import { provisioningDecision, runProvisioning } from "./provision-exec.mjs";
import { formatProvisioningPlan, launchNameOf, PLATFORM, provisioningActions, provisioningStatus, unrecipedRequired } from "./provision.mjs";
import { assertJsonPropertyType, isMcpLauncherCommand, MCP_ENV_LAUNCHER, mcpLauncherInvocation, mergeCodexMcpToml, mergeJsonMcpConfig, mergeKiroPermissions, mergeYamlMcpConfig, optionalServiceMcpServers, renderMcpConfig, YAML_MCP_FORMATS } from "./merge.mjs";
import { formatNotice, localDate, planNotices } from "./notices.mjs";
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
  const sourceKindsConfig = await readSourceKinds();
  const today = localDate();

  // Render and validate every selected target, and show its notices, before dist/ is touched.
  const rendered = [];
  for (const item of selected) {
    const outputs = await targetOutputs(targets[item], catalog, { target: item, scope: "user", mode: "build" });
    const sourceKindErrors = [];
    for (const output of outputs) {
      requireKnownSourceKind(output, sourceKindsConfig, sourceKindErrors);
    }
    if (sourceKindErrors.length > 0) fail(sourceKindErrors.join("; "));
    rendered.push({ item, outputs });
  }
  for (const { item, outputs } of rendered) {
    for (const notice of await planNotices(item, outputs)) {
      const [heading, ...details] = formatNotice(notice, today);
      console.log(`${item} notice: ${heading}`);
      for (const line of details) console.log(line);
    }
  }

  if (!dryRun) {
    await removeTree(path.join(root, "dist", target === "all" ? "" : target));
  }

  for (const { item, outputs } of rendered) {
    const adapter = targets[item];
    for (const output of outputs) {
      const targetPath = path.join(root, "dist", item, output.relativeOutput);
      if (dryRun) {
        console.log(`[dry-run] ${adapter.label}: ${output.source} -> ${relative(targetPath)}`);
        continue;
      }

      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, output.content);
      // The same mode install honours. An export target is buildOnly, so dist/ is not a preview of
      // the artifact — it IS the artifact someone hands to a plugin manager, and a companion script
      // that arrives there unrunnable is broken at the only point it gets materialized.
      if (output.mode !== undefined) await applyOutputMode(targetPath, output.mode);
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

  const blocked = [...plans.flatMap((plan) => plan.blocked.map((item) => `${plan.target}: ${item}`)), ...rootBlocks(plans)];
  // A category-filtered install must do real work across the selection: if no selected target
  // has any writes or config merges, the whole run is a no-op and fails (individual
  // non-applicable targets are informational, but "nothing installable anywhere" is an error).
  const runBlocker = categoryFilter && plans.every((plan) => plan.writes.length === 0 && plan.configMerges.length === 0)
    ? `no selected targets have installable outputs for categories: ${[...categoryFilter].sort().join(", ")}`
    : null;
  // Headless installs never prompt: a missing REQUIRED credential is an explicit failure that
  // names the variables and the expected file. Interactive installs prompt instead (below).
  const credentialBlocker = credentials.interactive ? null : formatMissingCredentialError(credentials.status, credentials.envFilePath);
  // A required prerequisite with no recipe for this platform can never be provisioned here. That
  // drops the affected SERVICE from wiring and makes the run report non-zero — it does not stop the install,
  // which would let one unavailable MCP server block a user's skills and rules. Optional gaps never
  // affect anything.
  const unprovisionable = provisioning.blockers.length > 0
    ? `missing required prerequisites with no ${PLATFORM} recipe: ${provisioning.blockers.map((item) => `${item.service}/${item.id}`).join(", ")}`
    : null;
  for (const plan of plans) {
    printInstallPlan(plan);
  }
  for (const item of rootBlocks(plans)) console.log(`install blocked: ${item}`);
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
    // The rebuild after provisioning goes through the same planner, so its blocks still apply.
    const reblocked = [...applyPlans.flatMap((plan) => plan.blocked.map((item) => `${plan.target}: ${item}`)), ...rootBlocks(applyPlans)];
    if (reblocked.length > 0) {
      for (const item of reblocked) console.log(`install blocked: ${item}`);
      process.exitCode = 1;
      return;
    }
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
    if (!(await applyInstallPlans(applyPlans))) {
      process.exitCode = 1;
      return;
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
  // Claims are read once per install root and shared by every plan writing into it.
  const claimsByRoot = new Map();
  const planFor = async (target, adapter, installRoot) => {
    if (!claimsByRoot.has(installRoot)) claimsByRoot.set(installRoot, await readRootClaims(installRoot));
    const rootSource = dest ? "explicit --dest" : "scope-derived root";
    return installPlan(target, adapter, installRoot, scope, rootSource, { ...options, rootClaims: claimsByRoot.get(installRoot) });
  };
  const plans = [];
  if (allTargetsSelected && scope === "user" && categoryFilter === null && optionalServices === null) {
    for (const [target, adapter] of Object.entries(retiredInstallTargets)) {
      plans.push(await planFor(target, adapter, dest ? path.resolve(dest) : adapter.installRoot(scope)));
    }
  }
  for (const target of selectedTargets) {
    const adapter = targets[target];
    if (!adapter) fail(`unsupported install target: ${target}`);
    const installRoot = dest ? path.resolve(dest) : adapter.installRoot(scope);
    if (installRoot === path.parse(installRoot).root) fail("install root cannot be filesystem root");
    plans.push(await planFor(target, adapter, installRoot));
  }
  addCrossPlanInstallConflicts(plans);
  protectCrossPlanLiveOutputs(plans);
  resolveSharedOwnership(plans);
  releaseHandovers(plans);
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
  const live = new Map();
  for (const plan of plans) {
    for (const item of [...plan.writes, ...plan.configMerges]) {
      live.set(item.output, [...(live.get(item.output) ?? []), plan.target]);
    }
  }
  for (const plan of plans) {
    for (const item of plan.staleRemovalActions) {
      if (item.action !== "remove" || !live.has(item.output)) continue;
      item.action = "retain";
      item.retainedFor = uniqueStrings(live.get(item.output));
    }
  }
}

// A manifest records who manages a path, not a policy inside the file, so another owner's claim is
// not a veto: a co-owned file is regenerated for this selection, with a warning when that drops a
// category another owner recorded, and a stale path is removed only once no other owner claims it
// (contract Migration steps 2 and 3). Owners taking part in this run are judged by their next
// manifests, every other owner by what is on disk.
function resolveSharedOwnership(plans) {
  const participants = new Map(plans.map((plan) => [participantKey(plan.installRoot, plan.target), plan]));
  const warnedPaths = new Set();
  for (const plan of plans) {
    for (const item of plan.writes) {
      const pathKey = `${plan.installRoot}\0${claimKey(item.relativeOutput)}`;
      if (item.action !== "write" || !item.existed || warnedPaths.has(pathKey)) continue;
      const dropped = uniqueStrings(otherClaims(plan, item.relativeOutput, participants)
        .filter((holder) => holder.category && !plan.selectedCategories.has(holder.category))
        .map((holder) => `${holder.owner}\0${holder.category}`))
        .sort()
        .map((key) => key.split("\0"));
      if (dropped.length === 0) continue;
      warnedPaths.add(pathKey);
      plan.warnings.push(sharedContributionWarning(item.relativeOutput, dropped));
    }
    for (const item of plan.staleRemovalActions) {
      if (item.action !== "remove") continue;
      const holders = uniqueStrings(otherClaims(plan, item.relativeOutput, participants).map((holder) => holder.owner));
      if (holders.length === 0) continue;
      item.action = "retain";
      item.retainedFor = holders;
    }
  }
  // Only once every removal in the run is settled can a released legacy file be known to stay.
  const removedInRun = new Set(plans.flatMap((plan) => plan.staleRemovalActions
    .filter((item) => item.action === "remove")
    .map((item) => `${plan.installRoot}\0${claimKey(item.relativeOutput)}`)));
  for (const plan of plans) plan.releasedLegacyPaths = releasedLegacyPaths(plan, participants, removedInRun);
}

// A split key drops its claim on a handed-over path or config route once the successor has adopted
// it: the successor takes part in the run, or has already installed into this root (contract
// Migration step 3). Until then the claim and the file or entries stay as they are.
function releaseHandovers(plans) {
  for (const plan of plans) {
    const adopted = (successor) => plan.rootClaims.manifests.has(successor)
      || plans.some((other) => other.installRoot === plan.installRoot && other.target === successor);
    for (const item of plan.handovers) {
      if (!adopted(item.successor)) continue;
      item.released = true;
      plan.manifest.managed = plan.manifest.managed.filter((entry) => claimKey(entry.output) !== item.output);
    }
    for (const item of plan.configHandovers) {
      if (!adopted(item.successor)) continue;
      item.released = true;
      const key = configEntryKey(item.path, item.format);
      plan.manifest.config_entries = plan.manifest.config_entries.filter((entry) => configEntryKey(entry.path, entry.format) !== key);
    }
  }
}

// The former keys that declare this target a successor, with what each hands over.
function predecessorsOf(target) {
  return Object.entries(targets).flatMap(([from, adapter]) => (adapter.successors ?? [])
    .filter((successor) => successor.target === target)
    .map((successor) => ({ from, paths: successor.paths ?? [], configRoutes: successor.configRoutes ?? [] })));
}

function summarizeAdoptions(adoptedFrom, adoptedConfig) {
  return adoptedConfig.flatMap(({ from, entries }) => {
    const paths = [...adoptedFrom.values()].filter((owner) => owner === from).length;
    return [
      ...(paths > 0 ? [`${from}: ${paths} former path${paths === 1 ? "" : "s"}`] : []),
      ...entries.map((entry) => `${from}: ${entry.path} ${entry.ids.join(", ")}`),
    ];
  });
}

// One warning per path, naming every owner whose recorded category this selection drops. The advice
// to restore a contribution names only owners and categories this checkout can still select.
function sharedContributionWarning(relativeOutput, dropped) {
  const plural = dropped.length > 1;
  const contributions = dropped.map(([owner, category]) => `${owner}'s ${category}`).join(" and ");
  const restorable = dropped.filter(([owner, category]) => Object.hasOwn(targets, owner) && assetCategoryNames.has(category));
  const advice = restorable.length === 0
    ? `no selectable target restores ${plural ? "them" : "it"}`
    : `installing ${restorable.map(([owner, category]) => `--target ${owner} --category ${category}`).join(" or ")} into this root restores ${restorable.length > 1 ? "them" : "it"}`;
  return `SHARED_CONTRIBUTION_REPLACED: ${relativeOutput} drops ${contributions} contribution${plural ? "s" : ""}; ${advice}`;
}

// Blocks that belong to an install root rather than one plan, listed once however many plans share it.
function rootBlocks(plans) {
  return uniqueStrings(plans.flatMap((plan) => plan.rootClaims.blocked.map((item) => `${plan.installRoot}: ${item}`)));
}

function participantKey(installRoot, target) {
  return `${installRoot}\0${target}`;
}

// Owners other than `plan` that still claim a path once this run completes. A nested legacy
// manifest is never a participant, so its claims count for every other owner even when that owner
// takes part in the run; `exceptNested` sets one nested manifest aside.
function otherClaims(plan, relativeOutput, participants, exceptNested = null) {
  const key = claimKey(relativeOutput);
  // A path this plan adopted from a split's former key is no longer held by that key's claim.
  const formerOwner = plan.adoptedFrom?.get(key) ?? null;
  const holders = [];
  for (const other of participants.values()) {
    if (other.installRoot !== plan.installRoot || other.target === plan.target || other.target === formerOwner) continue;
    const entry = other.nextEntries.get(key);
    if (entry) holders.push({ owner: other.target, category: entry.asset_category });
  }
  for (const claim of plan.rootClaims.byPath.get(key) ?? []) {
    if (claim.owner === plan.target || claim.owner === formerOwner || (claim.nested !== null && claim.nested === exceptNested)) continue;
    if (claim.nested === null && participants.has(participantKey(plan.installRoot, claim.owner))) continue;
    holders.push({ owner: claim.owner, category: claim.assetCategory });
  }
  return holders;
}

// Removing a nested legacy manifest ends its claims without authorizing any removal; list the
// recorded files that stay on disk with no claim at all, so their release is visible. A file this
// run deletes on other authority, such as the target's own legacy entry, is not left in place.
function releasedLegacyPaths(plan, participants, removedInRun) {
  return plan.staleRemovalActions
    .filter((item) => item.action === "remove")
    .flatMap((item) => {
      const nestedKey = claimKey(item.relativeOutput);
      const present = plan.rootClaims.nested.get(nestedKey) ?? [];
      return present.filter((output) => !plan.nextEntries.has(output)
        && !removedInRun.has(`${plan.installRoot}\0${output}`)
        && otherClaims(plan, output, participants, nestedKey).length === 0);
    })
    .sort((left, right) => left.localeCompare(right));
}

// `all` selects the WHOLE set, so pairing it with a sibling is ambiguous rather than additive:
// `--category all,development` asks at once for the general reset (which REMOVES previously managed
// opt-in assets) and for development to be added. Returning early on `all` also meant the siblings
// were never validated, so `all,developmnet` was accepted in silence and installed neither. Require
// `all` alone; every other value then reaches its own validation below.
function exclusiveAll(values, flag) {
  if (!values.includes("all")) return false;
  const siblings = uniqueStrings(values.filter((value) => value !== "all"));
  if (siblings.length > 0) fail(`${flag} all cannot be combined with ${siblings.join(", ")}; run them as separate installs`);
  return true;
}

function selectedInstallTargets(args) {
  const values = splitArgValues([...argValues(args, "--target"), ...argValues(args, "--runtime")]);
  if (values.length === 0) fail("missing required --target or --runtime");
  // An export format has no install destination of its own: its package is handed to the host's own
  // plugin manager, which decides where it lives. `--target all` therefore skips these rather than
  // inventing a location, and naming one explicitly says so instead of failing obscurely later.
  if (exclusiveAll(values, "--target")) return Object.keys(targets).filter((target) => !targets[target].buildOnly);
  const selected = uniqueStrings(values);
  for (const target of selected) {
    if (!isSafeTargetName(target)) fail(`unsafe install target: ${target}`);
    if (!Object.hasOwn(targets, target)) fail(`unsupported install target: ${target}`);
    if (targets[target].buildOnly) fail(`${target} is an export format, not an install target: build it, then register the package with the host's own plugin manager`);
  }
  return selected;
}

function installCategoryFilter(args) {
  const values = splitArgValues([...argValues(args, "--category"), ...argValues(args, "--categories")]);
  if (values.length === 0) return null;
  // Standalone `all` retains the full general sync; sensitive and specialized assets stay opt-in.
  if (exclusiveAll(values, "--category")) return null;
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
  // A service that cannot be provisioned here at all is dropped, and its recipes are not run — but
  // it never decides anything for its siblings: under -y, a runnable recipe still runs.
  const unprovisionable = new Set(provisioning.blockers.map((item) => item.service));
  const decision = provisioningDecision({
    actions: provisioning.actions,
    blockers: provisioning.blockers,
    interactive: provisioning.interactive,
    authorized: provisioning.authorized,
    dryRun: false,
  });

  // finalStatus is the detection the wiring is proven against: the post-recipe re-detection when
  // recipes run, else the initial (already-satisfied) detection. Its resolved absolute paths are what
  // the launch config carries, so a freshly installed binary is launched by path, not by bare name.
  let finalStatus = provisioning.status;
  let error = null;
  const runRecipes = () => {
    const result = runProvisioning(provisioning.serviceEntries, {
      repoRoot: root, skipServices: unprovisionable, onLog: (line) => console.log(line),
    });
    finalStatus = result.after;
  };
  if (decision.kind === "confirm") {
    const authorized = await confirmProvisioning(decision.actions);
    if (authorized) runRecipes(); // declining when only OPTIONAL gaps remain simply wires as-is
    else if (decision.mustAuthorize) error = "prerequisite installation refused; required prerequisites remain missing";
  } else if (decision.kind === "install") {
    runRecipes();
  } else if (decision.kind === "block") {
    error = `prerequisites missing; re-run with -y to install them, or install manually: ${formatProvisioningPlan(provisioning.status).join("; ").trim()}`;
  }
  // decision.kind === "proceed": nothing to run; finalStatus stays the initial detection.

  // ONE wiring path for everything that survives, whatever happened above: every service still
  // missing a required prerequisite is dropped, and every other service is wired from the SAME
  // detection — so a partial install never rewrites a working sibling's config with an unresolved
  // command (which would leave it launching a bare name with no wrapper and no browser path).
  const failed = new Set(
    finalStatus
      .filter((service) => service.prerequisites.some((prereq) => !prereq.satisfied && !prereq.optional))
      .map((service) => service.id),
  );
  if (failed.size > 0) {
    console.log(`provisioning: skipping config for ${[...failed].sort().join(", ")} (existing config preserved)`);
  }
  const launchWiring = resolveLaunchWiring(finalStatus, provisioning.serviceEntries);
  const plans = await buildInstallPlans({ ...planContext, excludeServices: failed.size > 0 ? failed : undefined, launchWiring });
  return { plans, failed, error };
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
    const template = `${credentials.envFilePath}.example`;
    const wroteTemplate = await writeEnvExample(template, credentials.status).catch(() => false);
    if (!wroteTemplate) console.log(`credentials: left ${template} unchanged; it was not generated by agent-surface or could not be written`);
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

// Windows has no POSIX mode bits to set, and a failure to set one must not abort an install that
// otherwise succeeded — the file is written either way, and its content is the deliverable.
async function applyOutputMode(target, mode) {
  await chmod(target, mode).catch(() => { /* best effort on platforms without POSIX modes */ });
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
  const rootClaims = options.rootClaims;
  // Blocks on the install root itself (an unreadable manifest) are reported once for the run, not per plan.
  const blocked = [];
  const manifestRouteError = await installPathError(installRoot, manifestPath, "manifest path");
  if (manifestRouteError) blocked.push(manifestRouteError);
  const previousManifest = manifestRouteError ? null : rootClaims.manifests.get(target) ?? null;
  const legacyOwnership = await readLegacyOwnership(target);
  const legacyClaims = new Set(legacyOwnership.files.map((item) => claimKey(item.output)));
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

    writes.push({ source: item.source, output, relativeOutput, content: item.content, mode: item.mode, renderKind: item.renderKind });
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

    // An existing file nobody claims is the operator's, identical bytes included: never overwrite
    // or adopt it (contract Migration step 2). With an unreadable manifest in the root the claim set
    // is incomplete, so the root block stands alone rather than beside false unowned reports.
    item.existed = true;
    const claimed = rootClaims.blocked.length > 0
      || rootClaims.byPath.has(claimKey(item.relativeOutput))
      || legacyClaims.has(claimKey(item.relativeOutput));
    if (!claimed) {
      blocked.push(`UNOWNED_DESTINATION: ${item.relativeOutput} exists and no agent-surface manifest in this install root claims it; move or remove it, then rerun`);
      item.action = "blocked";
      continue;
    }

    item.action = current.toString("utf8") === item.content ? "skip" : "write";
  }

  const partialInstall = categoryFilter !== null || optionalServices !== null;
  const liveOutputs = new Set(managed.map((item) => item.output));
  // A successor adopts what its former key recorded on the paths a split hands it, categories
  // included, so its own stale cleanup and category rules apply to them (contract Migration step 3).
  const ownFileEntries = manifestFileEntries(previousManifest, target);
  const ownOutputs = new Set(ownFileEntries.map((entry) => claimKey(entry.output)));
  const adoptedFrom = new Map();
  const adoptedFileEntries = predecessorsOf(target).flatMap(({ from, paths }) => manifestFileEntries(rootClaims.manifests.get(from), from)
    .filter((entry) => !ownOutputs.has(claimKey(entry.output)) && paths.some((prefix) => isPathInside(prefix, claimKey(entry.output))))
    .map((entry) => {
      adoptedFrom.set(claimKey(entry.output), from);
      return { ...entry, target };
    }));
  const previousFileEntries = [...ownFileEntries, ...adoptedFileEntries];
  const selectedCategories = selectedAssetCategories(categoryFilter);

  // An aggregate instruction document (Codex's AGENTS.md and its kin) holds several categories'
  // always-on rules in ONE file. Regenerating it under a narrower selection therefore erases what
  // the others contributed: `--category rules` after `--category development` rewrote the shared
  // document back to the general baseline while development's skills stayed installed, leaving a
  // profile no single command describes. Per-file rule hosts never had this problem — each rule is
  // its own managed output, and a category-filtered install prunes only the selected category.
  //
  // The manifest records ONE asset_category per output. That is enough to DETECT the loss, and not
  // enough to reconstruct a document assembled from several categories, so the operation is
  // rejected before anything is written rather than reassembled from a reconstructed profile. The
  // contribution is restored by re-running the category that owns it; the general full sync still
  // resets it deliberately, which is its documented meaning.
  if (partialInstall) {
    const previousOwner = new Map(previousFileEntries.filter((item) => item.asset_category).map((item) => [claimKey(item.output), item.asset_category]));
    // A moved document inherits the contribution its old route recorded until it records its own,
    // even once the old file is gone.
    const inheritedFrom = new Map();
    for (const route of declaredRouteMigrations(adapter, scope)) {
      if (previousOwner.has(route.to) || !previousOwner.has(route.from)) continue;
      previousOwner.set(route.to, previousOwner.get(route.from));
      inheritedFrom.set(route.to, route.from);
    }
    for (const item of writes) {
      // Only a real content change can lose anything: an unchanged file is a skip either way.
      if (item.action !== "write") continue;
      const key = claimKey(item.relativeOutput);
      const owner = previousOwner.get(key);
      if (owner === undefined || selectedCategories.has(owner)) continue;
      const holder = inheritedFrom.has(key)
        ? `${item.relativeOutput} replaces ${inheritedFrom.get(key)}, which carries`
        : `${item.relativeOutput} carries`;
      blocked.push(`${holder} the ${owner} category's contribution and this selection would overwrite it; re-run --category ${owner} to refresh that document, or run the general install to reset it`);
    }
  }
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
  // A declared old route is handled only by its migration, never by generic stale cleanup.
  const migrations = await planRouteMigrations(adapter, { scope, installRoot, writes, previousFileEntries, legacyClaims });
  const migratedRoutes = new Set(migrations.map((item) => item.from));
  for (const item of migrations) {
    if (item.action === "blocked") blocked.push(item.message);
  }
  const staleCandidates = (!partialInstall
    ? [...previousFileEntries, ...legacyOwnership.files].filter((item) => !liveOutputs.has(item.output))
    : partialStaleManaged)
    .filter((item) => !migratedRoutes.has(claimKey(item.output)));
  // A split key keeps a former path its successor now produces claimed and in place, never stale
  // (contract Migration step 3); the cross-plan pass releases it once another owner holds it.
  const handovers = uniqueStrings(staleCandidates.map((item) => claimKey(item.output))).flatMap((output) => {
    const successor = (adapter.successors ?? []).find((item) => (item.paths ?? []).some((prefix) => isPathInside(prefix, output)));
    return successor ? [{ output, successor: successor.target, released: false }] : [];
  });
  const handedOver = new Set(handovers.map((item) => item.output));
  const staleManaged = staleCandidates
    .filter((item) => !handedOver.has(claimKey(item.output)))
    .sort((left, right) => left.output.localeCompare(right.output));
  const staleManagedOutputs = new Set(staleManaged.map((item) => item.output));
  const staleRemovalActions = [];
  const configMerges = [];
  const adoptedConfig = predecessorsOf(target).map(({ from, configRoutes }) => {
    const routes = new Set(configRoutes.map((route) => configEntryKey(
      outputRootFor(route.relativeOutput, { target, scope, mode: "install", relocateExternalRoutes: rootSource === "explicit --dest" }),
      route.format,
    )));
    return { from, entries: manifestConfigEntries(rootClaims.manifests.get(from)).filter((entry) => routes.has(configEntryKey(entry.path, entry.format))) };
  });
  const previousConfigEntries = groupedConfigEntries([...manifestConfigEntries(previousManifest), ...adoptedConfig.flatMap((item) => item.entries)]);
  const ownedConfigEntries = [...previousConfigEntries, ...legacyOwnership.config_entries];
  const categoryRegistry = await readAssetCategories();
  const pruneMcpCategories = mcpPruneCategories(categoryFilter, optionalServices);
  const liveConfigRoutes = new Set();
  const skippedConfigRoutes = [];
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
  })).filter((route) => route.relativeOutput);
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
      const absence = await routeAbsence(mcpConfig, merge, installRoot, scope);
      if (absence?.error) {
        blocked.push(absence.error);
        // Its state is unknown, so the route is neither merged nor pruned as obsolete.
        liveConfigRoutes.add(configEntryKey(merge.relativeOutput, merge.format));
        continue;
      }
      if (absence) {
        const owned = ownedConfigEntries.some((entry) => configEntryKey(entry.path, entry.format) === configEntryKey(merge.relativeOutput, merge.format));
        const file = owned ? await probePresence(() => lstat(merge.output), merge.output) : { value: null };
        skippedConfigRoutes.push(`${merge.relativeOutput}: ${absence.reason}${skippedRouteCleanup(owned, file, partialInstall)}`);
        continue;
      }
      liveConfigRoutes.add(configEntryKey(merge.relativeOutput, merge.format));
      declaredConfigRoutes.push(merge);
      const prepared = await prepareMcpConfigMerge(merge, ownedConfigEntries, pruneMcpCategories, categoryRegistry);
      if (!isEmptyConfigNoop(prepared)) configMerges.push(prepared);
    }
  }

  // Config entries on a route a successor now merges stay recorded and unpruned, as handed-over paths do.
  const successorRoutes = new Map((adapter.successors ?? []).flatMap((successor) => (successor.configRoutes ?? []).map((route) => [
    configEntryKey(outputRootFor(route.relativeOutput, configRouteContext), route.format),
    successor.target,
  ])));
  const configHandovers = groupedConfigEntries(ownedConfigEntries)
    .filter((entry) => successorRoutes.has(configEntryKey(entry.path, entry.format)) && !liveConfigRoutes.has(configEntryKey(entry.path, entry.format)))
    .map((entry) => ({ path: entry.path, format: entry.format, ids: entry.ids, successor: successorRoutes.get(configEntryKey(entry.path, entry.format)), released: false }));
  const keptConfigRoutes = new Set([...liveConfigRoutes, ...configHandovers.map((entry) => configEntryKey(entry.path, entry.format))]);
  const pruneObsoleteConfigRoutes = !partialInstall;
  if (pruneObsoleteConfigRoutes) {
    await addObsoleteConfigRouteMerges(
      configMerges,
      ownedConfigEntries,
      keptConfigRoutes,
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
  // A migrated old route identical to its replacement goes after the writes, like any removal, so it
  // is deleted only once the replacement has been written.
  for (const item of migrations.filter((migration) => migration.action === "remove")) {
    staleRemovalActions.push({ output: item.output, relativeOutput: item.from, action: "remove", migratedTo: item.to });
  }
  const warnings = migrations
    .filter((item) => item.action === "retain")
    .map((item) => `LEGACY_FILE_RETAINED: ${item.from} differs from its replacement ${item.to} and is kept, because ${item.ignoredBy} shows the client ignores it; remove it when you no longer need it`);

  // Per-target: record non-applicability as informational. Whether the *run* fails is decided
  // at the call site (a run with no installable outputs anywhere is the error, not one target).
  let notApplicableCategories = null;
  if (categoryFilter && writes.length === 0 && configMerges.length === 0 && nonApplicable.length === 0) {
    notApplicableCategories = `no installable outputs for categories: ${[...categoryFilter].sort().join(", ")}`;
  }

  // A migrated old route stays claimed while it stays on disk: retained with a warning, or untouched
  // because this selection writes no replacement.
  const keptRoutes = new Set(migrations.filter((item) => ["retain", "untouched"].includes(item.action)).map((item) => item.from));
  const retainedManaged = previousFileEntries.filter((item) => {
    if (migratedRoutes.has(claimKey(item.output))) return keptRoutes.has(claimKey(item.output));
    if (handedOver.has(claimKey(item.output))) return true;
    return partialInstall && !liveOutputs.has(item.output) && !staleManagedOutputs.has(item.output);
  });
  const manifestManaged = [...retainedManaged, ...managed].sort((left, right) => left.output.localeCompare(right.output));
  const nextConfigEntries = mergedManifestConfigEntries(
    previousConfigEntries,
    configMerges,
    pruneObsoleteConfigRoutes ? keptConfigRoutes : null,
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
    notices: await planNotices(target, writes, installRoot),
    warnings,
    releasedLegacyPaths: [],
    routeMigrations: migrations,
    skippedConfigRoutes,
    handovers,
    configHandovers,
    adoptedFrom,
    adoptions: summarizeAdoptions(adoptedFrom, adoptedConfig),
    manifest,
    // Inputs to the cross-plan ownership decisions and to the pending manifest.
    rootClaims,
    selectedCategories,
    previousFileEntries,
    previousConfigEntries,
    nextEntries: new Map(manifestManaged.map((entry) => [claimKey(entry.output), entry])),
  };
}

// The routes an adapter declares moved at this scope, as claim keys.
function declaredRouteMigrations(adapter, scope) {
  return (adapter.routeMigrations ?? []).flatMap((route) => {
    const from = route.from({ scope });
    const to = route.to({ scope });
    return from && to ? [{ from: claimKey(from), to: claimKey(to), ignoredBy: route.ignoredBy }] : [];
  });
}

// Declared route migrations (contract Migration step 4). An owned old route is removed only after
// its replacement is written, and only when its bytes equal the replacement: anything else may carry
// edits or an earlier rendering. A differing old route blocks unless a recorded qualification shows
// the client ignores it, in which case it is kept and listed on every run until the operator removes
// it. An old route this target does not own, or one this selection writes no replacement for, is
// left alone. An identical old route another owner still claims is kept for that owner (step 3);
// only this target's claim ends.
async function planRouteMigrations(adapter, { scope, installRoot, writes, previousFileEntries, legacyClaims }) {
  const owned = new Set([...previousFileEntries.map((item) => claimKey(item.output)), ...legacyClaims]);
  const migrations = [];
  for (const route of declaredRouteMigrations(adapter, scope)) {
    const { from, to } = route;
    const output = path.join(installRoot, from);
    const replacement = writes.find((item) => claimKey(item.relativeOutput) === to);
    if (!replacement || !owned.has(from)) {
      migrations.push({ from, to, output, action: "untouched" });
      continue;
    }
    const routeError = await installPathError(installRoot, output, `migrated route ${from}`);
    if (routeError) {
      migrations.push({ from, to, output, action: "blocked", message: routeError });
      continue;
    }
    const current = await readFileIfExists(output);
    if (current === null) {
      migrations.push({ from, to, output, action: "missing" });
    } else if (current.toString("utf8") === replacement.content) {
      migrations.push({ from, to, output, action: "remove" });
    } else if (route.ignoredBy) {
      migrations.push({ from, to, output, action: "retain", ignoredBy: route.ignoredBy });
    } else {
      migrations.push({
        from,
        to,
        output,
        action: "blocked",
        message: `MIGRATION_SOURCE_CONFLICT: ${from} differs from its replacement ${to}, and the client may still read it, which would load both; review it, then move or remove it and rerun`,
      });
    }
  }
  return migrations;
}

// Ownership claims on one install root (contract Migration step 2): every <id>-manifest.json directly
// in its .agent-surface/ (retired and unknown IDs included; other files there are not manifests), and
// every legacy-listed nested manifest present under it, whose outputs are rebased to its own root.
// A claim grants ownership and cleanup retention; removal stays with a target's own manifest and
// legacy entries. A manifest that cannot be read or has the wrong shape blocks every plan in the root.
const MANIFEST_FILE = /^(.+)-manifest\.json$/;

async function readRootClaims(installRoot) {
  const claims = { manifests: new Map(), byPath: new Map(), nested: new Map(), blocked: [] };
  const directory = path.join(installRoot, ".agent-surface");
  const directoryError = await installPathError(installRoot, directory, "manifest directory");
  if (directoryError) {
    claims.blocked.push(directoryError);
    return claims;
  }
  for (const entry of await readDirectoryIfExists(directory)) {
    const owner = MANIFEST_FILE.exec(entry.name)?.[1];
    if (!owner) continue;
    const manifest = await readClaimManifest(installRoot, path.join(directory, entry.name), entry, claims.blocked);
    if (!manifest) continue;
    claims.manifests.set(owner, manifest);
    for (const item of manifest.managed) addClaim(claims, item.output, { owner, assetCategory: recordedCategory(item), nested: null });
  }
  for (const legacy of await legacyNestedManifests()) {
    const file = path.join(installRoot, legacy.output);
    const info = await lstatIfExists(file);
    if (!info) continue;
    const manifest = await readClaimManifest(installRoot, file, info, claims.blocked);
    if (!manifest) continue;
    const nested = claimKey(legacy.output);
    const present = [];
    for (const item of manifest.managed) {
      const output = path.join(legacy.root, item.output);
      addClaim(claims, output, { owner: legacy.target, assetCategory: recordedCategory(item), nested });
      if (await lstatIfExists(path.join(installRoot, output))) present.push(claimKey(output));
    }
    claims.nested.set(nested, present);
  }
  return claims;
}

function claimKey(relativeOutput) {
  return path.normalize(relativeOutput);
}

// A manifest another tool or version wrote may hold any value here; only a category-shaped name is
// kept, and anything else still counts as a recorded contribution without echoing the value.
function recordedCategory(entry) {
  if (entry.asset_category === undefined) return undefined;
  return typeof entry.asset_category === "string" && /^[a-z][a-z0-9-]*$/.test(entry.asset_category)
    ? entry.asset_category
    : "unrecognized";
}

function addClaim(claims, output, claim) {
  const key = claimKey(output);
  const list = claims.byPath.get(key);
  if (list) list.push(claim);
  else claims.byPath.set(key, [claim]);
}

async function readClaimManifest(installRoot, file, info, blocked) {
  const unreadable = (problem) => {
    blocked.push(`MANIFEST_UNREADABLE: ${path.relative(installRoot, file)} ${problem}; repair it, or remove it together with the files it recorded, then rerun`);
    return null;
  };
  if (!info.isFile()) return unreadable("is not a regular file");
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    return unreadable(`cannot be read (${error.message})`);
  }
  // The parser's message quotes the file's text, which may hold anything; report the fact only.
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    return unreadable("is not valid JSON");
  }
  const shapeError = manifestShapeError(manifest);
  return shapeError ? unreadable(shapeError) : manifest;
}

function manifestShapeError(manifest) {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) return "is not a JSON object";
  if (!Array.isArray(manifest.managed)) return "has no managed array";
  const entry = manifest.managed.findIndex((item) => typeof item?.output !== "string" || !isSafeRelativePath(item.output));
  if (entry !== -1) return `managed entry ${entry} has no safe relative output`;
  if (manifest.config_entries === undefined) return null;
  if (!Array.isArray(manifest.config_entries)) return "has a config_entries value that is not an array";
  const config = manifest.config_entries.findIndex(
    (item) => typeof item?.path !== "string" || typeof item?.format !== "string" || !Array.isArray(item?.ids),
  );
  return config === -1 ? null : `config entry ${config} lacks a string path, a string format or an ids array`;
}

// Legacy-listed manifests that live under another root's .agent-surface/ (a former install root).
async function legacyNestedManifests() {
  const legacy = await readJsonIfExists(path.join(root, "registry", "legacy-owned.json")) ?? {};
  return (Array.isArray(legacy.files) ? legacy.files : []).flatMap((item) => {
    if (typeof item?.output !== "string") return [];
    const parts = item.output.split(/[\\/]+/);
    const owner = MANIFEST_FILE.exec(parts.at(-1))?.[1];
    if (!owner || parts.length < 3 || parts.at(-2) !== ".agent-surface") return [];
    return [{
      output: path.join(...parts),
      root: path.join(...parts.slice(0, -2)),
      target: typeof item.target === "string" ? item.target : owner,
    }];
  });
}

async function lstatIfExists(file) {
  try {
    return await lstat(file);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
    throw error;
  }
}

async function readDirectoryIfExists(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return [];
    throw error;
  }
}

// Why a declared per-app route is not live on this machine, or null when it is. An absent route is
// not live: a full install prunes entries this target owns there as an obsolete route, which stays
// declared for that cleanup.
async function routeAbsence(mcpConfig, merge, installRoot, scope) {
  if (mcpConfig.editorExtension) {
    const presence = await editorExtensionPresence(mcpConfig.editorExtension, installRoot);
    if (presence.error) return presence;
    if (!presence.present) return { reason: presence.reason };
  }
  // An IDE's per-OS user MCP file is written only once the IDE has created its User directory, so an
  // install never creates user data for an IDE that is not installed.
  if (mcpConfig.ideUserData && scope === "user") {
    const userDirectory = path.dirname(merge.output);
    const found = await probePresence(() => stat(userDirectory), userDirectory, "IDE user data folder");
    if (found.error) return found;
    if (!found.value?.isDirectory()) return { reason: `${path.dirname(merge.relativeOutput)} does not exist yet; start the IDE once, then rerun` };
  }
  return null;
}

// A per-editor extension file is read only by that editor's copy of the extension, so its route is
// live only where the extension is installed: an extension folder (or a symlink to one) that the
// editor has not marked obsolete. Extension storage is not a signal, because editors keep it after an
// uninstall. The extensions directory is looked up under the install root, so a --dest install sees
// only its destination. A location that cannot be read blocks the plan rather than guessing.
async function editorExtensionPresence({ extensionsDir, extensionId }, installRoot) {
  const extensions = path.join(installRoot, extensionsDir, "extensions");
  const listed = await probePresence(() => readdir(extensions, { withFileTypes: true }), extensions);
  if (listed.error) return listed;
  const versioned = new RegExp(`^${extensionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d`, "i");
  const installed = [];
  for (const entry of listed.value ?? []) {
    if (!versioned.test(entry.name) || !(entry.isDirectory() || entry.isSymbolicLink())) continue;
    const target = await probePresence(() => stat(path.join(extensions, entry.name)), path.join(extensions, entry.name));
    if (target.error) return target;
    if (target.value?.isDirectory()) installed.push(entry.name.toLowerCase());
  }
  const where = path.join(extensionsDir, "extensions");
  if (installed.length === 0) return { present: false, reason: `no ${extensionId} extension folder under ${where}` };
  const obsoleteFile = path.join(extensions, ".obsolete");
  const obsolete = await probePresence(() => readFile(obsoleteFile, "utf8"), obsoleteFile);
  if (obsolete.error) return obsolete;
  const marked = obsoleteNames(obsolete.value);
  if (installed.every((name) => marked.has(name))) return { present: false, reason: `every ${extensionId} extension folder under ${where} is marked obsolete` };
  return { present: true };
}

// One rule for every presence probe: a missing path, or a file or directory where the other belongs,
// means absent (value null); anything else cannot be inspected safely and blocks.
async function probePresence(read, location, label = "editor extension location") {
  try {
    return { value: await read() };
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "EISDIR"].includes(error?.code)) return { value: null };
    return { error: `${label} cannot be inspected safely: ${location}: ${error.message}` };
  }
}

// What happens to the entries this target recorded at a skipped route. A full install prunes a regular
// file and ends the claim on a missing one; a partial install keeps both claims until the next full
// install. A directory or symlink there blocks the full install, which the blocked line explains.
function skippedRouteCleanup(owned, file, partialInstall) {
  if (!owned || file.error) return "";
  if (!file.value) return partialInstall ? "; its claim on the missing file ends at the next full install" : "; its claim on the missing file ends";
  if (!file.value.isFile()) return "";
  return partialInstall ? "; entries agent-surface merged there stay until a full install" : "; entries agent-surface merged there are pruned";
}

// VS Code-family editors list removed extension folders they have not deleted yet in extensions/.obsolete.
function obsoleteNames(text) {
  if (text === null) return new Set();
  try {
    const listed = JSON.parse(text);
    return new Set(Object.entries(listed ?? {}).filter(([, value]) => value === true).map(([name]) => name.toLowerCase()));
  } catch {
    return new Set();
  }
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
      // A missing file, or a file where a directory on its path belongs, holds nothing to prune: the
      // claim simply ends. Anything else cannot be inspected safely.
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") continue;
      configMerges.push({
        kind: "mcp",
        action: "blocked",
        relativeOutput: entry.path,
        error: `obsolete MCP config route cannot be inspected safely: ${entry.path}: ${error.message}`,
      });
      continue;
    }
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
  if (plan.notices.length > 0) {
    const today = localDate();
    console.log("notices:");
    for (const notice of plan.notices) {
      for (const line of formatNotice(notice, today)) console.log(`  ${line}`);
    }
  }
  if (plan.warnings.length > 0) {
    console.log("warnings:");
    for (const item of plan.warnings) console.log(`  ${item}`);
  }
  console.log("planned writes:");
  for (const item of plan.writes) {
    console.log(`  ${path.relative(plan.installRoot, item.output)} <- ${item.source}`);
  }
  const removes = plan.staleRemovalActions
    .filter((item) => (item.action === "remove" || item.action === "missing") && !item.migratedTo)
    .map((item) => item.relativeOutput);
  console.log("planned stale managed removals:");
  if (removes.length === 0) {
    console.log("  none");
  } else {
    for (const item of removes) console.log(`  ${item}`);
  }
  const retained = plan.staleRemovalActions
    .filter((item) => item.action === "retain" && !item.migratedTo)
    .map((item) => `${item.relativeOutput} (claimed by ${(item.retainedFor ?? []).join(", ")})`);
  console.log("planned stale managed paths retained for other owners:");
  if (retained.length === 0) {
    console.log("  none");
  } else {
    for (const item of retained) console.log(`  ${item}`);
  }
  if (plan.releasedLegacyPaths.length > 0) {
    console.log("legacy paths left in place without a claim:");
    for (const item of plan.releasedLegacyPaths) console.log(`  ${item}`);
  }
  const migrationLines = [
    ...plan.staleRemovalActions.filter((item) => item.migratedTo).map((item) => (item.action === "remove"
      ? `${item.relativeOutput} -> ${item.migratedTo}: identical to the replacement; removed after it is written`
      : `${item.relativeOutput} -> ${item.migratedTo}: identical to the replacement; kept, still claimed by ${(item.retainedFor ?? []).join(", ")}`)),
    ...plan.routeMigrations.filter((item) => item.action === "retain").map((item) => `${item.from} -> ${item.to}: kept; see warnings`),
    ...plan.routeMigrations.filter((item) => item.action === "missing").map((item) => `${item.from} -> ${item.to}: already gone; its claim ends`),
  ];
  if (migrationLines.length > 0) {
    console.log("planned route migrations:");
    for (const line of migrationLines) console.log(`  ${line}`);
  }
  const handoverLines = [
    ...uniqueStrings(plan.handovers.map((item) => item.successor)).flatMap((successor) => {
      const items = plan.handovers.filter((item) => item.successor === successor);
      const released = items.filter((item) => item.released).length;
      const kept = items.length - released;
      return [
        ...(kept > 0 ? [`${successor}: ${kept} former path${kept === 1 ? "" : "s"} kept in place until ${successor} claims them`] : []),
        ...(released > 0 ? [`${successor}: ${released} former path${released === 1 ? "" : "s"} released to ${successor}`] : []),
      ];
    }),
    ...plan.configHandovers.map((item) => (item.released
      ? `${item.successor}: ${item.path} ${item.ids.join(", ")} released to ${item.successor}`
      : `${item.successor}: ${item.path} ${item.ids.join(", ")} kept until ${item.successor} claims them`)),
  ];
  if (handoverLines.length > 0) {
    console.log("planned handovers to successor targets:");
    for (const line of handoverLines) console.log(`  ${line}`);
  }
  if (plan.adoptions.length > 0) {
    console.log("adopted from former targets:");
    for (const line of plan.adoptions) console.log(`  ${line}`);
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
  if (plan.skippedConfigRoutes.length > 0) {
    console.log("skipped config routes:");
    for (const item of plan.skippedConfigRoutes) console.log(`  ${item}`);
  }
  if (plan.nonApplicable && plan.nonApplicable.length > 0) {
    console.log("non-applicable at this scope:");
    for (const item of plan.nonApplicable) console.log(`  ${item} (project-scope only)`);
  }
  if (plan.notApplicableCategories) {
    console.log(`not applicable: ${plan.notApplicableCategories}`);
  }
  console.log("blocked:");
  const rootBlocked = plan.rootClaims.blocked.length > 0 ? ["this install root is blocked; see install blocked below"] : [];
  if (plan.blocked.length + rootBlocked.length === 0) {
    console.log("  none");
  } else {
    for (const item of [...plan.blocked, ...rootBlocked]) console.log(`  ${item}`);
  }
}

// Every participant's pending manifest lands before the run's first write, removal or config merge,
// so a path one target releases and another newly claims stays claimed throughout (contract
// Migration steps 6 and 7). There is no multi-file transaction: a late failure is reported, never
// rolled back, and the pending manifests let the same install be rerun to finish.
async function applyInstallPlans(plans) {
  const progress = { applying: false, plan: null, operations: [], index: 0, failedPath: null };
  try {
    for (const plan of plans) {
      Object.assign(progress, { plan, failedPath: path.relative(plan.installRoot, plan.manifestPath) });
      await writeManifestFile(plan, pendingManifest(plan));
    }
    progress.applying = true;
    for (const plan of plans) {
      progress.plan = plan;
      await applyInstallPlan(plan, progress);
    }
    return true;
  } catch (error) {
    reportInterruptedInstall(progress, plans, error);
    return false;
  }
}

// Names what landed and what did not, path by path and without content (contract Migration step 7).
function reportInterruptedInstall({ applying, plan, operations, index, failedPath }, plans, error) {
  console.log(`install interrupted: ${plan.target}: ${failedPath}: ${error.message}`);
  if (!applying) {
    console.log("  no planned write, removal or config merge ran; rerun the same install");
    return;
  }
  const position = plans.indexOf(plan);
  const applied = plans.slice(0, position).map((item) => item.target);
  console.log(`  targets applied before it: ${applied.length > 0 ? applied.join(", ") : "none"}`);
  for (const [label, list] of [["completed", operations.slice(0, index)], ["pending", operations.slice(index)]]) {
    console.log(`  ${label} for ${plan.target}: ${list.length}`);
    for (const operation of list) console.log(`    ${operation.kind} ${operation.path}`);
  }
  const notApplied = plans.slice(position + 1).map((item) => item.target);
  if (notApplied.length > 0) console.log(`  not applied: ${notApplied.join(", ")}`);
  console.log("  nothing was rolled back; the pending manifests still claim every planned path, so rerun the same install to finish");
}

// The union of what the plan held and what it will hold: a path in both keeps its next entry, and a
// config entry keeps the IDs of both, so every planned write and removal stays claimed.
function pendingManifest(plan) {
  const managed = new Map(plan.previousFileEntries.map((entry) => [claimKey(entry.output), entry]));
  for (const entry of plan.manifest.managed) managed.set(claimKey(entry.output), entry);
  return {
    ...plan.manifest,
    managed: [...managed.values()].sort((left, right) => left.output.localeCompare(right.output)),
    config_entries: unionConfigEntries(plan.previousConfigEntries, plan.manifest.config_entries),
  };
}

function unionConfigEntries(previousEntries, nextEntries) {
  const union = new Map(previousEntries.map((entry) => [configEntryKey(entry.path, entry.format), entry]));
  for (const entry of nextEntries) {
    const key = configEntryKey(entry.path, entry.format);
    const earlier = union.get(key);
    if (!earlier) {
      union.set(key, entry);
      continue;
    }
    const assetCategories = { ...earlier.asset_categories, ...entry.asset_categories };
    union.set(key, {
      path: entry.path,
      format: entry.format,
      ids: uniqueStrings([...earlier.ids, ...entry.ids]).sort(),
      ...(Object.keys(assetCategories).length > 0 ? { asset_categories: assetCategories } : {}),
    });
  }
  return [...union.values()].sort(
    (left, right) => configEntryKey(left.path, left.format).localeCompare(configEntryKey(right.path, right.format)),
  );
}

// One ordered list of what applying a plan does: writes, then removals of stale paths, then config
// merges, then the final manifest. The same list drives the apply and the interrupted report.
function applyOperations(plan) {
  return [
    ...plan.writes.map((item) => ({ kind: item.action === "skip" ? "unchanged" : "write", path: item.relativeOutput, item })),
    ...plan.staleRemovalActions
      .filter((item) => item.action === "remove")
      .map((item) => ({ kind: "remove", path: item.relativeOutput, item })),
    ...plan.configMerges.map((item) => ({ kind: "merge", path: item.relativeOutput, item })),
    { kind: "manifest", path: path.relative(plan.installRoot, plan.manifestPath) },
  ];
}

async function applyInstallPlan(plan, progress) {
  const operations = applyOperations(plan);
  const done = { written: 0, skipped: 0, removed: 0, migrated: 0, merged: 0 };
  Object.assign(progress, { operations, index: 0, failedPath: plan.installRoot });
  await mkdir(plan.installRoot, { recursive: true });
  for (const [index, operation] of operations.entries()) {
    Object.assign(progress, { index, failedPath: operation.path });
    await applyOperation(plan, operation, done);
  }
  progress.index = operations.length;

  console.log("installed:");
  console.log(`  wrote: ${done.written}`);
  console.log(`  skipped unchanged: ${done.skipped}`);
  console.log(`  removed stale: ${done.removed}`);
  if (done.migrated > 0) console.log(`  removed migrated routes: ${done.migrated}`);
  console.log(`  config merges: ${done.merged}`);
}

async function applyOperation(plan, { kind, item }, done) {
  if (kind === "unchanged") {
    // Identical content, but a mode the output declares still has to hold: a companion script
    // restored from a non-executable copy would otherwise stay unrunnable forever.
    if (item.mode !== undefined) await applyOutputMode(item.output, item.mode);
    done.skipped += 1;
  } else if (kind === "write") {
    await assertInstallPath(plan.installRoot, item.output, `managed output ${item.relativeOutput}`);
    await mkdir(path.dirname(item.output), { recursive: true });
    await assertInstallPath(plan.installRoot, item.output, `managed output ${item.relativeOutput}`);
    await writeFile(item.output, item.content);
    if (item.mode !== undefined) await applyOutputMode(item.output, item.mode);
    done.written += 1;
  } else if (kind === "remove") {
    await assertInstallPath(plan.installRoot, item.output, `stale managed output ${item.relativeOutput}`);
    await rm(item.output, { force: true });
    if (item.migratedTo) done.migrated += 1;
    else done.removed += 1;
  } else if (kind === "merge") {
    const result = await applyConfigMerge(item);
    done.merged += result.changed ? 1 : 0;
  } else {
    await writeManifestFile(plan, plan.manifest);
  }
}

// Replaced atomically, so a crash leaves the previous or the new manifest, never a torn one.
async function writeManifestFile(plan, manifest) {
  await assertInstallPath(plan.installRoot, plan.manifestPath, "manifest path");
  await mkdir(path.dirname(plan.manifestPath), { recursive: true });
  await assertInstallPath(plan.installRoot, plan.manifestPath, "manifest path");
  const temporary = `${plan.manifestPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    await rename(temporary, plan.manifestPath);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function assertInstallPath(safetyRoot, candidate, label) {
  const routeError = await installPathError(safetyRoot, candidate, label);
  if (routeError) throw new Error(routeError);
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
  if (merge.action === "blocked") throw new Error(merge.error);
  await assertInstallPath(merge.safetyRoot, merge.output, `config ${merge.relativeOutput}`);
  await mkdir(path.dirname(merge.output), { recursive: true });
  await assertInstallPath(merge.safetyRoot, merge.output, `config ${merge.relativeOutput}`);
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
