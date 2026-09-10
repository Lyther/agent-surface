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
import { LIMITS, SynapseInputError, SynapsePayloadError, utf8Bytes } from "./contract.js";
import { ensureOwnerOnlyDir } from "./fsguard.js";
import { SCHEMA_SQL, SCHEMA_VERSION, crossProjectId, decId, extId, rowToCompact, rowToFull, rowToLock, type LockRow, type MemoryRow } from "./model.js";
import { resolveProjectRef } from "./namespace.js";

const ftsQuery = (q: string): string =>
  q.split(/\s+/).filter(Boolean).map((t) => `"${t.replace(/"/g, "")}"`).join(" ") || '""';

function openDb(path: string, readonly: boolean): DatabaseSync {
  if (!readonly) { mkdirSync(dirname(path), { recursive: true }); ensureOwnerOnlyDir(dirname(path)); }
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
    const sup = q.supersedes ? decId(q.supersedes) : null;
    db.exec("BEGIN IMMEDIATE");
    try {
      if (sup) {
        if (sup.store === "cross-project") throw new SynapseInputError("cross-project memory ids are read-only");
        if (sup.store !== store) throw new SynapseInputError(`supersedes id ${q.supersedes} belongs to ${sup.store} memory`);
        const predecessor = db.prepare("SELECT 1 FROM memory WHERE id=? AND status='live'").get(sup.rowid);
        if (!predecessor) throw new SynapseInputError(`unknown supersedes id ${q.supersedes}`);
        this.markSuperseded(db, sup.rowid);
      }
      const res = db.prepare("INSERT INTO memory(ts,agent_id,content,tags,supersedes,status) VALUES(?,?,?,?,?,'live')")
        .run(ts, q.agentId, text, tags, sup?.rowid ?? null);
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
    if (d.store === "cross-project") throw new SynapseInputError("cross-project memory ids are read-only");
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
    // A query-less recall that carries a cursor is a forward drain: page the project
    // ASCending so delivered rows form a contiguous block above `since` and the cursor
    // can advance without ever skipping the sub-window (id-DESC + MAX(id) would strand it).
    const incremental = !q.query && q.since !== undefined;
    const sources: { db: DatabaseSync | null; store: Scope; since: number }[] = [
      { db: primaryDb, store: "project", since: q.since ?? 0 },
      { db: this.globalDb(), store: "global", since: 0 }, // global always re-scanned (low churn)
    ];

    const hits: { row: MemoryRow; store: Scope; rank?: number; readOnly?: true }[] = [];
    let sourceCapped = false; // browse: any source filled its page (informational "there is more")
    let projectCapped = false; // drain: the project page was full ⇒ more project rows lie beyond it
    let projectScannedMax = q.since ?? 0; // drain: highest project id the SQL scanned (safe to skip past)
    for (const s of sources) {
      if (!s.db) continue;
      const order = incremental && s.store === "project" ? "asc" : "desc";
      const rows = q.query ? this.searchRows(s.db, q.query, s.since, q.limit) : this.recentRows(s.db, s.since, q.limit, order);
      if (rows.length >= q.limit) sourceCapped = true; // more rows may remain beyond this page
      if (s.store === "project") {
        projectCapped = rows.length >= q.limit;
        if (incremental && rows.length) projectScannedMax = rows[rows.length - 1]!.row.id; // ASC ⇒ last is max
      }
      for (const r of rows) {
        if (q.tags && q.tags.length) {
          const t = r.row.tags ? (JSON.parse(r.row.tags) as string[]) : [];
          if (!q.tags.every((x) => t.includes(x))) continue;
        }
        const readOnly = q.project && s.store === "project" ? true : undefined;
        hits.push(r.rank !== undefined
          ? { row: r.row, store: s.store, rank: r.rank, ...(readOnly ? { readOnly } : {}) }
          : { row: r.row, store: s.store, ...(readOnly ? { readOnly } : {}) });
      }
    }
    // search → bm25 relevance; drain → project rows first in ascending id (so a byte cut
    // drops the newest-in-page and the cursor stays a no-skip floor); browse → newest first
    // by ts, which is the only field comparable across the separate project and global DBs
    // (raw rowids are per-DB sequences and would let the larger DB crowd out the other).
    if (q.query) {
      hits.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || b.row.ts - a.row.ts || b.row.id - a.row.id);
    } else if (incremental) {
      hits.sort((a, b) =>
        (a.store === b.store ? 0 : a.store === "project" ? -1 : 1)
        || (a.store === "project" ? a.row.id - b.row.id : b.row.ts - a.row.ts || b.row.id - a.row.id));
    } else {
      hits.sort((a, b) => b.row.ts - a.row.ts || b.row.id - a.row.id);
    }

    const results: (CompactMemory | FullMemory)[] = [];
    let bytes = 0;
    let truncated = false;
    // Drain path only: the first project row that was deliverable but cut by the limit/budget.
    // Because project rows sort first, a cut on a project row means every project row from here
    // up is undelivered; a cut on a global row means all project rows were already delivered.
    let firstDroppedProjectId = 0;
    for (const h of hits) {
      if (results.length >= q.limit) { truncated = true; if (h.store === "project") firstDroppedProjectId = h.row.id; break; }
      const rec = q.mode === "full" ? rowToFull(h.row, h.store) : rowToCompact(h.row, h.store, h.rank);
      if (h.readOnly) {
        rec.id = crossProjectId(h.row.id);
        if ("supersedes" in rec && rec.supersedes !== undefined) rec.supersedes = crossProjectId(rec.supersedes);
        rec.readOnly = true;
      }
      // Budget on the whole serialized record (id/ts/agent/tags/provenance), not just the
      // snippet — that is what actually reaches the caller's context. First record is always
      // admitted so recall makes progress even under a tiny budget.
      const size = utf8Bytes(JSON.stringify(rec));
      if (bytes + size > q.maxBytes && results.length > 0) { truncated = true; if (h.store === "project") firstDroppedProjectId = h.row.id; break; }
      results.push(rec);
      bytes += size;
    }
    if (incremental) {
      // Cursor/`truncated` reflect PROJECT drain only: global is re-scanned from 0 every call and
      // can never be advanced by the cursor, so counting it would loop forever once the project is
      // drained. Advance past scanned project rows (delivered or filtered); stop before the first
      // budget-cut project row so it is refetched next call.
      const cursor = firstDroppedProjectId ? firstDroppedProjectId - 1 : projectScannedMax;
      return { results, truncated: firstDroppedProjectId !== 0 || projectCapped, cursor };
    }
    const browseCursor = primaryDb
      ? (primaryDb.prepare("SELECT COALESCE(MAX(id),0) AS m FROM memory").get() as unknown as { m: number }).m
      : 0;
    return { results, truncated: truncated || sourceCapped, cursor: browseCursor };
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

  private recentRows(db: DatabaseSync, since: number, limit: number, order: "asc" | "desc" = "desc"): RowHit[] {
    // `order` is an internal literal (never user input): ASC drains forward from a cursor,
    // DESC shows the newest slice for browse.
    const rows = db.prepare(
      `SELECT id,ts,agent_id,content,tags,supersedes,status FROM memory WHERE status='live' AND id > ? ORDER BY id ${order === "asc" ? "ASC" : "DESC"} LIMIT ?`,
    ).all(since, limit) as unknown as MemoryRow[];
    return rows.map((row) => ({ row }));
  }

  get(q: { projectDbPath: string; agentId: string; ids: Offset[] }): FullMemory[] {
    const byStore = new Map<Scope, number[]>();
    for (const id of q.ids) {
      const d = decId(id);
      if (d.store === "cross-project") throw new SynapseInputError("cross-project memory ids are read-only; recall with mode=full");
      const arr = byStore.get(d.store);
      if (arr) arr.push(d.rowid); else byStore.set(d.store, [d.rowid]);
    }
    const out: FullMemory[] = [];
    let bytes = 0;
    for (const [store, rowids] of byStore) {
      if (!rowids.length) continue;
      const ph = rowids.map(() => "?").join(",");
      const rows = this.dbFor(store, q.projectDbPath).prepare(
        `SELECT id,ts,agent_id,content,tags,supersedes,status FROM memory WHERE id IN (${ph}) AND status!='redacted'`,
      ).all(...rowids) as unknown as MemoryRow[];
      for (const r of rows) {
        // Aggregate content ceiling: get expands caller-chosen ids, so fail loud rather than
        // silently flooding context. A single record is always ≤ CONTENT_BYTES_MAX ⇒ always fetchable.
        bytes += utf8Bytes(r.content);
        if (bytes > LIMITS.GET_MAXBYTES) {
          throw new SynapsePayloadError(`memory_get content exceeds ${LIMITS.GET_MAXBYTES} bytes; request fewer ids or use compact recall`);
        }
        out.push(rowToFull(r, store));
      }
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
