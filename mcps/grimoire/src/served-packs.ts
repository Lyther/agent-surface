// grimoire — discover source-packs served_by grimoire from optional-services.json.
// Used by install.mjs so adding a served_by pack does not require another hardcoded path.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SKILLS_REL, resolveSkillsRel } from "./indexer.js";

export interface RegistryService {
  kind?: string;
  path?: string;
  commit?: string;
  optional?: boolean;
  status?: string;
  served_by?: string[];
  index_root?: string;
  attribution?: string;
}

export interface RegistryFile {
  services?: Record<string, RegistryService>;
}

export interface ServedPack {
  serviceId: string;
  path: string;
  absPath: string;
  skillsRel: string;
  required: boolean;
  commit?: string;
  attribution: string;
}

export function loadRegistry(repoRoot: string): RegistryFile {
  const file = join(repoRoot, "registry", "optional-services.json");
  return JSON.parse(readFileSync(file, "utf8")) as RegistryFile;
}

export function servedPacksFromRegistry(repoRoot: string, registry?: RegistryFile): ServedPack[] {
  const services = (registry ?? loadRegistry(repoRoot)).services ?? {};
  const packs: ServedPack[] = [];
  for (const [serviceId, service] of Object.entries(services)) {
    if (!Array.isArray(service.served_by) || !service.served_by.includes("grimoire")) continue;
    if (typeof service.path !== "string") throw new Error(`served pack ${serviceId} has no path`);
    if (typeof service.attribution !== "string" || !service.attribution.trim()) {
      throw new Error(`served pack ${serviceId} has no attribution`);
    }
    packs.push({
      serviceId,
      path: service.path,
      absPath: join(repoRoot, service.path),
      skillsRel: resolveSkillsRel(service.index_root ?? DEFAULT_SKILLS_REL),
      required: service.optional === false || service.status === "required",
      commit: service.commit,
      attribution: service.attribution,
    });
  }
  return packs;
}

export function indexerArgv(packs: ServedPack[]): { args: string[]; missingRequired: ServedPack[] } {
  const args: string[] = [];
  const missingRequired: ServedPack[] = [];
  for (const pack of packs) {
    const skillsDir = join(pack.absPath, pack.skillsRel);
    if (!existsSync(skillsDir)) {
      if (pack.required) missingRequired.push(pack);
      continue;
    }
    args.push("--pack", `${pack.serviceId}:${pack.absPath}`);
    if (pack.commit) args.push("--commit", pack.commit);
    args.push("--attribution", pack.attribution);
    if (pack.skillsRel !== DEFAULT_SKILLS_REL) args.push("--skills-rel", pack.skillsRel);
  }
  return { args, missingRequired };
}

function main(argv: string[]): void {
  let repo = "";
  let indexer = "";
  let printArgs = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") repo = argv[++i] ?? "";
    else if (a === "--indexer") indexer = argv[++i] ?? "";
    else if (a === "--print-index-args") printArgs = true;
    else if (a === "--index") { /* consumed with --indexer */ }
  }
  if (!repo) { process.stderr.write("[grimoire-served-packs] --repo is required\n"); process.exit(2); }
  const packs = servedPacksFromRegistry(repo);
  const { args, missingRequired } = indexerArgv(packs);
  if (missingRequired.length) {
    for (const pack of missingRequired) {
      process.stderr.write(`ERROR: required pack ${pack.serviceId} not found at ${join(pack.absPath, pack.skillsRel)}.\n`);
      process.stderr.write(`       Run: git submodule update --init -- ${pack.path}, then re-run npm run install:grimoire.\n`);
    }
    process.stderr.write("       Index was NOT rebuilt; install is incomplete. Any existing index is left untouched; a clean machine reports INDEX_MISSING.\n");
    process.exit(1);
  }
  if (!args.length) {
    process.stderr.write("[grimoire-served-packs] no served packs found in registry\n");
    process.exit(1);
  }
  if (printArgs) {
    process.stdout.write(`${JSON.stringify(args)}\n`);
    return;
  }
  if (!indexer) { process.stderr.write("[grimoire-served-packs] --indexer is required unless --print-index-args\n"); process.exit(2); }
  const result = spawnSync(process.execPath, [indexer, ...args], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

if (process.argv[1] && process.argv[1].endsWith("served-packs.js")) {
  try { main(process.argv.slice(2)); }
  catch (e) { process.stderr.write(`[grimoire-served-packs] fatal: ${e instanceof Error ? e.message : String(e)}\n`); process.exit(1); }
}
