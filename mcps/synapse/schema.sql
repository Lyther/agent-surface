-- synapse schema (v0.5). Applied to BOTH the per-project file and the global file.
-- Every session's server opens these files; SQLite serializes the writers. No scope/kind
-- column: project vs global is which FILE; classification is tags. memory is append-only
-- (forget/supersede flip status, never delete). id is the monotonic cursor.
--
-- Connection pragmas set by the store at open (not schema):
--   PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;
--   PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS memory (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,   -- monotonic cursor + stable memory id
  ts         INTEGER NOT NULL,                    -- epoch ms
  agent_id   TEXT    NOT NULL,                    -- provenance (asserted)
  content    TEXT    NOT NULL,
  tags       TEXT,                                -- JSON array | NULL
  supersedes INTEGER REFERENCES memory(id),
  status     TEXT    NOT NULL DEFAULT 'live' CHECK (status IN ('live','superseded','redacted'))
);
CREATE INDEX IF NOT EXISTS idx_memory_status_id ON memory(status, id);

-- external-content FTS5 over live memory; store maintains it in the same txn.
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  content, tags, content='memory', content_rowid='id', tokenize='porter unicode61'
);

CREATE TABLE IF NOT EXISTS locks (
  glob        TEXT PRIMARY KEY,
  agent_id    TEXT    NOT NULL,
  acquired_at INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_locks_expiry ON locks(expires_at);

-- A file v0.4 wrote also holds its `operations` table. Nothing reads it; it stays for one release so
-- a v0.4 sidecar still running after the upgrade keeps writing, and the release after drops it.

-- What each hook receiver (a host session, or one of its subagents) has been handed, per store. The
-- hook moves both cursors in one BEGIN IMMEDIATE transaction, so a record reaches a receiver once.
CREATE TABLE IF NOT EXISTS hook_cursors (
  receiver      TEXT    PRIMARY KEY,               -- host session_id, plus ":<agent_id>" for a subagent
  project_after INTEGER NOT NULL,                  -- highest project memory id handed over or skipped
  global_after  INTEGER NOT NULL,                  -- the same for the global file
  own_ids       TEXT    NOT NULL DEFAULT '[]',     -- JSON ids this receiver wrote that lie past its cursors
  updated_at    INTEGER NOT NULL                   -- epoch ms of the last claim
);
