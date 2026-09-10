# Roadmap

Status: SHIPPED (v0.4 core + distribution + robustness; PR #14 merged) — open by nature: per-host in-app smoke (operator-recorded continuously) + the git tag (maintainer go)
Source architecture: mcps/synapse/architecture.md
Last updated: 2026-08-31

## Roadmap Principles

- One HTTP sidecar owns writes + realtime; a stdio bridge gives universal host reach. Push accelerates; cursor pull is the correctness floor.
- 7 tools, self-describing via server `instructions` + descriptions + in-band hints. No ritual/handshake.
- Physical isolation; identity auto-derived, never gates writes. Compact/budgeted recall by default.
- Every task carries observable acceptance evidence; nothing depends on push.
- Distribution never clobbers a host's existing MCP config: agent-surface generates the files it owns and **merges** (read-modify-write) into shared/secret-bearing ones.

## Status Snapshot

- **Done**: Phase 0 (spike + contract + model + namespace), Phase 1 (sidecar/bridge/store/identity/memory/locks/realtime/instructions), Phase 2 (autostart + launchd, security pass, threat-model README, first-party distribution, **concurrency + crash recovery**), Phase 3 (**non-destructive MCP merge engine**; external MCP opt-in policy reconciled), Phase 4 (**dirty-bit coalescing**, **bridge MCP-roots routing**, SSE-resume + idle-shutdown claims truth-stated). Proof: synapse `npm test` 40/40; repo gates are rerun with each distribution change.
- **Phase 5 (production-readiness) — mostly done** (PR #14 and later portfolio refreshes): shipped distribution, CI, `doctor` sidecar health, Linux lazy-start + reference systemd unit, YAML config support, and CHANGELOG. **Open by nature**: per-host live transport smoke and the `synapse-v0.4.0` git tag. The current matrix has 22 generated MCP hosts; Antigravity desktop, DSH, and Pi have no modeled MCP.

## Phase 0–1: Core (DONE)

- [x] `P0.1` Spike S-01 — realtime push + bridge-forward + cursor floor. Evidence: `test/sidecar.test.ts` "S-01 …", `test/bridge.test.ts` "forwards realtime resources/updated".
- [x] `P0.2`–`P0.4` Contract / model / namespace — `src/contract.ts` (7 tools, `instructions`, DTOs), `src/model.ts` + `schema.sql` (no scope/kind column), `src/namespace.ts` (git-root realpath hash). Evidence: `tsc` clean; store tests.
- [x] `P1.1` Sidecar transport — Streamable HTTP 127.0.0.1, sessions, bearer, DNS-rebind/Host, SDK `>=1.24.0 <2`. Evidence: sidecar tests (bearer/init/isolation).
- [x] `P1.2` stdio bridge — proxy JSON-RPC + forward `resources/updated`/`list_changed`. Evidence: bridge proxy + forward test.
- [x] `P1.3`–`P1.6` Store, identity, `memory_*`, `lock_*` — single-owner WAL, FTS5/bm25, budgeted recall, atomic lock reap+claim. Evidence: 13 store tests incl. F001/F004.
- [x] `P1.7` Realtime + cursor floor — commit hook → dirty-bit; `recall({since})`/`lock_list` floor. Evidence: S-01 + `since`-cursor tests.
- [x] `P1.8` `instructions` + tool descriptions (≥3 sentences, "untrusted data"). Evidence: `SERVER_INSTRUCTIONS` + `TOOL_DESCRIPTIONS` in `src/contract.ts`.

## Phase 2: Hardening + owned-file distribution

- [x] `T2.1` Lifecycle autostart — `src/bootstrap.ts` lock-elected spawn + discovery/token (mode 600); `deploy/launchd/local.synapse.plist` deployed/restarted by `install.mjs` (macOS only; Linux and Windows use the same lazy autostart). Evidence: bridge "zero-config autostart" test; `node --check install.mjs`.
- [x] `T2.3` Security pass — bearer/Host, ingest redaction, `forget` plaintext scrub (F004), 2 MB body cap → 413 (F005), mode-600 files (F007). Evidence: F002/F004/F005 + redaction tests.
- [x] `T2.4` Threat model + README. Evidence: `README.md` Security section.
- [x] `T2.6` Distribution (owned-file targets) — first-party `synapse` registry entry; `optional-services.schema.json` first-party path; `npm run install:synapse` builds+links bins and deploys/updates the launchd sidecar. Evidence: `check generated: ok`; generated routes asserted in `tests/suites/build.test.mjs`.
- [x] `T2.2` Concurrency + crash recovery
  - Files: `test/recovery.test.ts`.
  - Scope: many concurrent sessions; kill sidecar mid-write (SIGKILL); restart; assert no lost committed writes and recovery to last committed row (WAL).
  - Acceptance evidence: `T2.2: kill mid-session then restart recovers all committed rows and last id` + `T2.2: concurrent writes from many sessions all persist across a hard crash` (synapse `npm test` 40/40).
  - Dependencies: none.
- [x] `T2.5` Per-target transport smoke (runbook)
  - Files: `test/smoke/README.md`.
  - Scope: launch `synapse-bridge` under each registered host; confirm tools/list + a remember/recall round-trip + push arrives.
  - Acceptance evidence: runbook landed with the per-host procedure; matrix-driven config merge is proven in `tests/suites/install.test.mjs`; in-process transport is proven by `test/bridge.test.ts`; native host passes remain separately recorded evidence.
  - Dependencies: T2.6.
  - Note: the live per-host smoke is operator-run evidence, not an automated test; the matrix records pass/fail per host before that host is documented as fully wired.
- [x] `T2.7` Orchestrator seeding
  - Files: `commands/workflow-orchestrator.md` (SYNAPSE AGENT SEEDING section).
  - Scope: when the orchestrator fans out concurrent agents, pass `SYNAPSE_AGENT_ID` (per agent, distinct) and a shared `SYNAPSE_PROJECT`; single-agent runs untouched.
  - Acceptance evidence: the orchestrator command now specifies the per-agent `SYNAPSE_AGENT_ID` + shared `SYNAPSE_PROJECT` seeding rule and the single-agent exemption; non-secret, process-local only, never persisted.
  - Dependencies: T2.6.

## Phase 3: MCP-merge distribution

Goal: deliver synapse to the hosts the user listed in `README.md` Distribution step 2 **without** clobbering user-owned servers/secrets.

- [x] `P3.1` Non-destructive merge engine
  - Files: `scripts/agent-surface.mjs` (`mcpConfigMerge`, `mergeJsonMcpConfig`, `mergeCodexMcpToml`), `scripts/agent-surface/jsonc.mjs`, `registry/target-capabilities.json`.
  - Scope: read-modify-write helpers per config format — JSON `mcpServers`, TOML `mcp_servers` (Codex), JSONC `mcp` (Kilo/OpenCode), nested settings (`gemini settings.json`, Zed `context_servers`, VS Code `servers`), Claude Code (`~/.claude.json` / project `.mcp.json`). Merge adds/updates only the `synapse` key; preserves all other entries and comments where the format requires.
  - Acceptance evidence: matrix-driven cases in `tests/suites/install.test.mjs` cover the active JSON/JSONC/TOML/YAML merge families; idempotent re-merge is a no-op diff.
  - Dependencies: T2.6.
- [x] `P3.2` Flip manual MCP targets to generated-merge
  - Files: `scripts/agent-surface/targets.mjs`, `registry/target-capabilities.json`, `tests/suites/{build,install}.test.mjs`.
  - Scope: every target whose capability record declares a generated MCP surface emits or merges the `synapse` stdio entry.
  - Acceptance evidence: `check generated` and matrix-driven install tests assert `synapse` on every active generated route; non-destructive merge tests expect a merge, not a skip.
  - Dependencies: P3.1.
- [x] `P3.3` Reconcile `agentmemory` default vs opt-in
  - Files: `scripts/agent-surface/targets.mjs`, `tests/suites/install.test.mjs`, `registry/optional-services.json`.
  - Scope: external/secret-bearing MCPs (agentmemory) are **opt-in** via `--category mcps --service <id>`; only first-party secretless MCPs (synapse) are default-on. This matches the README.
  - Acceptance evidence: install tests assert external MCPs are absent unless selected while first-party MCPs are present. Decision: **opt-in**.
  - Dependencies: none.
- [x] `P3.4` Pending-target research/wiring
  - Scope: research each previously-unwired host's MCP surface and either wire it (generated-merge) or record an evidence-backed reason it stays out.
  - Outcome: the maintained matrix now covers 22 generated hosts across JSON/JSONC/TOML/YAML, including current Copilot, Grok Build, Antigravity CLI, Qoder, Qwen Code, and Kiro routes. Antigravity desktop, DSH, and Pi remain intentionally unwired.
  - Acceptance evidence: `registry/target-capabilities.json` records the path/format boundary; `check generated` plus matrix-driven build/install tests cover every generated target.
  - Dependencies: P3.1.

## Phase 4: Robustness + doc reconciliation

- [x] `P4.1` SSE resumability — the architecture truth-states this: stream-level `Last-Event-ID` resume is **not wired** (no event store); the correctness floor is reconnect + cursor re-pull (`recall({since})`). No doc claims stream resume. Acceptance: the doc no longer claims stream resume (architecture.md lines ~103, ~130).
- [x] `P4.2` Dirty-bit coalescing — added a leading+trailing-edge per-channel coalescer in `src/sidecar.ts` (`NotificationCoalescer`, default 50ms window) so a burst of writes collapses to ≤2 notifications. Acceptance: `test/coalescing.test.ts` — a 20-write burst produces ≤2 notifications and all 20 rows stay cursor-retrievable; spaced writes each notify (no over-coalescing).
- [x] `P4.3` Bridge MCP-roots routing — `src/bridge.ts` resolves the project key as `SYNAPSE_PROJECT` → host's first MCP root (`file://` URI) → cwd git-root, so hosts that launch the bridge outside the workspace still isolate. Acceptance: `test/roots-routing.test.ts` — a roots-provided workspace routes to the right DB without cwd reliance; override wins; no-roots host falls back to cwd.
- [x] `P4.4` Doc/code drift sweep — `architecture.md`/`README.md`/`roadmap.md` truth-stated against the code; every IMPLEMENTED claim maps to a named test (synapse 40/40). The three prior drift claims (SSE resume, dirty-bit rate-limit, idle-shutdown) are reconciled: SSE resume = not wired (stated); dirty-bit = coalesced now; idle-shutdown = the sidecar stays resident.

## Phase 5: Production-readiness (remaining)

The honest blockers before an unqualified "production-ready" claim. Items marked **(shared)** are tracked in `mcps/grimoire/roadmap.md` too — they cover the agent-surface MCP plumbing both services ride.

- [x] `P5.1` **(shared)** Ship the distribution work — the original PR #14 wiring and later portfolio refreshes maintain one capability matrix and per-format merge gates.
- [~] `P5.2` Per-host live transport smoke — run native headless probes where available and record GUI-only launches separately. Config merge and in-process bridge transport are automated; host execution remains a distinct proof boundary.
- [x] `P5.3` **(shared)** Goose + Poolside MCP — safe non-destructive YAML block merge is implemented; the current generated matrix totals 22 hosts.
- [x] `P5.4` **(shared)** CI gate — `.github/workflows/ci.yml` `mcp` job (Node 22) runs the synapse suite (40 tests) + `npm audit` on every PR.
- [x] `P5.5` `agent-surface doctor` sidecar health — `doctor` reports `synapse-bridge`/`synapse-sidecar` linked state and `~/.synapse/sidecar.json` presence, plus grimoire/host wiring.
- [x] `P5.6` Linux always-on service — **lazy-start** documented as the supported Linux mode (the bridge autostarts the lock-elected sidecar; no service required), plus an optional reference systemd *user* unit at `deploy/systemd/synapse-sidecar.service`.
- [ ] `P5.7` **(shared)** Release — `CHANGELOG.md` landed; **remaining**: cut the `synapse-v0.4.0` git tag (maintainer go) and clear `NODE_TLS_REJECT_UNAUTHORIZED=0` in the launching env.

## Later / Not Now

- Private (agent-local) visibility — additive `visibility` column; deferred per prior user decision (shared-only).
- OAuth 2.1 resource-server auth — static bearer covers localhost.
- 2026-07-28 stateless / `subscriptions/listen` migration — pin SDK `>=1.24.0 <2`; revisit when the RC + SDK ship.
- CRDT document-merge / A2A peer messaging — out of scope; we append + lock, MCP gives shared-memory not peer messaging.
- Linux/systemd service unit — macOS launchd is primary; add only if a Linux host needs always-on.

## Cross-Phase Gates

- [x] Cursor pull correct without push — S-01 + `since` tests.
- [x] Bridge forwards push + tools — bridge test.
- [x] Cross-project isolation (+ explicit read) — isolation tests.
- [x] Identity never blocks writes — F002 / no-env write test.
- [x] Recall compact/budgeted — byte-budget + truncation test.
- [x] No-secret-in-store — redaction suite.
- [x] SDK security floor `>=1.24.0 <2` — `package.json` pin.
- [x] Merge never clobbers — matrix-driven install tests exercise the active JSON/JSONC/TOML/YAML merge families (P3.1 done).
- [~] Per-target smoke — config merge is proven for all 22 generated hosts plus in-process bridge transport; live host execution is recorded separately and is not inferred from generated output.
