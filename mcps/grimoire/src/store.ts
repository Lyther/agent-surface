// grimoire — the only runtime seam. Read-only reader over the self-contained index.
// Never writes (all writes live in indexer, build-time). Every public method first
// checks index health and returns INDEX_MISSING/INDEX_STALE instead of throwing.
import { existsSync, readFileSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  LIMITS, type FileGetResult, type GetResult, type ListResult, type SearchResult, type StatusError,
} from "./contract.js";
import { CATEGORY_ALIASES, SCHEMA_VERSION, decId, rowToFull, rowToHit, rowToRef, servedAttribution, type SkillRow } from "./model.js";
import { resolvePaths, type GrimoirePaths } from "./namespace.js";

interface ManifestPack { serviceId: string; commit: string; sourceHash: string; attribution: string }
interface Manifest { schemaVersion: number; packs: ManifestPack[] }

const REBUILD = "run: npm run install:grimoire";

// Words carrying no retrieval signal. They are dropped before the query is built so they
// cannot lend rank to a skill that matches nothing else; a query made only of them keeps them.
const FILLER = new Set(["a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "with", "my", "me", "i", "it", "its",
  "is", "am", "are", "was", "were", "be", "been", "do", "does", "did", "how", "what", "when", "which", "who", "why",
  "by", "at", "from", "as", "that", "this", "these", "those", "there", "their", "any", "some", "into", "over", "about",
  "can", "could", "should", "would", "will", "want", "need", "please", "help", "up", "so", "if", "then", "than"]);
// "out" and "off" stay searchable on purpose: dropping them collapses a spaced technique name
// such as "out of band" or "off by one" to one weak word, and both appear in indexed skills.

// Quote each token so user text can never be FTS5 query syntax; "" matches nothing safely.
// Terms are OR-ed, not AND-ed: FTS5 reads space-separated terms as a conjunction, which
// discards a relevant skill the moment a caller adds one word its text happens to lack
// ("configure tls 1.3 for a service" lost the TLS skill on "service"). Weighted BM25 then orders
// the candidates by each matched term's rarity and frequency, document length and column, not by
// how many terms matched: an unmatched term adds nothing to a skill's score and no longer
// excludes it, though it can lift other skills that contain it. The trade is deliberate: a query about an uncovered topic now returns its best
// lexical matches rather than nothing, so a caller must judge a hit's summary against its own
// task. Nothing is padded — a query whose every term is absent from the index still matches no
// row.
// Whitespace and the separators written between alternatives ("tls/ssl", "xss,csrf") split
// terms, so each alternative is a candidate on its own. "." and "-" do not split: inside a
// term they join a version, CVE ID or compound name, which the tokenizer then matches as an
// adjacent phrase ("1.3", "cve-2021-44228").
const TERM_SPLIT = /[\s/,;|]+/;
// An all-caps word is a name, not filler, even when its lowercase form is: "CAN" bus, "IT" forensics.
const isFiller = (t: string): boolean =>
  FILLER.has(t.toLowerCase()) && !(t.length > 1 && t === t.toUpperCase() && t !== t.toLowerCase());

export const ftsQuery = (q: string): string => {
  const all = q.split(TERM_SPLIT).map((t) => t.replace(/"/g, "")).filter(Boolean);
  const kept = all.filter((t) => !isFiller(t));
  return (kept.length ? kept : all).map((t) => `"${t}"`).join(" OR ") || '""';
};

function isUnsafePath(p: string): boolean {
  if (p.includes("\0")) return true;
  if (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p)) return true;
  return p.split(/[\\/]/).some((s) => s === "..");
}

const encodeCursor = (id: string): string => Buffer.from(id, "utf8").toString("base64url");
function decodeCursor(c: string): string | null {
  try {
    const s = Buffer.from(c, "base64url").toString("utf8");
    return s.length ? s : null;
  } catch { return null; }
}

export class Store {
  private paths: GrimoirePaths;
  private _db: DatabaseSync | null = null;
  private _dbIdentity: string | null = null;

  constructor(opts?: { dir?: string }) {
    this.paths = resolvePaths(opts?.dir);
  }

  private db(): DatabaseSync {
    const stat = statSync(this.paths.indexPath, { bigint: true });
    const identity = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}`;
    if (this._db && this._dbIdentity !== identity) this.close();
    if (!this._db) {
      this._db = new DatabaseSync(this.paths.indexPath, { readOnly: true });
      this._db.exec("PRAGMA busy_timeout=2000");
      this._dbIdentity = identity;
    }
    return this._db;
  }

  close(): void { this._db?.close(); this._db = null; this._dbIdentity = null; }

  private metaGet(db: DatabaseSync, key: string): string | undefined {
    const row = db.prepare("SELECT value FROM index_meta WHERE key=?").get(key) as { value: string } | undefined;
    return row?.value;
  }

  /** Compares the index against the INSTALLED manifest (never the repo registry). */
  indexStatus(): StatusError | { status: "ok" } {
    if (!existsSync(this.paths.indexPath) || !existsSync(this.paths.manifestPath)) {
      return { status: "INDEX_MISSING", hint: `index not built; ${REBUILD}` };
    }
    let manifest: Manifest;
    try {
      const parsed = JSON.parse(readFileSync(this.paths.manifestPath, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object") throw new Error("invalid manifest");
      manifest = parsed as Manifest;
    }
    catch { return { status: "INDEX_STALE", hint: `manifest unreadable; ${REBUILD}` }; }
    let db: DatabaseSync;
    try { db = this.db(); this.metaGet(db, "schema_version"); }
    catch { this.close(); return { status: "INDEX_STALE", hint: `index unreadable; ${REBUILD}` }; }

    const schemaVersion = Number(this.metaGet(db, "schema_version"));
    if (schemaVersion !== manifest.schemaVersion || schemaVersion !== SCHEMA_VERSION) {
      return { status: "INDEX_STALE", hint: `schema changed; ${REBUILD}` };
    }
    if (!Array.isArray(manifest.packs) || manifest.packs.length === 0
      || manifest.packs.some((p) => !p || typeof p.serviceId !== "string" || typeof p.commit !== "string"
        || typeof p.sourceHash !== "string" || typeof p.attribution !== "string")) {
      return { status: "INDEX_STALE", hint: `empty manifest; ${REBUILD}` };
    }
    let indexedIds: unknown;
    try { indexedIds = JSON.parse(this.metaGet(db, "pack_ids") ?? ""); }
    catch { indexedIds = null; }
    const manifestIds = manifest.packs.map((p) => p.serviceId).sort();
    if (!Array.isArray(indexedIds)
      || JSON.stringify(indexedIds) !== JSON.stringify(manifestIds)) {
      return { status: "INDEX_STALE", hint: `pack set changed since build; ${REBUILD}` };
    }
    for (const p of manifest.packs) {
      if (this.metaGet(db, `pack:${p.serviceId}:source_commit`) !== p.commit
        || this.metaGet(db, `pack:${p.serviceId}:source_hash`) !== p.sourceHash
        || this.metaGet(db, `pack:${p.serviceId}:attribution`) !== p.attribution) {
        return { status: "INDEX_STALE", hint: `source changed since build; ${REBUILD}` };
      }
    }
    return { status: "ok" };
  }

  private readyDb(): DatabaseSync | StatusError {
    const s = this.indexStatus();
    if (s.status !== "ok") return s;
    return this._db ?? { status: "INDEX_STALE", hint: `index unreadable; ${REBUILD}` };
  }

  search(query: string, k: number = LIMITS.K_DEFAULT): SearchResult {
    const db = this.readyDb();
    if ("status" in db) return db;
    const rows = db.prepare(
      `SELECT s.id, s.pack, s.name, s.description, -bm25(skills_fts, 10.0, 5.0, 1.0) AS score
       FROM skills_fts JOIN skills s ON s.rowid = skills_fts.rowid
       WHERE skills_fts MATCH ? ORDER BY score DESC LIMIT ?`,
    ).all(ftsQuery(query), k) as unknown as (Pick<SkillRow, "id" | "pack" | "name" | "description"> & { score: number })[];
    return { status: "ok", hits: rows.map((r) => rowToHit(r, r.score)) };
  }

  list(category?: string, cursor?: string): ListResult {
    const db = this.readyDb();
    if ("status" in db) return db;
    let after = "";
    if (cursor !== undefined) {
      const d = decodeCursor(cursor);
      if (d === null) return { status: "INVALID_INPUT", hint: "cursor is not a valid grimoire_list cursor" };
      after = d;
    }
    const mappedCategory = category === undefined ? undefined : (CATEGORY_ALIASES[category] ?? category);
    const rows = (mappedCategory
      ? db.prepare("SELECT id,pack,name,description FROM skills WHERE category=? AND id>? ORDER BY id LIMIT ?").all(mappedCategory, after, LIMITS.PAGE + 1)
      : db.prepare("SELECT id,pack,name,description FROM skills WHERE id>? ORDER BY id LIMIT ?").all(after, LIMITS.PAGE + 1)
    ) as unknown as Pick<SkillRow, "id" | "pack" | "name" | "description">[];
    const hasMore = rows.length > LIMITS.PAGE;
    const page = rows.slice(0, LIMITS.PAGE);
    const out: ListResult = { status: "ok", items: page.map(rowToRef) };
    const last = page[page.length - 1];
    if (hasMore && last) out.nextCursor = encodeCursor(last.id);
    return out;
  }

  get(id: string): GetResult {
    const db = this.readyDb();
    if ("status" in db) return db;
    if (!decId(id)) return { status: "INVALID_INPUT", hint: 'id must be "<pack>:<skillName>"' };
    const row = db.prepare("SELECT * FROM skills WHERE id=?").get(id) as unknown as SkillRow | undefined;
    if (!row) return { status: "NOT_FOUND", hint: "unknown skill id" };
    const files = db.prepare("SELECT rel_path,size FROM skill_files WHERE skill_id=? ORDER BY rel_path")
      .all(id) as unknown as { rel_path: string; size: number }[];
    const attribution = servedAttribution(this.metaGet(db, `pack:${row.pack}:attribution`) ?? row.pack, row.notice);
    return { status: "ok", skill: rowToFull(row, files.map((f) => ({ path: f.rel_path, size: f.size })), attribution) };
  }

  fileGet(id: string, path: string): FileGetResult {
    const db = this.readyDb();
    if ("status" in db) return db;
    if (!decId(id)) return { status: "INVALID_INPUT", hint: 'id must be "<pack>:<skillName>"' };
    if (isUnsafePath(path)) return { status: "INVALID_INPUT", hint: "path must be a relative entry from the skill manifest (no absolute or .. paths)" };
    const skill = db.prepare("SELECT pack,notice FROM skills WHERE id=?").get(id) as { pack: string; notice: string } | undefined;
    if (!skill) return { status: "NOT_FOUND", hint: "unknown skill id" };
    const row = db.prepare("SELECT content,size FROM skill_files WHERE skill_id=? AND rel_path=?")
      .get(id, path) as unknown as { content: string; size: number } | undefined;
    if (!row) return { status: "NOT_FOUND", hint: "path not in skill manifest; call grimoire_get first" };
    const attribution = servedAttribution(this.metaGet(db, `pack:${skill.pack}:attribution`) ?? skill.pack, skill.notice);
    return { status: "ok", file: { path, content: row.content, size: row.size, attribution } };
  }
}
