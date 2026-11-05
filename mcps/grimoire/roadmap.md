# Roadmap — grimoire

Status: G1 IMPLEMENTED · Source: [architecture.md](architecture.md) · Last updated: 2026-11-05

v0.1 shipped as `grimoire-v0.1.0`; its history is in git. G1 removes the machinery by which the index checked itself and keeps the search-quality gates. It lands in the same PR as [Synapse's plan](../synapse/roadmap.md), in the order set in [docs/roadmap.md](../../docs/roadmap.md#phase-mcp-s-synapse-and-grimoire-simplification).

## G1: Single-Artifact Index Without Provenance

Exit gate: `npm test` in `mcps/grimoire` passes, including the real-pack and held-out evals, and a real-pack build in a temp `GRIMOIRE_DIR` serves search → get → file_get over stdio.

- [x] `G1.1` Indexer
  - Files: `src/indexer.ts`, `src/model.ts`, `schema.sql`, `src/namespace.ts`, `test/indexer.test.ts`.
  - Scope:
    - remove `manifest.json`, git HEAD/pin/dirty logic, source snapshots and hashes, attribution, `notice` and license-file collection;
    - skip a symbolic `SKILL.md` with the reason `symbolic SKILL.md`;
    - schema v4 drops the provenance columns;
    - publish with one rename.
  - Acceptance evidence: indexer tests show that:
    - a build leaves only `index.sqlite`;
    - a failed build leaves the previous index byte-identical;
    - a symbolic `SKILL.md` appears in `skipped` while the rest of its pack is indexed;
    - a modified checkout is indexed with its working-tree content.
- [x] `G1.2` Runtime
  - Files: `src/store.ts`, `src/model.ts`, `src/contract.ts`, `src/tools.ts` and their tests.
  - Scope:
    - `indexStatus` reports only a missing index, an unreadable index or a schema mismatch;
    - responses carry no provenance or attribution;
    - remove `isUnsafePath`.
  - Acceptance evidence: store, contract and server tests pass. `file_get` with `../x` or an absolute path returns `NOT_FOUND`, and a v3 index returns `INDEX_STALE`.
- [x] `G1.3` Registry and repo tooling
  - Files:
    - `src/served-packs.ts`;
    - `registry/optional-services.json`: the `attribution` fields and the notes that refer to them;
    - `schemas/optional-services.schema.json`;
    - `scripts/agent-surface/doctor.mjs`: report only whether the index exists;
    - `tests/suites/check.test.mjs`: drop the whitespace-attribution case;
    - `tests/suites/runtime.test.mjs`: drop the attribution-drift case.
  - Acceptance evidence: root `npm test` and `npm run check` pass, and `rg -n "attribution" mcps/grimoire/src registry schemas scripts/agent-surface/doctor.mjs` finds nothing.
- [x] `G1.4` Eval gates
  - Files: `test/eval.test.ts`.
  - Scope: replace `built.skills === 121` and `=== 103` with an assertion that `skipped` holds only expected entries. A fresh build of the real packs sets that list; record each expected skip with its reason.
  - Acceptance evidence: the eval tests pass on the checked-out packs. Making one skill's frontmatter invalid in a temp copy of a pack fails the new assertion.
- [x] `G1.5` Automated acceptance
  - Scope: build the real packs into a temp `GRIMOIRE_DIR` with `grimoire-index`. Then start `grimoire-server` with that `GRIMOIRE_DIR` and call search → get → file_get over stdio.
  - Acceptance evidence:
    - a known query returns its expected skill first;
    - `get` returns that skill's body;
    - `file_get` returns a listed file;
    - `~/.grimoire` is untouched.
- [x] `G1.6` Docs
  - Scope: `README.md`, `api-contract.md`, `data-model.md`, `diagrams.md`, the status in architecture.md, and a CHANGELOG entry.

## Later (open only if a trigger fires)

- **Hybrid or embedding retrieval:** only if an eval floor fails or higher recall is required.
- **More packs:** add them through `served_by`, with the same native Agent-Skill contract.
- **`resource_link`:** once client support is consistent.
- **Binary supporting files:** unsupported; indexing fails clearly on non-UTF-8 bytes.
