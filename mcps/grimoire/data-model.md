# Data Model — grimoire

Status: IMPLEMENTED (v0.1; schema 4) · Source: mcps/grimoire/architecture.md + api-contract.md · Last updated: 2026-11-05

A **derived, read-only** index — not a database of record. The source of truth is the checked-out pack tree; `~/.grimoire/index.sqlite` is a self-contained build artifact (mode 600), rebuilt not migrated. `model.ts` owns `SCHEMA_SQL` + mappers + the id codec; `indexer.ts` is the only writer; `store.ts` reads. `SCHEMA_VERSION = 4`.

## Entities

- **skill** — one Agent-Skill (`SKILL.md`). Identity: surrogate `id = "<pack>:<skillName>"`; natural key `(pack, name)`. Owns: body, description, derived category.
- **skill_file** — one supporting file (`scripts/`/`references/`/`assets/`) belonging to a skill; identity `(skill_id, rel_path)`. The served packs ship thousands of these.
- **index_meta** — key/value build metadata (`schema_version`) used for staleness.
- One `skill` has many `skill_file` (FK, cascade). `skills_fts` is an FTS5 view over `skill`, not an entity.

## Physical schema (canonical `schema.sql`, mirrored by `model.ts` SCHEMA_SQL)

```sql
-- SCHEMA_VERSION = 4. Built write-once from the checked-out pack trees; rebuilt, never migrated.
CREATE TABLE skills (
  id              TEXT PRIMARY KEY,                 -- "<pack>:<skillName>"
  pack            TEXT NOT NULL,
  name            TEXT NOT NULL,                    -- skill slug; column name MUST equal the FTS column 'name'
  description     TEXT NOT NULL,                    -- frontmatter description, capped at 1024 chars
  body            TEXT NOT NULL,                    -- SKILL.md body after frontmatter separation
  category        TEXT NOT NULL,                    -- derived from name prefix
  category_source TEXT NOT NULL DEFAULT 'derived' CHECK (category_source IN ('derived')),
  UNIQUE (pack, name)
);                                                  -- normal rowid table (FTS external-content needs rowid)
CREATE INDEX idx_skills_pack_category ON skills(pack, category);

CREATE TABLE skill_files (
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,                           -- relative to skill dir, e.g. references/iocs.md
  content  TEXT NOT NULL,                           -- raw file content (served as-is)
  size     INTEGER NOT NULL,                        -- bytes
  PRIMARY KEY (skill_id, rel_path)
);

CREATE VIRTUAL TABLE skills_fts USING fts5(
  name, description, body,
  content='skills', content_rowid='rowid',          -- external content over skills.rowid
  tokenize='porter unicode61'
);
-- INVARIANT: FTS column names (name, description, body) MUST exist verbatim on `skills` —
-- external-content fts5 reads originals via `SELECT <col> FROM skills WHERE rowid=?` (cf. synapse memory_fts).
-- indexer populates skills_fts(rowid,name,description,body) after inserting skills (write-once → no sync triggers).
-- search: SELECT s.*, -bm25(skills_fts, 10.0, 5.0, 1.0) AS score   -- name^/desc^/body-low; negate so higher = better
--         FROM skills_fts JOIN skills s ON s.rowid = skills_fts.rowid
--         WHERE skills_fts MATCH ? ORDER BY score DESC LIMIT ?;

CREATE TABLE index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- key: 'schema_version'
```

## Index status (runtime, no repo dependency)

`store.indexStatus()`:

- `index.sqlite` absent → **`INDEX_MISSING`**.
- the file cannot be opened/read, or `index_meta.schema_version` ≠ `SCHEMA_VERSION` → **`INDEX_STALE`**.
- else → **`ok`**.

Nothing else makes the index stale: there is no manifest, pin, HEAD, or dirty-state comparison.

## Derivations & codecs (pure, in `model.ts`)

- **id codec**: `extId(pack, skillName) = `${pack}:${skillName}``; `decId(id)` splits on the first `:`. Both segments must match `^[a-z0-9][a-z0-9-]*$` (Agent-Skills slug rule). Ids are content-independent → stable across rebuilds.
- **category**: `deriveCategory(name)` = the leading token before the first `-` mapped to a small fixed set (`analyzing, detecting, conducting, building, configuring, auditing, collecting, deploying, implementing, performing, hunting, exploiting, reverse, …`); unrecognized → `other`. Always `category_source='derived'` — **not** authoritative (the pack ships no taxonomy).

## Data dictionary (non-obvious fields)

| Field | Type | Allowed / null | Owner | Sensitivity |
|---|---|---|---|---|
| skills.id | text PK | `<pack>:<skillName>`, not null | model.ts (codec) | - |
| skills.category / category_source | text | derived set / const `derived` | model.ts | - |
| skill_files.rel_path | text | skill-dir-relative, not null | indexer | - (exact lookup key for `file_get`) |
| skill_files.content | text | raw, not null | indexer | indexed supporting content (served labeled; Grimoire never executes it) |
| index_meta('schema_version') | text | integer string, not null | indexer | - (staleness) |

## Build / refresh / invalidation

Write-once per build: the indexer writes `index.sqlite.tmp.<pid>` in the target directory, then publishes it with one `rename` over `index.sqlite` and restricts the result to mode 600. A failed build leaves the previous index byte-identical and removes its temp file. A long-lived `Store` detects index replacement and reopens on the next call. The checked-out tree is indexed as it stands, local edits included; a symbolic `SKILL.md` skips that skill with reason `symbolic SKILL.md` instead of failing the pack. No runtime writes or SQL migrations. Recovery from a corrupt or partial index is a rebuild from the checked-out packs (`npm run install:grimoire`).
