// Filesystem read/parse helpers shared by install, workflow, doctor, and the CLI.
// Thin wrappers over node:fs/promises that return null (not throw) on ENOENT and
// route JSON/JSONC parse failures through fail() with a repo-relative label.
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { parseJsoncResult } from "./jsonc.mjs";
import { relative, root } from "./registry.mjs";
import { exists, fail } from "./util.mjs";

export async function removeTree(target) {
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

export function parseJsonc(text, label) {
  const result = parseJsoncResult(text);
  if (result.ok) return result.value;
  fail(`${label}: invalid JSONC: ${result.error.message}`);
}

export async function readJsonIfExists(file) {
  if (!(await exists(file))) return null;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    fail(`failed to parse JSON at ${relative(file)}: ${error.message}`);
  }
}

export async function readJsoncIfExists(file) {
  if (!(await exists(file))) return null;
  return parseJsonc(await readFile(file, "utf8"), path.relative(root, file));
}

export async function readFileIfExists(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
