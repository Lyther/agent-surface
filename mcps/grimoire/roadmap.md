# Roadmap — grimoire

Status: SHIPPED (v0.1) · Source: mcps/grimoire/architecture.md · Last updated: 2026-07-01

Small build. Phases are checkpoints, not ceremony; each box names its acceptance proof. All P0–P3 boxes are done and proven by the test suites (`mcps/grimoire` package tests incl. a spawned-process stdio test + the real-pack eval gate, plus repo `check`/`test`).

## P0 — eval baseline (do first)

- [x] Committed `test/fixtures/queries/real-pack.json` (30 reviewed model-phrased queries with expected skill ids) + a fixture set with negatives.
- [x] BM25 index over the real pack; baseline recorded (hit@1 0.60 / hit@5 0.80 / MRR 0.686) and thresholds derived into `architecture.md`; hybrid trigger noted (not built).

## P1 — build the server (fixture-backed)

- [x] `package.json` (bin `grimoire-server`/`grimoire-index`, sdk `>=1.24.0 <2`, zod, node>=22.17 gate) + `tsconfig.json` → `tsc` clean.
- [x] `contract.ts` + `model.ts` + `schema.sql` (+ tests): tools/DTOs/errors; `SCHEMA_SQL` loads; id round-trips across packs.
- [x] `indexer.ts` (+ fixture pack incl. 1 malformed): validate metadata, store body/files **raw**, write `index_meta` + manifest; 0 crashes.
- [x] `store.ts` (+ test): `search`/`list`/`get`/`fileGet`/`indexStatus` over the fixture index; `INDEX_MISSING`/`INDEX_STALE`.
- [x] `tools.ts` + `server.ts` (+ in-process test in `server.test.ts` and a spawned-process stdio test in `packaging.test.ts`): `tools/list` shows 4; `search→get→file_get` round-trip; labeled-text rendering.

## P2 — real pack + install

- [x] `install.sh` + `install:grimoire`: link bins (derived from `package.json#bin`, no path drift) then build index + `~/.grimoire/manifest.json`; a required pack absent → **fail (exit 1)**, never a silent success (server then reports `INDEX_MISSING`); the indexer builds into a temp db + atomic-renames, so a failed build never corrupts an existing index; `indexStatus` reads the installed manifest, not the repo.
- [x] `eval.test.ts`: `hit@5`/`MRR` meet the P0 thresholds, gated on the pinned pack (CI-gated; skips on a submodule-less checkout).

## P3 — distribution (reach every MCP host)

- [x] Registry: `grimoire` `first_party kind:"mcp"` + `served_by:["grimoire"]` on the `anthropic-cybersecurity-skills` source-pack (+ schema allows `served_by`) → `npm run check` green.
- [x] `scripts/agent-surface.mjs`: grimoire in the first-party MCP set → renders/merges across the **full synapse host set**; repo `test` green (per-format dist assertions added).
- [x] `check` rule (`checkServedBy`): `served_by`-grimoire ⇒ `source-pack`, no `skill_roots`, not present in any native catalog; proven by negative tests.
- [x] Smoke: real-stdio `search→get→file_get` against the server binary; grimoire confirmed in every config family (Claude/Droid/Deepagents/Cursor JSON, Codex TOML, Kilo/OpenCode local-map, VS Code servers, Zed context_servers).

## Later

- Hybrid/embeddings only if P2 eval fails · `resource_link` once clients support it · `doctor` index-freshness check · index more packs as they're de-scoped to grimoire.
