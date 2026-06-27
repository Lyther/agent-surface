// synapse MCP — Store: the only SQLite seam. Uses node:sqlite (built-in, no native
// build). All projection mutations happen inside the same transaction as the
// source event append (atomic; crash leaves no half-applied projection).

import { chmodSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type {
  EventKind,
  EventRecord,
  IClock,
  IIdentity,
  IStore,
  MemoryRecord,
  MemoryType,
  MessageRecord,
  Offset,
  PresenceRecord,
  ReservationRecord,
  Scope,
} from "./contract.js";
import {
  rowToEventRecord,
  rowToMemoryRecord,
  rowToMessageRecord,
  rowToPresenceRecord,
  rowToReservationRecord,
  SCHEMA_VERSION,
  type EventRow,
  type MemoryRow,
  type PresenceRow,
  type ReservationRow,
} from "./model.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('message','dm','reservation','reservation_release','presence','memory','memory_supersede','tombstone')),
  topic TEXT,
  to_agent TEXT,
  scope TEXT NOT NULL,
  payload TEXT NOT NULL,
  supersedes INTEGER REFERENCES events(id)
);
CREATE INDEX IF NOT EXISTS idx_events_kind_id ON events(kind, id);
CREATE INDEX IF NOT EXISTS idx_events_topic_id ON events(topic, id) WHERE topic IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_dm ON events(to_agent, id) WHERE to_agent IS NOT NULL;
CREATE TABLE IF NOT EXISTS memory (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fact','decision','lesson','note')),
  scope TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  evidence TEXT,
  confidence REAL,
  valid_from INTEGER NOT NULL,
  valid_to INTEGER,
  superseded_by INTEGER REFERENCES events(id),
  redacted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_memory_live ON memory(scope, superseded_by, redacted);
CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory(agent_id);
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(content, tags, content='memory', content_rowid='id', tokenize='porter unicode61');
CREATE TABLE IF NOT EXISTS reservations (
  resource_glob TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  event_id INTEGER NOT NULL REFERENCES events(id)
);
CREATE INDEX IF NOT EXISTS idx_reservations_expiry ON reservations(expires_at);
CREATE TABLE IF NOT EXISTS presence (
  agent_id TEXT PRIMARY KEY,
  last_seen INTEGER NOT NULL,
  caps TEXT
);
`;

/** "database is locked" / SQLITE_BUSY from node:sqlite (message- or code-based). */
function isLockedError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && code.includes("SQLITE_BUSY")) return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && /database is locked|SQLITE_BUSY/i.test(msg);
}

/** Synchronous sleep (node:sqlite is synchronous; no async backoff available here). */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export class Store implements IStore {
  private db: DatabaseSync;
  private identity: IIdentity;
  private clock: IClock;
  /** Called after each successful appendEvent; used by the watcher to tick. */
  onAppend: (() => void) | null = null;

  constructor(identity: IIdentity, clock: IClock) {
    this.identity = identity;
    this.clock = clock;
    const dbPath = identity.dbPath();
    this.db = new DatabaseSync(dbPath);
    // F008: set DB file to private mode after creation.
    try { chmodSync(dbPath, 0o600); } catch { /* file may not exist yet on first open */ }
    // R4-F001: busy_timeout MUST come before any lock-heavy op (the WAL-mode
    // switch and schema creation take a write lock). Otherwise concurrent
    // cold-boot of multiple agents fails immediately with "database is locked".
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.initWithRetry();
  }

  /**
   * Open-time init that can contend on a fresh DB when several processes boot at
   * once: the WAL-mode switch + schema + bootstrap each take a write lock.
   * busy_timeout handles most of it; bounded retry+backoff covers the residual
   * window where SQLite returns "database is locked" before honoring the timeout.
   */
  private initWithRetry(): void {
    const maxAttempts = 25;
    for (let attempt = 1; ; attempt++) {
      try {
        this.db.exec("PRAGMA journal_mode = WAL");
        this.db.exec("PRAGMA synchronous = NORMAL");
        this.db.exec("PRAGMA foreign_keys = ON");
        this.initSchema();
        this.checkVersion();
        return;
      } catch (err) {
        if (!isLockedError(err) || attempt >= maxAttempts) throw err;
        sleepSync(Math.min(20 * attempt, 200)); // capped linear backoff
      }
    }
  }

  private initSchema(): void {
    this.db.exec(SCHEMA_SQL);
  }

  private checkVersion(): void {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
    if (!row) {
      // First run: bootstrap.
      const ns = this.identity.namespace();
      const now = this.clock.now();
      const ins = this.db.prepare("INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)");
      ins.run("schema_version", String(SCHEMA_VERSION));
      ins.run("contract_version", "0.1.0");
      ins.run("namespace", ns);
      ins.run("created_at", String(now));
    } else if (parseInt(row.value) !== SCHEMA_VERSION) {
      // Version mismatch: rebuild projections from events.
      this.rebuildProjections();
    }
  }

  close(): void {
    this.db.close();
  }

  schemaVersion(): number {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
    return row ? parseInt(row.value) : 0;
  }

  latestOffset(): Offset {
    const row = this.db.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM events").get() as { m: number };
    return row.m;
  }

  eventCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS c FROM events").get() as { c: number };
    return row.c;
  }

  appendEvent(input: {
    agentId: string;
    kind: EventKind;
    scope: Scope;
    topic?: string;
    toAgent?: string;
    payload: unknown;
    supersedes?: Offset;
  }): { offset: Offset; ts: number } {
    const ts = this.clock.now();
    const payloadJson = JSON.stringify(input.payload);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const stmt = this.db.prepare(
        `INSERT INTO events (ts, agent_id, kind, topic, to_agent, scope, payload, supersedes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      stmt.run(
        ts,
        input.agentId,
        input.kind,
        input.topic ?? null,
        input.toAgent ?? null,
        input.scope,
        payloadJson,
        input.supersedes ?? null,
      );
      const offset = this.db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };
      this.applyProjection(input.kind, offset.id, input.agentId, ts, input.scope, input.topic, input.payload, input.supersedes);
      this.db.exec("COMMIT");
      // Notify the watcher that a new event was appended (F006).
      if (this.onAppend) this.onAppend();
      return { offset: offset.id, ts };
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  private applyProjection(
    kind: EventKind,
    eventId: number,
    agentId: string,
    ts: number,
    scope: Scope,
    _topic: string | undefined,
    payload: unknown,
    supersedes: Offset | undefined,
  ): void {
    switch (kind) {
      case "message":
      case "dm":
        // No projection table; read directly from events.
        break;
      case "reservation": {
        const p = payload as { resourceGlob: string; ttlMs: number };
        const expiresAt = ts + p.ttlMs;
        // Reap expired first.
        this.db.prepare("DELETE FROM reservations WHERE expires_at <= ?").run(ts);
        // Try insert-or-renew (only if same agent holds it).
        const existing = this.db.prepare(
          "SELECT agent_id FROM reservations WHERE resource_glob = ?",
        ).get(p.resourceGlob) as { agent_id: string } | undefined;
        if (!existing) {
          this.db.prepare(
            "INSERT INTO reservations (resource_glob, agent_id, acquired_at, expires_at, event_id) VALUES (?, ?, ?, ?, ?)",
          ).run(p.resourceGlob, agentId, ts, expiresAt, eventId);
        } else if (existing.agent_id === agentId) {
          // Renew own.
          this.db.prepare(
            "UPDATE reservations SET acquired_at = ?, expires_at = ?, event_id = ? WHERE resource_glob = ?",
          ).run(ts, expiresAt, eventId, p.resourceGlob);
        }
        // If held by another agent, the reservation event was still logged but
        // the projection is NOT updated — the caller sees the CONFLICT via the
        // reserve() return, not via the event log.
        break;
      }
      case "reservation_release": {
        const p = payload as { resourceGlob: string };
        this.db.prepare("DELETE FROM reservations WHERE resource_glob = ?").run(p.resourceGlob);
        break;
      }
      case "presence": {
        const p = payload as { caps?: string[] };
        this.db.prepare(
          "INSERT INTO presence (agent_id, last_seen, caps) VALUES (?, ?, ?) ON CONFLICT(agent_id) DO UPDATE SET last_seen = excluded.last_seen, caps = excluded.caps",
        ).run(agentId, ts, p.caps ? JSON.stringify(p.caps) : null);
        break;
      }
      case "memory": {
        const p = payload as { type: MemoryType; content: string; tags?: string[]; evidence?: string[]; confidence?: number };
        this.db.prepare(
          `INSERT INTO memory (id, ts, agent_id, type, scope, content, tags, evidence, confidence, valid_from, valid_to, superseded_by, redacted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)`,
        ).run(
          eventId,
          ts,
          agentId,
          p.type,
          scope,
          p.content,
          p.tags ? JSON.stringify(p.tags) : null,
          p.evidence ? JSON.stringify(p.evidence) : null,
          p.confidence ?? null,
          ts,
        );
        // FTS5 insert.
        this.db.prepare(
          "INSERT INTO memory_fts (rowid, content, tags) VALUES (?, ?, ?)",
        ).run(eventId, p.content, p.tags ? JSON.stringify(p.tags) : "");
        break;
      }
      case "memory_supersede": {
        // Mark old row invalid; drop from FTS.
        if (supersedes !== undefined) {
          this.db.prepare(
            "UPDATE memory SET valid_to = ?, superseded_by = ? WHERE id = ?",
          ).run(ts, eventId, supersedes);
          // FTS5 external-content delete: must pass the ORIGINAL content/tags
          // (FTS5 uses them to compute the index delta). Fetch them first.
          const oldRow = this.db.prepare(
            "SELECT content, tags FROM memory WHERE id = ?",
          ).get(supersedes) as { content: string; tags: string | null } | undefined;
          if (oldRow) {
            this.db.prepare(
              "INSERT INTO memory_fts (memory_fts, rowid, content, tags) VALUES ('delete', ?, ?, ?)",
            ).run(supersedes, oldRow.content, oldRow.tags ?? "");
          }
        }
        // If a replacement content was provided, insert a new memory row.
        const p = payload as { reason?: string; content?: string; type?: MemoryType; tags?: string[]; evidence?: string[]; confidence?: number };
        if (p.content) {
          this.db.prepare(
            `INSERT INTO memory (id, ts, agent_id, type, scope, content, tags, evidence, confidence, valid_from, valid_to, superseded_by, redacted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)`,
          ).run(
            eventId,
            ts,
            agentId,
            p.type ?? "fact",
            scope,
            p.content,
            p.tags ? JSON.stringify(p.tags) : null,
            p.evidence ? JSON.stringify(p.evidence) : null,
            p.confidence ?? null,
            ts,
          );
          this.db.prepare(
            "INSERT INTO memory_fts (rowid, content, tags) VALUES (?, ?, ?)",
          ).run(eventId, p.content, p.tags ? JSON.stringify(p.tags) : "");
        }
        break;
      }
      case "tombstone": {
        if (supersedes !== undefined) {
          this.db.prepare(
            "UPDATE memory SET redacted = 1, valid_to = ?, superseded_by = ? WHERE id = ?",
          ).run(ts, eventId, supersedes);
          // Get the content/tags for FTS delete (needs them for external-content FTS5).
          const mem = this.db.prepare("SELECT content, tags FROM memory WHERE id = ?").get(supersedes) as { content: string; tags: string | null } | undefined;
          if (mem) {
            this.db.prepare(
              "INSERT INTO memory_fts (memory_fts, rowid, content, tags) VALUES ('delete', ?, ?, ?)",
            ).run(supersedes, mem.content, mem.tags ?? "");
          }
        }
        break;
      }
    }
  }

  queryMessages(q: { agentId: string; topic?: string; to?: string; since: Offset; limit: number }): MessageRecord[] {
    const now = this.clock.now();
    if (q.topic) {
      // Messages on that topic since `since`, excluding expired (R2-F005).
      const rows = this.db.prepare(
        `SELECT * FROM events WHERE kind IN ('message','dm') AND topic = ? AND id > ?
         AND NOT (
           json_extract(payload, '$.expiresAt') IS NOT NULL
           AND json_extract(payload, '$.expiresAt') <= ?
         )
         ORDER BY id LIMIT ?`,
      ).all(q.topic, q.since, now, q.limit) as EventRow[];
      return rows.filter((r) => this.messageNotExpired(r, now)).map(rowToMessageRecord);
    }
    // Topic omitted: DMs to caller + shared messages, excluding expired.
    // Expiry MUST be filtered in SQL BEFORE LIMIT (R3-F003): otherwise a run of
    // expired rows consumes the page and hides live messages that sort later.
    const rows = this.db.prepare(
      `SELECT * FROM events
       WHERE kind IN ('message','dm') AND id > ?
         AND (
           (kind = 'dm' AND to_agent = ?)
           OR (kind = 'message' AND scope = 'shared')
         )
         AND NOT (
           json_extract(payload, '$.expiresAt') IS NOT NULL
           AND json_extract(payload, '$.expiresAt') <= ?
         )
       ORDER BY id LIMIT ?`,
    ).all(q.since, q.agentId, now, q.limit) as EventRow[];
    return rows.filter((r) => this.messageNotExpired(r, now)).map(rowToMessageRecord);
  }

  /** R2-F005: check if a message/DM event has expired. */
  private messageNotExpired(row: EventRow, now: number): boolean {
    try {
      const payload = JSON.parse(row.payload) as { expiresAt?: number };
      if (payload.expiresAt !== undefined && payload.expiresAt <= now) {
        return false;
      }
      return true;
    } catch {
      return true; // unparseable payload → not expired
    }
  }

  exportEvents(q: { agentId: string; since?: Offset; until?: Offset; kinds?: EventKind[]; scope?: Scope; limit: number }): {
    events: EventRecord[];
    nextOffset?: Offset;
    truncated: boolean;
  } {
    let sql = "SELECT * FROM events WHERE 1=1";
    const args: (string | number)[] = [];
    // Scope enforcement: private events are only visible to their owner.
    sql += " AND (scope = 'shared' OR (scope = 'private' AND agent_id = ?))";
    args.push(q.agentId);
    if (q.since !== undefined) { sql += " AND id > ?"; args.push(q.since); }
    if (q.until !== undefined) { sql += " AND id <= ?"; args.push(q.until); }
    if (q.kinds && q.kinds.length) { sql += ` AND kind IN (${q.kinds.map(() => "?").join(",")})`; args.push(...q.kinds); }
    if (q.scope) { sql += " AND scope = ?"; args.push(q.scope); }
    sql += " ORDER BY id LIMIT ?";
    args.push(q.limit + 1); // fetch one extra to detect truncation
    const rows = this.db.prepare(sql).all(...args) as EventRow[];
    const truncated = rows.length > q.limit;
    const slice = truncated ? rows.slice(0, q.limit) : rows;
    const events = slice.map(rowToEventRecord);
    const nextOffset = events.length > 0 ? events[events.length - 1].offset + 1 : undefined;
    return { events, nextOffset, truncated };
  }

  reserve(q: { agentId: string; resourceGlob: string; ttlMs: number }):
    | { ok: true; reservation: ReservationRecord }
    | { ok: false; heldBy: string; expiresAt: number } {
    const now = this.clock.now();
    // Atomic check-and-insert inside a single transaction (fixes TOCTOU).
    this.db.exec("BEGIN IMMEDIATE");
    try {
      // Reap expired.
      this.db.prepare("DELETE FROM reservations WHERE expires_at <= ?").run(now);
      // Check current holder.
      const existing = this.db.prepare(
        "SELECT agent_id, expires_at FROM reservations WHERE resource_glob = ?",
      ).get(q.resourceGlob) as { agent_id: string; expires_at: number } | undefined;
      if (existing && existing.agent_id !== q.agentId) {
        this.db.exec("ROLLBACK");
        return { ok: false, heldBy: existing.agent_id, expiresAt: existing.expires_at };
      }
      // We can reserve (either empty or renewing own).
      const ts = this.clock.now();
      const expiresAt = ts + q.ttlMs;
      const stmt = this.db.prepare(
        `INSERT INTO events (ts, agent_id, kind, topic, to_agent, scope, payload, supersedes)
         VALUES (?, ?, 'reservation', NULL, NULL, 'shared', ?, NULL)`,
      );
      stmt.run(ts, q.agentId, JSON.stringify({ resourceGlob: q.resourceGlob, ttlMs: q.ttlMs }));
      const eventId = (this.db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;
      // Upsert reservation projection.
      this.db.prepare(
        `INSERT INTO reservations (resource_glob, agent_id, acquired_at, expires_at, event_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(resource_glob) DO UPDATE SET acquired_at = ?, expires_at = ?, event_id = ?`,
      ).run(q.resourceGlob, q.agentId, ts, expiresAt, eventId, ts, expiresAt, eventId);
      this.db.exec("COMMIT");
      // Notify the watcher (same as appendEvent does).
      if (this.onAppend) this.onAppend();
      const row = this.db.prepare("SELECT * FROM reservations WHERE resource_glob = ?").get(q.resourceGlob) as ReservationRow;
      return { ok: true, reservation: rowToReservationRecord(row) };
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  release(q: { agentId: string; resourceGlob: string }): { released: boolean } {
    // R2-F004: perform holder check + release event + projection delete
    // inside one BEGIN IMMEDIATE transaction to prevent TOCTOU.
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db.prepare(
        "SELECT agent_id FROM reservations WHERE resource_glob = ?",
      ).get(q.resourceGlob) as { agent_id: string } | undefined;
      if (!existing) {
        this.db.exec("ROLLBACK");
        return { released: false };
      }
      if (existing.agent_id !== q.agentId) {
        this.db.exec("ROLLBACK");
        return { released: false };
      }
      // Append the release event + delete projection atomically.
      const ts = this.clock.now();
      this.db.prepare(
        `INSERT INTO events (ts, agent_id, kind, topic, to_agent, scope, payload, supersedes)
         VALUES (?, ?, 'reservation_release', NULL, NULL, 'shared', ?, NULL)`,
      ).run(ts, q.agentId, JSON.stringify({ resourceGlob: q.resourceGlob }));
      // Delete the projection inside the same transaction.
      this.db.prepare("DELETE FROM reservations WHERE resource_glob = ?").run(q.resourceGlob);
      this.db.exec("COMMIT");
      if (this.onAppend) this.onAppend();
      return { released: true };
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  listReservations(q: { globFilter?: string }): ReservationRecord[] {
    const now = this.clock.now();
    // Reap expired.
    this.db.prepare("DELETE FROM reservations WHERE expires_at <= ?").run(now);
    let sql = "SELECT * FROM reservations WHERE expires_at > ?";
    const args: (string | number)[] = [now];
    if (q.globFilter) {
      sql += " AND resource_glob LIKE ?";
      args.push(q.globFilter.replace(/%/g, "\\%").replace(/_/g, "\\_") + "%");
    }
    sql += " ORDER BY resource_glob";
    const rows = this.db.prepare(sql).all(...args) as ReservationRow[];
    return rows.map(rowToReservationRecord);
  }

  upsertPresence(q: { agentId: string; caps?: string[] }): void {
    this.appendEvent({
      agentId: q.agentId,
      kind: "presence",
      scope: "shared",
      payload: { caps: q.caps },
    });
  }

  listPresence(): PresenceRecord[] {
    const rows = this.db.prepare("SELECT * FROM presence ORDER BY last_seen DESC").all() as PresenceRow[];
    return rows.map(rowToPresenceRecord);
  }

  recall(q: { agentId: string; query: string; scope?: Scope; type?: MemoryType; tags?: string[]; limit: number }): {
    results: MemoryRecord[];
    truncated: boolean;
  } {
    // Build scope filter: omitted = own private + shared.
    let scopeFilter: string;
    if (q.scope === "private") {
      scopeFilter = "(scope = 'private' AND agent_id = ?)";
    } else if (q.scope === "shared") {
      scopeFilter = "scope = 'shared'";
    } else {
      // Both: own private + shared.
      scopeFilter = "((scope = 'private' AND agent_id = ?) OR scope = 'shared')";
    }

    // FTS5 BM25 search, joined with memory for live-row filtering.
    const ftsQuery = q.query.replace(/"/g, '""');
    let sql = `
      SELECT m.*, bm25(memory_fts) AS rank
      FROM memory_fts
      JOIN memory m ON m.id = memory_fts.rowid
      WHERE memory_fts MATCH ?
        AND m.superseded_by IS NULL
        AND m.redacted = 0
        AND ${scopeFilter}
    `;
    const args: (string | number)[] = [ftsQuery];
    if (q.scope === "private" || (!q.scope)) {
      args.push(q.agentId);
    }
    if (q.type) {
      sql += " AND m.type = ?";
      args.push(q.type);
    }
    sql += " ORDER BY rank LIMIT ?";
    args.push(q.limit + 1);

    const rows = this.db.prepare(sql).all(...args) as (MemoryRow & { rank: number })[];
    const truncated = rows.length > q.limit;
    const slice = truncated ? rows.slice(0, q.limit) : rows;
    return {
      results: slice.map((r) => rowToMemoryRecord(r, r.rank)),
      truncated,
    };
  }

  history(q: { agentId: string; id?: Offset; query?: string; limit: number }): MemoryRecord[] {
    if (q.id !== undefined) {
      // Enforce scope on the id path: private rows are only visible to their owner.
      const row = this.db.prepare(
        `SELECT * FROM memory WHERE id = ? AND ((scope = 'private' AND agent_id = ?) OR scope = 'shared')`,
      ).get(q.id, q.agentId) as MemoryRow | undefined;
      return row ? [rowToMemoryRecord(row)] : [];
    }
    // Search by content LIKE (case-insensitive, avoids FTS for history which includes superseded).
    const pattern = `%${(q.query ?? "").replace(/[%_]/g, "\\$&")}%`;
    const rows = this.db.prepare(
      `SELECT * FROM memory
       WHERE content LIKE ? ESCAPE '\\' COLLATE NOCASE
         AND ((scope = 'private' AND agent_id = ?) OR scope = 'shared')
       ORDER BY ts DESC LIMIT ?`,
    ).all(pattern, q.agentId, q.limit) as MemoryRow[];
    return rows.map((r) => rowToMemoryRecord(r));
  }

  supersede(q: { agentId: string; targetId: Offset; content?: string; reason?: string }): { offset: Offset; ts: number } {
    // F002: enforce visibility/ownership before superseding.
    // Load the target row with scope enforcement — same predicate as tombstone/history.
    const mem = this.db.prepare(
      "SELECT redacted, superseded_by, scope, agent_id FROM memory WHERE id = ? AND ((scope = 'private' AND agent_id = ?) OR scope = 'shared')",
    ).get(q.targetId, q.agentId) as { redacted: number; superseded_by: number | null; scope: string; agent_id: string } | undefined;
    if (!mem) {
      throw new Error("NOT_FOUND");
    }
    // Idempotent: if already superseded (superseded_by set, not tombstoned), return the existing supersede event.
    if (mem.superseded_by !== null && mem.redacted === 0) {
      const event = this.db.prepare("SELECT id, ts FROM events WHERE id = ?").get(mem.superseded_by) as { id: number; ts: number };
      return { offset: event.id, ts: event.ts };
    }
    return this.appendEvent({
      agentId: q.agentId,
      kind: "memory_supersede",
      scope: mem.scope as Scope,
      payload: { reason: q.reason, content: q.content },
      supersedes: q.targetId,
    });
  }

  tombstone(q: { agentId: string; targetId: Offset; reason: string }): { offset: Offset; ts: number } {
    // Load the target row with scope enforcement.
    const mem = this.db.prepare(
      "SELECT redacted, superseded_by, scope, agent_id FROM memory WHERE id = ? AND ((scope = 'private' AND agent_id = ?) OR scope = 'shared')",
    ).get(q.targetId, q.agentId) as { redacted: number; superseded_by: number | null; scope: string; agent_id: string } | undefined;
    if (!mem) {
      throw new Error("NOT_FOUND");
    }
    // Idempotent: if already tombstoned (redacted=1), return the existing tombstone event.
    if (mem.redacted === 1 && mem.superseded_by !== null) {
      const event = this.db.prepare("SELECT id, ts FROM events WHERE id = ?").get(mem.superseded_by) as { id: number; ts: number };
      return { offset: event.id, ts: event.ts };
    }
    return this.appendEvent({
      agentId: q.agentId,
      kind: "tombstone",
      scope: "shared",
      payload: { reason: q.reason },
      supersedes: q.targetId,
    });
  }

  rebuildProjections(): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec("DELETE FROM memory");
      this.db.exec("DELETE FROM memory_fts");
      this.db.exec("DELETE FROM reservations");
      this.db.exec("DELETE FROM presence");
      const events = this.db.prepare("SELECT * FROM events ORDER BY id").all() as EventRow[];
      for (const e of events) {
        const payload = JSON.parse(e.payload);
        this.applyProjection(e.kind, e.id, e.agent_id, e.ts, e.scope as Scope, e.topic ?? undefined, payload, e.supersedes ?? undefined);
      }
      this.db.prepare("UPDATE meta SET value = ? WHERE key = 'schema_version'").run(String(SCHEMA_VERSION));
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }
}
