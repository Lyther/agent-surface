// grimoire — the only runtime seam. Read-only reader over the self-contained index.
// Never writes (all writes live in indexer, build-time). Every public method first
// checks index health and returns INDEX_MISSING/INDEX_STALE instead of throwing.
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  LIMITS, type FileGetResult, type GetResult, type ListResult, type SearchResult, type StatusError,
} from "./contract.js";
import { SCHEMA_VERSION, decId, rowToFull, rowToHit, rowToRef, type SkillRow } from "./model.js";
import { resolvePaths, type GrimoirePaths } from "./namespace.js";

interface ManifestPack { serviceId: string; commit: string; sourceHash: string }
interface Manifest { schemaVersion: number; packs: ManifestPack[] }

const REBUILD = "run: npm run install:grimoire";

// Quote each token so user text can never be FTS5 query syntax; "" matches nothing safely.
const ftsQuery = (q: string): string =>
  q.split(/\s+/).filter(Boolean).map((t) => `"${t.replace(/"/g, "")}"`).join(" ") || '""';

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

  constructor(opts?: { dir?: string }) {
    this.paths = resolvePaths(opts?.dir);
  }

  private db(): DatabaseSync {
    if (!this._db) {
      this._db = new DatabaseSync(this.paths.indexPath, { readOnly: true });
      this._db.exec("PRAGMA busy_timeout=2000");
    }
    return this._db;
  }

  close(): void { this._db?.close(); this._db = null; }

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
    try { manifest = JSON.parse(readFileSync(this.paths.manifestPath, "utf8")) as Manifest; }
    catch { return { status: "INDEX_STALE", hint: `manifest unreadable; ${REBUILD}` }; }
    let db: DatabaseSync;
    try { db = this.db(); this.metaGet(db, "schema_version"); }
    catch { this.close(); return { status: "INDEX_STALE", hint: `index unreadable; ${REBUILD}` }; }

    const schemaVersion = Number(this.metaGet(db, "schema_version"));
    if (schemaVersion !== manifest.schemaVersion || schemaVersion !== SCHEMA_VERSION) {
      return { status: "INDEX_STALE", hint: `schema changed; ${REBUILD}` };
    }
    if (!Array.isArray(manifest.packs) || manifest.packs.length === 0) {
      return { status: "INDEX_STALE", hint: `empty manifest; ${REBUILD}` };
    }
    for (const p of manifest.packs) {
      if (this.metaGet(db, `pack:${p.serviceId}:source_commit`) !== p.commit
        || this.metaGet(db, `pack:${p.serviceId}:source_hash`) !== p.sourceHash) {
        return { status: "INDEX_STALE", hint: `source changed since build; ${REBUILD}` };
      }
    }
    return { status: "ok" };
  }

  private guard(): StatusError | null {
    const s = this.indexStatus();
    return s.status === "ok" ? null : s;
  }

  search(query: string, k: number = LIMITS.K_DEFAULT): SearchResult {
    const err = this.guard();
    if (err) return err;
    const rows = this.db().prepare(
      `SELECT s.id, s.pack, s.name, s.description, -bm25(skills_fts, 10.0, 5.0, 1.0) AS score
       FROM skills_fts JOIN skills s ON s.rowid = skills_fts.rowid
       WHERE skills_fts MATCH ? ORDER BY score DESC LIMIT ?`,
    ).all(ftsQuery(query), k) as unknown as (Pick<SkillRow, "id" | "pack" | "name" | "description"> & { score: number })[];
    return { status: "ok", hits: rows.map((r) => rowToHit(r, r.score)) };
  }

  list(category?: string, cursor?: string): ListResult {
    const err = this.guard();
    if (err) return err;
    let after = "";
    if (cursor !== undefined) {
      const d = decodeCursor(cursor);
      if (d === null) return { status: "INVALID_INPUT", hint: "cursor is not a valid grimoire_list cursor" };
      after = d;
    }
    const db = this.db();
    const rows = (category
      ? db.prepare("SELECT id,pack,name,description FROM skills WHERE category=? AND id>? ORDER BY id LIMIT ?").all(category, after, LIMITS.PAGE + 1)
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
    const err = this.guard();
    if (err) return err;
    if (!decId(id)) return { status: "INVALID_INPUT", hint: 'id must be "<pack>:<skillName>"' };
    const db = this.db();
    const row = db.prepare("SELECT * FROM skills WHERE id=?").get(id) as unknown as SkillRow | undefined;
    if (!row) return { status: "NOT_FOUND", hint: "unknown skill id" };
    const files = db.prepare("SELECT rel_path,size FROM skill_files WHERE skill_id=? ORDER BY rel_path")
      .all(id) as unknown as { rel_path: string; size: number }[];
    return { status: "ok", skill: rowToFull(row, files.map((f) => ({ path: f.rel_path, size: f.size }))) };
  }

  fileGet(id: string, path: string): FileGetResult {
    const err = this.guard();
    if (err) return err;
    if (!decId(id)) return { status: "INVALID_INPUT", hint: 'id must be "<pack>:<skillName>"' };
    if (isUnsafePath(path)) return { status: "INVALID_INPUT", hint: "path must be a relative entry from the skill manifest (no absolute or .. paths)" };
    const db = this.db();
    if (!db.prepare("SELECT 1 FROM skills WHERE id=?").get(id)) return { status: "NOT_FOUND", hint: "unknown skill id" };
    const row = db.prepare("SELECT content,size FROM skill_files WHERE skill_id=? AND rel_path=?")
      .get(id, path) as unknown as { content: string; size: number } | undefined;
    if (!row) return { status: "NOT_FOUND", hint: "path not in skill manifest; call grimoire_get first" };
    return { status: "ok", file: { path, content: row.content, size: row.size } };
  }
}
