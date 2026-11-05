// grimoire — build-time ONLY writer. Walks each pack's skills root, validates metadata,
// stores body + every UTF-8 supporting file verbatim in a self-contained sqlite index, then
// publishes it with one rename over index.sqlite. Not imported by the server.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { TextDecoder } from "node:util";
import { parseDocument as parseYamlDocument } from "yaml";
import { LIMITS, SLUG_RE } from "./contract.js";
import { SCHEMA_SQL, SCHEMA_VERSION, deriveCategory, extId } from "./model.js";
import { resolvePaths } from "./namespace.js";

export interface PackSpec {
  serviceId: string;
  path: string;
  skillsRel?: string;
}
export interface BuildResult { skills: number; files: number; skipped: { pack: string; dir: string; reason: string }[] }

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

function readUtf8Text(file: string, label: string): string {
  try {
    return utf8.decode(readFileSync(file));
  } catch {
    throw new Error(`${label} is not UTF-8 text: ${file}`);
  }
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

const stringEntries = (value: unknown): Record<string, string> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};

// Split the Markdown body here; the YAML library owns frontmatter syntax.
export function parseFrontmatter(text: string): { fields: Record<string, string>; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return null;
  try {
    // Third-party packs sometimes have malformed nonessential fields. YAML's
    // recovery mode still provides the scalar name/description we index.
    const parsed: unknown = parseYamlDocument(m[1] ?? "", { strict: false, logLevel: "silent" }).toJS();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return { fields: stringEntries(parsed), body: text.slice(m[0].length) };
  } catch {
    return null;
  }
}

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

// Discover skill directories beneath a pack's skills root. A child directory holding a SKILL.md is a
// skill; intermediate directories (e.g. a catalog's category folders) are traversed, but a skill's
// own subtree is never descended — those files are its companions, listed separately. Returns each
// skill directory as a POSIX-style path relative to skillsDir, sorted for a deterministic build.
function findSkillDirs(skillsDir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const entries = readdirSync(rel ? join(skillsDir, rel) : skillsDir, { withFileTypes: true });
    // A SKILL.md in the root itself is not a skill — skills live in child directories, so only a
    // non-empty rel can be a skill root.
    if (rel && entries.some((e) => e.name === "SKILL.md" && !e.isDirectory())) { out.push(rel); return; }
    // Directory symlinks report isDirectory() === false, so they are never followed: no symlink
    // cycles. Code-unit order (not locale-aware) keeps the emitted index stable across host locales.
    const childDirs = entries.filter((e) => e.isDirectory()).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const child of childDirs) walk(rel ? `${rel}/${child.name}` : child.name);
  };
  walk("");
  return out;
}

export function buildIndex(opts: { packs: PackSpec[]; outDir?: string }): BuildResult {
  if (opts.packs.length === 0) throw new Error("no packs given");
  const packIds = new Set<string>();
  for (const pack of opts.packs) {
    if (!SLUG_RE.test(pack.serviceId)) throw new Error(`invalid pack id: ${pack.serviceId}`);
    if (packIds.has(pack.serviceId)) throw new Error(`duplicate pack id: ${pack.serviceId}`);
    packIds.add(pack.serviceId);
  }
  const { indexPath, dir } = resolvePaths(opts.outDir);
  mkdirSync(dir, { recursive: true });
  const tmp = `${indexPath}.tmp.${process.pid}`;
  if (existsSync(tmp)) rmSync(tmp, { force: true });

  const db = new DatabaseSync(tmp);
  const result: BuildResult = { skills: 0, files: 0, skipped: [] };
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(SCHEMA_SQL);
    db.prepare("INSERT OR REPLACE INTO index_meta(key,value) VALUES('schema_version',?)").run(String(SCHEMA_VERSION));

    const insSkill = db.prepare(
      "INSERT INTO skills(id,pack,name,description,body,category,category_source) VALUES(?,?,?,?,?,?,'derived')",
    );
    const insFts = db.prepare("INSERT INTO skills_fts(rowid,name,description,body) VALUES(?,?,?,?)");
    const insFile = db.prepare("INSERT INTO skill_files(skill_id,rel_path,content,size) VALUES(?,?,?,?)");

    for (const pack of opts.packs) {
      const skillsRel = resolveSkillsRel(pack.skillsRel);
      const skillsDir = join(pack.path, skillsRel);
      // A pack was explicitly requested: a missing skills dir is a hard error, not a skip.
      // Failing here (vs. quietly producing an empty index) prevents a broken/incomplete
      // checkout from clobbering a good index.
      if (!existsSync(skillsDir)) throw new Error(`pack ${pack.serviceId}: no skills directory at ${skillsDir}`);
      const seenIds = new Set<string>(); // first path for an id wins; later same-name dirs are skipped
      const skillsAtPackStart = result.skills;

      db.exec("BEGIN");
      for (const skillRel of findSkillDirs(skillsDir)) {
        const skillDir = join(skillsDir, skillRel);
        const dirLabel = skillRel || basename(skillDir);
        const skillMd = join(skillDir, "SKILL.md");
        const skillMdStat = lstatSync(skillMd, { throwIfNoEntry: false });
        if (!skillMdStat) { result.skipped.push({ pack: pack.serviceId, dir: dirLabel, reason: "no SKILL.md" }); continue; }
        // Reading a symbolic SKILL.md by name would follow it out of the pack; skip that skill and
        // keep indexing the rest of the pack.
        if (skillMdStat.isSymbolicLink()) { result.skipped.push({ pack: pack.serviceId, dir: dirLabel, reason: "symbolic SKILL.md" }); continue; }
        const raw = readUtf8Text(skillMd, `pack ${pack.serviceId}: SKILL.md`);
        const parsed = parseFrontmatter(raw);
        if (!parsed) { result.skipped.push({ pack: pack.serviceId, dir: dirLabel, reason: "no frontmatter" }); continue; }
        const name = (parsed.fields["name"]?.trim()) || basename(skillDir);
        if (!SLUG_RE.test(name)) { result.skipped.push({ pack: pack.serviceId, dir: dirLabel, reason: `invalid name slug: ${name}` }); continue; }
        const description = (parsed.fields["description"] ?? "").trim().slice(0, LIMITS.DESCRIPTION_MAX);
        const body = parsed.body;
        const id = extId(pack.serviceId, name);
        const { category } = deriveCategory(name);

        // Two skills sharing a name (e.g. the same leaf under different category folders) collide on
        // id; the first discovered path wins and the rest are reported. Pre-checking keeps a genuine
        // insert failure (not a collision) propagating as a hard error instead of a silent skip.
        if (seenIds.has(id)) { result.skipped.push({ pack: pack.serviceId, dir: dirLabel, reason: `duplicate skill id: ${id}` }); continue; }
        seenIds.add(id);
        const res = insSkill.run(id, pack.serviceId, name, description, body, category);
        const rowid = Number(res.lastInsertRowid);
        insFts.run(rowid, name, description, body);
        result.skills++;

        for (const rel of listSupportingFiles(skillDir)) {
          const content = readUtf8Text(join(skillDir, rel), `pack ${pack.serviceId}: supporting file`);
          const size = Buffer.byteLength(content, "utf8");
          insFile.run(id, rel, content, size);
          result.files++;
        }
      }
      // Fail closed: a requested pack that indexes nothing is a misconfiguration (usually a wrong
      // index_root), not a reason to publish an empty index over a good one.
      if (result.skills === skillsAtPackStart) throw new Error(`pack ${pack.serviceId}: no skills found under ${skillsRel}`);
      db.exec("COMMIT");
    }
  } catch (e) {
    // Non-destructive: a failed build leaves any existing index untouched and removes only the
    // half-written temp db (the rename below never ran).
    db.close();
    if (existsSync(tmp)) rmSync(tmp, { force: true });
    throw e;
  }
  db.close();

  try {
    // Owner-only before it is published, so the live index is never readable by others.
    chmodSync(tmp, 0o600);
    renameSync(tmp, indexPath);
  } finally {
    if (existsSync(tmp)) rmSync(tmp, { force: true });
  }
  return result;
}

// ---- CLI: grimoire-index --pack <serviceId>:<absPath> [...] [--out <dir>] ----
function main(argv: string[]): void {
  const packs: PackSpec[] = [];
  let outDir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pack") {
      const spec = argv[++i] ?? "";
      const c = spec.indexOf(":");
      if (c <= 0) { process.stderr.write(`[grimoire-index] bad --pack (want serviceId:path): ${spec}\n`); process.exit(2); }
      packs.push({ serviceId: spec.slice(0, c), path: spec.slice(c + 1) });
    } else if (a === "--skills-rel") {
      const last = packs[packs.length - 1];
      if (!last) { process.stderr.write("[grimoire-index] --skills-rel must follow --pack\n"); process.exit(2); }
      try { last.skillsRel = resolveSkillsRel(argv[++i]); }
      catch (e) { process.stderr.write(`[grimoire-index] ${e instanceof Error ? e.message : String(e)}\n`); process.exit(2); }
    } else if (a === "--out") {
      outDir = argv[++i];
    }
  }
  if (!packs.length) { process.stderr.write("[grimoire-index] no --pack given\n"); process.exit(2); }
  const r = buildIndex({ packs, outDir });
  process.stderr.write(`[grimoire-index] indexed ${r.skills} skills, ${r.files} files; skipped ${r.skipped.length}\n`);
  for (const s of r.skipped.slice(0, 20)) process.stderr.write(`  skip ${s.pack}/${s.dir}: ${s.reason}\n`);
}

if (process.argv[1] && process.argv[1].endsWith("indexer.js")) {
  try { main(process.argv.slice(2)); }
  catch (e) { process.stderr.write(`[grimoire-index] fatal: ${e instanceof Error ? e.message : String(e)}\n`); process.exit(1); }
}
