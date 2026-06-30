// synapse — physical isolation: per-project SQLite file keyed by canonical git-root
// hash, plus a fixed global file. Same repo from root/subdir/symlink → same file.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Namespaces {
  dbDir: string;
  namespace: string;
  projectDbPath: string;
  globalDbPath: string;
}

function dbDirOf(dbDir?: string): string {
  return dbDir ?? process.env["SYNAPSE_DB_DIR"] ?? join(homedir(), ".synapse");
}

/** Canonical project key for a directory: explicit override → git root realpath → realpath cwd. */
export function projectKey(cwd: string, override?: string): string {
  const ov = override ?? process.env["SYNAPSE_NAMESPACE"];
  if (ov && ov.trim()) return ov.trim();
  let root = cwd;
  try {
    root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim() || cwd;
  } catch { /* not a git repo → use cwd */ }
  try { root = realpathSync(root); } catch { /* path may not resolve */ }
  return root;
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

export function resolveNamespaces(opts?: { namespace?: string; cwd?: string; dbDir?: string }): Namespaces {
  const dbDir = dbDirOf(opts?.dbDir);
  const ns = hashKey(projectKey(opts?.cwd ?? process.cwd(), opts?.namespace));
  return {
    dbDir,
    namespace: ns,
    projectDbPath: join(dbDir, `${ns}.sqlite`),
    globalDbPath: join(dbDir, "global.sqlite"),
  };
}

/** Resolve an explicit cross-project ref (a path) to its project DB file (read-only use). */
export function resolveProjectRef(ref: string, dbDir?: string): string {
  return join(dbDirOf(dbDir), `${hashKey(projectKey(ref))}.sqlite`);
}
