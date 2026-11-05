// synapse — the only SQLite seam. Each process opens the global DB and lazily opens each
// project's DB (routed by projectDbPath), plus read-only opens of other projects for explicit
// cross-read. Every session runs its own process over the same files: WAL plus busy_timeout
// lets SQLite serialize their writers, and each write takes the write lock up front.
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  CompactMemory, FullMemory, IClock, IStore, LockRecord, Offset, RecallQuery, RecallResult,
  Store as Scope,
} from "./contract.js";
import { LIMITS, SynapseInputError, SynapsePayloadError, utf8Bytes } from "./contract.js";
import { ensureOwnerOnlyDir } from "./fsguard.js";
import { SCHEMA_SQL, SCHEMA_VERSION, crossProjectId, decId, extId, rowToCompact, rowToFull, rowToLock, type LockRow, type MemoryRow } from "./model.js";
import { resolveProjectRef } from "./namespace.js";

const ftsQuery = (q: string): string =>
  q.split(/\s+/).filter(Boolean).map((t) => `"${t.replace(/"/g, "")}"`).join(" ") || '""';

// Every requested tag must be in the row's JSON `tags` array (NULL = no tags). It runs in SQL, before
// LIMIT: filtering the page afterwards drops eligible rows that rank or sort below it. The SQL text is
// a constant; the tag list travels as one bound JSON parameter and is never spliced into the statement.
const TAGS_ALL_SQL = "AND NOT EXISTS (SELECT 1 FROM json_each(?) w WHERE w.value NOT IN (SELECT value FROM json_each(COALESCE(m.tags,'[]'))))";
const tagFilter = (tags: string[] | undefined): { sql: string; params: string[] } =>
  tags && tags.length ? { sql: TAGS_ALL_SQL, params: [JSON.stringify(tags)] } : { sql: "", params: [] };

const BUSY_TIMEOUT_MS = 5000;
const SQLITE_BUSY = 5;
const WAL_RETRY_INTERVAL_MS = 10;

// Switching a new file to WAL needs an exclusive lock, and SQLite answers SQLITE_BUSY at once, without
// the busy handler, while another process makes the same switch: four servers opening one new project
// file at once failed this way. The switch is persistent, so retrying until busy_timeout covers it.
function enableWal(db: DatabaseSync): void {
  const deadline = Date.now() + BUSY_TIMEOUT_MS;
  for (;;) {
    try { db.exec("PRAGMA journal_mode=WAL"); return; } catch (e) {
      if ((e as { errcode?: unknown }).errcode !== SQLITE_BUSY || Date.now() >= deadline) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, WAL_RETRY_INTERVAL_MS);
    }
  }
}

function openDb(path: string, readonly: boolean): DatabaseSync {
  if (!readonly) { mkdirSync(dirname(path), { recursive: true }); ensureOwnerOnlyDir(dirname(path)); }
  const db = new DatabaseSync(path, { readOnly: readonly });
  db.exec(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS}`);
  if (!readonly) {
    enableWal(db);
    db.exec("PRAGMA synchronous=NORMAL");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(SCHEMA_SQL);
    // Read first: even an ignored insert takes the write lock, and the hook opens this file on every tool call.
    if (!db.prepare("SELECT 1 FROM meta WHERE key='schema_version'").get()) {
      db.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES('schema_version',?)").run(String(SCHEMA_VERSION));
    }
    try { chmodSync(path, 0o600); } catch { /* best effort */ }
  }
  return db;
}

export interface StoreOptions {
  clock: IClock;
  globalDbPath: string;
  dbDir?: string;
}

interface RowHit { row: MemoryRow; rank?: number }
/** A live record a hook receiver has not been handed yet; `id` is the external id memory_get takes. */
export interface UnseenRecord { id: Offset; store: Scope; ts: number; agentId: string; content: string }
export interface Claim { baseline: boolean; taken: number; remaining: number }
type UnseenRow = { id: number; ts: number; agent_id: string; content: string };
type AcquireResult = { ok: true; lock: LockRecord } | { ok: false; heldBy: string; expiresAt: number };

/**
 * Run one write under BEGIN IMMEDIATE. Taking the write lock first matters with several processes: a
 * read transaction that later upgrades can fail with SQLITE_BUSY, which busy_timeout does not retry.
 */
const maxId = (db: DatabaseSync | null): number =>
  db ? (db.prepare("SELECT COALESCE(MAX(id),0) AS m FROM memory").get() as unknown as { m: number }).m : 0;
const countLiveAfter = (db: DatabaseSync | null, after: number, except: number[]): number =>
  db ? (db.prepare("SELECT COUNT(*) AS n FROM memory WHERE status='live' AND id > ? AND id NOT IN (SELECT value FROM json_each(?))")
    .get(after, JSON.stringify(except)) as unknown as { n: number }).n : 0;

function writeTx<T>(db: DatabaseSync, apply: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = apply();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    // A COMMIT that failed may have ended the transaction already; a second error would hide the first.
    if (db.isTransaction) db.exec("ROLLBACK");
    throw e;
  }
}

export class Store implements IStore {
  private clock: IClock;
  private globalDbPath: string;
  private dbDir: string | undefined;
  private rw = new Map<string, DatabaseSync>();
  private ro = new Map<string, DatabaseSync | null>();

  constructor(opts: StoreOptions) {
    this.clock = opts.clock;
    this.globalDbPath = opts.globalDbPath;
    this.dbDir = opts.dbDir;
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

  // ---- writes ----------------------------------------------------------------
  remember(q: { projectDbPath: string; agentId: string; content: string; tags?: string[]; global?: boolean; supersedes?: Offset }): { id: Offset; ts: number } {
    const ts = this.clock.now();
    const store: Scope = q.global ? "global" : "project";
    const db = this.dbFor(store, q.projectDbPath);
    const tags = q.tags && q.tags.length ? JSON.stringify(q.tags) : null;
    const sup = q.supersedes ? decId(q.supersedes) : null;
    return writeTx(db, () => {
      if (sup) {
        if (sup.store === "cross-project") throw new SynapseInputError("cross-project memory ids are read-only");
        if (sup.store !== store) throw new SynapseInputError(`supersedes id ${q.supersedes} belongs to ${sup.store} memory`);
        const predecessor = db.prepare("SELECT 1 FROM memory WHERE id=? AND status='live'").get(sup.rowid);
        if (!predecessor) throw new SynapseInputError(`unknown supersedes id ${q.supersedes}`);
        this.markSuperseded(db, sup.rowid);
      }
      const res = db.prepare("INSERT INTO memory(ts,agent_id,content,tags,supersedes,status) VALUES(?,?,?,?,?,'live')")
        .run(ts, q.agentId, q.content, tags, sup?.rowid ?? null);
      const rowid = Number(res.lastInsertRowid);
      db.prepare("INSERT INTO memory_fts(rowid,content,tags) VALUES(?,?,?)").run(rowid, q.content, tags ?? "");
      return { id: extId(store, rowid), ts };
    });
  }

  /** supersede: flip status + drop from FTS; CONTENT IS PRESERVED for history/audit. */
  private markSuperseded(db: DatabaseSync, rowid: number): void {
    const row = db.prepare("SELECT content,tags FROM memory WHERE id=?").get(rowid) as unknown as
      { content: string; tags: string | null } | undefined;
    if (!row) return;
    db.prepare("UPDATE memory SET status='superseded' WHERE id=?").run(rowid);
    db.prepare("INSERT INTO memory_fts(memory_fts,rowid,content,tags) VALUES('delete',?,?,?)").run(rowid, row.content, row.tags ?? "");
  }

  /** forget: drop from FTS and OVERWRITE the plaintext with a reason tombstone
   *  (real remediation for leaked secrets) while keeping the row for audit (id/ts/agent). */
  private scrubRow(db: DatabaseSync, rowid: number, reason: string): void {
    const row = db.prepare("SELECT content,tags,status FROM memory WHERE id=?").get(rowid) as unknown as
      { content: string; tags: string | null; status: string } | undefined;
    if (!row) return;
    // Only a live row is still indexed: markSuperseded already deleted it, and external-content
    // FTS5 reports a second delete of the same rowid as a malformed database.
    if (row.status === "live") db.prepare("INSERT INTO memory_fts(memory_fts,rowid,content,tags) VALUES('delete',?,?,?)").run(rowid, row.content, row.tags ?? "");
    db.prepare("UPDATE memory SET content=?, tags=NULL, status='redacted' WHERE id=?").run(`[REDACTED: ${reason}]`, rowid);
  }

  forget(q: { projectDbPath: string; agentId: string; id: Offset; reason: string }): { id: Offset; ts: number } | null {
    const d = decId(q.id);
    if (d.store === "cross-project") throw new SynapseInputError("cross-project memory ids are read-only");
    const db = this.dbFor(d.store, q.projectDbPath);
    return writeTx(db, () => {
      const exists = db.prepare("SELECT 1 FROM memory WHERE id=? AND status!='redacted'").get(d.rowid);
      if (!exists) return null;
      this.scrubRow(db, d.rowid, q.reason);
      return { id: q.id, ts: this.clock.now() };
    });
  }

  // ---- reads ---------------------------------------------------------------
  recall(q: RecallQuery): RecallResult {
    const primaryDb: DatabaseSync | null = q.project ? this.crossDb(q.project) : this.rwDb(q.projectDbPath);
    // A recall that carries a cursor, with or without a query, is a forward drain: page the
    // project ASCending by id so delivered rows form a contiguous block above `since` and the
    // cursor can advance without ever skipping the sub-window (DESC/rank + MAX(id) would strand it).
    const incremental = q.since !== undefined;
    const sources: { db: DatabaseSync | null; store: Scope; since: number }[] = [
      { db: primaryDb, store: "project", since: q.since ?? 0 },
      { db: this.globalDb(), store: "global", since: 0 }, // global always re-scanned (low churn)
    ];

    const hits: { row: MemoryRow; store: Scope; rank?: number; readOnly?: true }[] = [];
    let sourceCapped = false; // browse: any source filled its page (informational "there is more")
    let projectCapped = false; // drain: the project page was full ⇒ more project rows lie beyond it
    let projectScannedMax = q.since ?? 0; // drain: highest project id the SQL returned (safe to skip past)
    for (const s of sources) {
      if (!s.db) continue;
      const drain = incremental && s.store === "project";
      const rows = q.query
        ? this.searchRows(s.db, q.query, s.since, q.limit, drain ? "asc" : "rank", q.tags)
        : this.recentRows(s.db, s.since, q.limit, drain ? "asc" : "desc", q.tags);
      if (rows.length >= q.limit) sourceCapped = true; // more rows may remain beyond this page
      if (s.store === "project") {
        projectCapped = rows.length >= q.limit;
        if (incremental && rows.length) projectScannedMax = rows[rows.length - 1]!.row.id; // ASC ⇒ last is max
      }
      for (const r of rows) {
        const readOnly = q.project && s.store === "project" ? true : undefined;
        hits.push(r.rank !== undefined
          ? { row: r.row, store: s.store, rank: r.rank, ...(readOnly ? { readOnly } : {}) }
          : { row: r.row, store: s.store, ...(readOnly ? { readOnly } : {}) });
      }
    }
    // drain → project rows first in ascending id (so a byte cut drops the newest-in-page and
    // the cursor stays a no-skip floor); search → bm25 relevance; browse → newest first
    // by ts, which is the only field comparable across the separate project and global DBs
    // (raw rowids are per-DB sequences and would let the larger DB crowd out the other).
    if (incremental) {
      hits.sort((a, b) =>
        (a.store === b.store ? 0 : a.store === "project" ? -1 : 1)
        || (a.store === "project" ? a.row.id - b.row.id : b.row.ts - a.row.ts || b.row.id - a.row.id));
    } else if (q.query) {
      hits.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || b.row.ts - a.row.ts || b.row.id - a.row.id);
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
      // drained. Advance past the project rows the SQL returned (tags are filtered there, before
      // LIMIT); stop before the first budget-cut project row so it is refetched next call.
      const cursor = firstDroppedProjectId ? firstDroppedProjectId - 1 : projectScannedMax;
      return { results, truncated: firstDroppedProjectId !== 0 || projectCapped, cursor };
    }
    const browseCursor = primaryDb
      ? (primaryDb.prepare("SELECT COALESCE(MAX(id),0) AS m FROM memory").get() as unknown as { m: number }).m
      : 0;
    // A truncated ranked page is not a contiguous id block, so MAX(id) would skip the matches it
    // left out; cursor 0 makes the follow-up an ascending drain over every match instead.
    const pageTruncated = truncated || sourceCapped;
    return { results, truncated: pageTruncated, cursor: q.query && pageTruncated ? 0 : browseCursor };
  }

  private searchRows(db: DatabaseSync, query: string, since: number, limit: number, order: "rank" | "asc", tags?: string[]): RowHit[] {
    // `order` is an internal literal (never user input): ASC drains forward from a cursor.
    const tf = tagFilter(tags);
    const rows = db.prepare(
      `SELECT m.id,m.ts,m.agent_id,m.content,m.tags,m.supersedes,m.status, bm25(memory_fts) AS rank
       FROM memory_fts JOIN memory m ON m.id=memory_fts.rowid
       WHERE memory_fts MATCH ? AND m.status='live' AND m.id > ? ${tf.sql}
       ORDER BY ${order === "asc" ? "m.id ASC" : "rank"} LIMIT ?`,
    ).all(ftsQuery(query), since, ...tf.params, limit) as unknown as (MemoryRow & { rank: number })[];
    return rows.map((r) => ({ row: r, rank: r.rank }));
  }

  private recentRows(db: DatabaseSync, since: number, limit: number, order: "asc" | "desc" = "desc", tags?: string[]): RowHit[] {
    // `order` is an internal literal (never user input): ASC drains forward from a cursor,
    // DESC shows the newest slice for browse.
    const tf = tagFilter(tags);
    const rows = db.prepare(
      `SELECT id,ts,agent_id,content,tags,supersedes,status FROM memory m WHERE status='live' AND id > ? ${tf.sql} ORDER BY id ${order === "asc" ? "ASC" : "DESC"} LIMIT ?`,
    ).all(since, ...tf.params, limit) as unknown as MemoryRow[];
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
  acquire(q: { projectDbPath: string; agentId: string; glob: string; ttlMs: number }): AcquireResult {
    const db = this.rwDb(q.projectDbPath);
    return writeTx<AcquireResult>(db, () => {
      // Read after BEGIN IMMEDIATE: time spent waiting for another process's write must not shorten the lease.
      const now = this.clock.now();
      db.prepare("DELETE FROM locks WHERE expires_at <= ?").run(now);
      const held = db.prepare("SELECT glob,agent_id,acquired_at,expires_at FROM locks WHERE glob=?").get(q.glob) as unknown as LockRow | undefined;
      if (held && held.agent_id !== q.agentId) return { ok: false, heldBy: held.agent_id, expiresAt: held.expires_at };
      const expiresAt = now + q.ttlMs;
      db.prepare(
        "INSERT INTO locks(glob,agent_id,acquired_at,expires_at) VALUES(?,?,?,?) " +
        "ON CONFLICT(glob) DO UPDATE SET agent_id=excluded.agent_id, acquired_at=excluded.acquired_at, expires_at=excluded.expires_at",
      ).run(q.glob, q.agentId, now, expiresAt);
      return { ok: true, lock: { glob: q.glob, agentId: q.agentId, acquiredAt: now, expiresAt } };
    });
  }

  release(q: { projectDbPath: string; agentId: string; glob: string }): { released: boolean } {
    const res = this.rwDb(q.projectDbPath).prepare("DELETE FROM locks WHERE glob=? AND agent_id=?").run(q.glob, q.agentId);
    return { released: Number(res.changes) > 0 };
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

  // ---- hook delivery ---------------------------------------------------------
  /**
   * Hand a hook receiver the live records it has not seen, at most once (ADR-15). Its first claim only
   * records the current max ids as its baseline (ADR-16). Later claims offer records to `take` oldest
   * first, each store's records in id order, until `take` returns false; each cursor then moves past
   * what was taken and past the ids in `skip`, which the receiver wrote itself. A skipped id the cursor
   * has not reached when `take` stops is kept with the cursor, so a later claim skips it too. With
   * nothing new, the claim reads only and takes no write lock. The global file is read only if it exists.
   */
  claimUnseen(q: { projectDbPath: string; receiver: string; skip: Offset[]; take: (r: UnseenRecord) => boolean }): Claim {
    const project = this.rwDb(q.projectDbPath);
    const global = existsSync(this.globalDbPath) ? this.globalDb() : null;
    const cursorOf = (): { p: number; g: number; own: string } | undefined =>
      project.prepare("SELECT project_after AS p, global_after AS g, own_ids AS own FROM hook_cursors WHERE receiver=?")
        .get(q.receiver) as unknown as { p: number; g: number; own: string } | undefined;
    const liveAfter = (db: DatabaseSync | null, after: number): boolean =>
      db !== null && db.prepare("SELECT 1 FROM memory WHERE status='live' AND id > ? LIMIT 1").get(after) !== undefined;
    const seen = cursorOf();
    if (seen && !liveAfter(project, seen.p) && !liveAfter(global, seen.g)) return { baseline: false, taken: 0, remaining: 0 };
    return writeTx(project, () => {
      const now = this.clock.now();
      const cursor = cursorOf();
      if (!cursor) {
        project.prepare("INSERT INTO hook_cursors(receiver,project_after,global_after,updated_at) VALUES(?,?,?,?)")
          .run(q.receiver, maxId(project), maxId(global), now);
        return { baseline: true, taken: 0, remaining: 0 };
      }
      const skip = new Set([...q.skip, ...(JSON.parse(cursor.own) as Offset[])]);
      const unseen = (db: DatabaseSync | null, after: number): Iterator<UnseenRow> => (db
        ? db.prepare("SELECT id,ts,agent_id,content FROM memory WHERE status='live' AND id > ? ORDER BY id").iterate(after) as unknown as Iterator<UnseenRow>
        : [][Symbol.iterator]());
      const sources = [
        { store: "project" as const, rows: unseen(project, cursor.p), after: cursor.p },
        { store: "global" as const, rows: unseen(global, cursor.g), after: cursor.g },
      ];
      const heads = sources.map((s) => s.rows.next());
      let taken = 0;
      for (;;) {
        // Oldest head first; a store's own rows stay in id order, so each cursor only ever covers a prefix.
        const live = [0, 1].filter((i) => !heads[i]!.done);
        if (live.length === 0) break;
        const i = live.reduce((a, b) => ((heads[b]!.value as UnseenRow).ts < (heads[a]!.value as UnseenRow).ts ? b : a));
        const source = sources[i]!;
        const row = heads[i]!.value as UnseenRow;
        const id = extId(source.store, row.id);
        if (!skip.has(id)) {
          if (!q.take({ id, store: source.store, ts: row.ts, agentId: row.agent_id, content: row.content })) break;
          taken += 1;
        }
        source.after = row.id;
        heads[i] = source.rows.next();
      }
      for (const s of sources) s.rows.return?.();
      const [p, g] = [sources[0]!.after, sources[1]!.after];
      const ahead = { project: [] as number[], global: [] as number[] };
      for (const id of skip) {
        const d = decId(id);
        if (d.store === "project" && d.rowid > p) ahead.project.push(d.rowid);
        if (d.store === "global" && d.rowid > g) ahead.global.push(d.rowid);
      }
      const own = [...ahead.project.map((r) => extId("project", r)), ...ahead.global.map((r) => extId("global", r))];
      project.prepare("UPDATE hook_cursors SET project_after=?, global_after=?, own_ids=?, updated_at=? WHERE receiver=?")
        .run(p, g, JSON.stringify(own), now, q.receiver);
      return { baseline: false, taken, remaining: countLiveAfter(project, p, ahead.project) + countLiveAfter(global, g, ahead.global) };
    });
  }

  close(): void {
    for (const db of this.rw.values()) db.close();
    for (const db of this.ro.values()) db?.close();
  }
}
