# Data Model — grimoire

Status: IMPLEMENTED (v0.1) · Source: mcps/grimoire/architecture.md + api-contract.md · Last updated: 2026-07-01

A **derived, read-only** index — not a database of record. The source of truth is the pinned submodule; `~/.grimoire/index.sqlite` is a self-contained build artifact (mode 600), rebuilt not migrated. `model.ts` owns `SCHEMA_SQL` + mappers + the id codec; `indexer.ts` is the only writer; `store.ts` reads. `SCHEMA_VERSION = 1`.

## Entities

- **skill** — one Agent-Skill (`SKILL.md`). Identity: surrogate `id = "<pack>:<skillName>"`; natural key `(pack, name)`. Owns: body, description, derived category, provenance.
- **skill_file** — one supporting file (`scripts/`/`references/`/`assets/`) belonging to a skill; identity `(skill_id, rel_path)`. The pack ships ~3,404 of these.
- **index_meta** — key/value build metadata (schema version + per-pack provenance) used for staleness.
- One `skill` has many `skill_file` (FK, cascade). `skills_fts` is an FTS5 view over `skill`, not an entity.

## Physical schema (canonical `schema.sql`, mirrored by `model.ts` SCHEMA_SQL)

```sql
-- SCHEMA_VERSION = 1. Built write-once per pinned commit; rebuilt, never migrated.
CREATE TABLE skills (
  id              TEXT PRIMARY KEY,                 -- "<pack>:<skillName>"
  pack            TEXT NOT NULL,
  name            TEXT NOT NULL,                    -- skill slug; column name MUST equal the FTS column 'name'
  source_path     TEXT NOT NULL,                    -- repo-relative SKILL.md path at build time
  source_commit   TEXT NOT NULL,                    -- pinned submodule commit
  sha256          TEXT NOT NULL,                    -- of the raw body
  indexed_at      TEXT NOT NULL,                    -- ISO-8601 UTC
  description     TEXT NOT NULL,                    -- frontmatter description (raw)
  body            TEXT NOT NULL,                    -- raw SKILL.md body (no mutation)
  category        TEXT NOT NULL,                    -- derived from name prefix
  category_source TEXT NOT NULL DEFAULT 'derived' CHECK (category_source IN ('derived')),
  UNIQUE (pack, name)
);                                                  -- normal rowid table (FTS external-content needs rowid)
CREATE INDEX idx_skills_pack_category ON skills(pack, category);

CREATE TABLE skill_files (
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,                           -- relative to skill dir, e.g. references/iocs.md
  content  TEXT NOT NULL,                           -- raw file content (served as-is)
  sha256   TEXT NOT NULL,
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
-- keys: 'schema_version' ; 'pack:<id>:source_commit' ; 'pack:<id>:file_count' ; 'pack:<id>:source_hash' ; 'pack:<id>:built_at'
```

## Installed expected-source manifest — `~/.grimoire/manifest.json`

```jsonc
{ "schemaVersion": 1,
  "packs": [ { "serviceId": "anthropic-cybersecurity-skills",
               "path": "external/anthropic-cybersecurity-skills",
               "commit": "<pinned sha>", "sourceHash": "<sha256 of the indexed source set>" } ] }
```

`store.indexStatus()` (runtime, no repo dependency):

- `index.sqlite` or `manifest.json` absent → **`INDEX_MISSING`**.
- `index_meta.schema_version` ≠ `manifest.schemaVersion`, **or** any pack's `index_meta` `source_commit`/`source_hash` ≠ the manifest pack entry → **`INDEX_STALE`**.
- else → **`ok`**. Compared against the installed manifest, **never** `registry/optional-services.json`.

## Derivations & codecs (pure, in `model.ts`)

- **id codec**: `extId(pack, skillName) = `${pack}:${skillName}``; `decId(id)` splits on the first `:`. Both segments must match `^[a-z0-9][a-z0-9-]*$` (Agent-Skills slug rule). Ids are content-independent → stable across rebuilds.
- **category**: `deriveCategory(name)` = the leading token before the first `-` mapped to a small fixed set (`analyzing, detecting, conducting, building, configuring, auditing, collecting, deploying, implementing, performing, hunting, exploiting, reverse, …`); unrecognized → `other`. Always `category_source='derived'` — **not** authoritative (the pack ships no taxonomy).

## Data dictionary (non-obvious fields)

| Field | Type | Allowed / null | Owner | Sensitivity |
|---|---|---|---|---|
| skills.id | text PK | `<pack>:<skillName>`, not null | model.ts (codec) | - |
| skills.source_commit | text | 40-hex, not null | indexer | - (provenance/audit) |
| skills.sha256 | text | 64-hex of body, not null | indexer | - |
| skills.category / category_source | text | derived set / const `derived` | model.ts | - |
| skill_files.rel_path | text | manifest-relative, not null | indexer | - (validated against manifest on `file_get`) |
| skill_files.content | text | raw, not null | indexer | untrusted reference data (served labeled, never executed) |
| index_meta('pack:*:source_hash') | text | sha256, not null | indexer | - (staleness) |

## Build / refresh / invalidation

Write-once per pinned commit: the indexer builds into a temp db, populates `skills` + `skill_files` + `skills_fts` + `index_meta`, then **atomically renames** to `~/.grimoire/index.sqlite` and writes `~/.grimoire/manifest.json`. No in-place mutation, no runtime writes, no SQL migrations — a `SCHEMA_VERSION` bump or a submodule commit change surfaces as `INDEX_STALE` and is resolved by `npm run install:grimoire` (full rebuild). Recovery from a corrupt/partial index = rebuild (the source is the pinned submodule). No secrets stored; all columns are non-secret reference data, so DTOs (`SkillRef`/`SkillHit`/`SkillFull`/`FileManifestEntry`) shape rows directly with no field redaction.
