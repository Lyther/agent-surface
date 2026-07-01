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
