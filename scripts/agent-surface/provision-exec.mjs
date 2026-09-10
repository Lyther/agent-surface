// Prerequisite provisioning EXECUTOR: the side-effecting half of provisioning. provision.mjs is
// pure detection + planning; this module decides whether an install is authorized to run the
// recipes (interactive asks once, -y authorizes, headless never prompts, --dry-run never reaches
// here) and then runs them, re-detecting afterward so the wire/no-wire decision is proven by the
// filesystem — not by a recipe's exit code alone. A service whose REQUIRED prerequisite is still
// missing after execution is reported as failed so the caller can skip wiring it while leaving its
// existing config untouched (working installs are preserved; completed prerequisites are reused).
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { launchSpec } from "./mcp-env-launch.mjs";
import { launchNameOf, PLATFORM, provisioningActions, provisioningStatus, whichSync } from "./provision.mjs";

// Resolve a recipe's command to an absolute path when a prerequisite installed EARLIER in this run
// now provides it — so `uv tool install …` runs the uv just installed into an off-PATH directory
// (e.g. ~/.local/bin on a fresh HOME) instead of a bare `uv` that spawn cannot find. A command that
// already carries a path is used verbatim; otherwise fall back to a normal PATH lookup, or the bare
// name (letting spawn surface an honest ENOENT) when nothing resolves.
function resolveActionCommand(command, status, options) {
  if (command.includes("/") || command.includes("\\")) return command;
  for (const service of status) {
    for (const prereq of service.prerequisites) {
      if (prereq.resolvedPath && launchNameOf(prereq.resolvedPath, options.platform, options.env) === command) {
        return prereq.resolvedPath;
      }
    }
  }
  return whichSync(command, options) ?? command;
}

// Collapse actions that run the exact same command in the same working directory to one execution —
// a runtime shared by several selected services (e.g. Node) is installed once, in dependency order
// (registry order is preserved: tools/runtimes before the binary that needs them).
export function dedupeActions(actions) {
  const seen = new Set();
  const deduped = [];
  for (const action of actions) {
    const key = JSON.stringify([action.run, action.cwd ?? null]);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(action);
  }
  return deduped;
}

// Decide what an install should do about missing prerequisites, without side effects, so the policy
// is unit-testable in isolation. `actions` are missing prerequisites that HAVE a recipe; `blockers`
// are missing REQUIRED prerequisites with NO recipe for this platform (unsatisfiable here).
//
// A blocker only removes ITS OWN service: that service cannot be provisioned here, so the caller
// drops it and its recipes are not run — but it must not suppress a sibling's runnable recipe. An
// install of Chrome DevTools plus Synapse on native Windows still provisions Chrome DevTools.
//   proceed                 — no runnable recipe is needed; wire what is satisfied.
//   install                 — authorized (-y) to run the runnable recipes now.
//   confirm                 — a TTY is attached; ask once before running them.
//   block(needs-authorization) — headless with required gaps and no -y; never prompt. The caller
//                                reports this and drops the services it affects, keeping the rest.
export function provisioningDecision({ actions, blockers = [], interactive, authorized, dryRun }) {
  const unprovisionable = new Set(blockers.map((item) => item.service));
  const runnable = actions.filter((action) => !unprovisionable.has(action.service));
  const requiredActions = runnable.filter((action) => !action.optional);
  if (runnable.length === 0) return { kind: "proceed", unprovisionable };
  // A dry-run never runs recipes; it only shows the plan and returns before the apply phase.
  if (dryRun) return { kind: "proceed", unprovisionable };
  if (authorized) return { kind: "install", actions: runnable, unprovisionable };
  if (interactive) return { kind: "confirm", actions: runnable, mustAuthorize: requiredActions.length > 0, unprovisionable };
  // Headless without -y: only REQUIRED gaps stop the recipes; optional-only gaps are just skipped.
  if (requiredActions.length > 0) return { kind: "block", reason: "needs-authorization", actions: requiredActions, unprovisionable };
  return { kind: "proceed", unprovisionable };
}

// Run the missing prerequisites' recipes (deduped), then RE-DETECT so readiness reflects the real
// filesystem. Returns per-run results plus the set of service ids whose required prerequisites are
// still unsatisfied afterward. `spawnFn` is injected in tests; recipes inherit stdio in production so
// interactive elevation (sudo/npm) can prompt. Detection stays real (existsSync/version), so a recipe
// that "succeeds" without producing its binary still marks the service failed.
export function runProvisioning(serviceEntries, options = {}) {
  const {
    platform = PLATFORM, env = process.env, homedir = os.homedir(),
    spawnFn = spawnSync, repoRoot = process.cwd(), onLog = () => {},
    skipServices = new Set(),
  } = options;
  const detectOptions = { platform, env, homedir };
  const before = provisioningStatus(serviceEntries, detectOptions);
  // Do not install anything for a service that cannot be completed here anyway (one of its
  // prerequisites has no recipe on this platform) — that would be a real side effect, e.g. a
  // machine-wide Node install, for a server the run is about to drop.
  const actions = dedupeActions(provisioningActions(before).filter((action) => !skipServices.has(action.service)));
  const ran = [];
  for (const action of actions) {
    const cwd = action.cwd === "repo" ? repoRoot : undefined;
    // Re-detect before each step so a prerequisite installed by an earlier step (e.g. uv) resolves to
    // its actual path even when its install directory is not on PATH; then launch the recipe command
    // by that resolved path instead of the bare name.
    const current = provisioningStatus(serviceEntries, detectOptions);
    const command = resolveActionCommand(action.run[0], current, detectOptions);
    onLog(`provisioning: ${action.source} (${action.run.join(" ")})${action.elevation ? " [elevated]" : ""}`);
    let result;
    try {
      // A recipe command that resolves to a Windows batch shim (npm.cmd, and anything else npm
      // links) cannot be spawned directly — Node refuses .cmd/.bat without a shell. Route it
      // through cmd.exe with per-token quoting, the same way the MCP launcher does.
      const spec = launchSpec(command, action.run.slice(1), platform);
      result = spawnFn(spec.file, spec.args, { stdio: "inherit", cwd, env, ...spec.options });
    } catch (error) {
      result = { status: null, error };
    }
    const ok = Boolean(result) && result.status === 0 && !result.error;
    ran.push({
      run: action.run,
      source: action.source,
      optional: action.optional === true,
      ok,
      code: result?.status ?? null,
      error: result?.error?.message ?? null,
    });
    onLog(ok ? `provisioning: ok ${action.source}` : `provisioning: FAILED ${action.source} (${result?.error?.message ?? `exit ${result?.status}`})`);
  }
  const after = provisioningStatus(serviceEntries, detectOptions);
  const failed = new Set();
  for (const service of after) {
    for (const prereq of service.prerequisites) {
      if (!prereq.satisfied && !prereq.optional) failed.add(service.id);
    }
  }
  return { ran, before, after, failed };
}
