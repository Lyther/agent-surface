-- synapse schema (v0.4). Applied to BOTH the per-project file and the global file.
-- Single owner (the sidecar) is the sole writer. No scope/kind column: project vs
-- global is which FILE; classification is tags. memory is append-only (forget/supersede
-- flip status, never delete). id is the monotonic cursor.
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
