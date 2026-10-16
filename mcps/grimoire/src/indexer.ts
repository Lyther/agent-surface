// grimoire: Build-time indexer. Walks skills packs, validates, writes all bodies/files to SQLite index + manifest. Not server-imported. Writes once, fail-closed.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { TextDecoder } from "node:util";
import { parseDocument as parseYamlDocument } from "yaml";
import { LIMITS, SLUG_RE } from "./contract.js";
import { SCHEMA_SQL, SCHEMA_VERSION, deriveCategory, extId } from "./model.js";
import { resolvePaths } from "./namespace.js";

export interface PackSpec {
  serviceId: string;
  path: string;
  commit?: string;
  skillsRel?: string;
  attribution: string;
}
export interface IndexedPack { serviceId: string; path: string; commit: string; sourceHash: string; attribution: string }
export interface IndexedManifest { schemaVersion: number; packs: IndexedPack[] }
export interface BuildResult { manifest: IndexedManifest; skills: number; files: number; skipped: { dir: string; reason: string }[] }

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

function readUtf8Text(file: string, label: string): string {
  try {
    return utf8.decode(readFileSync(file));
  } catch {
    throw new Error(`${label} is not UTF-8 text: ${file}`);
  }
}

function gitToplevel(path: string): string | undefined {
  try {
    return execFileSync("git", ["-C", path, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch { return undefined; }
}

function sameDir(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return resolve(a) === resolve(b);
  }
}

function gitOwnsPack(path: string): boolean {
  const top = gitToplevel(path);
  return top !== undefined && sameDir(top, path);
}

function gitHead(path: string): string | undefined {
  if (!gitOwnsPack(path)) return undefined;
  try {
    return execFileSync("git", ["-C", path, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch { return undefined; }
}

export const DEFAULT_SKILLS_REL = "skills";

export function resolveSkillsRel(rel?: string): string {
  const value = rel ?? DEFAULT_SKILLS_REL;
  if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(value)
    || value.split("/").some((part) => part === "." || part === "..")) {
    throw new Error(`invalid skillsRel: ${rel ?? ""}`);
  }
  return value;
}

function indexedSourceIsDirty(path: string, skillsRel: string): boolean {
  if (!gitOwnsPack(path)) return false;
  try {
    return Boolean(execFileSync(
      "git",
      ["-C", path, "status", "--porcelain=v1", "--untracked-files=all", "--ignored=matching", "--", skillsRel],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim());
  } catch { return false; }
}

function indexedSourceChanged(snapshots: Map<string, string>): boolean {
  for (const [file, digest] of snapshots) {
    try {
      if (sha256(readUtf8Text(file, "indexed source")) !== digest) return true;
    } catch { return true; }
  }
  return false;
}

const stringEntries = (value: unknown): Record<string, string> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};

// Splits Markdown from YAML frontmatter. `metadata` is string entries from optional `metadata` map.
export function parseFrontmatter(text: string): { fields: Record<string, string>; metadata: Record<string, string>; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return null;
  try {
    // Yields scalar fields for indexing even on bad YAML.
    const parsed: unknown = parseYamlDocument(m[1] ?? "", { strict: false, logLevel: "silent" }).toJS();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return { fields: stringEntries(parsed), metadata: stringEntries((parsed as Record<string, unknown>)["metadata"]), body: text.slice(m[0].length) };
  } catch {
    return null;
  }
}

const NOTICE_FIELD_MAX = 200;
const LICENSE_FILE_RE = /^(?:LICEN[CS]E|COPYING)(?:[.-][A-Za-z0-9.-]+)?$/i;

// Gets license/author/companion license files for this skill.
function skillNotice(skillDir: string, fields: Record<string, string>, metadata: Record<string, string>): string {
  const clean = (value: string | undefined): string => (value ?? "").replace(/\s+/g, " ").trim().slice(0, NOTICE_FIELD_MAX);
  const license = clean(fields["license"]);
  const author = clean(fields["author"] || metadata["author"]);
  const licenseFiles = readdirSync(skillDir, { withFileTypes: true })
    .filter((e) => e.isFile() && LICENSE_FILE_RE.test(e.name)).map((e) => e.name).sort();
  return [license && `license ${license}`, author && `author ${author}`, licenseFiles.length > 0 && `license file ${licenseFiles.join(", ")}`]
    .filter(Boolean).join("; ");
}

// Recursively lists all supporting files in a skill dir (excl. SKILL.md).
function listSupportingFiles(skillDir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const e of readdirSync(join(skillDir, rel), { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(childRel);
      else if (e.isFile() && childRel !== "SKILL.md") out.push(childRel);
    }
  };
  walk("");
  return out.sort();
}

// Recursively finds all child dirs under skillsDir that have SKILL.md. Skips descending into subdirs of skills.
function findSkillDirs(skillsDir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const entries = readdirSync(rel ? join(skillsDir, rel) : skillsDir, { withFileTypes: true });
    // Only non-root child dirs with SKILL.md count as skills.
    if (rel && entries.some((e) => e.name === "SKILL.md" && !e.isDirectory())) { out.push(rel); return; }
    // Directory symlinks not followed; keep output deterministic.
    const childDirs = entries.filter((e) => e.isDirectory()).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const child of childDirs) walk(rel ? `${rel}/${child.name}` : child.name);
  };
  walk("");
  return out;
}

export function buildIndex(opts: {
  packs: PackSpec[];
  outDir?: string;
  indexedAt?: string;
  onSourceRead?: (path: string) => void;
}): BuildResult {
  if (opts.packs.length === 0) throw new Error("no packs given");
  const packIds = new Set<string>();
  for (const pack of opts.packs) {
    if (!SLUG_RE.test(pack.serviceId)) throw new Error(`invalid pack id: ${pack.serviceId}`);
    if (packIds.has(pack.serviceId)) throw new Error(`duplicate pack id: ${pack.serviceId}`);
    if (typeof pack.attribution !== "string" || !pack.attribution.trim()) {
      throw new Error(`pack ${pack.serviceId}: attribution is required`);
    }
    packIds.add(pack.serviceId);
  }
  const { indexPath, manifestPath, dir } = resolvePaths(opts.outDir);
  const indexedAt = opts.indexedAt ?? new Date().toISOString();
  mkdirSync(dir, { recursive: true });
  const tmp = `${indexPath}.tmp.${process.pid}`;
  if (existsSync(tmp)) rmSync(tmp, { force: true });

  const db = new DatabaseSync(tmp);
  const result: BuildResult = { manifest: { schemaVersion: SCHEMA_VERSION, packs: [] }, skills: 0, files: 0, skipped: [] };
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(SCHEMA_SQL);
    db.prepare("INSERT OR REPLACE INTO index_meta(key,value) VALUES('schema_version',?)").run(String(SCHEMA_VERSION));

    const insSkill = db.prepare(
      "INSERT INTO skills(id,pack,name,source_path,source_commit,sha256,indexed_at,description,body,category,category_source,notice) VALUES(?,?,?,?,?,?,?,?,?,?,'derived',?)",
    );
    const insFts = db.prepare("INSERT INTO skills_fts(rowid,name,description,body) VALUES(?,?,?,?)");
    const insFile = db.prepare("INSERT INTO skill_files(skill_id,rel_path,content,sha256,size) VALUES(?,?,?,?,?)");
    const insMeta = db.prepare("INSERT OR REPLACE INTO index_meta(key,value) VALUES(?,?)");
    const updateSourceCommit = db.prepare("UPDATE skills SET source_commit=? WHERE pack=?");

    for (const pack of opts.packs) {
      const attribution = pack.attribution.trim();
      const initialHead = gitHead(pack.path);
      if (pack.commit && initialHead && !/^[0-9a-f]{40}$/.test(pack.commit)) {
        throw new Error(`pack ${pack.serviceId}: declared commit must be a clean 40-hex Git revision`);
      }
      if (pack.commit && initialHead && pack.commit !== initialHead) {
        throw new Error(`pack ${pack.serviceId}: git HEAD ${initialHead} != declared commit ${pack.commit}`);
      }
      const baseCommit = initialHead ?? "uncommitted";
      let commit = baseCommit;
      const skillsRel = resolveSkillsRel(pack.skillsRel);
      const skillsDir = join(pack.path, skillsRel);
      // Missing skills dir is a hard error (prevents empty or broken index).
      if (!existsSync(skillsDir)) throw new Error(`pack ${pack.serviceId}: no skills directory at ${skillsDir}`);
      const fingerprints: string[] = []; // Stable per-skill digests to generate pack sourceHash.
      const sourceSnapshots = new Map<string, string>();
      const seenIds = new Set<string>(); // First path for an id wins, others skipped.
      const skillsAtPackStart = result.skills;
      let packFiles = 0;

      db.exec("BEGIN");
      for (const skillRel of findSkillDirs(skillsDir)) {
        const skillDir = join(skillsDir, skillRel);
        const dirLabel = skillRel || basename(skillDir);
        const skillMd = join(skillDir, "SKILL.md");
        if (!existsSync(skillMd)) { result.skipped.push({ dir: dirLabel, reason: "no SKILL.md" }); continue; }
        if (lstatSync(skillMd).isSymbolicLink()) {
          throw new Error(`pack ${pack.serviceId}: symbolic SKILL.md is not allowed: ${skillMd}`);
        }
        const raw = readUtf8Text(skillMd, `pack ${pack.serviceId}: SKILL.md`);
        sourceSnapshots.set(skillMd, sha256(raw));
        opts.onSourceRead?.(skillMd);
        const parsed = parseFrontmatter(raw);
        if (!parsed) { result.skipped.push({ dir: dirLabel, reason: "no frontmatter" }); continue; }
        const name = (parsed.fields["name"]?.trim()) || basename(skillDir);
        if (!SLUG_RE.test(name)) { result.skipped.push({ dir: dirLabel, reason: `invalid name slug: ${name}` }); continue; }
        const description = (parsed.fields["description"] ?? "").trim().slice(0, LIMITS.DESCRIPTION_MAX);
        const body = parsed.body;
        const bodySha = sha256(body);
        const id = extId(pack.serviceId, name);
        const { category } = deriveCategory(name);
        const sourcePath = relative(pack.path, skillMd);

        // If a skill id was already seen, skip; otherwise, store and continue.
        if (seenIds.has(id)) { result.skipped.push({ dir: dirLabel, reason: `duplicate skill id: ${id}` }); continue; }
        seenIds.add(id);
        const notice = skillNotice(skillDir, parsed.fields, parsed.metadata);
        const res = insSkill.run(id, pack.serviceId, name, sourcePath, commit, bodySha, indexedAt, description, body, category, notice);
        const rowid = Number(res.lastInsertRowid);
        insFts.run(rowid, name, description, body);
        result.skills++;

        const fileDigests: string[] = [];
        for (const rel of listSupportingFiles(skillDir)) {
          const file = join(skillDir, rel);
          const content = readUtf8Text(file, `pack ${pack.serviceId}: supporting file`);
          sourceSnapshots.set(file, sha256(content));
          opts.onSourceRead?.(file);
          const size = Buffer.byteLength(content, "utf8");
          const fsha = sha256(content);
          insFile.run(id, rel, content, fsha, size);
          result.files++;
          packFiles++;
          fileDigests.push(`${rel}:${fsha}`);
        }
        fingerprints.push(`${id}|${sha256(raw)}|${fileDigests.join(",")}`);
      }
      // Any pack yielding no skills is a hard error (usually misconfig, not empty).
      if (result.skills === skillsAtPackStart) throw new Error(`pack ${pack.serviceId}: no skills found under ${skillsRel}`);
      if (baseCommit !== "uncommitted" && !baseCommit.endsWith("-dirty")
        && (indexedSourceIsDirty(pack.path, skillsRel) || indexedSourceChanged(sourceSnapshots)
          || (initialHead !== undefined && gitHead(pack.path) !== initialHead))) {
        commit = `${baseCommit}-dirty`;
        updateSourceCommit.run(commit, pack.serviceId);
      }
      db.exec("COMMIT");

      const sourceHash = sha256(fingerprints.sort().join("\n"));
      insMeta.run(`pack:${pack.serviceId}:source_commit`, commit);
      insMeta.run(`pack:${pack.serviceId}:file_count`, String(packFiles));
      insMeta.run(`pack:${pack.serviceId}:source_hash`, sourceHash);
      insMeta.run(`pack:${pack.serviceId}:attribution`, attribution);
      insMeta.run(`pack:${pack.serviceId}:built_at`, indexedAt);
      result.manifest.packs.push({ serviceId: pack.serviceId, path: pack.path, commit, sourceHash, attribution });
    }
    insMeta.run("pack_ids", JSON.stringify([...packIds].sort()));
  } catch (e) {
    // On build failure, leave existing index, manifest. Remove temp db.
    db.close();
    if (existsSync(tmp)) rmSync(tmp, { force: true });
    throw e;
  }
  db.close();

  const manifestTmp = `${manifestPath}.tmp.${process.pid}`;
  try {
    if (existsSync(manifestTmp)) rmSync(manifestTmp, { force: true });
    writeFileSync(manifestTmp, JSON.stringify(result.manifest, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, indexPath);
    try { chmodSync(indexPath, 0o600); } catch { /* best effort */ }
    renameSync(manifestTmp, manifestPath);
  } finally {
    if (existsSync(tmp)) rmSync(tmp, { force: true });
    if (existsSync(manifestTmp)) rmSync(manifestTmp, { force: true });
  }
  return result;
}

// CLI: grimoire-index --pack <serviceId>:<absPath> [...] [--out <dir>]
function main(argv: string[]): void {
  const packs: PackSpec[] = [];
  let outDir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pack") {
      const spec = argv[++i] ?? "";
      const c = spec.indexOf(":");
      if (c <= 0) { process.stderr.write(`[grimoire-index] bad --pack (want serviceId:path): ${spec}\n`); process.exit(2); }
      packs.push({ serviceId: spec.slice(0, c), path: spec.slice(c + 1), attribution: "" });
    } else if (a === "--skills-rel") {
      const last = packs[packs.length - 1];
      if (!last) { process.stderr.write("[grimoire-index] --skills-rel must follow --pack\n"); process.exit(2); }
      try { last.skillsRel = resolveSkillsRel(argv[++i]); }
      catch (e) { process.stderr.write(`[grimoire-index] ${e instanceof Error ? e.message : String(e)}\n`); process.exit(2); }
    } else if (a === "--commit") {
      const last = packs[packs.length - 1];
      if (!last) { process.stderr.write("[grimoire-index] --commit must follow --pack\n"); process.exit(2); }
      last.commit = argv[++i] ?? "";
    } else if (a === "--attribution") {
      const last = packs[packs.length - 1];
      if (!last) { process.stderr.write("[grimoire-index] --attribution must follow --pack\n"); process.exit(2); }
      last.attribution = argv[++i] ?? "";
    } else if (a === "--out") {
      outDir = argv[++i];
    }
  }
  if (!packs.length) { process.stderr.write("[grimoire-index] no --pack given\n"); process.exit(2); }
  const r = buildIndex({ packs, outDir });
  process.stderr.write(`[grimoire-index] indexed ${r.skills} skills, ${r.files} files; skipped ${r.skipped.length}; packs=${r.manifest.packs.map((p) => p.serviceId).join(",")}\n`);
  for (const s of r.skipped.slice(0, 20)) process.stderr.write(`  skip ${s.dir}: ${s.reason}\n`);
}

if (process.argv[1] && process.argv[1].endsWith("indexer.js")) {
  try { main(process.argv.slice(2)); }
  catch (e) { process.stderr.write(`[grimoire-index] fatal: ${e instanceof Error ? e.message : String(e)}\n`); process.exit(1); }
}
