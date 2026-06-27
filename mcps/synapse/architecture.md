# Architecture

## Status

Status: PROPOSED
Source concept: mcps/synapse/concept-zero.md
Last updated: 2026-06-26

## Executive Decision

`synapse` is a single, local-first MCP server (TypeScript, official `@modelcontextprotocol/sdk` pinned `<2`, `node:sqlite` in WAL) whose **system of record is one append-only `events` table** in a per-namespace SQLite file. `bus_*` (coordination) and `memory_*` (shared memory) tools are thin handlers that append events and read **synchronously-maintained projection tables** (FTS5 for recall, plus `reservations` and `presence`) updated inside the same write transaction. The decisive architectural fact: **v0.1 stdio transport is one-process-per-client**, so several agents run several `synapse` processes over one shared WAL file — cross-process realtime therefore comes from **polling the event-log offset, accelerated by an `fs.watch` tick-file wake**, not from an in-process SQLite update hook. Each server then emits MCP `notifications/resources/updated` to its own client. Security is structural: process isolation + per-agent identity from env, provenance on every row, private-by-default scopes, secret redaction on ingest, and stored content rendered as quoted data never as instructions. Deliberately excluded: HTTP/auth surface (deferred to v0.2), network mesh, embeddings/graph, web viewer.

## Source and Evidence Inventory

| Source | Status | Used for | Notes |
|---|---|---|---|
| `mcps/synapse/concept-zero.md` | current | concept HLD (source of truth) | Candidate C selected; G/N/C/Q IDs reused here |
| `mcps/synapse/architecture.md` | absent → this doc | prior decisions | first version |
| `mcps/synapse/roadmap.md` | absent → companion | execution plan | written alongside |
| root `package.json` | `VERIFIED_EXISTING` | repo is Node/ESM config-distribution tool (ajv, `.mjs`, node>=18); no root TS build | `synapse` is a self-contained TS subproject, own `package.json`/`tsconfig` |
| `scripts/agent-surface.mjs`, `registry/optional-services.json` | `VERIFIED_EXISTING` | MCP distribution path | MCPs ship as optional-services → adapters render per-host `.mcp.json` pointing at a command (e.g. `~/.local/bin/agentmemory-mcp`) |
| `external/agentmemory` @ v0.9.27 | `VERIFIED_EXISTING` | prior art / anti-pattern | rejected as base (concept E-01..E-03) |
| MCP spec 2025-11-25; `node:sqlite`, SQLite WAL/FTS5 docs | `ADOPTED` | transport, storage | concept E-06..E-09 |

## Requirements Traceability

| ID | Requirement | Architecture response | Verification / gate |
|---|---|---|---|
| G-01 | Real-time messages + topic pub/sub | `events` append + `bus_publish`/`bus_subscribe`/`bus_messages`; cross-process poll+fswatch → `notifications/resources/updated` | Q-01 latency test |
| G-02 | Reservations, task claims, presence | `reservations` + `presence` projections, atomic over `events` | Q-02 concurrency test |
| G-03 | Shared memory: provenance+scope, hybrid recall, no blind delete | `memory_remember`/`memory_recall` (FTS5/BM25) / `memory_supersede` (bi-temporal) | recall + supersede tests |
| G-04 | Secure by default | stdio/process isolation, env identity, provenance rows, redaction, data-as-data | Q-03, Q-04 tests |
| G-05 | Minimal, one server, one file | single process, one SQLite file, deps = SDK + node:sqlite + zod | dependency audit |
| C-01 | Same-host SQLite-WAL | per-namespace file; no NFS; `busy_timeout` | Q-02, Q-05 |
| C-02 | Stored content is untrusted data | typed/quoted rendering; static tool descriptions | Q-03 |
| C-03 | No remote exec / `curl \| sh` / 0.0.0.0 | none in design; stdio only in v0.1 | review |
| N-01..N-04 | No cross-vendor discovery / mesh / CRDT / providers / viewer | out of scope; not built | scope guard |
| Q-01..Q-05 | notify latency, concurrent-append integrity, poison-render, redaction, crash recovery | see Quality Scenarios | Phase-1 gates |

## System Context

```text
 agent A ─stdio─▶ synapse proc A ┐
 agent B ─stdio─▶ synapse proc B ┼─▶ one SQLite-WAL file  (per namespace)
 agent C ─stdio─▶ synapse proc C ┘        events (SoR)
                                          ├─ FTS5(memory)  ─ projection
   each proc: poll offset + fs.watch      ├─ reservations  ─ projection
   tick → notifications/resources/updated └─ presence      ─ projection
   to ITS OWN client
 operator ─▶ reads the SQLite file / event log directly (audit)
```

Trust boundary: the local user's machine. Each `synapse` process trusts only its launching agent's identity (env) and treats all *stored* content as untrusted. No network listener in v0.1.

## Selected Architecture

**Candidate B — event log + synchronous SQLite projections, multi-process over one WAL file.**

Components (all in one TS package, one process per client):

| Component | Responsibility |
|---|---|
| `transport` | MCP stdio server via official SDK; registers tools + the subscribable resource(s); emits `notifications/resources/updated` |
| `identity` | Resolve `agent_id` (env `SYNAPSE_AGENT_ID`, else MCP client info, else error for writes) and `namespace` (env `SYNAPSE_NAMESPACE`, else project-root hash); resolve DB path |
| `store` | `node:sqlite` (WAL, `busy_timeout`, `synchronous=NORMAL`); one `appendEvent()` that writes the event row **and** updates affected projections in a single transaction |
| `projections` | `events` (SoR) → `memory_fts` (FTS5), `reservations`, `presence`; rebuildable by replaying `events` |
| `watcher` | Poll `events.id > lastSeen` on an interval; bump/watch a per-namespace tick-file (`fs.watch`) to wake immediately on another process's write; push `notifications/resources/updated` |
| `tools.bus_*` / `tools.memory_*` | Zod-validated handlers; thin over `store` + `projections` |
| `safety` | Ingest redaction; data-as-data rendering; scope/identity enforcement |

Data flow (write): tool handler → validate (zod) → `store.appendEvent` (txn: insert event + update projection + bump tick-file) → return. (read): tool handler → query projection (bounded) → render as typed data. (realtime): `watcher` detects new `events.id` (own or other process) → emits resource-updated → client may re-read via `bus_messages`/`memory_recall` with a cursor.

Deployment: `npm run build` in `mcps/synapse/` → bundled `dist/synapse-mcp.mjs`; later registered in `registry/optional-services.json` (kind `mcp`, command = the built entrypoint) so existing adapters generate per-host `.mcp.json`.

## Data and State

- **System of record:** `events(id INTEGER PK AUTOINCREMENT, ts INTEGER, agent_id TEXT, kind TEXT, topic TEXT, scope TEXT, payload JSON, supersedes INTEGER NULL)`. Total order = `id`. Append-only; corrections/deletes are tombstone events, not row deletes.
- **Projections (derived, rebuildable):** `memory_fts` (FTS5 over memory content + metadata), `reservations(resource_glob, agent_id, expires_at, event_id)`, `presence(agent_id, last_seen, caps)`. Each is updated in the same txn as its source event; all can be dropped and replayed from `events`.
- **Scopes (v0.1):** `private` (default, `agent_id`-bound) / `shared`; enforced on every read. `group:<id>` is reserved for a future version and is not an accepted input.
- **Retention / forgetting:** v0.2 `memory_forget` scores importance×recency×frequency and writes tombstones; `events` may be compacted later behind an explicit op (not v0.1).
- **Consistency:** single-writer per file (WAL); cross-process writes serialized by SQLite with `busy_timeout`; readers get snapshot isolation. Crash → recover to last committed event (WAL durability); projections re-derived on boot if a checksum/version mismatch is detected.
- **Privacy:** secrets redacted before persist; no transcript auto-capture; file is user-local (`~/.synapse/<namespace>.sqlite`, mode 600).

## Technology Decisions

| Area | Decision | State | Rationale | Alternatives rejected |
|---|---|---|---|---|
| Language | TypeScript | `ADOPTED` (USER_DECISION) | Matches repo Node toolchain | Python/FastMCP (rejected at review) |
| MCP SDK | `@modelcontextprotocol/sdk` pinned `<2` | `ADOPTED` | Official, MIT, stdio+resources+notifications | hand-rolled JSON-RPC |
| Storage | `node:sqlite`, WAL, `busy_timeout`, `synchronous=NORMAL` | `ADOPTED` | Synchronous API simplifies txns; one file; cross-process WAL | node:sqlite (newer, less proven for WAL multi-proc); async drivers |
| Validation | `zod` | `PROPOSED` | Ergonomic strict schemas (`.strict()`, size caps) for tool inputs | Ajv (repo root uses it, but zod is the MCP-TS norm) |
| Persistence model | event log + synchronous projections | `PROPOSED` | SoR + fast bounded reads; rebuildable | pure compute-on-read; separate domain tables w/ secondary audit |
| Realtime (v0.1, stdio multi-proc) | poll offset + `fs.watch` tick-file → `notifications/resources/updated` | `SPIKE_REQUIRED` (S-01) | In-proc `update_hook` can't see other processes' writes | broker (NATS/Redis) — over-built for one host |
| Transport | stdio only (v0.1) | `ADOPTED` | One client/process, OS isolation, no auth needed | Streamable HTTP (v0.2, behind auth) |
| Tool naming | underscores (`bus_publish`) | `ADOPTED` | Portable across host adapters | dotted names (host-dependent) |
| Identity | env `SYNAPSE_AGENT_ID` / namespace resolver | `PROPOSED` | No god-token; per-process trust | shared bearer (no, footgun) |

## Open Source / Service Adoption

| Capability | Adopt / adapt / build | Selected route | Evidence | Risk |
|---|---|---|---|---|
| MCP protocol | adopt | official TS SDK `<2` | concept E-08/E-09 | SDK v2 churn → pinned, re-check |
| Local store | adopt | SQLite via node:sqlite | concept E-07 | built-in, no native build; importable without flag from Node >=22.17.0 (ExperimentalWarning on 22.x; stable on 24+) |
| Hybrid recall (later) | adopt | `sqlite-vec` (v0.2) | concept E-10 | pre-1.0; behind adapter |
| Reservation pattern | adapt | MCP Agent Mail (advisory locks) | concept E-09 | advisory only — documented |
| Memory conflict model | adapt | Zep/Graphiti bi-temporal invalidate | concept E-10 | more rows; compaction later |
| Namespace resolver, status/heartbeat/export | adapt | folded in from former `agent-sync` concept (now removed) | cross-review | converged (checkpoint deferred to Later) |
| Event log + projections core | build | this design | concept E-06 | small, ours |

## Quality Scenarios and Fitness Gates

| Scenario | Architecture mechanism | Evidence to collect | Gate |
|---|---|---|---|
| Q-01 publish → subscriber notified | poll+fswatch wake → resource-updated | measured p50/p95 cross-process latency at default interval | < ~300 ms p95 (revisit if S-01 says otherwise) |
| Q-02 N agents append concurrently | WAL single-writer + `busy_timeout`; txn projections | integrity test: M writes from K processes, 0 lost, total order intact, no corruption | pass |
| Q-03 poisoned record fetched | data-as-data render; static tool descriptions | test: stored injection string never surfaces as instruction/description; carries provenance | pass |
| Q-04 secret in ingest | redaction before persist | unit tests over `Bearer`/`sk-proj-`/`sk-ant-`/`gh[pus]_`/`glpat` + custom | pass; floor = agentmemory v0.9.27 set |
| Q-05 crash mid-write | WAL durability; projection rebuild on version mismatch | kill-during-write test → recover to last committed event; projections consistent | pass |

## Security, Privacy, and Compliance

- **Assets:** shared memory + message log (may contain project context); agent identities.
- **Trust boundary:** local machine; each process trusts its launching agent only.
- **AuthZ:** scope checks on every read; cross-identity access on `private`/`group` rejected. No god-token. v0.1 needs no network auth (stdio). v0.2 HTTP adds bearer + Host validation + per-request identity binding (MCP best practices).
- **Poisoning (primary risk, concept E-05):** stored content is rendered as typed/quoted data; tool descriptions are static and never interpolate stored data; every record carries authenticated writer id + ts; private-by-default limits blast radius.
- **Secrets:** redaction on `memory_remember` ingest; no auto-capture; DB file mode 600.
- **Dependency risk:** 3 runtime deps; pin SDK `<2`; CI audit; prefer prebuilt node:sqlite binaries.
- **Auditability:** append-only `events` is the human-readable audit trail; tombstones, never silent deletes.
- **Abuse cases handled:** fake-identity write (env-bound id + provenance), lock starvation (TTL expiry), oversized payload (size caps), replayed/poisoned recall (scope + provenance + data-as-data).

## Operations

- **Deploy:** build to `dist/`; register as optional-service; adapters emit per-host MCP config. No daemon, no ports (v0.1).
- **Config:** env — `SYNAPSE_AGENT_ID`, `SYNAPSE_NAMESPACE`, `SYNAPSE_DB_DIR`, `SYNAPSE_POLL_MS`, `SYNAPSE_STREAMS`(future).
- **Observability:** structured logs to stderr only (never stdout — stdio transport owns stdout); `synapse_status` tool reports namespace, db path, counts, latest offset, active agents.
- **Backup/restore:** copy the SQLite file; restore = drop file back. Projection rebuild on boot.
- **Rollback:** versioned schema; projections rebuildable; events immutable.
- **Cost:** local disk only; no external calls in core.

## Risks, Debt, and Revisit Triggers

| Item | Impact | Trigger | Owner / next proof |
|---|---|---|---|
| Cross-process realtime is poll-based | latency floor at poll interval | S-01 shows fswatch unreliable on a target OS | Phase-0 spike; fallback = lower interval |
| stdio multi-process write contention | `SQLITE_BUSY` under many writers | >~dozen concurrent agents | Q-02 benchmark; then consider single HTTP server |
| node:sqlite availability / experimental | startup failure on old Node; warning noise on 22.x | Node <22.17 (import fails) or 22.x ExperimentalWarning | engine floor `>=22.17.0`; prefer Node 24+ in prod |
| ~~Two concept docs~~ | resolved | — | converged; `mcp/agent-sync/` removed |
| BM25-only recall (v0.1) | weak semantic recall | measured recall failures | v0.2 sqlite-vec hybrid |
| SDK v2 / spec change | breakage | SDK 2.x release | pinned `<2`; re-check at impl |

## ADR Index

| Decision | Status | Section |
|---|---|---|
| ADR-01 Single MCP, two tool families over one event log | accepted | concept Candidate C / Selected Architecture |
| ADR-02 Event log as SoR + synchronous projections | accepted | Data and State |
| ADR-03 TypeScript + official SDK `<2` + node:sqlite | accepted (USER_DECISION) | Technology Decisions |
| ADR-04 v0.1 stdio-only; HTTP+auth deferred to v0.2 | accepted | Technology Decisions |
| ADR-05 Cross-process realtime via poll + fswatch (not in-proc hook) | proposed, `SPIKE_REQUIRED` S-01 | Realtime / Risks |
| ADR-06 No god-token; per-process env identity + provenance | accepted | Security |
