// grimoire — build-time ONLY writer. Walks pinned skill packs, validates metadata,
// stores body + every supporting file RAW into a self-contained sqlite index, writes
// index_meta + the installed expected-source manifest. Write-once: builds into a temp
// db then atomically renames. Not imported by the server.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LIMITS, SLUG_RE } from "./contract.js";
import { SCHEMA_SQL, SCHEMA_VERSION, deriveCategory, extId } from "./model.js";
import { resolvePaths } from "./namespace.js";

export interface PackSpec { serviceId: string; path: string; commit?: string } // path = dir containing skills/
export interface IndexedPack { serviceId: string; path: string; commit: string; sourceHash: string }
export interface IndexedManifest { schemaVersion: number; packs: IndexedPack[] }
export interface BuildResult { manifest: IndexedManifest; skills: number; files: number; skipped: { dir: string; reason: string }[] }

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

function gitCommit(path: string): string | undefined {
  try {
    return execFileSync("git", ["-C", path, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch { return undefined; }
}

// Minimal YAML frontmatter reader: returns the raw scalar fields we need (name,
// description) and the body. Handles inline + folded multi-line scalar continuations
// (indented lines following a key), which is how these packs write `description`.
export function parseFrontmatter(text: string): { fields: Record<string, string>; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return null;
  const block = m[1] ?? "";
  const body = text.slice(m[0].length);
  const lines = block.split(/\r?\n/);
  const fields: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const kv = /^([A-Za-z0-9_][A-Za-z0-9_-]*):(.*)$/.exec(line); // top-level key (no leading indent)
    if (!kv) continue;
    const key = kv[1]!;
    let value = (kv[2] ?? "").trim();
    // Block scalar indicators (>, |, with optional chomp) → value is the folded block.
    if (value === ">" || value === "|" || value === ">-" || value === "|-" || value === ">+" || value === "|+") value = "";
    // Absorb indented continuation lines (folded scalar); stop at the next top-level key or a list.
    const parts: string[] = value ? [value] : [];
    while (i + 1 < lines.length) {
      const next = lines[i + 1] ?? "";
      if (/^\s+\S/.test(next) && !/^\s*-\s/.test(next)) { parts.push(next.trim()); i++; }
      else break;
    }
    if (parts.length) fields[key] = parts.join(" ");
  }
  return { fields, body };
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

export function buildIndex(opts: { packs: PackSpec[]; outDir?: string; indexedAt?: string }): BuildResult {
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
      "INSERT INTO skills(id,pack,name,source_path,source_commit,sha256,indexed_at,description,body,category,category_source) VALUES(?,?,?,?,?,?,?,?,?,?,'derived')",
    );
    const insFts = db.prepare("INSERT INTO skills_fts(rowid,name,description,body) VALUES(?,?,?,?)");
    const insFile = db.prepare("INSERT INTO skill_files(skill_id,rel_path,content,sha256,size) VALUES(?,?,?,?,?)");
    const insMeta = db.prepare("INSERT OR REPLACE INTO index_meta(key,value) VALUES(?,?)");

    for (const pack of opts.packs) {
      const commit = pack.commit ?? gitCommit(pack.path) ?? "uncommitted";
      const skillsDir = join(pack.path, "skills");
      // A pack was explicitly requested: a missing skills/ dir is a hard error, not a skip.
      // Failing here (vs. quietly producing an empty index) prevents a broken/incomplete
      // checkout from clobbering a good index or shipping a contradictory manifest.
      if (!existsSync(skillsDir)) throw new Error(`pack ${pack.serviceId}: no skills/ directory at ${skillsDir}`);
      const fingerprints: string[] = []; // per-skill stable digests → pack sourceHash

      db.exec("BEGIN");
      for (const e of readdirSync(skillsDir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const skillDir = join(skillsDir, e.name);
        const skillMd = join(skillDir, "SKILL.md");
        if (!existsSync(skillMd)) { result.skipped.push({ dir: e.name, reason: "no SKILL.md" }); continue; }
        const raw = readFileSync(skillMd, "utf8");
        const parsed = parseFrontmatter(raw);
        if (!parsed) { result.skipped.push({ dir: e.name, reason: "no frontmatter" }); continue; }
        const name = (parsed.fields["name"]?.trim()) || e.name;
        if (!SLUG_RE.test(name)) { result.skipped.push({ dir: e.name, reason: `invalid name slug: ${name}` }); continue; }
        const description = (parsed.fields["description"] ?? "").trim().slice(0, LIMITS.DESCRIPTION_MAX);
        const body = parsed.body;
        const bodySha = sha256(body);
        const id = extId(pack.serviceId, name);
        const { category } = deriveCategory(name);
        const sourcePath = relative(pack.path, skillMd);

        let rowid: number;
        try {
          const res = insSkill.run(id, pack.serviceId, name, sourcePath, commit, bodySha, indexedAt, description, body, category);
          rowid = Number(res.lastInsertRowid);
        } catch { result.skipped.push({ dir: e.name, reason: `duplicate skill id: ${id}` }); continue; }
        insFts.run(rowid, name, description, body);
        result.skills++;

        const fileDigests: string[] = [];
        for (const rel of listSupportingFiles(skillDir)) {
          const content = readFileSync(join(skillDir, rel), "utf8");
          const size = Buffer.byteLength(content, "utf8");
          const fsha = sha256(content);
          insFile.run(id, rel, content, fsha, size);
          result.files++;
          fileDigests.push(`${rel}:${fsha}`);
        }
        fingerprints.push(`${id}|${bodySha}|${fileDigests.join(",")}`);
      }
      db.exec("COMMIT");

      const sourceHash = sha256(fingerprints.sort().join("\n"));
      insMeta.run(`pack:${pack.serviceId}:source_commit`, commit);
      insMeta.run(`pack:${pack.serviceId}:file_count`, String(result.files));
      insMeta.run(`pack:${pack.serviceId}:source_hash`, sourceHash);
      insMeta.run(`pack:${pack.serviceId}:built_at`, indexedAt);
      result.manifest.packs.push({ serviceId: pack.serviceId, path: pack.path, commit, sourceHash });
    }
  } catch (e) {
    // Non-destructive: a failed build leaves any existing index + manifest untouched and
    // removes only the half-written temp db (the rename below never ran).
    db.close();
    if (existsSync(tmp)) rmSync(tmp, { force: true });
    throw e;
  }
  db.close();

  renameSync(tmp, indexPath);
  try { chmodSync(indexPath, 0o600); } catch { /* best effort */ }
  writeFileSync(manifestPath, JSON.stringify(result.manifest, null, 2) + "\n", { mode: 0o600 });
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
