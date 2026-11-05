// The Synapse PostToolUse hook entry for the three hosts whose hooks can add context to the model:
// Claude Code, Codex and Droid (mcps/synapse/architecture.md, Registration). The install adds the entry
// wherever it wires the synapse MCP server for those targets and removes it wherever it prunes that
// server. One JSON merge keeps every other key and hook; this module handles no other kind of hook.
import * as TOML from "@decimalturn/toml-patch";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseJsonc, removeJsoncValue, setJsoncPath } from "./jsonc.mjs";
import { shimFileName } from "./mcp-shims.mjs";

export const SYNAPSE_HOOK_TARGETS = new Set(["claude-code", "codex", "droid"]);
const EVENT = "PostToolUse";
// The variables that choose the store and project; the hook must see the values the server sees.
export const SYNAPSE_ROUTING_ENV = ["SYNAPSE_DB_DIR", "SYNAPSE_PROJECT", "SYNAPSE_NAMESPACE"];

/** The launcher mcps/synapse/install.mjs writes; an entry is Synapse's when its command runs it. */
export function synapseHookLauncher(home = os.homedir()) {
  return path.join(home, ".local", "bin", shimFileName("synapse-hook"));
}

// One shell word for `value`: bare when no character needs quoting, else single-quoted for POSIX
// shells, or double-quoted on Windows, whose paths keep their backslashes bare.
function shellWord(value) {
  const windows = process.platform === "win32";
  if ((windows ? /^[\w@%+=:,./\\-]+$/ : /^[\w@%+=:,./-]+$/).test(value)) return value;
  return windows ? `"${value}"` : `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * The command a host runs after each tool: the launcher, after the routing variables the synapse MCP
 * entry sets, so hook and server open the same store. An empty value stays: it overrides the host's own
 * value for the server, so it must for the hook. Hosts start hooks through their shell, and a Windows
 * command cannot prefix variables portably, so there the hook reads the host's environment.
 */
export function synapseHookCommand(home = os.homedir(), entryEnv = {}) {
  const launcher = shellWord(synapseHookLauncher(home));
  if (process.platform === "win32") return launcher;
  const routing = SYNAPSE_ROUTING_ENV.filter((key) => typeof entryEnv[key] === "string");
  return [...routing.map((key) => `${key}=${shellWord(entryEnv[key])}`), launcher].join(" ");
}

async function readText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * The file a target reads PostToolUse hooks from, relative to the install root, and the JSON path of
 * the event's list in it. Droid reads `.factory/hooks.json` when that file exists and the `hooks` key
 * of `.factory/settings.json` otherwise, so creating hooks.json would hide hooks a user keeps in
 * settings.json.
 */
export async function synapseHookRoute(target, installRoot) {
  if (target === "claude-code") return { relativeOutput: path.join(".claude", "settings.json"), eventPath: ["hooks", EVENT] };
  if (target === "codex") return { relativeOutput: path.join(".codex", "hooks.json"), eventPath: ["hooks", EVENT] };
  if (target !== "droid") return null;
  const hooksFile = path.join(".factory", "hooks.json");
  const settingsFile = path.join(".factory", "settings.json");
  if ((await readText(path.join(installRoot, hooksFile))) !== null) return { relativeOutput: hooksFile, eventPath: [EVENT] };
  const settings = await readText(path.join(installRoot, settingsFile));
  const settingsHooks = settings === null ? undefined : parseJsonc(settings, settingsFile)?.hooks;
  return settingsHooks === undefined
    ? { relativeOutput: hooksFile, eventPath: [EVENT] }
    : { relativeOutput: settingsFile, eventPath: ["hooks", EVENT] };
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
// Synapse's entry is one whose command synapseHookCommand could have written: the launcher, quoted or
// bare, after nothing but routing assignments. A rerun updates it and a prune finds it, while a user's
// own command around the launcher, such as `nice <launcher>`, stays the user's.
const ROUTING_PREFIX = new RegExp(`^(?:(?:${SYNAPSE_ROUTING_ENV.join("|")})=(?:'(?:[^']|'\\\\'')*'|[^\\s'"]*) )*`);
const runsLauncher = (hook, launcher) => isObject(hook) && typeof hook.command === "string"
  && [shellWord(launcher), launcher].includes(hook.command.replace(ROUTING_PREFIX, ""));
const holdsLauncher = (groups, launcher) =>
  Array.isArray(groups) && groups.some((group) => Array.isArray(group?.hooks) && group.hooks.some((hook) => runsLauncher(hook, launcher)));

/**
 * Add (`enabled`) or remove the entry that runs `hook.launcher` after every tool. Matching is by
 * launcher: a rerun changes nothing, an entry whose command differs only takes the new `hook.command`,
 * and a user's own matcher or timeout on that entry survives. Only that entry is inserted, updated or
 * deleted, so the user's entries keep their content and comments; removal keeps their bytes, while
 * an insertion re-indents an entry that shares its line. Returns the new text; a file whose hook keys
 * hold the wrong types is refused, never rewritten.
 */
export function mergeSynapseHook(text, eventPath, { launcher, command }, enabled, label) {
  const source = text ?? "{}";
  const root = parseJsonc(source, label);
  if (!isObject(root)) throw new Error(`${label}: the root must be an object`);
  let parent = root;
  for (const key of eventPath.slice(0, -1)) {
    parent = parent[key];
    if (parent === undefined) break;
    if (!isObject(parent)) throw new Error(`${label}: ${key} must be an object`);
  }
  const groups = parent?.[EVENT];
  if (groups !== undefined && !Array.isArray(groups)) throw new Error(`${label}: ${eventPath.join(".")} must be an array`);
  const present = holdsLauncher(groups, launcher);
  if (enabled && present) {
    let next = source;
    groups.forEach((group, g) => group?.hooks?.forEach?.((hook, h) => {
      if (runsLauncher(hook, launcher) && hook.command !== command) next = setJsoncPath(next, [...eventPath, g, "hooks", h, "command"], command);
    }));
    return next;
  }
  if (enabled) {
    const entry = { matcher: "*", hooks: [{ type: "command", command }] };
    return groups === undefined
      ? setJsoncPath(source, eventPath, [entry])
      : setJsoncPath(source, [...eventPath, groups.length], entry, { insert: true });
  }
  if (!present) return source;
  // From the last entry back, so the indexes still to visit stay valid.
  let next = source;
  let kept = groups.length;
  for (let g = groups.length - 1; g >= 0; g -= 1) {
    const hooks = groups[g]?.hooks;
    if (!Array.isArray(hooks) || !hooks.some((hook) => runsLauncher(hook, launcher))) continue;
    if (hooks.every((hook) => runsLauncher(hook, launcher))) {
      next = removeJsoncValue(next, [...eventPath, g]);
      kept -= 1;
      continue;
    }
    for (let h = hooks.length - 1; h >= 0; h -= 1) {
      if (runsLauncher(hooks[h], launcher)) next = removeJsoncValue(next, [...eventPath, g, "hooks", h]);
    }
  }
  if (kept > 0) return next;
  const without = removeJsoncValue(next, eventPath);
  // An event key this entry alone held leaves no empty `hooks` object behind.
  if (eventPath.length > 1 && Object.keys(parseJsonc(without, label)[eventPath[0]] ?? {}).length === 0) {
    return removeJsoncValue(without, [eventPath[0]]);
  }
  return without;
}

// The env of the synapse entry a config merge leaves in place: the user's own keys survive a merge, so
// this is what the server will run with. The three hook targets keep MCP servers in JSON or TOML.
function mergedSynapseEnv(merge) {
  if (!merge.content) return {};
  const config = merge.format === "codex-toml" ? TOML.parse(merge.content) : parseJsonc(merge.content, merge.relativeOutput);
  const env = config?.[merge.format === "codex-toml" ? "mcp_servers" : "mcpServers"]?.synapse?.env;
  return isObject(env) ? env : {};
}

/**
 * The hook change one target's install plan makes, or null when the plan leaves Synapse alone: the
 * entry follows the synapse MCP server, added where a config merge wires it and removed where one
 * prunes it.
 */
export async function planSynapseHook({ target, installRoot, configMerges, home = os.homedir() }) {
  if (!SYNAPSE_HOOK_TARGETS.has(target)) return null;
  const wiring = configMerges.find((merge) => (merge.entries ?? merge.mcpEntries ?? []).some(([id]) => id === "synapse"));
  const prunes = configMerges.some((merge) => (merge.removeMcpServers ?? []).includes("synapse"));
  if (!wiring && !prunes) return null;
  const route = await synapseHookRoute(target, installRoot);
  const output = path.join(installRoot, route.relativeOutput);
  const hook = { launcher: synapseHookLauncher(home), command: synapseHookCommand(home, wiring ? mergedSynapseEnv(wiring) : {}) };
  const current = await readText(output);
  const wires = wiring !== undefined;
  const content = mergeSynapseHook(current, route.eventPath, hook, wires, route.relativeOutput);
  return {
    output,
    relativeOutput: route.relativeOutput,
    change: wires ? "add" : "remove",
    action: content === (current ?? "{}") ? "skip" : "write",
    content: content.endsWith("\n") ? content : `${content}\n`,
  };
}

/** For doctor: whether the user-scope file `target` reads hooks from runs synapse-hook after every tool. */
export async function synapseHookStatus(target, home = os.homedir()) {
  let shown;
  let groups;
  try {
    // Droid's route itself parses settings.json, so a broken file there is reported, not thrown.
    const route = await synapseHookRoute(target, home);
    shown = path.join("~", route.relativeOutput);
    const text = await readText(path.join(home, route.relativeOutput));
    groups = text === null ? undefined : route.eventPath.reduce((node, key) => (isObject(node) ? node[key] : undefined), parseJsonc(text, shown));
  } catch (error) {
    return `unreadable: ${error.message}`;
  }
  return holdsLauncher(groups, synapseHookLauncher(home))
    ? `registered (${shown})`
    : `not registered in ${shown} (agent-surface install --target ${target} --category mcps)`;
}
