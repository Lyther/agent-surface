// Repo root + cached loaders for the JSON registries (the source of truth). Sole reader of
// the raw registry files; other modules import these instead of re-reading disk.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Two levels up from scripts/agent-surface/ = the repo root.
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Repo-root-relative path for display.
export function relative(file) {
  return path.relative(root, file);
}

let sourceKindsCache;
export async function readSourceKinds() {
  if (sourceKindsCache !== undefined) return sourceKindsCache;
  sourceKindsCache = JSON.parse(await readFile(path.join(root, "registry", "source-kinds.json"), "utf8"));
  return sourceKindsCache;
}

let optionalServicesCache;
export async function readOptionalServices() {
  if (optionalServicesCache !== undefined) return optionalServicesCache;
  optionalServicesCache = JSON.parse(await readFile(path.join(root, "registry", "optional-services.json"), "utf8"));
  return optionalServicesCache;
}
