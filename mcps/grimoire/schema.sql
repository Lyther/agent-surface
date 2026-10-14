-- grimoire — canonical read-only index schema (mirrored by src/model.ts SCHEMA_SQL).
-- SCHEMA_VERSION = 3. Built write-once per indexed source state; rebuilt, never migrated.
CREATE TABLE IF NOT EXISTS skills (
  id              TEXT PRIMARY KEY,                 -- "<pack>:<skillName>"
  pack            TEXT NOT NULL,
  name            TEXT NOT NULL,                    -- skill slug; column name MUST equal the FTS column 'name'
  source_path     TEXT NOT NULL,                    -- repo-relative SKILL.md path at build time
  source_commit   TEXT NOT NULL,                    -- clean commit or "<commit>-dirty"
  sha256          TEXT NOT NULL,                    -- of the raw body
  indexed_at      TEXT NOT NULL,                    -- ISO-8601 UTC
  description     TEXT NOT NULL,                    -- parsed frontmatter description, capped at 1024 chars
  body            TEXT NOT NULL,                    -- SKILL.md body after frontmatter separation
  category        TEXT NOT NULL,                    -- derived from name prefix
  category_source TEXT NOT NULL DEFAULT 'derived' CHECK (category_source IN ('derived')),
  notice          TEXT NOT NULL DEFAULT '',         -- skill license/author/license-file declarations, appended to the served attribution
  UNIQUE (pack, name)
);
CREATE INDEX IF NOT EXISTS idx_skills_pack_category ON skills(pack, category);

CREATE TABLE IF NOT EXISTS skill_files (
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,                           -- relative to skill dir, e.g. references/iocs.md
  content  TEXT NOT NULL,                           -- raw file content (served as-is)
  sha256   TEXT NOT NULL,
  size     INTEGER NOT NULL,                        -- bytes
  PRIMARY KEY (skill_id, rel_path)
);

-- External-content FTS5 over skills. INVARIANT: the FTS column names (name, description,
-- body) MUST exist verbatim on `skills` — external-content fts5 reads originals via
-- `SELECT <col> FROM skills WHERE rowid=?` (cf. synapse memory_fts).
CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
  name, description, body,
  content='skills', content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TABLE IF NOT EXISTS index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- keys: 'schema_version' ; 'pack_ids' ; per-pack source_commit/file_count/source_hash/attribution/built_at
