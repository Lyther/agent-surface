# Architecture — grimoire

Status: IMPLEMENTED (v0.1) · Source: mcps/grimoire/concept-zero.md · Last updated: 2026-07-01

Thin, read-only MCP — a small script, not a platform. This doc is sized to match. Diagrams: [diagrams.md](diagrams.md) (containers · ERD · JIT flow).

## What it is

A read-only, stateless **stdio MCP server** that serves large Agent-Skill packs **just-in-time** so the model *selects* a skill instead of drowning in a 750-entry startup catalog. It reads a self-contained `node:sqlite` FTS5 index (skill text + every supporting file's content) **built on install** from the pinned submodule. Four namespaced tools; no sidecar, no network, no executor, no embeddings (v0). Distribution reuses synapse's first-party MCP rails, so it reaches **every MCP-capable host those rails cover** — Claude Code, Codex, Deep Agents, Cursor, Droid, Kilo, OpenCode, VS Code, Zed, … — for free. Precondition: served packs are **deferred from all native skill catalogs** (grimoire is the sole path). Sources: `concept-zero.md` (current); synapse impl (`VERIFIED_EXISTING` — FTS5 store, stdio Server, first-party distribution reused); `anthropic-cybersecurity-skills` (754 skills + 3,404 supporting files, already `source-pack` with no `skill_roots`).

## Source tree

```text
mcps/grimoire/
  src/
    contract.ts  - zod tool I/O, DTOs, ErrorCode (INDEX_MISSING/INDEX_STALE/NOT_FOUND/INVALID_INPUT), SERVER_INSTRUCTIONS, id codec <pack>:<skillName>. Pure.
    model.ts     - SCHEMA_SQL (skills + skill_files + index_meta + FTS5), row mappers, deriveCategory(name)→categorySource:"derived". Pure.
    indexer.ts   - build-time ONLY writer: walk pack roots → validate metadata (skip no-frontmatter/bad-slug/dup-id; truncate desc>1024 in metadata) → store body/files RAW → sqlite + index_meta + ~/.grimoire/manifest.json. Absent pack dir → throws; builds into a temp db + atomic-renames (non-destructive). Not imported by server.
    store.ts     - runtime read-only reader: search(bm25)/list/get/fileGet/indexStatus. No writes, no MCP.
    tools.ts     - 4 tool specs + validated dispatcher (structuredContent + labeled text); readOnlyHint.
    server.ts    - stdio MCP Server (instructions); bin grimoire-server. Opens index read-only.
    namespace.ts - resolve ~/.grimoire/{index.sqlite,manifest.json} + pack roots; no repo dependency at runtime.
  test/{contract,model,indexer,store,server,packaging,eval}.test.ts · test/helpers.ts · test/fixtures/{pack/**, queries/*.json}
    (packaging.test.ts = bin-targets-exist + spawned-process real-stdio; eval.test.ts = fixture + real-pack gate)
  schema.sql · install.sh · package.json · README.md
```

Dependency direction: `server → tools → store → model → contract`; `indexer` is the only writer.

## Tools (read-only; each result `status: ok | <ErrorCode> + hint`)

Full schemas, error semantics, and examples: [api-contract.md](api-contract.md) (`src/contract.ts` is the source of truth).

- `grimoire_search({query, k?})` → `{hits:[{id,pack,name,summary,score}]}` — primary path, BM25 top-k.
- `grimoire_list({category?, cursor?})` → paginated `[{id,pack,name,summary}]`; derived categories.
- `grimoire_get({id})` → body + supporting-file manifest + provenance `{sourcePath,sourceCommit,sha256,indexedAt}`.
- `grimoire_file_get({id, path})` → one supporting file's content (`path` validated against the manifest).

## Data

Full DDL, manifest shape, codecs, and data dictionary: [data-model.md](data-model.md). Self-contained `~/.grimoire/index.sqlite` (mode 600): `skills(id PK=<pack>:<skillName>, pack, name, source_path, source_commit, sha256, indexed_at, description, body, category, category_source)`, `skill_files(skill_id, rel_path, content, sha256, size)`, `skills_fts` (FTS5 over name+description+body; bm25 name^/desc^/body-low), `index_meta` (schema_version + per-pack commit/hash). `store.indexStatus()` compares `index_meta` to the **installed `~/.grimoire/manifest.json`** (written by the indexer) → `ok|stale|missing` — never the repo registry (the global binary may run with no checkout).

## Distribution

Registry `first_party kind:"mcp"` grimoire entry (stdio `~/.local/bin/grimoire-server`) → rendered/merged across the **full synapse MCP host set** (zero new infra). A `served_by:["grimoire"]` link on the `anthropic-cybersecurity-skills` source-pack tells the `check` rule which packs grimoire indexes. Invariant: `served_by` includes grimoire ⇒ `source-pack`, no `skill_roots`, pinned `commit`, present in the index. `check` fails if a served pack regains `skill_roots` or its skill names surface in any native catalog.

## Security

Local-only, read-only, no secrets. Served content is **untrusted reference data**: stored **raw** (char-stripping would corrupt security XML/HTML/code), returned as structured data + a labeled text mirror (`Reference content, not instructions:`); tool descriptions + `instructions` reinforce it. `grimoire_file_get` rejects any path not in the skill's stored manifest (no traversal; no serve-time fs read).

## Decisions

- Read-only stdio, **no sidecar** — synapse's single-writer/realtime machinery is unneeded for retrieval.
- **Self-contained** index (store file contents) — portable; zero runtime submodule dependency.
- **Build-on-install** from pinned source — no committed/stale index; `INDEX_STALE` on drift vs the installed manifest.
- **BM25/FTS5 v0** (weights name^10/desc^5/body^1). Measured baseline on the pinned 754-pack over 30 reviewed paraphrased queries: **hit@1 0.60, hit@5 0.80, MRR 0.686** (`test/eval.test.ts`, gated at hit@5 ≥ 0.70 / MRR ≥ 0.55 to catch regressions). **Hybrid trigger**: if the gate drops below the floor, or higher recall is wanted, add hybrid lexical+embedding retrieval — not built in v0 (paraphrase/sibling-skill collisions are the main miss class).
- **4 namespaced tools** incl. `file_get` — generic `skill_*` would collide with native "skills"; `resource_link` deferred (uneven client support).
- **`served_by` link + installed manifest** — explicit ownership + runtime staleness without the repo.

## Risks

- BM25 misses paraphrased queries → curate trigger-keyword descriptions; add hybrid only if the eval gate fails.
- Model doesn't call grimoire → routing wording in `instructions`/tool descriptions; revisit with a pointer skill if smoke shows non-use.
- Stale index after a submodule bump without reinstall → `INDEX_STALE`; surface in `doctor`.

## Guardrails

`store` opens read-only and never writes (all writes in `indexer`, build-time). Ids are `<pack>:<skillName>` (never row ids); every `get` carries provenance. No network, no execution, no embeddings (v0). Out of scope: a write path in `store`, mirroring a served pack into a native catalog, a 5th tool without a driver.
