// synapse — the only SQLite seam. ONE machine-wide store: owns the global DB and
// lazily opens each project's DB (routed by projectDbPath), plus read-only opens of
// other projects for explicit cross-read. Sole writer ⇒ realtime notify fires INLINE
// after each commit (no SQLite hook needed). onCommit(channel): "global" or projectDbPath.
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  CompactMemory, FullMemory, IClock, IRedactor, IStore, LockRecord, Offset, RecallQuery, RecallResult,
  Store as Scope,
} from "./contract.js";
import { utf8Bytes } from "./contract.js";
import { SCHEMA_SQL, SCHEMA_VERSION, decId, extId, rowToCompact, rowToFull, rowToLock, type LockRow, type MemoryRow } from "./model.js";
import { resolveProjectRef } from "./namespace.js";

const ftsQuery = (q: string): string =>
  q.split(/\s+/).filter(Boolean).map((t) => `"${t.replace(/"/g, "")}"`).join(" ") || '""';

function openDb(path: string, readonly: boolean): DatabaseSync {
  if (!readonly) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { readOnly: readonly });
  db.exec("PRAGMA busy_timeout=5000");
  if (!readonly) {
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA synchronous=NORMAL");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(SCHEMA_SQL);
    db.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES('schema_version',?)").run(String(SCHEMA_VERSION));
    try { chmodSync(path, 0o600); } catch { /* best effort */ }
  }
  return db;
}

export interface StoreOptions {
  clock: IClock;
  redactor: IRedactor;
  globalDbPath: string;
  dbDir?: string;
  /** fired after a committed write; channel = "global" | projectDbPath. Sidecar fans out. */
  onCommit?: (channel: string) => void;
}

interface RowHit { row: MemoryRow; rank?: number }
export const GLOBAL_CHANNEL = "global";

export class Store implements IStore {
  private clock: IClock;
  private redactor: IRedactor;
  private globalDbPath: string;
  private dbDir: string | undefined;
  private onCommit: ((channel: string) => void) | undefined;
  private rw = new Map<string, DatabaseSync>();
  private ro = new Map<string, DatabaseSync | null>();

  constructor(opts: StoreOptions) {
    this.clock = opts.clock;
    this.redactor = opts.redactor;
    this.globalDbPath = opts.globalDbPath;
    this.dbDir = opts.dbDir;
    this.onCommit = opts.onCommit;
  }

  private rwDb(path: string): DatabaseSync {
    let db = this.rw.get(path);
    if (!db) { db = openDb(path, false); this.rw.set(path, db); }
    return db;
  }
  private globalDb(): DatabaseSync { return this.rwDb(this.globalDbPath); }
  private dbFor(store: Scope, projectDbPath: string): DatabaseSync {
    return store === "global" ? this.globalDb() : this.rwDb(projectDbPath);
  }

  // ---- writes (sole writer; notify inline after commit) --------------------
  remember(q: { projectDbPath: string; agentId: string; content: string; tags?: string[]; global?: boolean; supersedes?: Offset }): { id: Offset; ts: number; redactions: number } {
    const ts = this.clock.now();
    const { text, count } = this.redactor.redact(q.content);
    const store: Scope = q.global ? "global" : "project";
    const db = this.dbFor(store, q.projectDbPath);
    const tags = q.tags && q.tags.length ? JSON.stringify(q.tags) : null;
    const sup = q.supersedes !== undefined ? decId(q.supersedes) : null;
    db.exec("BEGIN IMMEDIATE");
    try {
      if (sup && sup.store === store) this.markSuperseded(db, sup.rowid);
      const res = db.prepare("INSERT INTO memory(ts,agent_id,content,tags,supersedes,status) VALUES(?,?,?,?,?,'live')")
        .run(ts, q.agentId, text, tags, sup && sup.store === store ? sup.rowid : null);
      const rowid = Number(res.lastInsertRowid);
      db.prepare("INSERT INTO memory_fts(rowid,content,tags) VALUES(?,?,?)").run(rowid, text, tags ?? "");
      db.exec("COMMIT");
      this.onCommit?.(store === "global" ? GLOBAL_CHANNEL : q.projectDbPath);
      return { id: extId(store, rowid), ts, redactions: count };
    } catch (e) { db.exec("ROLLBACK"); throw e; }
  }

  /** supersede: flip status + drop from FTS; CONTENT IS PRESERVED for history/audit. */
  private markSuperseded(db: DatabaseSync, rowid: number): void {
    const row = db.prepare("SELECT content,tags FROM memory WHERE id=?").get(rowid) as unknown as
      { content: string; tags: string | null } | undefined;
    if (!row) return;
    db.prepare("UPDATE memory SET status='superseded' WHERE id=?").run(rowid);
    db.prepare("INSERT INTO memory_fts(memory_fts,rowid,content,tags) VALUES('delete',?,?,?)").run(rowid, row.content, row.tags ?? "");
  }

  /** forget/redact: drop from FTS and OVERWRITE the plaintext with a reason tombstone
   *  (real remediation for leaked secrets) while keeping the row for audit (id/ts/agent). */
  private redactRow(db: DatabaseSync, rowid: number, reason: string): void {
    const row = db.prepare("SELECT content,tags FROM memory WHERE id=?").get(rowid) as unknown as
      { content: string; tags: string | null } | undefined;
    if (!row) return;
    // `reason` is free-form and this is THE secret-remediation path, so an agent may name
    // the leaked value in it (e.g. "purge token sk-proj-..."). Scrub it through the same
    // ingest redactor before persisting so forget never re-leaks the secret it removes.
    const safeReason = this.redactor.redact(reason).text;
    db.prepare("INSERT INTO memory_fts(memory_fts,rowid,content,tags) VALUES('delete',?,?,?)").run(rowid, row.content, row.tags ?? "");
    db.prepare("UPDATE memory SET content=?, tags=NULL, status='redacted' WHERE id=?").run(`[REDACTED: ${safeReason}]`, rowid);
  }

  forget(q: { projectDbPath: string; agentId: string; id: Offset; reason: string }): { id: Offset; ts: number } | null {
    const d = decId(q.id);
    const db = this.dbFor(d.store, q.projectDbPath);
    const exists = db.prepare("SELECT 1 FROM memory WHERE id=? AND status!='redacted'").get(d.rowid);
    if (!exists) return null;
    db.exec("BEGIN IMMEDIATE");
    try { this.redactRow(db, d.rowid, q.reason); db.exec("COMMIT"); }
    catch (e) { db.exec("ROLLBACK"); throw e; }
    this.onCommit?.(d.store === "global" ? GLOBAL_CHANNEL : q.projectDbPath);
    return { id: q.id, ts: this.clock.now() };
  }

  // ---- reads ---------------------------------------------------------------
  recall(q: RecallQuery): RecallResult {
    const primaryDb: DatabaseSync | null = q.project ? this.crossDb(q.project) : this.rwDb(q.projectDbPath);
    const sources: { db: DatabaseSync | null; store: Scope; since: number }[] = [
      { db: primaryDb, store: "project", since: q.since ?? 0 },
      { db: this.globalDb(), store: "global", since: 0 }, // global always re-scanned (low churn)
    ];

    const hits: { row: MemoryRow; store: Scope; rank?: number }[] = [];
    for (const s of sources) {
      if (!s.db) continue;
      const rows = q.query ? this.searchRows(s.db, q.query, s.since, q.limit) : this.recentRows(s.db, s.since, q.limit);
      for (const r of rows) {
        if (q.tags && q.tags.length) {
          const t = r.row.tags ? (JSON.parse(r.row.tags) as string[]) : [];
          if (!q.tags.every((x) => t.includes(x))) continue;
        }
        hits.push(r.rank !== undefined ? { row: r.row, store: s.store, rank: r.rank } : { row: r.row, store: s.store });
      }
    }
    hits.sort((a, b) => (q.query ? (a.rank ?? 0) - (b.rank ?? 0) || b.row.id - a.row.id : b.row.id - a.row.id));

    const results: (CompactMemory | FullMemory)[] = [];
    let bytes = 0;
    let truncated = false;
    for (const h of hits) {
      if (results.length >= q.limit) { truncated = true; break; }
      const rec = q.mode === "full" ? rowToFull(h.row, h.store) : rowToCompact(h.row, h.store, h.rank);
      const size = utf8Bytes(q.mode === "full" ? (rec as FullMemory).content : (rec as CompactMemory).snippet);
      if (bytes + size > q.maxBytes && results.length > 0) { truncated = true; break; }
      results.push(rec);
      bytes += size;
    }
    const max = this.rwDb(q.projectDbPath).prepare("SELECT COALESCE(MAX(id),0) AS m FROM memory").get() as unknown as { m: number };
    return { results, truncated, cursor: max.m };
  }

  private searchRows(db: DatabaseSync, query: string, since: number, limit: number): RowHit[] {
    const rows = db.prepare(
      `SELECT m.id,m.ts,m.agent_id,m.content,m.tags,m.supersedes,m.status, bm25(memory_fts) AS rank
       FROM memory_fts JOIN memory m ON m.id=memory_fts.rowid
       WHERE memory_fts MATCH ? AND m.status='live' AND m.id > ?
       ORDER BY rank LIMIT ?`,
    ).all(ftsQuery(query), since, limit) as unknown as (MemoryRow & { rank: number })[];
    return rows.map((r) => ({ row: r, rank: r.rank }));
  }

  private recentRows(db: DatabaseSync, since: number, limit: number): RowHit[] {
    const rows = db.prepare(
      "SELECT id,ts,agent_id,content,tags,supersedes,status FROM memory WHERE status='live' AND id > ? ORDER BY id DESC LIMIT ?",
    ).all(since, limit) as unknown as MemoryRow[];
    return rows.map((row) => ({ row }));
  }

  get(q: { projectDbPath: string; agentId: string; ids: Offset[] }): FullMemory[] {
    const byStore = new Map<Scope, number[]>();
    for (const id of q.ids) {
      const d = decId(id);
      const arr = byStore.get(d.store);
      if (arr) arr.push(d.rowid); else byStore.set(d.store, [d.rowid]);
    }
    const out: FullMemory[] = [];
    for (const [store, rowids] of byStore) {
      if (!rowids.length) continue;
      const ph = rowids.map(() => "?").join(",");
      const rows = this.dbFor(store, q.projectDbPath).prepare(
        `SELECT id,ts,agent_id,content,tags,supersedes,status FROM memory WHERE id IN (${ph}) AND status!='redacted'`,
      ).all(...rowids) as unknown as MemoryRow[];
      for (const r of rows) out.push(rowToFull(r, store));
    }
    return out;
  }

  // ---- locks (project-scoped file coordination) ----------------------------
  acquire(q: { projectDbPath: string; agentId: string; glob: string; ttlMs: number }): { ok: true; lock: LockRecord } | { ok: false; heldBy: string; expiresAt: number } {
    const now = this.clock.now();
    const db = this.rwDb(q.projectDbPath);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM locks WHERE expires_at <= ?").run(now);
      const held = db.prepare("SELECT glob,agent_id,acquired_at,expires_at FROM locks WHERE glob=?").get(q.glob) as unknown as LockRow | undefined;
      if (held && held.agent_id !== q.agentId) {
        db.exec("COMMIT");
        return { ok: false, heldBy: held.agent_id, expiresAt: held.expires_at };
      }
      const expiresAt = now + q.ttlMs;
      db.prepare(
        "INSERT INTO locks(glob,agent_id,acquired_at,expires_at) VALUES(?,?,?,?) " +
        "ON CONFLICT(glob) DO UPDATE SET agent_id=excluded.agent_id, acquired_at=excluded.acquired_at, expires_at=excluded.expires_at",
      ).run(q.glob, q.agentId, now, expiresAt);
      db.exec("COMMIT");
      this.onCommit?.(q.projectDbPath);
      return { ok: true, lock: { glob: q.glob, agentId: q.agentId, acquiredAt: now, expiresAt } };
    } catch (e) { db.exec("ROLLBACK"); throw e; }
  }

  release(q: { projectDbPath: string; agentId: string; glob: string }): { released: boolean } {
    const res = this.rwDb(q.projectDbPath).prepare("DELETE FROM locks WHERE glob=? AND agent_id=?").run(q.glob, q.agentId);
    const released = Number(res.changes) > 0;
    if (released) this.onCommit?.(q.projectDbPath);
    return { released };
  }

  listLocks(q: { projectDbPath: string; globFilter?: string }): LockRecord[] {
    const now = this.clock.now();
    const db = this.rwDb(q.projectDbPath);
    db.prepare("DELETE FROM locks WHERE expires_at <= ?").run(now);
    const rows = (q.globFilter
      ? db.prepare("SELECT glob,agent_id,acquired_at,expires_at FROM locks WHERE glob LIKE ? ORDER BY glob").all(`%${q.globFilter}%`)
      : db.prepare("SELECT glob,agent_id,acquired_at,expires_at FROM locks ORDER BY glob").all()) as unknown as LockRow[];
    return rows.map(rowToLock);
  }

  private crossDb(ref: string): DatabaseSync | null {
    const path = resolveProjectRef(ref, this.dbDir);
    if (this.rw.has(path)) return this.rw.get(path)!; // already open RW (it's an active project)
    const cached = this.ro.get(path);
    if (cached !== undefined) return cached;
    const db = existsSync(path) ? openDb(path, true) : null;
    this.ro.set(path, db);
    return db;
  }

  close(): void {
    for (const db of this.rw.values()) db.close();
    for (const db of this.ro.values()) db?.close();
  }
}
