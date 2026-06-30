# Architecture

## Status

Status: IMPLEMENTED (v0.4 core + distribution + robustness — HTTP sidecar + stdio bridge, realtime with coalescing, budgeted recall, autostart, non-destructive MCP merge into all 13 hosts, crash recovery, bridge roots routing). Remaining: live per-host transport smoke (T2.5 runbook) and pending-target wiring (P3.4). See [roadmap.md](roadmap.md).
Source concept: mcps/synapse/concept-zero.md (HISTORICAL; this doc is the source of truth)
Last updated: 2026-06-30

## Executive Decision

`synapse` is **one local sidecar** (TypeScript, `@modelcontextprotocol/sdk` `>=1.24.0 <2`, `node:sqlite` WAL) that is the **sole owner/writer** of per-project + global SQLite stores and the realtime hub for **many concurrent agent sessions**. It speaks **Streamable HTTP on 127.0.0.1** (bearer + Origin/Host validation). Because stdio is the only *universally* supported MCP transport, clients connect through a **thin stdio bridge** that autostarts the sidecar, proxies JSON-RPC to it, and forwards server notifications back over stdout; HTTP-native hosts may hit the sidecar URL directly. Realtime is native: an in-process `commit_hook` pushes MCP `notifications/resources/updated` (a **dirty-bit**) to subscribed sessions — **no watcher, no poll, no topic bus, no handshake**. Push is an accelerator; the **correctness floor is cursor pull**: `memory_recall({since})` + `lock_list`. Surface = **7 tools** (`memory_remember`/`recall`/`get`/`forget`, `lock_acquire`/`release`/`list`); `memory_recall` returns **compact, budgeted** results by default with `memory_get({ids})` for full records. Usage is taught via the server **`instructions` field** + rich tool/arg descriptions + **in-band result hints**. Isolation is **physical** (file per canonical git-root hash + opt-in global file; explicit cross-project read) — there is **no `scope`/visibility column**. Single owner removes the cold-start/WAL-contention class. **Distribution**: a first-party `agent-surface` registry entry renders the stdio `synapse-bridge` into the MCP configs agent-surface *owns* (droid, deepagents) and **non-destructively merges** into the 11 secret-bearing manual-MCP hosts (Cursor/Codex/Gemini/Cline/Kilo/OpenCode/VS Code/Trae/Windsurf/Zed/Claude Code) so synapse never clobbers a user's own servers; `install.sh` (`npm run install:synapse`) builds + links the bins and deploys/updates the always-on launchd sidecar. **Realtime** notifications are coalesced (leading+trailing edge) to bound burst-write churn; **crash recovery** is proven (SIGKILL→restart→WAL durable to last committed id); the **bridge** resolves the project from roots→env→cwd so out-of-workspace launches still isolate. Status: **IMPLEMENTED** (29/29 package tests; repo `check`+`test` green); remaining: live per-host transport smoke (T2.5 runbook) and pending-target wiring (P3.4). Excluded: stdio-per-client ownership, watcher/poll, topic bus, presence/handshake, private visibility (deferred), `kind` enum.

## Source and Evidence Inventory

| Source | Status | Used for | Notes |
|---|---|---|---|
| `concept-zero.md` | HISTORICAL | problem framing + evidence (E-01..E-10) + security stance | mechanism specifics (bus/stdio/event-log) superseded by this doc |
| prior synapse impl + contract/model/tests/package files | `REMOVED` (git `8a761c5`) | reference only | re-create fresh in Phase 0 |
| MCP spec 2025-11-25 (+ draft / 2026-07-28 RC) | `ADOPTED` | transport + realtime | Streamable HTTP multi-session; stdio universal; `resources/subscribe`→`resources/updated` (optional, client support uneven); `instructions` reaches the model; RC → per-subscription streams + caching |
| `@modelcontextprotocol/sdk` GHSA-w48q-cv73-mx4w (DNS rebinding) | `ADOPTED` | security floor | pin **`>=1.24.0 <2`**, not just `<2` |
| node:sqlite, SQLite WAL/FTS5 | `ADOPTED` | storage | single owner ⇒ one writer; WAL for durability + operator reads |
| research 2026-06-28 (local-first sync, MCP realtime, agent ergonomics, MINJA) | evidence | design basis | SQLite has no cross-proc push → single-owner-pushes; `instructions` reaches model, resources don't; compact/progressive recall beats raw `limit`; budgeted recall counters poisoning/flooding |
| `external/agentmemory` v0.9.27, MCP Agent Mail | reference / patterns | ergonomics | tool-desc quality, `privacy.ts` redaction, smart-search compact shape, in-band lock hints |

## Requirements Traceability

| ID | Requirement | Architecture response | Verification / gate |
|---|---|---|---|
| G-01 | Concurrent agents share durable knowledge in real time | sidecar owner; write → commit hook → `resources/updated` dirty-bit; agent `recall({since})` the delta | A writes → B notified <1s; B pull-by-cursor returns it |
| G-02 | Prevent concurrent-edit collisions, live | `lock_acquire` atomic; conflict → `{heldBy,expiresAt,suggestion}`; release/auto-reap pushes dirty-bit | concurrent acquire → one winner; release notifies |
| G-03 | Conflict handling without loss | supersede via `memory_remember(supersedes)`; `memory_forget` redacts; append-only | superseded/redacted excluded from recall, kept for audit |
| G-04 | Secure by default | 127.0.0.1 + bearer + Origin/Host; SDK `>=1.24.0`; auto-identity+provenance; ingest redaction; data-as-data | bind/Origin/redaction/poison tests |
| G-05 | Minimal & self-describing | 7 tools; rich descriptions; server `instructions`; in-band hints | tool count == 7; `instructions` present; descriptions ≥3 sentences |
| G-06 | Realtime without watcher; correct without push | commit hook → dirty-bit; **cursor pull is the floor** (`recall({since})`+`lock_list`) | works with push DISABLED via cursor |
| G-07 | Context control (no flooding) | compact+budgeted `recall` default; `memory_get({ids})` for full | recall returns snippets+provenance under budget; full only on demand |
| C-01 | Single shared owner + universal client reach | HTTP sidecar (sole writer) + stdio bridge (universal); HTTP-direct optional | one process opens DBs; bridge works on a stdio-only host |
| C-02 | Default project isolation, explicit cross-project read | physical file per git-root hash; `recall(project:<ref>)` opens another file read-only | B absent by default, present when named |
| N-01..N-05 | No stdio-per-client ownership / watcher-poll / topic bus / handshake / `scope` column / `kind` enum | not built | scope guard |

## System Context

```text
 agent A (host) ─ stdio ─▶ synapse-bridge A ─┐
 agent B (host) ─ stdio ─▶ synapse-bridge B ─┼─ HTTP/SSE (127.0.0.1+bearer) ─▶ ┌──────────────────────────┐
 agent C (HTTP-native host) ── HTTP/SSE ──────┘                                  │ synapse-sidecar (1 proc) │
        ▲                                                                        │ sole owner + writer      │
        └─ resources/updated (dirty-bit) ◀── forwarded by bridge ◀── push ───────│  commit_hook → notify    │
           + cursor pull via tools (floor)                                       │  ~/.synapse/<hash>.sqlite │
                                                                                 │  ~/.synapse/global.sqlite │
 operator ─▶ reads .sqlite files directly (audit)                               └──────────────────────────┘
```

Trust boundary: the local machine (single user, cooperative concurrent agents). Sidecar authenticates by bearer, derives `agent_id` for provenance; all stored content is untrusted data.

## Selected Architecture

| Component | Responsibility |
|---|---|
| `sidecar` | Long-lived process; **sole** `node:sqlite` owner (WAL); Streamable HTTP on 127.0.0.1; N sessions; `commit_hook` → notifier; the realtime hub |
| `bridge` | Tiny stdio MCP server per client; autostarts + health-checks the sidecar; proxies JSON-RPC to sidecar HTTP; forwards `resources/updated` to host stdout. Resolves the project key from `SYNAPSE_PROJECT` → host's first MCP root (`file://`) → cwd git-root (P4.3), so out-of-workspace launches still isolate. Universal-compat entry. |
| `identity` | Per-session `agent_id`: `SYNAPSE_AGENT_ID` → MCP `clientInfo` → stable session id. Never throws; provenance only. |
| `namespace` | Project DB = hash(`git rev-parse --show-toplevel` realpath) → realpath cwd → `SYNAPSE_NAMESPACE`. Global DB fixed. |
| `store` | `memory`+FTS5, `locks`; monotonic cursor; atomic lock txn; redaction on ingest |
| `notifier` | commit → `resources/updated` dirty-bit to that namespace's subscribers (inline in `sidecar.onCommit`); **leading+trailing-edge coalescer** bounds burst-write notifications (P4.2); best-effort, cursor pull is the floor |
| `tools` | 7 tools; compact/budgeted recall; in-band hints |
| `instructions` | Server `InitializeResult.instructions` (≤~2KB) — the manual that reaches the model |
| `lifecycle` | **Default**: bridge first-client autostart (PID/token files mode 0600) + idle shutdown. **Optional**: `local.synapse` launchd agent for always-on. |

Data flow — **write**: auth+validate (zod, byte caps) → redact → append row in project (or global) DB → commit → commit-hook → push dirty-bit → return id+provenance. **recall**: FTS across project∪global (or named other project, read-only); `since` cursor is incremental for the **project** store only — the low-churn **global** store is always re-scanned (the returned `cursor` is the project MAX(id)), so clients dedupe already-seen global ids; **compact** projection (id, snippet, agentId, ts, tags, score, store) under `limit`/`maxBytes`; `mode:full` or `memory_get({ids})` for bodies. **realtime**: agent subscribes; on dirty-bit it `recall({since})`/`lock_list`; if the client ignores push, the same cursor pull at turn boundaries stays correct. **lock**: atomic reap→claim; conflict returns holder+suggestion.

## Source Tree and File Responsibilities

All `src/*` files are IMPLEMENTED (compiled by `tsc`, exercised by `test/*`). Dependency direction: `sidecar`/`bridge` → `tools` → `store` → `model` → `contract`; `contract` imports nothing runtime-bound.

```text
mcps/synapse/
  src/
    contract.ts   - FROZEN tool I/O, zod inputs (.describe), DTOs, LIMITS, SERVER_INSTRUCTIONS, IStore. Pure; imports no sqlite/http/fs. Invariant: 7 tools, no scope/kind field.
    model.ts      - Row entities + mappers + SCHEMA_SQL + external-id codec (global = BASE+rowid). Owns id encode/decode; no I/O.
    store.ts      - SOLE node:sqlite owner: per-project + global DBs (WAL), FTS5/bm25 recall, byte budget, atomic lock reap+claim, ingest redaction, onCommit(channel). Must not know HTTP/MCP. Verified by test/store.test.ts.
    tools.ts      - Transport-agnostic tool specs (tools/list) + validated dispatcher (tools/call); results are JSON-in-text (data, not instructions); lock denials carry hints.
    sidecar.ts    - ONE process: low-level MCP Server per session over Streamable HTTP (127.0.0.1 + bearer + DNS-rebind), resources/subscribe handling, onCommit → coalesced resources/updated fan-out (P4.2), 2 MB body cap. Verified by test/sidecar.test.ts + test/coalescing.test.ts + test/recovery.test.ts.
    bridge.ts     - Per-host stdio Server <-> upstream HTTP Client; proxies tools/resources; forwards resources/updated + list_changed downstream; autostarts the sidecar; resolves project key roots → SYNAPSE_PROJECT → cwd git-root (P4.3). Verified by test/bridge.test.ts + test/roots-routing.test.ts.
    bootstrap.ts  - Zero-config: discovery file + persistent token (mode 600) + lock-elected sidecar spawn + /health poll. Owns ~/.synapse file lifecycle.
    namespace.ts  - Canonical project key = git-root realpath hash (override -> git root -> cwd); fixed global path. Owns physical isolation routing.
    identity.ts   - Derive agent_id (env -> clientInfo -> session) for provenance; never throws.
    redactor.ts   - Secret regex floor (Bearer/sk-/gh_/glpat/...) applied on ingest.
    clock.ts      - SystemClock / FakeClock seam for deterministic tests.
  test/{store,sidecar,bridge,recovery,roots-routing,coalescing}.test.ts  - 29 tests: store invariants, forget-reason redaction, project-vs-global cursor; live-HTTP sidecar + S-01 realtime + oversized-body 413; bridge proxy/forward + autostart; kill→restart WAL recovery + concurrent writes; bridge roots routing; dirty-bit coalescing.
  test/smoke/README.md  - per-target transport smoke runbook (T2.5): host matrix + the live per-host check procedure.
  schema.sql            - Canonical DDL mirror of model.ts SCHEMA_SQL.
  install.sh            - Build + link bins; deploy/restart launchd sidecar (npm run install:synapse).
  deploy/launchd/local.synapse.plist  - Always-on sidecar service (RunAtLoad + KeepAlive).
```

Distribution lives in the parent repo, not here: `registry/optional-services.json` (first-party `synapse` entry), `schemas/optional-services.schema.json` (first-party path), and `scripts/agent-surface.mjs` (renders the stdio entry into owned-file targets and **non-destructively merges** into all 11 manual/secret-bearing hosts). The merge engine is IMPLEMENTED (roadmap P3).

## Data and State

- **`memory`** (append-only): `id (monotonic = cursor), ts, agent_id, content, tags(json), supersedes(id?), status(live|superseded|redacted)`. FTS5 over `content`+`tags`. **No `scope`/`kind` column** — project vs global is *which file*; classification is `tags`.
- **`locks`**: `glob PK, agent_id, acquired_at, expires_at`. TTL + lazy reap; atomic acquire.
- **Single writer** (the sidecar) → no cross-process WAL contention, no cold-start race. WAL for durability + operator reads.
- **Physical isolation**: project file (git-root hash) + global file, mode 600. Cross-project read = explicitly open another project's file, read-only; never implicit, no other-project writes. (Per-agent *private* visibility intentionally omitted; a future `visibility` column could add it without touching isolation.)
- **Recovery**: restart sidecar → recover to last committed WAL row; clients reconnect and cursor-re-pull (`recall({since})`). Stream-level `Last-Event-ID` resume is **not yet wired** (no event store) — roadmap P4.1.

## Technology Decisions

| Area | Decision | State | Rationale | Alternatives rejected |
|---|---|---|---|---|
| Topology | one HTTP sidecar (sole owner) + stdio bridge (universal client) | `IMPLEMENTED` (USER_DECISION) | shared owner needed for realtime; stdio bridge = universal host compat; HTTP-direct free for capable hosts | HTTP-only (brittle host support); stdio-per-client (no cross-notify) |
| Realtime | commit-hook → `resources/updated` dirty-bit; **cursor pull is the floor** | `IMPLEMENTED` | native MCP push; correctness never depends on push | watcher/poll (cut); `list_changed` as floor (wrong semantics); CRDT (overkill) |
| Recall | compact+budgeted default; `since` cursor; `memory_get({ids})` full | `IMPLEMENTED` | `limit` ≠ context control; counters flooding/poisoning | full-by-default (floods); separate `sync_changes` tool (fold into `recall`) |
| Storage | `node:sqlite` WAL single owner; `memory`+`locks`; no scope column | `IMPLEMENTED` | one writer = simple; physical isolation | logical scope column (agentmemory leak class) |
| Identity | auto-derive per session, never gate writes | `IMPLEMENTED` | zero ceremony | handshake/`IDENTITY_REQUIRED` |
| Usage delivery | server `instructions` + descriptions + in-band hints | `IMPLEMENTED` | reaches the model | guide resource (invisible to clients) |
| Auth / SDK | static bearer (local) + Origin/Host; SDK `>=1.24.0 <2` | `IMPLEMENTED` | spec-acceptable local; DNS-rebind advisory patched ≥1.24.0 | `<2` alone (vulnerable); full OAuth (overkill local) |
| Lifecycle | bridge autostart default; launchd always-on via `install.sh` | `IMPLEMENTED` | zero-setup default; always-on service | launchd-required (heavy default) |
| Distribution | first-party registry entry → stdio `synapse-bridge`; **generated** for owned files (droid, deepagents), **non-destructive merge** for manual/secret-bearing hosts (Cursor, Codex, Gemini, Cline, Kilo, OpenCode, VS Code, Trae, Windsurf, Zed, Claude Code) | `IMPLEMENTED` | reuse agent-surface render path; never bake a per-project secret/path into a global config | wholesale write into secret-bearing configs (clobbers user servers) |

## Quality Scenarios and Fitness Gates

| Scenario | Mechanism | Gate |
|---|---|---|
| A writes, B sees it live | commit hook → dirty-bit → B `recall({since})` | B notified <1s (push) AND B cursor-pull returns it (floor) |
| Push-ignoring client | cursor pull at turn boundary | coordination correct with push disabled |
| Recall doesn't flood | compact+budgeted default | result under `maxBytes`; full only via `memory_get` |
| Two agents lock same glob | atomic reap+claim | one winner; loser gets `{heldBy,expiresAt,suggestion}` |
| Project A vs B | separate files; explicit `project:` | B absent by default; present when named |
| Stdio-only host | bridge → sidecar | tools + push work through the bridge |
| Poisoned/secret record | redaction; quoted-data render | redaction suite; never surfaces as instruction |
| Crash / reconnect | append-only WAL + reconnect cursor re-pull | recover to last row (proven: `test/recovery.test.ts` kill→restart→max(id) intact); client re-pulls via `recall({since})` (stream `Last-Event-ID` resume = not wired, stated) |

## Security, Privacy, and Compliance

- Sidecar binds **127.0.0.1 only**; validate `Origin`/`Host` (DNS-rebinding); **static bearer** (token file mode 0600); SDK **`>=1.24.0`**; no token passthrough; OAuth deferred. Bridge↔sidecar over localhost with the same bearer.
- Identity auto-derived (provenance); `forget` works with derived identity; append-only = audit. Cooperative single-user trust.
- Secrets redacted on ingest (Bearer/sk-proj/sk-ant/gh[pus]_/glpat floor); no transcript auto-capture; DB + token files mode 600.
- Stored content rendered as quoted data, never instructions; static tool descriptions; strict zod (`additionalProperties:false`, UTF-8 byte caps); fail-open reads.

## Operations

- **Lifecycle**: the first client's bridge lock-elects and autostarts the sidecar (discovery + bearer token in `~/.synapse`, mode 0600); it stays resident (no idle-shutdown). `npm run install:synapse` additionally deploys the `local.synapse` launchd service (RunAtLoad + KeepAlive) and restarts it on every redistribute via bootout→bootstrap; the token + DBs persist.
- Config: `SYNAPSE_DB_DIR` (default `~/.synapse`), `SYNAPSE_PORT` (default 4319), `SYNAPSE_TOKEN`/`SYNAPSE_URL` (auto if unset); per-session `SYNAPSE_AGENT_ID`/`SYNAPSE_PROJECT`/`SYNAPSE_NAMESPACE`. `SYNAPSE_SKIP_SERVICE=1` installs bins only.
- Observability: sidecar stderr (launchd → `/tmp/local.synapse.{out,err}`); audit = read `.sqlite`. Backup = copy files. Cost: one small process + thin bridges.

## Risks, Debt, and Revisit Triggers

| Item | Impact | Trigger | Next proof |
|---|---|---|---|
| Client ignores `resources/updated` | no live push for that client | known-thin today | cursor pull floor (S-01 proven) |
| MCP merge clobbers a host's own servers/secrets | data loss in user config | resolved | per-format read-modify-write + idempotent-merge fixture test for all 11 manual hosts (`tests/agent-surface.test.mjs`) |
| Crash / many-session integrity unproven | possible lost write on kill | resolved | `test/recovery.test.ts` (SIGKILL mid-session → restart → all committed rows + max(id) intact; concurrent writes persist) |
| Notification flooding on burst writes | host churn | resolved | leading+trailing-edge coalescer (`test/coalescing.test.ts`: 20-write burst → ≤2 notifications) |
| Bridge cwd ≠ workspace | wrong project namespace | resolved | bridge roots routing (`test/roots-routing.test.ts`: roots → env → cwd) |
| 2026-07-28 RC (stateless, `subscriptions/listen`) | transport churn | RC ships | cache-friendly reads; pin SDK `>=1.24.0 <2` |
| Private visibility omitted | no agent-local scratch | a real need | additive `visibility` column later |

## ADR Index

| Decision | Status | Section |
|---|---|---|
| ADR-01 HTTP sidecar (sole owner) + stdio bridge (universal); HTTP-direct optional | accepted (USER_DECISION) | Topology |
| ADR-02 Realtime = commit-hook dirty-bit push; **cursor pull is the correctness floor** | accepted | Realtime |
| ADR-03 Compact+budgeted recall default + `memory_get({ids})`; `since` cursor folded into `recall` (no `sync_changes` tool) | accepted | Recall |
| ADR-04 Physical isolation only (git-root file + global); **no scope/visibility column**; explicit cross-project read | accepted | Data and State |
| ADR-05 Identity auto-derived per session; no handshake | accepted | Security |
| ADR-06 Usage via server `instructions` + descriptions + in-band hints | accepted | Selected |
| ADR-07 SDK `>=1.24.0 <2` (DNS-rebind); bearer + Origin/Host; bind 127.0.0.1 | accepted | Security |
| ADR-08 Lifecycle: bridge autostart default, launchd always-on via `install.sh` | accepted | Operations |
| ADR-09 (open) private visibility omitted per prior user decision; revisit if scratch needed | proposed | Data and State |
| ADR-10 Distribution: first-party registry entry (no submodule pin); **generated** for agent-surface-owned MCP files (droid, deepagents); **non-destructive merge** for manual/secret-bearing hosts (all 11); never bake a per-project path/secret into a global config (bridge derives project at runtime, roots → env → cwd) | accepted | Technology Decisions · roadmap P3 |
