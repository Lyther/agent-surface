# Roadmap — grimoire

Status: P0–P3 DONE (v0.1 core + distribution) · production-readiness = P4 remaining · Source: mcps/grimoire/architecture.md · Last updated: 2026-07-01

Small build. Phases are checkpoints, not ceremony; each box names its acceptance proof. P0–P3 are done and proven by the test suites (`mcps/grimoire` package tests incl. a spawned-process stdio test + the real-pack eval gate, plus repo `check`/`test`). **P4 lists the honest blockers before an unqualified "production-ready" claim.**

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

- [x] `install.sh` + `install:grimoire`: link bins (derived from `package.json#bin`, no path drift) then build index + `~/.grimoire/manifest.json`; a required pack absent → **install exits 1** (never a silent success); the indexer builds into a temp db + atomic-renames, so **any existing index is left untouched** and a **clean machine reports `INDEX_MISSING`**; `indexStatus` reads the installed manifest, not the repo.
- [x] `eval.test.ts`: `hit@5`/`MRR` meet the P0 thresholds, gated on the pinned pack (CI-gated; skips on a submodule-less checkout).

## P3 — distribution (reach every generated MCP host modeled by agent-surface)

MCP-host coverage is **honest, not blanket**. Three groups (see `registry/target-capabilities.json` `surfaces.mcp`):

- **Generated (17)** — auto-rendered + non-destructively merged across JSON/TOML/YAML config families: Claude Code, Codex, Deep Agents, Cursor, Droid, Cline, Kilo, OpenCode, VS Code, VSCodium, Trae, Windsurf, Zed, Grok Build, Antigravity CLI, **Goose** (`config.yaml` extensions, user-scope), **Poolside** (`settings.yaml` mcp_servers).
- **No modeled MCP surface** — Antigravity (legacy workflows; use Antigravity CLI), Copilot (MCP handled by the host editor), Pi (no stdio MCP config verified).

- [x] Registry: `grimoire` `first_party kind:"mcp"` + `served_by:["grimoire"]` on the `anthropic-cybersecurity-skills` source-pack (+ schema allows `served_by`) → `npm run check` green.
- [x] `scripts/agent-surface.mjs`: grimoire in the first-party MCP set → renders/merges across **all 17 generated MCP hosts**; repo `test` green (per-format dist assertions added).
- [x] `check` rule (`checkServedBy`): `served_by`-grimoire ⇒ `source-pack`, no `skill_roots`, not present in any native catalog; proven by negative tests.
- [x] Smoke: real-stdio `search→get→file_get` against the server binary; grimoire confirmed in every config family (Claude/Droid/Deepagents/Cursor JSON, Codex TOML, Kilo/OpenCode local-map, VS Code servers, Zed context_servers).

## P4 — production-readiness (remaining)

The honest blockers before an unqualified "production-ready" claim. Items marked **(shared)** are tracked in `mcps/synapse/roadmap.md` too — they cover the agent-surface MCP plumbing both services ride.

- [ ] `P4.1` **(shared)** Ship the distribution work — branch + commit + PR + merge: the new MCP-target wiring (VSCodium / Grok Build / Antigravity CLI), the honest `target-capabilities.json` matrix, and the docs (README, `docs/reference/targets.md`, adapter READMEs). Acceptance: merged to `main`; `check` + `test` green on the tip.
- [ ] `P4.2` Per-host live launch smoke (the acceptance floor) — launch each of the 17 generated MCP hosts, confirm `tools/list` exposes the 4 `grimoire_*` tools and `grimoire_search` returns `ok`; record pass/fail per host. **Especially validate the 3 just-added formats** (VSCodium `mcp.json`, Grok `.grok/settings.json`, Antigravity `mcp_config.json`) actually load in the real tool — they came from doc research, not a live load. Acceptance: a recorded host matrix (operator-run, not automated).
- [ ] `P4.3` **(shared)** CI gate — CI runs the `mcps/grimoire` suite (incl. the real-pack eval gate) + `npm audit` on every PR; fails on eval-floor regression. Acceptance: green CI workflow.
- [x] `P4.4` **(shared)** Goose + Poolside MCP — **done**: a safe non-destructive YAML block-merge (`mergeYamlMcpConfig`) was added and both flipped to `generated` (17 total). Merge preserves keys/comments/sibling servers, is idempotent, and refuses (blocks, never corrupts) on tabs or flow-style. Acceptance: verified non-destructive + idempotent merge on a seeded `config.yaml`; covered by tests.
- [ ] `P4.5` `agent-surface doctor` index-freshness — compare the installed `~/.grimoire/manifest.json` pin against the repo's `registry/optional-services.json` commit/hash and warn on drift (runtime `indexStatus` can't see the repo); also assert `grimoire-server` is linked and wired in host configs. Acceptance: `doctor` flags a stale or unwired grimoire.
- [ ] `P4.6` **(shared)** Release — cut `grimoire 0.1` with a `CHANGELOG`; tag. Clear `NODE_TLS_REJECT_UNAUTHORIZED=0` from the release shell. Acceptance: tagged release + notes.

## Later (deferred-by-design — open only if a trigger fires)

- **Hybrid / embedding retrieval** — only if the eval gate floor proves insufficient or higher recall is required (current BM25 v0 baseline: hit@5 0.80 / MRR 0.686).
- **More packs** — add `--pack` + `served_by` as other large packs are de-scoped to grimoire (today: `anthropic-cybersecurity-skills` only).
- **`resource_link`** — expose skills/files as MCP resources once client support is even (`grimoire_file_get` covers it today).
- **Binary supporting files** — current pack is all text; revisit if a pack ships binary assets (stored as UTF-8 today).
