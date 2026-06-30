# Roadmap

Status: IMPLEMENTED (v0.4 core + distribution + robustness) — remaining: Phase 5 production-readiness (ship, per-host live smoke, CI, doctor health, Goose/Poolside YAML, release)
Source architecture: mcps/synapse/architecture.md
Last updated: 2026-07-01

## Roadmap Principles

- One HTTP sidecar owns writes + realtime; a stdio bridge gives universal host reach. Push accelerates; cursor pull is the correctness floor.
- 7 tools, self-describing via server `instructions` + descriptions + in-band hints. No ritual/handshake.
- Physical isolation; identity auto-derived, never gates writes. Compact/budgeted recall by default.
- Every task carries observable acceptance evidence; nothing depends on push.
- Distribution never clobbers a host's existing MCP config: agent-surface generates the files it owns and **merges** (read-modify-write) into shared/secret-bearing ones.

## Status Snapshot

- **Done**: Phase 0 (spike + contract + model + namespace), Phase 1 (sidecar/bridge/store/identity/memory/locks/realtime/instructions), Phase 2 (autostart + launchd, security pass, threat-model README, first-party distribution, **concurrency + crash recovery**), Phase 3 (**non-destructive MCP merge engine** + flip of all 11 manual hosts to generated-merge; agentmemory opt-in policy reconciled), Phase 4 (**dirty-bit coalescing**, **bridge MCP-roots routing**, SSE-resume + idle-shutdown claims truth-stated). Proof: synapse `npm test` 29/29; repo `npm run check` + `npm test` green.
- **Remaining (Phase 5 — production-readiness)**: ship the wiring/docs (P5.1); recorded per-host live transport smoke across the 17 generated hosts (P5.2 / T2.5); CI gate (P5.4); `doctor` sidecar health (P5.5); Linux always-on story (P5.6); release + CHANGELOG (P5.7). **P3.4 pending-target wiring is done**: 17 generated MCP hosts (VSCodium/Grok/Antigravity CLI + Goose/Poolside YAML added); Antigravity-legacy/Copilot/Pi no modeled MCP.

## Phase 0–1: Core (DONE)

- [x] `P0.1` Spike S-01 — realtime push + bridge-forward + cursor floor. Evidence: `test/sidecar.test.ts` "S-01 …", `test/bridge.test.ts` "forwards realtime resources/updated".
- [x] `P0.2`–`P0.4` Contract / model / namespace — `src/contract.ts` (7 tools, `instructions`, DTOs), `src/model.ts` + `schema.sql` (no scope/kind column), `src/namespace.ts` (git-root realpath hash). Evidence: `tsc` clean; store tests.
- [x] `P1.1` Sidecar transport — Streamable HTTP 127.0.0.1, sessions, bearer, DNS-rebind/Origin, SDK `>=1.24.0 <2`. Evidence: sidecar tests (bearer/init/isolation).
- [x] `P1.2` stdio bridge — proxy JSON-RPC + forward `resources/updated`/`list_changed`. Evidence: bridge proxy + forward test.
- [x] `P1.3`–`P1.6` Store, identity, `memory_*`, `lock_*` — single-owner WAL, FTS5/bm25, budgeted recall, atomic lock reap+claim. Evidence: 13 store tests incl. F001/F004.
- [x] `P1.7` Realtime + cursor floor — commit hook → dirty-bit; `recall({since})`/`lock_list` floor. Evidence: S-01 + `since`-cursor tests.
- [x] `P1.8` `instructions` + tool descriptions (≥3 sentences, "untrusted data"). Evidence: `SERVER_INSTRUCTIONS` + `TOOL_DESCRIPTIONS` in `src/contract.ts`.

## Phase 2: Hardening + owned-file distribution

- [x] `T2.1` Lifecycle autostart — `src/bootstrap.ts` lock-elected spawn + discovery/token (mode 600); `deploy/launchd/local.synapse.plist` deployed/restarted by `install.sh`. Evidence: bridge "zero-config autostart" test; `sh -n install.sh`.
- [x] `T2.3` Security pass — bearer/Origin, ingest redaction, `forget` plaintext scrub (F004), 2 MB body cap → 413 (F005), mode-600 files (F007). Evidence: F002/F004/F005 + redaction tests.
- [x] `T2.4` Threat model + README. Evidence: `README.md` Security section.
- [x] `T2.6` Distribution (owned-file targets) — first-party `synapse` registry entry; `optional-services.schema.json` first-party path; renders stdio `synapse-bridge` into droid (`.factory/mcp.json`, default) + deepagents (`--category mcps`); `npm run install:synapse` builds+links bins and deploys/updates the launchd sidecar. Evidence: `check generated: ok`; droid `mcp.json` assertion in `tests/agent-surface.test.mjs`.
- [x] `T2.2` Concurrency + crash recovery
  - Files: `test/recovery.test.ts`.
  - Scope: many concurrent sessions; kill sidecar mid-write (SIGKILL); restart; assert no lost committed writes and recovery to last committed row (WAL).
  - Acceptance evidence: `T2.2: kill mid-session then restart recovers all committed rows and last id` + `T2.2: concurrent writes from many sessions all persist across a hard crash` (synapse `npm test` 29/29).
  - Dependencies: none.
- [x] `T2.5` Per-target transport smoke (runbook)
  - Files: `test/smoke/README.md`.
  - Scope: launch `synapse-bridge` under each registered host; confirm tools/list + a remember/recall round-trip + push arrives.
  - Acceptance evidence: runbook landed with the per-host check procedure and a host matrix; config-merge proven for all 13 hosts via `tests/agent-surface.test.mjs`; in-process transport proven by `test/bridge.test.ts`; **live per-host passes are recorded in the matrix as they are run** (droid/deepagents wired via in-process bridge test; others config-verified, transport-pending).
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
  - Files: `scripts/agent-surface.mjs` (`mcpConfigMerge`, `mergeJsonMcpConfig`, `mergeCodexMcpToml`, `mergeJsoncRootObjectProperty`), `scripts/agent-surface/jsonc.mjs`, `registry/target-capabilities.json`.
  - Scope: read-modify-write helpers per config format — JSON `mcpServers`, TOML `mcp_servers` (Codex), JSONC `mcp` (Kilo/OpenCode), nested settings (`gemini settings.json`, Zed `context_servers`, VS Code `servers`), Claude Code (`~/.claude.json` / project `.mcp.json`). Merge adds/updates only the `synapse` key; preserves all other entries and comments where the format requires.
  - Acceptance evidence: `tests/agent-surface.test.mjs` non-destructive merge loop for all 11 manual hosts (claude-code, cline, gemini-cli, kilo, opencode, trae, vscode, windsurf, zed) + explicit cursor/codex merge tests; idempotent re-merge is a no-op diff.
  - Dependencies: T2.6.
- [x] `P3.2` Flip manual MCP targets to generated-merge
  - Files: `scripts/agent-surface.mjs` (per-target `mcpConfig` adapter), `registry/target-capabilities.json` (`mcp.generation: "generated"`), `tests/agent-surface.test.mjs`.
  - Scope: Cursor, Codex, Gemini CLI, Cline, Kilo, OpenCode, VS Code, Trae, Windsurf, Zed, Claude Code — emit/merge the `synapse` stdio entry.
  - Acceptance evidence: `check generated` asserts `synapse` present per target; synapse wired into all 13 hosts asserted in `tests/agent-surface.test.mjs` (lines ~484-500); non-destructive merge tests expect a merge, not a skip.
  - Dependencies: P3.1.
- [x] `P3.3` Reconcile `agentmemory` default vs opt-in
  - Files: `scripts/agent-surface.mjs` (`selectedMcpServiceEntries` filters to `first_party === true` unless `--service` is explicit), `tests/agent-surface.test.mjs`, `registry/optional-services.json`.
  - Scope: external/secret-bearing MCPs (agentmemory) are **opt-in** via `--category mcps --service <id>`; only first-party secretless MCPs (synapse) are default-on. This matches the README.
  - Acceptance evidence: `tests/agent-surface.test.mjs` asserts `agentmemory` absent from droid default `mcp.json` while `synapse` present; merge tests assert `agentmemory` never auto-added. Decision: **opt-in** (resolved — the prior "default-on for droid" note was stale; code already excluded it).
  - Dependencies: none.
- [x] `P3.4` Pending-target research/wiring
  - Scope: research each previously-unwired host's MCP surface and either wire it (generated-merge) or record an evidence-backed reason it stays out.
  - Outcome: **VSCodium** (`mcp.json` servers), **Grok Build** (`.grok/settings.json` mcpServers), **Antigravity CLI** (plugin `mcp_config.json` mcpServers) → `generated` (JSON, safe merge). **Goose** (`config.yaml` extensions, user-scope) + **Poolside** (`settings.yaml` mcp_servers) → `generated` via the new non-destructive YAML block-merge (`mergeYamlMcpConfig`). **Antigravity (legacy)** / **Copilot** / **Pi** → no modeled MCP surface (legacy→use CLI; Copilot MCP is host-editor-owned; Pi has no verified stdio MCP config).
  - Acceptance evidence: `registry/target-capabilities.json` `surfaces.mcp` records generated/none per target with reasons; `check generated` + `tests/agent-surface.test.mjs` cover the new generated targets. **17 generated MCP hosts total.**
  - Dependencies: P3.1.

## Phase 4: Robustness + doc reconciliation

- [x] `P4.1` SSE resumability — the architecture truth-states this: stream-level `Last-Event-ID` resume is **not wired** (no event store); the correctness floor is reconnect + cursor re-pull (`recall({since})`). No doc claims stream resume. Acceptance: the doc no longer claims stream resume (architecture.md lines ~103, ~130).
- [x] `P4.2` Dirty-bit coalescing — added a leading+trailing-edge per-channel coalescer in `src/sidecar.ts` (`NotificationCoalescer`, default 50ms window) so a burst of writes collapses to ≤2 notifications. Acceptance: `test/coalescing.test.ts` — a 20-write burst produces ≤2 notifications and all 20 rows stay cursor-retrievable; spaced writes each notify (no over-coalescing).
- [x] `P4.3` Bridge MCP-roots routing — `src/bridge.ts` resolves the project key as `SYNAPSE_PROJECT` → host's first MCP root (`file://` URI) → cwd git-root, so hosts that launch the bridge outside the workspace still isolate. Acceptance: `test/roots-routing.test.ts` — a roots-provided workspace routes to the right DB without cwd reliance; override wins; no-roots host falls back to cwd.
- [x] `P4.4` Doc/code drift sweep — `architecture.md`/`README.md`/`roadmap.md` truth-stated against the code; every IMPLEMENTED claim maps to a named test (synapse 29/29; repo check+test green). The three prior drift claims (SSE resume, dirty-bit rate-limit, idle-shutdown) are reconciled: SSE resume = not wired (stated); dirty-bit = coalesced now (was best-effort, never "rate-limited"); idle-shutdown = the sidecar stays resident (no idle-shutdown; `architecture.md` Operations states this).

## Phase 5: Production-readiness (remaining)

The honest blockers before an unqualified "production-ready" claim. Items marked **(shared)** are tracked in `mcps/grimoire/roadmap.md` too — they cover the agent-surface MCP plumbing both services ride.

- [ ] `P5.1` **(shared)** Ship the distribution work — branch + commit + PR + merge: the new MCP-target wiring (VSCodium / Grok Build / Antigravity CLI, P3.4), the honest capability matrix, and the docs. Acceptance: merged to `main`; `check` + `test` green on the tip.
- [ ] `P5.2` Per-host live transport smoke — the recorded operator passes for `T2.5` / the Cross-Phase "Per-target smoke passed" gate: launch `synapse-bridge` under each of the 17 generated MCP hosts and record a `tools/list` + remember→recall round-trip + realtime push pass. **Especially the 3 just-added formats** (VSCodium / Grok / Antigravity CLI) — proven written, not yet proven loaded by the real tool.
- [x] `P5.3` **(shared)** Goose + Poolside MCP — **done**: safe non-destructive YAML block-merge added (`mergeYamlMcpConfig`); both flipped to `generated` (17 total). Preserves keys/comments/siblings, idempotent, refuses tabs/flow-style rather than corrupt.
- [ ] `P5.4` **(shared)** CI gate — CI runs the `mcps/synapse` suite (29 tests) + `npm audit` on every PR. Acceptance: green CI workflow.
- [ ] `P5.5` `agent-surface doctor` sidecar health — assert `synapse-bridge`/`synapse-sidecar` are linked, the launchd job (macOS) is up or the lazy-start path is healthy, `~/.synapse/{token,sidecar.json}` exist (mode 600), and `GET /health` returns ok; assert synapse is wired in host configs. Acceptance: `doctor` flags a down/unwired synapse.
- [ ] `P5.6` Linux always-on service — promote the `Later` systemd unit to a deliverable if a Linux host needs always-on; otherwise document lazy-start (bridge autostarts the sidecar) as the supported Linux mode. Acceptance: a systemd unit + install path, or a stated lazy-start support note.
- [ ] `P5.7` **(shared)** Release — cut `synapse 0.4` with a `CHANGELOG`; tag. Clear `NODE_TLS_REJECT_UNAUTHORIZED=0` from the release shell. Acceptance: tagged release + notes.

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
- [x] Merge never clobbers — `tests/agent-surface.test.mjs` non-destructive merge loop for all 11 manual hosts + cursor/codex explicit merge tests (P3.1 done).
- [ ] Per-target smoke passed — config-merge proven for all 13 hosts; live per-host transport smoke recorded in `test/smoke/README.md` as it is run (T2.5 runbook landed; droid/deepagents wired via in-process bridge test, others config-verified).
