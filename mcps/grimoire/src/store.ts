// grimoire — the only runtime seam. Read-only reader over the self-contained index.
// Never writes (all writes live in indexer, build-time). Every public method first
// checks index health and returns INDEX_MISSING/INDEX_STALE instead of throwing.
import { existsSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  LIMITS, type FileGetResult, type GetResult, type ListResult, type SearchResult, type StatusError,
} from "./contract.js";
import { CATEGORY_ALIASES, SCHEMA_VERSION, decId, rowToFull, rowToHit, rowToRef, type SkillRow } from "./model.js";
import { resolvePaths, type GrimoirePaths } from "./namespace.js";

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

  /** INDEX_MISSING without the file; INDEX_STALE when it cannot be opened or its schema is not this build's. */
  indexStatus(): StatusError | { status: "ok" } {
    if (!existsSync(this.paths.indexPath)) {
      return { status: "INDEX_MISSING", hint: `index not built; ${REBUILD}` };
    }
    let schemaVersion: number;
    try { schemaVersion = Number(this.metaGet(this.db(), "schema_version")); }
    catch { this.close(); return { status: "INDEX_STALE", hint: `index unreadable; ${REBUILD}` }; }
    if (schemaVersion !== SCHEMA_VERSION) {
      return { status: "INDEX_STALE", hint: `schema changed; ${REBUILD}` };
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
    const mappedCategory = category === undefined ? undefined : (CATEGORY_ALIASES.get(category) ?? category);
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
    return { status: "ok", skill: rowToFull(row, files.map((f) => ({ path: f.rel_path, size: f.size }))) };
  }

  fileGet(id: string, path: string): FileGetResult {
    const db = this.readyDb();
    if ("status" in db) return db;
    if (!decId(id)) return { status: "INVALID_INPUT", hint: 'id must be "<pack>:<skillName>"' };
    const skill = db.prepare("SELECT id FROM skills WHERE id=?").get(id) as { id: string } | undefined;
    if (!skill) return { status: "NOT_FOUND", hint: "unknown skill id" };
    const row = db.prepare("SELECT content,size FROM skill_files WHERE skill_id=? AND rel_path=?")
      .get(id, path) as unknown as { content: string; size: number } | undefined;
    if (!row) return { status: "NOT_FOUND", hint: "path not in skill manifest; call grimoire_get first" };
    return { status: "ok", file: { path, content: row.content, size: row.size } };
  }
}
