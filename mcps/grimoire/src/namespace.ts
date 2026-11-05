// grimoire — runtime path resolution. The server and indexer agree on where the
// self-contained index lives. No repo dependency.
import { homedir } from "node:os";
import { join } from "node:path";

export interface GrimoirePaths { dir: string; indexPath: string }

export function grimoireDir(dir?: string): string {
  return dir ?? process.env["GRIMOIRE_DIR"] ?? join(homedir(), ".grimoire");
}

export function resolvePaths(dir?: string): GrimoirePaths {
  const d = grimoireDir(dir);
  return { dir: d, indexPath: join(d, "index.sqlite") };
}
