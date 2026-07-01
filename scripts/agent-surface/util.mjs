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
