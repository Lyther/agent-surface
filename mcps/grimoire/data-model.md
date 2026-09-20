# Data Model — grimoire

Status: IMPLEMENTED (v0.1) · Source: mcps/grimoire/architecture.md + api-contract.md · Last updated: 2026-08-31

A **derived, read-only** index — not a database of record. The source of truth is the pinned submodule; `~/.grimoire/index.sqlite` is a self-contained build artifact (mode 600), rebuilt not migrated. `model.ts` owns `SCHEMA_SQL` + mappers + the id codec; `indexer.ts` is the only writer; `store.ts` reads. `SCHEMA_VERSION = 2`.

## Entities

- **skill** — one Agent-Skill (`SKILL.md`). Identity: surrogate `id = "<pack>:<skillName>"`; natural key `(pack, name)`. Owns: body, description, derived category, provenance.
- **skill_file** — one supporting file (`scripts/`/`references/`/`assets/`) belonging to a skill; identity `(skill_id, rel_path)`. The served packs ship thousands of these.
- **index_meta** — key/value build metadata (schema version + per-pack provenance) used for staleness.
- One `skill` has many `skill_file` (FK, cascade). `skills_fts` is an FTS5 view over `skill`, not an entity.

## Physical schema (canonical `schema.sql`, mirrored by `model.ts` SCHEMA_SQL)

```sql
-- SCHEMA_VERSION = 2. Built write-once per indexed source state; rebuilt, never migrated.
CREATE TABLE skills (
  id              TEXT PRIMARY KEY,                 -- "<pack>:<skillName>"
  pack            TEXT NOT NULL,
  name            TEXT NOT NULL,                    -- skill slug; column name MUST equal the FTS column 'name'
  source_path     TEXT NOT NULL,                    -- repo-relative SKILL.md path at build time
  source_commit   TEXT NOT NULL,                    -- clean commit or "<commit>-dirty"
  sha256          TEXT NOT NULL,                    -- of the raw body
  indexed_at      TEXT NOT NULL,                    -- ISO-8601 UTC
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
-- keys: 'schema_version' ; 'pack_ids' ; per-pack source_commit/file_count/source_hash/attribution/built_at
```

## Installed expected-source manifest — `~/.grimoire/manifest.json`

```jsonc
{ "schemaVersion": 2,
  "packs": [ { "serviceId": "anthropic-cybersecurity-skills",
               "path": "external/anthropic-cybersecurity-skills",
               "commit": "<pinned sha or pinned sha-dirty>", "sourceHash": "<sha256 of the indexed source set>",
               "attribution": "<author, source, license, transformation notice>" },
             { "serviceId": "rev-skills",
               "path": "external/rev-skills",
               "commit": "<pinned sha or pinned sha-dirty>", "sourceHash": "<sha256 of the indexed source set>",
               "attribution": "<author, source, license, transformation notice>" },
             { "serviceId": "hack-skills",
               "path": "external/hack-skills",
               "commit": "<pinned sha or pinned sha-dirty>", "sourceHash": "<sha256 of the indexed source set>",
               "attribution": "<author, source, license, transformation notice>" } ] }
```

`store.indexStatus()` (runtime, no repo dependency):

- `index.sqlite` or `manifest.json` absent → **`INDEX_MISSING`**.
- `index_meta.schema_version` ≠ `manifest.schemaVersion`, the exact pack-id sets differ, or any pack's `source_commit`/`source_hash`/`attribution` differs from the manifest → **`INDEX_STALE`**.
- else → **`ok`**. Compared against the installed manifest, **never** `registry/optional-services.json`.

## Derivations & codecs (pure, in `model.ts`)

- **id codec**: `extId(pack, skillName) = `${pack}:${skillName}``; `decId(id)` splits on the first `:`. Both segments must match `^[a-z0-9][a-z0-9-]*$` (Agent-Skills slug rule). Ids are content-independent → stable across rebuilds.
- **category**: `deriveCategory(name)` = the leading token before the first `-` mapped to a small fixed set (`analyzing, detecting, conducting, building, configuring, auditing, collecting, deploying, implementing, performing, hunting, exploiting, reverse, …`); unrecognized → `other`. Always `category_source='derived'` — **not** authoritative (the pack ships no taxonomy).

## Data dictionary (non-obvious fields)

| Field | Type | Allowed / null | Owner | Sensitivity |
|---|---|---|---|---|
| skills.id | text PK | `<pack>:<skillName>`, not null | model.ts (codec) | - |
| skills.source_commit | text | 40-hex, `<40-hex>-dirty`, or `uncommitted`; not null | indexer | - (provenance/audit) |
| skills.sha256 | text | 64-hex of body, not null | indexer | - |
| skills.category / category_source | text | derived set / const `derived` | model.ts | - |
| skill_files.rel_path | text | manifest-relative, not null | indexer | - (validated against manifest on `file_get`) |
| skill_files.content | text | raw, not null | indexer | indexed supporting content (served labeled; Grimoire never executes it) |
| index_meta('pack:*:source_hash') | text | sha256, not null | indexer | - (staleness) |
| index_meta('pack:*:attribution') | text | author/source/license notice, not null | registry + indexer | public attribution |

## Build / refresh / invalidation

Write-once per indexed source state: the indexer builds a temp DB and temp manifest, then renames both into place and removes leftover temp artifacts on failure. The two-file publication is fail-closed rather than transactionally atomic: interruption between renames can produce `INDEX_STALE`, never a healthy mismatched pack set; rerunning `npm run install:grimoire` repairs it. A long-lived `Store` detects index replacement and reopens on the next call. A Git-owned clean pack records its commit; modified, deleted, untracked, or ignored indexed content records `<commit>-dirty`; a Git-less tree records `uncommitted` even if a caller declares a commit. Attribution is explicit and required. No runtime writes or SQL migrations. Recovery from a corrupt/partial index is a rebuild from the pinned source.
