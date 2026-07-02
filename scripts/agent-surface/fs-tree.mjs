// Source-tree traversal: list files by extension and enumerate directories, skipping the
// generated/VCS trees. Pure walkers over the repo root; no parsing, no state.
import { readdir } from "node:fs/promises";
import path from "node:path";
import { root } from "./registry.mjs";
import { exists } from "./util.mjs";

export async function files(dir, extensions) {
  const base = path.join(root, dir);
  if (!(await exists(base))) return [];

  return filesUnder(base, extensions);
}

export async function filesUnder(base, extensions) {
  const out = [];
  const entries = await readdir(base, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "dist" || entry.name === "node_modules" || entry.name === ".agent-surface") continue;
    const full = path.join(base, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await filesUnder(full, extensions)));
      continue;
    }
    if (entry.isFile() && (extensions.includes(path.extname(full)) || extensions.includes(path.basename(full)))) {
      out.push(full);
    }
  }
  return out.sort();
}

export async function directories(base) {
  if (!(await exists(base))) return [];

  const out = [];
  const entries = await readdir(base, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === ".git" || entry.name === "dist" || entry.name === "node_modules") continue;
    const full = path.join(base, entry.name);
    out.push(full, ...(await directories(full)));
  }
  return out;
}

export async function directDirectories(base) {
  if (!(await exists(base))) return [];

  const entries = await readdir(base, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(base, entry.name))
    .sort();
}
