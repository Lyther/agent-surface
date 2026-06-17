import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(moduleDir, "../..");

let ignoreSourceCache;

export async function checkIgnores(targets) {
  const ignore = await readIgnores();
  const emitters = Object.entries(targets)
    .filter(([, adapter]) => adapter.ignoreFilename)
    .map(([name]) => name)
    .sort();
  const errors = [];

  if (!ignore) {
    errors.push("ignores/default.ignore is missing");
  } else if (ignore.body.trim().length === 0) {
    errors.push("ignores/default.ignore is empty");
  }

  console.log(`ignores: source ${ignore ? "ok" : "missing"}, emitters ${emitters.length} (${emitters.join(", ")})`);
  if (errors.length > 0) {
    console.log("errors:");
    for (const error of errors) console.log(`  ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("ignores check: ok");
}

export async function ignoreOutputs(adapter) {
  if (!adapter.ignoreFilename) return [];
  const ignore = await readIgnores();
  if (!ignore) return [];
  return [{
    source: ignore.source,
    relativeOutput: adapter.ignoreFilename,
    content: ignore.body,
  }];
}

async function readIgnores() {
  if (ignoreSourceCache !== undefined) return ignoreSourceCache;
  const file = path.join(root, "ignores", "default.ignore");
  ignoreSourceCache = await exists(file) ? { source: relative(file), body: await readFile(file, "utf8") } : null;
  return ignoreSourceCache;
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function relative(file) {
  return path.relative(root, file);
}
