-- synapse MCP — SQLite schema (v0.1, schema_version = 1)
-- Event-sourced: `events` is the system of record. Every other table is a
-- projection, maintained in the SAME write transaction as its source event and
-- fully rebuildable by replaying `events` in id order.
--
-- Connection pragmas (set by the store at open time, NOT part of the schema):
--   PRAGMA journal_mode = WAL;        -- many readers + one writer, same host
--   PRAGMA synchronous  = NORMAL;     -- durable enough under WAL; faster
--   PRAGMA busy_timeout = 5000;       -- cross-process writer contention (S-02 tunes)
--   PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- meta: schema/contract version + namespace identity (single row per key)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Bootstrap (run once on create):
--   INSERT INTO meta(key,value) VALUES
--     ('schema_version','1'), ('contract_version','0.1.0'),
--     ('namespace', :namespace), ('created_at', :now);

-- ---------------------------------------------------------------------------
-- events: APPEND-ONLY system of record. id = monotonic total-order cursor.
-- Never UPDATE or DELETE a row; corrections are new `tombstone`/`*_supersede`
-- events. payload is JSON (kind-specific).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,                  -- epoch ms (from IClock)
  agent_id   TEXT    NOT NULL,                  -- asserted writer identity (provenance)
  kind       TEXT    NOT NULL CHECK (kind IN (
                 'message','dm','reservation','reservation_release',
                 'presence','memory','memory_supersede','tombstone')),
  topic      TEXT,                              -- message topic (kind='message')
  to_agent   TEXT,                              -- dm recipient (kind='dm')
  scope      TEXT    NOT NULL,                  -- v0.1: 'private' | 'shared' ('group:<id>' reserved, future)
  payload    TEXT    NOT NULL,                  -- JSON
  supersedes INTEGER REFERENCES events(id)      -- target offset (memory_supersede/tombstone)
);
CREATE INDEX IF NOT EXISTS idx_events_kind_id  ON events(kind, id);
CREATE INDEX IF NOT EXISTS idx_events_topic_id ON events(topic, id) WHERE topic    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_dm        ON events(to_agent, id) WHERE to_agent IS NOT NULL;

-- ---------------------------------------------------------------------------
-- memory: PROJECTION of memory/memory_supersede/tombstone events. Bi-temporal:
--   transaction time = event id ordering (immutable, in `events`)
--   valid time       = [valid_from, valid_to)   (valid_to set on supersede)
-- id = originating event id = the stable memory id. Never blind-deleted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory (
  id            INTEGER PRIMARY KEY,            -- = events.id of the 'memory' event
  ts            INTEGER NOT NULL,
  agent_id      TEXT    NOT NULL,
  type          TEXT    NOT NULL CHECK (type IN ('fact','decision','lesson','note')),
  scope         TEXT    NOT NULL,
  content       TEXT    NOT NULL,
  tags          TEXT,                           -- JSON array | NULL
  evidence      TEXT,                           -- JSON array | NULL
  confidence    REAL,                           -- 0..1 | NULL
  valid_from    INTEGER NOT NULL,               -- = ts of this fact
  valid_to      INTEGER,                        -- set when superseded/tombstoned; NULL = currently valid
  superseded_by INTEGER REFERENCES events(id),  -- offset of the supersede event; NULL = live
  redacted      INTEGER NOT NULL DEFAULT 0      -- 1 = tombstoned (hard-hidden, e.g. leaked secret)
);
-- recall filters live rows; keep this index aligned with the recall predicate:
CREATE INDEX IF NOT EXISTS idx_memory_live  ON memory(scope, superseded_by, redacted);
CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory(agent_id);

-- FTS5 over memory content/tags (external-content; manually synced in the same txn).
-- On add:       INSERT INTO memory_fts(rowid,content,tags) VALUES(id,content,tags);
-- On supersede/tombstone (drop from default recall, keep history via memory table):
--               INSERT INTO memory_fts(memory_fts,rowid,content,tags) VALUES('delete',id,content,tags);
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  content, tags,
  content='memory', content_rowid='id',
  tokenize='porter unicode61'
);

-- ---------------------------------------------------------------------------
-- reservations: PROJECTION. v0.1 conflict is by EXACT resource_glob string
-- (advisory; overlapping-but-different globs do NOT conflict). Expired rows are
-- reaped lazily on reserve/list (expires_at <= now).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
  resource_glob TEXT PRIMARY KEY,
  agent_id      TEXT    NOT NULL,
  acquired_at   INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  event_id      INTEGER NOT NULL REFERENCES events(id)
);
CREATE INDEX IF NOT EXISTS idx_reservations_expiry ON reservations(expires_at);

-- Atomic reserve (run inside BEGIN IMMEDIATE):
--   DELETE FROM reservations WHERE expires_at <= :now;            -- reap
--   INSERT INTO reservations(resource_glob,agent_id,acquired_at,expires_at,event_id)
--     VALUES(:glob,:agent,:now,:now+:ttl,:eventId)
--   ON CONFLICT(resource_glob) DO UPDATE SET
--     acquired_at=:now, expires_at=:now+:ttl, event_id=:eventId
--     WHERE reservations.agent_id = :agent;                       -- renew own only
--   -- if 0 rows changed -> held by another agent -> SELECT holder, return ok:false

-- ---------------------------------------------------------------------------
-- presence: PROJECTION. Latest heartbeat per agent.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presence (
  agent_id  TEXT PRIMARY KEY,
  last_seen INTEGER NOT NULL,
  caps      TEXT                                -- JSON array | NULL
);
