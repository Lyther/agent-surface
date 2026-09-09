// Prerequisite provisioning: detect (read-only) each selected MCP service's executable
// requirements + runtime floors, resolve their ABSOLUTE paths (so IDE launches never depend on an
// interactive shell's PATH), and build a consolidated, per-platform install plan for what is
// missing. Execution (running the recipes) lives in the executor; this module is pure detection +
// planning so the planner can call it in dry-run and headless modes without side effects.
//
// Detection is deliberately strict: an existing path only counts when it is a REGULAR, EXECUTABLE
// file (a directory or a non-executable file is not a usable launch binary); a declared runtime
// floor is checked against the resolved binary; and a Python library requirement is checked inside
// the tool's OWN interpreter environment, so an installed launcher never masks missing extras.
// Each platform's recipes are ordered ALTERNATIVES: the planner selects the first whose `requires`
// command is present (or that declares none), so Linux picks the actual package manager instead of
// assuming apt.
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const PLATFORM = process.platform; // "darwin" | "linux" | "win32"

function expandHome(target, homedir = os.homedir()) {
  if (target === "~") return homedir;
  if (target.startsWith("~/")) return path.join(homedir, target.slice(2));
  return target;
}

// Windows decides executability by EXTENSION, not by a permission bit: only a name ending in a
// PATHEXT entry is launchable. The OS value wins when present; the fallback is the conservative
// core set (a machine-agnostic default must not invent script-host extensions). Extensions are
// parsed with the win32 API so a backslash path is split correctly even when this runs on POSIX.
const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";
function windowsExtensions(env) {
  return (env.PATHEXT || DEFAULT_PATHEXT).split(";").map((ext) => ext.trim().toLowerCase()).filter(Boolean);
}
function hasWindowsExecutableExtension(target, env) {
  const ext = path.win32.extname(target).toLowerCase();
  return ext !== "" && windowsExtensions(env).includes(ext);
}

// A usable launch binary must be a regular file the OS will actually execute: on POSIX any execute
// bit set, on Windows a PATHEXT extension. A directory, a non-executable regular file, and (on
// Windows) an extensionless or non-PATHEXT file are all NOT usable — so a declared POSIX-style
// location such as `~/.local/bin/uv` is correctly rejected on Windows instead of reading satisfied.
// Only the executability RULE is platform-driven; path mechanics stay native (on real Windows the
// native path API is already the win32 one), so this is testable against a real filesystem.
export function isExecutableFile(target, platform = PLATFORM, env = process.env) {
  let info;
  try {
    info = statSync(target); // follows symlinks: a symlink to a real executable resolves correctly
  } catch {
    return false;
  }
  if (!info.isFile()) return false;
  if (platform === "win32") return hasWindowsExecutableExtension(target, env);
  return (info.mode & 0o111) !== 0;
}

// Dependency-free PATH resolution (no `which`/`command -v` subshell): scan PATH, honoring PATHEXT
// on Windows, and accept only an EXECUTABLE regular file. An input that is already a path is
// returned when it is itself executable. Returns an absolute path or null. This is the same
// resolution the wrapper needs, so the config can point at a real binary.
export function whichSync(command, { platform = PLATFORM, env = process.env } = {}) {
  if (command.includes("/") || command.includes("\\")) {
    return isExecutableFile(command, platform, env) ? path.resolve(command) : null;
  }
  const dirs = (env.PATH || "").split(path.delimiter).filter(Boolean);
  // On Windows a bare name is probed with each PATHEXT suffix; a name that ALREADY carries one
  // (e.g. "node.exe") is also probed as-is, so an explicit extension is not double-suffixed.
  const exts = platform === "win32"
    ? [...(hasWindowsExecutableExtension(command, env) ? [""] : []), ...windowsExtensions(env)]
    : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext);
      if (isExecutableFile(candidate, platform, env)) return path.resolve(candidate);
    }
  }
  return null;
}

// The launch NAME a resolved binary provides, for comparison against a registry command. Windows
// binaries carry a PATHEXT extension the registry name never has (`npx` → `npx.cmd`, `uv` →
// `uv.exe`), so it is stripped there; on POSIX this is just the file name.
export function launchNameOf(target, platform = PLATFORM, env = process.env) {
  const base = (platform === "win32" ? path.win32 : path).basename(target);
  if (platform !== "win32") return base;
  const ext = path.win32.extname(base).toLowerCase();
  return ext && windowsExtensions(env).includes(ext) ? base.slice(0, -ext.length) : base;
}

// Read a binary's `--version` (e.g. node) and normalize to a bare "x.y.z". Null on any failure.
export function commandVersion(binPath) {
  try {
    const res = spawnSync(binPath, ["--version"], { encoding: "utf8" });
    if (res.status !== 0 || typeof res.stdout !== "string") return null;
    const match = res.stdout.match(/(\d+)\.(\d+)\.(\d+)/);
    return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
  } catch {
    return null;
  }
}

// Compare a bare version against a ">=x.y.z" floor. Unknown/malformed inputs fail closed (false).
export function satisfiesFloor(actual, floor) {
  const f = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(floor ?? "");
  const a = /^(\d+)\.(\d+)\.(\d+)$/.exec(actual ?? "");
  if (!f || !a) return false;
  for (let i = 1; i <= 3; i += 1) {
    const av = Number(a[i]);
    const fv = Number(f[i]);
    if (av > fv) return true;
    if (av < fv) return false;
  }
  return true;
}

// Choose the applicable recipe for a platform from its ordered alternatives: the first whose
// `requires` command resolves on PATH (or that declares no `requires`). Returns null when the
// platform has no alternative that can run here (e.g. Linux with none of apt/dnf/pacman/zypper) —
// a genuine "cannot provision here" that surfaces as a blocker for a required prerequisite.
export function selectRecipe(candidates, { platform = PLATFORM, env = process.env } = {}) {
  for (const candidate of candidates ?? []) {
    if (!candidate.requires || whichSync(candidate.requires, { platform, env })) return candidate;
  }
  return null;
}

// Read a single directory path a tool prints (e.g. `uv tool dir`). Null on any failure, so an
// unavailable manager degrades to the declared fallback locations instead of throwing.
function readPathOutput(binPath, args, env) {
  try {
    const res = spawnSync(binPath, args, { encoding: "utf8", env });
    if (res.status !== 0 || typeof res.stdout !== "string") return null;
    return res.stdout.split("\n")[0].trim() || null;
  } catch {
    return null;
  }
}

// Candidate interpreters, most authoritative first. A tool manager knows where it puts its
// environments and the layout is platform-specific (uv: `~/.local/share/uv/tools` on POSIX,
// `%APPDATA%\uv\data\tools` on Windows, and either can be redirected by env/config), so ASK the
// manager that was already detected for this service rather than hard-coding another directory
// variant per platform. The literal `interpreter` list remains as the fallback for when the manager
// cannot be resolved. Registry order guarantees the manager is detected before its dependents.
function pythonInterpreterCandidates(python, { homedir, env, siblings }) {
  const candidates = [];
  const root = python.interpreter_root;
  const managerPath = root ? siblings?.get(root.prerequisite)?.resolvedPath : null;
  if (managerPath) {
    const dir = readPathOutput(managerPath, root.run ?? [], env);
    if (dir) for (const sub of python.interpreter_subpaths ?? []) candidates.push(path.join(dir, sub));
  }
  for (const literal of python.interpreter ?? []) candidates.push(expandHome(literal, homedir));
  return candidates;
}

// Check a Python library requirement inside a SPECIFIC interpreter's environment (e.g. a uv tool
// venv), using importlib.util.find_spec so nothing is imported/executed. Returns whether every
// module is importable there, plus the interpreter used. An installed console script therefore
// never hides missing library extras — the modules are probed in the environment that actually
// runs the tool.
function detectPython(python, { homedir, env, platform, siblings }) {
  const interpreter = pythonInterpreterCandidates(python, { homedir, env, siblings })
    .find((candidate) => isExecutableFile(candidate, platform, env)) ?? null;
  if (!interpreter) return { ok: false, interpreter: null };
  const modules = python.modules ?? [];
  const probe = `import importlib.util as u, sys; sys.exit(0 if all(u.find_spec(m) for m in ${JSON.stringify(modules)}) else 1)`;
  try {
    const res = spawnSync(interpreter, ["-c", probe], { encoding: "utf8", env });
    return { ok: res.status === 0, interpreter };
  } catch {
    return { ok: false, interpreter };
  }
}

// Detect one prerequisite (read-only): resolve its executable path (explicit locations first, then
// PATH), check any runtime floor against the RESOLVED binary, and check any Python modules inside
// the tool's own interpreter. Returns the SELECTED recipe alternative for the current platform when
// it is missing/unsatisfied (null when nothing here can install it). `siblings` are this service's
// EARLIER prerequisite detections (registry order is dependency order), so a dependent can ask an
// already-resolved tool where it keeps its environments instead of guessing per-platform layouts.
export function detectPrerequisite(prereq, { platform = PLATFORM, homedir = os.homedir(), env = process.env } = {}, siblings = null) {
  const detect = prereq.detect ?? {};
  const declaresPath = (detect.paths?.length ?? 0) > 0 || Boolean(detect.command);
  let resolvedPath = null;
  for (const candidate of detect.paths ?? []) {
    const abs = expandHome(candidate, homedir);
    if (isExecutableFile(abs, platform, env)) { resolvedPath = abs; break; }
  }
  if (!resolvedPath && detect.command) resolvedPath = whichSync(detect.command, { platform, env });
  const pathOk = declaresPath ? resolvedPath !== null : true;

  let nodeActual = null;
  let nodeOk = true;
  if (detect.node) {
    // Prefer the resolved runtime binary; fall back to the CLI's own Node when the floor is on Node
    // itself and no separate path resolved.
    const probe = resolvedPath && /node(\.exe)?$/.test(resolvedPath) ? resolvedPath : whichSync("node", { platform, env });
    nodeActual = probe ? commandVersion(probe) : null;
    nodeOk = satisfiesFloor(nodeActual, detect.node);
  }

  let pythonOk = true;
  let pythonInterpreter = null;
  if (detect.python) {
    const result = detectPython(detect.python, { homedir, env, platform, siblings });
    pythonOk = result.ok;
    pythonInterpreter = result.interpreter;
  }

  const satisfied = pathOk && nodeOk && pythonOk;
  const candidates = prereq.recipes?.[platform] ?? [];
  return {
    id: prereq.id,
    kind: prereq.kind,
    optional: prereq.optional === true,
    launchArg: prereq.launch_arg ?? null,
    satisfied,
    resolvedPath,
    nodeFloor: detect.node ?? null,
    nodeActual,
    nodeOk,
    pythonModules: detect.python ? (detect.python.modules ?? []) : null,
    pythonOk,
    pythonInterpreter,
    recipe: satisfied ? null : selectRecipe(candidates, { platform, env }),
    recipeCandidates: candidates.length,
  };
}

// Build the provisioning status for the selected services. `serviceEntries` are [id, service]
// pairs (only services with a `provisioning` block contribute). Returns per-service detection with
// the missing prerequisites' selected recipes, in dependency order (registry order: tools/runtimes
// before the binary that needs them).
export function provisioningStatus(serviceEntries, options = {}) {
  const services = [];
  for (const [id, service] of serviceEntries) {
    const provisioning = service.provisioning;
    if (!provisioning) continue;
    // Detect in registry order and carry the results forward: a prerequisite may need an earlier
    // one's resolved path (e.g. asking uv for its tool directory instead of assuming the layout).
    const detected = new Map();
    const prerequisites = provisioning.prerequisites.map((prereq) => {
      const result = detectPrerequisite(prereq, options, detected);
      detected.set(prereq.id, result);
      return result;
    });
    services.push({ id, prerequisites });
  }
  return services;
}

// The missing REQUIRED prerequisites across all services that have no runnable recipe on this
// platform — an install cannot complete them, so they must fail the run (headless) or be surfaced
// as blockers. "No runnable recipe" covers both an undeclared platform and a declared platform
// whose alternatives all require an absent package manager.
export function unrecipedRequired(status, platform = PLATFORM) {
  const blockers = [];
  for (const service of status) {
    for (const prereq of service.prerequisites) {
      if (!prereq.satisfied && !prereq.optional && !prereq.recipe) {
        blockers.push({ service: service.id, id: prereq.id, platform });
      }
    }
  }
  return blockers;
}

// The ordered list of install actions (missing, has a runnable recipe) — each with its service, the
// selected step, and whether it needs elevation. Optional-missing prerequisites are included so the
// plan surfaces them, flagged optional.
export function provisioningActions(status) {
  const actions = [];
  for (const service of status) {
    for (const prereq of service.prerequisites) {
      if (prereq.satisfied || !prereq.recipe) continue;
      const step = prereq.recipe;
      actions.push({
        service: service.id,
        prerequisite: prereq.id,
        optional: prereq.optional,
        run: step.run,
        cwd: step.cwd ?? null,
        elevation: step.elevation === true,
        source: step.source,
      });
    }
  }
  return actions;
}

// Human-readable plan lines (names + sources + elevation only; never secrets). One line per
// prerequisite of each selected provisioned service.
export function formatProvisioningPlan(status) {
  const lines = [];
  for (const service of status) {
    for (const prereq of service.prerequisites) {
      if (prereq.satisfied) {
        lines.push(`  ${service.id}: ${prereq.id} ok${prereq.resolvedPath ? ` (${prereq.resolvedPath})` : ""}`);
      } else if (prereq.recipe) {
        const elevated = prereq.recipe.elevation ? " [needs elevation]" : "";
        lines.push(`  ${service.id}: ${prereq.id} MISSING → ${prereq.recipe.source}${elevated}${prereq.optional ? " (optional)" : ""}`);
      } else {
        const why = prereq.nodeFloor && !prereq.nodeOk
          ? `needs node ${prereq.nodeFloor} (found ${prereq.nodeActual ?? "none"})`
          : prereq.recipeCandidates > 0
            ? "no supported package manager found"
            : "no recipe for this platform";
        lines.push(`  ${service.id}: ${prereq.id} MISSING → ${why}${prereq.optional ? " (optional)" : ""}`);
      }
    }
  }
  return lines;
}
