// grimoire — resolves runtime paths for index and manifest.
import { homedir } from "node:os";
import { join } from "node:path";

export interface GrimoirePaths { dir: string; indexPath: string; manifestPath: string }

export function grimoireDir(dir?: string): string {
  return dir ?? process.env["GRIMOIRE_DIR"] ?? join(homedir(), ".grimoire");
}

export function resolvePaths(dir?: string): GrimoirePaths {
  const d = grimoireDir(dir);
  return { dir: d, indexPath: join(d, "index.sqlite"), manifestPath: join(d, "manifest.json") };
}
