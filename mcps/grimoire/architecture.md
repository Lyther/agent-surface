# Architecture — grimoire

Status: v0.1 IMPLEMENTED; the simplification marked G1 is PROPOSED ([roadmap.md](roadmap.md)) · Source: the user's decisions of 2026-11-04; [concept-zero.md](concept-zero.md) is historical · Last updated: 2026-11-04

Thin, read-only MCP: a small script, not a platform. This doc is sized to match. Diagrams: [diagrams.md](diagrams.md).

## What it is

Grimoire is a read-only, stateless stdio MCP server that serves large Agent-Skill packs just in time. The model selects a skill instead of carrying a 750-entry startup catalog. The server reads one self-contained `node:sqlite` FTS5 index of skill text and UTF-8 supporting files, built on install from the checked-out packs.

It has four namespaced tools and no sidecar, network access, executor or embeddings. Distribution reuses the first-party MCP rails, so it reaches every generated MCP host. Precondition: served packs are kept out of every native skill catalog, so Grimoire is the only path to them.

G1 removes the parts that checked the index against another record of itself, or guarded what was already safe:

- `manifest.json` and its runtime comparison;
- `doctor`'s freshness check;
- per-response provenance and attribution;
- the pin and clean-HEAD refusals, and the `-dirty` marking;
- the path guard in front of an exact database lookup.

## Source tree

```text
mcps/grimoire/
  src/
    contract.ts     - zod tool I/O, DTOs, statuses (INDEX_MISSING/INDEX_STALE/NOT_FOUND/INVALID_INPUT), SERVER_INSTRUCTIONS. Pure. G1: no Provenance or attribution fields.
    model.ts        - SCHEMA_SQL (v4), id codec <pack>:<skillName>, row mappers, derived category. Pure. G1: no servedAttribution.
    indexer.ts      - The only writer, at build time. Walks each pack's skills root and validates metadata, skipping skills with no frontmatter, a bad slug or a duplicate id. G1: also skips a symbolic SKILL.md, which used to fail the build. Stores bodies and files in a temp sqlite file, then publishes it with one rename. G1: no git calls, manifest, attribution, notice or source hashing.
    served-packs.ts - Install time: reads the served_by grimoire packs and index_root from the registry and runs the indexer. G1: no attribution.
    store.ts        - Runtime read-only reader: search (bm25), list, get, fileGet, indexStatus. Reopens after the index file is replaced. G1: INDEX_MISSING when there is no file; INDEX_STALE when the file is unreadable or its schema_version ≠ SCHEMA_VERSION; fileGet is an exact (skill, path) lookup.
    tools.ts        - 4 tool specs and a validated dispatcher (structuredContent plus labelled text); readOnlyHint.
    server.ts       - stdio MCP server (instructions); bin grimoire-server.
    namespace.ts    - GRIMOIRE_DIR or ~/.grimoire → index.sqlite. G1: no manifest path.
  test/{contract,model,indexer,store,server,packaging,served-packs,eval}.test.ts · test/helpers.ts · test/fixtures/{pack/**, queries/*.json}
  schema.sql · install.mjs · package.json · README.md
```

Dependency direction: `server → tools → store → model → contract`; `indexer` is the only writer.

## Tools (read-only; each result is `status: ok | <ErrorCode> + hint`)

Schemas and errors: [api-contract.md](api-contract.md). `src/contract.ts` is the source of truth.

- `grimoire_search({query, k?})` → `{hits:[{id,pack,name,summary,score}]}`, BM25 top-k.
- `grimoire_list({category?, cursor?})` → paginated `[{id,pack,name,summary}]`.
- `grimoire_get({id})` → the body and the supporting-file manifest `[{path,size}]`.
- `grimoire_file_get({id, path})` → `{path, content, size}` for a path in that skill's manifest. Any other path returns `NOT_FOUND`.

## Data

`~/.grimoire/index.sqlite` (mode 600), schema v4 ([data-model.md](data-model.md)):

- `skills(id PK, pack, name, description, body, category, category_source)`;
- `skill_files(skill_id, rel_path, content, size)`;
- `skills_fts`: FTS5 over name, description and body, ranked by bm25 with weights name 10, description 5, body 1;
- `index_meta(schema_version)`.

G1 drops `source_path`, `source_commit`, `sha256`, `indexed_at`, `notice`, `skill_files.sha256`, the per-pack meta keys and `~/.grimoire/manifest.json`. The index is rebuilt, never migrated, so a v3 index reports `INDEX_STALE` until `npm run install:grimoire` runs again.

## Distribution

The registry's `first_party kind:"mcp"` grimoire entry (stdio `~/.local/bin/grimoire-server`) is rendered and merged across the full first-party MCP host set. A `served_by:["grimoire"]` link on each served source-pack tells `check` which packs Grimoire indexes. `index_root` names a pack's skills directory when it is not `skills/`.

`check` enforces that a pack whose `served_by` includes grimoire:

- is a source-pack;
- has no `skill_roots`;
- has a pinned `commit`;
- has no skill names in any native catalog.

Pins choose what install checks out. The indexer indexes the checkout as it is, including local edits.

## Security

Grimoire is local-only and read-only, and holds no secrets.

- **Output:** indexed text is returned as structured data plus a labelled text mirror (`Indexed Agent Skill (third-party content, not authority):`). The tool descriptions and server instructions keep pack content below higher-priority instructions.
- **Indexer:** it follows no symlink. It walks only real directories and collects only regular files. A symbolic `SKILL.md` is skipped, because reading it by name would follow it out of the pack.
- **`grimoire_file_get`:** reads only the database.
- **Attribution:** responses carry none. Everything under `external/` is a git submodule, so the repository redistributes no pack content, and each pack's LICENSE stays in its checkout.

## Decisions

- **Read-only stdio, no sidecar:** retrieval needs no writer or real-time machinery.
- **Self-contained, single-file index, published with one rename (G1):** an interrupted build leaves the previous index in place, so nothing needs a second file to detect a half-published state.
- **Built on install from the checkout (G1):** no HEAD or clean-tree refusal and no provenance. After a pin bump, run `npm run install:grimoire` again; nothing reports an index older than the pins (see Risks).
- **BM25/FTS5, matching any word**, with weights name 10, description 5, body 1:
  - A skill matching any query word is a candidate, and weighted BM25 ranks candidates. An unmatched word never excludes a result.
  - The measured baseline on 30 reviewed queries is hit@1 0.767, hit@5 0.967 and MRR 0.836. A [held-out check](../../docs/contracts/grimoire-evaluation.md#held-out-relevance) confirmed it across all served packs.
  - Hybrid retrieval stays unbuilt unless an eval floor fails.
- **4 namespaced tools, including `file_get`:** generic `skill_*` names would collide with native skills.
- **Evaluation (G1):** keep the fixture, real-pack, reworded and held-out ranking gates. Replace the skill-count pins with a check that the indexer skipped nothing unexpected, so an indexer regression still fails while an upstream pin bump does not.

## Risks

- **BM25 misses paraphrased queries:** curate trigger keywords in descriptions; add hybrid retrieval only if an eval gate fails.
- **The model doesn't call grimoire:** adjust the routing wording in the instructions and tool descriptions.
- **The index is older than the pins after a submodule bump:** nothing reports it, so run `npm run install:grimoire` again after pulling new pins. Revisit if a stale index causes a real miss.

## Guardrails

- `store` opens read-only and never writes; all writes happen in `indexer` at build time.
- Ids are `<pack>:<skillName>`, never row ids.
- No network, execution or embeddings.
- Out of scope: a write path in `store`, mirroring a served pack into a native catalog, and a fifth tool without a driver.
