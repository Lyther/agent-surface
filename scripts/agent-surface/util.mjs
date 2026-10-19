// Foundational primitives shared across the compiler. No module-global state, so any
// other module can import these without coupling back into agent-surface.mjs.
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

// True if `file` is a safe repo-relative path (no absolute, no `..` traversal).
export function isSafeRelativePath(file) {
  return file !== "" && !path.isAbsolute(file) && !file.split(/[\\/]+/).includes("..");
}

export function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

// What a command was given, in order: options, the values that follow their flags, and the words that
// are neither. A value follows its flag even when it starts with `-`; `--` ends the options only for a
// command that hands the rest on (`rest`, as `run` does) and is an option elsewhere.
function givenArgs(args, { values = [], rest = false }) {
  const given = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--" && rest) break;
    if (values.includes(arg)) {
      given.push({ kind: "option", arg }, { kind: "value", arg: args[index + 1], of: arg });
      index += 1;
    } else {
      given.push({ kind: arg.startsWith("-") ? "option" : "word", arg });
    }
  }
  return given;
}

export function helpRequested(args, spec = {}) {
  return givenArgs(args, spec).some(({ kind, arg }) => kind === "option" && (arg === "--help" || arg === "-h"));
}

// Rejects the first argument the command would not read: an unknown option, a word after its
// subcommand, or a one-value option given again. An option takes one value, so `--target a b` and
// `--target a --target b` each read `a` alone where the option is not a list.
export function rejectUnknownArgs(command, args, spec = {}) {
  const { values = [], switches = [], lists = [], repeatable = [] } = spec;
  const given = givenArgs(args, spec);
  const seen = new Set();
  for (const [index, { kind, arg }] of given.entries()) {
    if (kind === "word") {
      const flag = given[index - 1]?.kind === "value" ? given[index - 1].of : null;
      const hint = lists.includes(flag) ? `; ${flag} takes a comma-separated list` : repeatable.includes(flag) ? `; repeat ${flag} for each value` : "";
      fail(`unexpected argument for ${command}: ${arg}${hint}`);
    }
    if (kind !== "option" || switches.includes(arg)) continue;
    if (!values.includes(arg)) {
      const known = [...values, ...switches];
      fail(`unknown option for ${command}: ${arg}; ${known.length > 0 ? `it accepts ${known.join(", ")}` : "it takes no options"}`);
    }
    if (seen.has(arg) && !lists.includes(arg) && !repeatable.includes(arg)) fail(`${arg} is given twice; ${command} reads one value`);
    seen.add(arg);
  }
}

export function argValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? fail(`missing value for ${name}`);
}

export function argValues(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1] ?? fail(`missing value for ${name}`);
    values.push(value);
    index += 1;
  }
  return values;
}

export function splitArgValues(values) {
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export function requiredArgValue(args, name) {
  return argValue(args, name) ?? fail(`missing required ${name}`);
}

export function uniqueStrings(values) {
  return [...new Set(values)].sort();
}

export function globMatches(glob, file) {
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

export function isSafeTargetName(target) {
  return typeof target === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(target);
}

export function isPathInside(parent, candidate) {
  const relativePath = path.relative(parent, candidate);
  return relativePath === "" || isSafeRelativePath(relativePath);
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function safeTimestamp(value) {
  return value.replace(/[:.]/g, "-");
}

export function safeFilename(value) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}
