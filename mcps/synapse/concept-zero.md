# Concept Zero — `synapse`

Status: PROPOSED
Last updated: 2026-06-26

> ⚠️ **HISTORICAL HLD — do NOT implement from the body below.** Source of truth is **[architecture.md](architecture.md) (v0.4)** + **[roadmap.md](roadmap.md)**. Keep this doc only for problem framing, the evidence ledger (E-01..E-10), and the security stance. Everything below about *mechanism* is superseded: the current design is **one HTTP sidecar (sole SQLite owner) + a stdio bridge**, realtime via `notifications/resources/updated` (dirty-bit) with **cursor pull as the correctness floor**, **7 tools** (`memory_remember/recall/get/forget`, `lock_acquire/release/list`) — NOT a stdio event-log "bus", NOT a watcher, NOT `bus_*`/offsets/presence.

## Executive Decision

Build **one** minimal, local-first MCP server — `synapse` — that lets a small set of LLM coding agents in a single orchestration **coordinate in real time** and **share memory**, over **one** SQLite (WAL) file on one host, with realtime push via the native MCP `notifications/resources/updated` channel and **no network mesh/federation**. Both concerns are projections of a single append-only event log, so they share one identity/provenance layer, one audit trail, and one security model — splitting them into two servers would double the attack surface and force double registration for zero benefit. We **reject** `agentmemory` as a base (109+ REST endpoints, P2P mesh, viewer, embedding providers — the opposite of minimal, and its mesh sync was its CVE class) and **reject** heavyweight memory engines (Graphiti/Cognee pull Neo4j/Kuzu/LanceDB). We **adapt** proven patterns: SQLite-WAL + MCP-notification realtime (MCP Agent Mail, official memory server), advisory file reservations (Agent Mail), bi-temporal invalidation for memory conflicts (Zep/Graphiti), and recency·importance·relevance scoring (Generative Agents). Deliberately **not** built: cross-vendor agent discovery (A2A/ANP/SLIM), CRDTs, vector DB in slice 1, multi-host federation, cloud, web viewer.

## Problem and Evidence

| ID | Claim | Evidence | Confidence | Impact |
|---|---|---|---|---|
| E-01 | `agentmemory` is over-built for "minimal" and still ships a P2P mesh sync surface. | Verified at **v0.9.27**: 128 REST endpoints (CHANGELOG "126 → 128"), `src/functions/mesh.ts` present; the mesh was advisory `04-mesh-unauth.md`'s CVE class (now auth'd, still surface we don't want). | high | Rejects it as base; informs our "no network mesh" decision. |
| E-02 | The 6 published findings are fixed; redaction (#06: `Bearer`/`sk-proj`/`sk-ant`) and local bind (#03: 127.0.0.1) confirmed patched at v0.9.27. **But cross-agent isolation is still being hardened release-by-release** — v0.9.27 fixed #817 where `AGENTMEMORY_AGENT_SCOPE=isolated` was NOT enforced on the BM25 `memory_recall` path (agent B could read agent A's memories). | `.github/security-advisories/01–06` ("Patched 0.8.2"); `src/functions/privacy.ts:7-10`; `iii-config.yaml` host 127.0.0.1; CHANGELOG `[0.9.27]` Security #817. | high | Those bugs are fixed, so the pin is safe to bump — but agentmemory's *multi-agent isolation*, exactly what we need, leaked as recently as v0.9.27. Reinforces reject-as-base + our provenance/scope-first design. |
| E-03 | agentmemory is built for single-agent longitudinal capture, not live multi-agent coordination. | `src/hooks/*` (capture pipeline), `package.json` description "Persistent memory for AI coding agents". | high | Doesn't fit "sync across agents in an orchestration." |
| E-04 | Memory and inter-agent comms are distinct problems with different consistency models, but the *same* minimal substrate (SQLite-WAL + MCP notifications) and *same* security model. | Research streams 2 & 3. | high | Justifies one server, two tool families over a shared event log. |
| E-05 | Shared multi-agent memory is a poisoning amplifier; attacks propagate and persist far worse than single-agent injection. | AgentPoison (arXiv:2407.12784, >80% ASR at <0.1% poison), MINJA (~95%), MemoryGraft; SSGM (arXiv:2603.11768). | high | Provenance + scope isolation + data-not-instructions are mandatory, not optional. |
| E-06 | For a few agents on one host, an append-only event log gives total order, replay, and crash recovery with no broker; the log offset *is* the consistency model. | AutoGen 0.4 actor model (2025-01); event-sourcing; research stream 2. | high | Eliminates concurrency reasoning and Kafka/NATS for slice 1. |
| E-07 | SQLite WAL = unlimited readers + exactly one writer, snapshot isolation, same-host only; optimal for a handful of agents. | sqlite.org/wal.html; research stream 3. | high | Storage substrate chosen; bounds it to single host (acceptable). |
| E-08 | MCP now defines OAuth 2.1 auth; token passthrough forbidden; stdio preferred for local single-client; HTTP must validate Host + bind localhost. | MCP spec 2025-11-25 authorization; security_best_practices. | high | Sets the auth/transport ladder (stdio default → bearer/unix-socket → OAuth only if networked). |
| E-09 | No existing MCP server is an adequate as-is adopt: official `server-memory` is stdio-only/JSONL/no-lock; Agent Mail has no auth ("trust the machine"); mcp-memory-service is heavy with a real CVE history. | Research stream 3 (npm/PyPI/GitHub). | high | Build a thin server; adapt their patterns, not their footprint. |
| E-10 | Literature consensus on "good" memory: tiered store → active extract/consolidate → temporal-aware update (invalidate, don't blind-overwrite) → importance-based forgetting → hybrid (vector+BM25+graph) retrieval → per-fact provenance + ACL. | CoALA (2309.02427), Zhang survey (2404.13501), Zep (2501.13956), Mem0, Du survey (2603.07670). | high | Defines the memory roadmap; slice 1 takes BM25 + provenance + invalidation, defers vector/graph. |

## Users and Stakeholders

| Actor | Need | Constraints | Success signal |
|---|---|---|---|
| Orchestrated coding agents (Claude Code, Cursor, etc.) | Publish/read messages, claim files/tasks, share + recall memory, see presence | One host or LAN; MCP-only interface; must not be hijacked by poisoned data | Agents avoid duplicate/conflicting edits; reuse each other's findings |
| Orchestrator / lead agent | Fan-out work, observe progress, prevent collisions | Low latency; total-ordered history | Coordinates N agents without a human merging state by hand |
| Developer / operator (single user) | Run it locally, audit what agents told each other, trust defaults | Minimal ops, secure-by-default, inspectable | Reads the audit log; no exposed ports; no secrets stored |
| Excluded | Cross-org/internet agent discovery; multi-tenant SaaS | Out of scope | — |

## Goals, Non-Goals, and Constraints

| ID | Type | Statement | Evidence |
|---|---|---|---|
| G-01 | goal | Real-time message passing + topic pub/sub between agents on one host. | E-04, E-06 |
| G-02 | goal | Coordination primitives: advisory file/resource reservations, task claims, presence. | E-09 (Agent Mail) |
| G-03 | goal | Shared memory: write with provenance+scope; hybrid recall; conflict handling that never blind-deletes. | E-05, E-10 |
| G-04 | goal | Secure by default: localhost/stdio, per-agent identity, provenance, data-never-instructions, secret redaction on ingest. | E-05, E-08 |
| G-05 | goal | Minimal: one server, one file, smallest sound dependency set, production-ready. | repo principles |
| N-01 | non-goal | Cross-vendor agent discovery / internet-scale identity (A2A/ANP/AGNTCY). | stream 2 |
| N-02 | non-goal | Network mesh/federation/P2P sync. | E-01 |
| N-03 | non-goal | CRDT concurrent document co-editing. | stream 2 |
| N-04 | non-goal | Embedded LLM providers, web viewer, marketing surface. | E-01 |
| C-01 | constraint | Same-host SQLite-WAL (no NFS, no multi-writer-across-hosts in slice 1). | E-07 |
| C-02 | constraint | All stored content treated as untrusted data, never as model instructions. | E-05 |
| C-03 | constraint | No remote code download/exec; no `curl \| sh`; no default 0.0.0.0 bind. | E-01, E-02 |

## Unacceptable Outcomes

| Outcome | Why it matters | Prevention / detection |
|---|---|---|
| Stored data executed as instructions (memory poisoning) | One compromised agent hijacks all readers; persists across sessions | Render records as quoted/typed data; static pinned tool descriptions; provenance on every record; private-by-default scope |
| Unauthenticated network exposure | Whole shared store readable/injectable by anyone on LAN (agentmemory's class) | stdio/unix-socket/localhost default; never 0.0.0.0; bearer/Host-validation if HTTP |
| Secret captured into the store | Tokens leak into shared memory + audit log | Redaction on ingest covering modern formats (`Bearer`, `sk-proj-`, `sk-ant-`, `ghp_`/`ghs_`/`ghu_`); agentmemory's #06 gaps are fixed at v0.9.27 — match that baseline as the floor, not the ceiling |
| Silent memory overwrite / loss | Conflicting facts destroy provenance and audit | Bi-temporal invalidation: supersede, never delete; append-only event log is source of truth |
| Cross-identity access | Agent reads/writes another's private scope | Per-agent least-privilege scopes; reject cross-identity; no god-token |

## Glossary

| Term | Meaning |
|---|---|
| Event | Append-only, totally-ordered record (message, memory write, lock, presence). The source of truth. |
| Topic | Named channel agents publish/subscribe to. |
| Scope | Visibility namespace for a memory/event: `private` (one agent) or `shared` (all) in v0.1; `group:<id>` reserved for a future version. |
| Reservation | Advisory lock on a file/resource glob with TTL, to prevent concurrent-edit collisions. |
| Provenance | Authenticated writer id + timestamp attached to every record. |
| Invalidation | Marking a memory fact superseded (bi-temporal) instead of deleting it. |

## Critical Journeys

| Journey | Current pain | Proposed experience | Evidence needed |
|---|---|---|---|
| Two agents edit the same file | Silent clobber / merge conflict | Agent A reserves `src/x.ts`; B sees reservation, picks other work | Reservation TTL ergonomics |
| Agent B reuses A's finding | B re-derives what A already learned | A `remember`s a fact (shared scope); B `recall`s it with provenance | Recall precision (BM25 slice 1) |
| Orchestrator tracks progress | Polls each agent / reads scattered logs | Subscribes to a topic; receives push notifications in order | Notification delivery semantics |
| Conflicting facts arrive | Newer blindly overwrites older | New fact supersedes old; both retained with timestamps | Conflict UX for agents |

## Quality Scenarios

| ID | Scenario | Measure | Later architecture gate |
|---|---|---|---|
| Q-01 | Agent publishes → subscriber notified | < 200 ms same-host (ASSUMPTION) | notification transport choice |
| Q-02 | 10 agents append concurrently | No lost writes; total order preserved; no corruption | WAL + serialized write queue; `busy_timeout` |
| Q-03 | Poisoned record fetched by reader | Never reaches model as instruction; flagged with provenance | data-rendering + schema tests |
| Q-04 | Secret in an ingested observation | Redacted before persist | redaction unit tests incl. modern token formats |
| Q-05 | Crash mid-write | Recover to last committed event; no partial state | WAL durability; append-only log |

## Research Landscape

| Capability | Candidate route | Evidence | Verdict |
|---|---|---|---|
| Base memory product | agentmemory | E-01–E-03 | REJECT (over-built; wrong shape) |
| Memory engine | Graphiti/Zep, Cognee | stream 1 | ADOPT only for memory-heavy product; too heavy here → borrow models |
| Memory engine (lib) | Mem0, Letta, A-MEM, LangMem | stream 1 | BUILD-AROUND / ADAPT algorithms; Mem0 reported to have an unauth delete CVE (UNVERIFIED — confirm against NVD/GHSA before relying on it) |
| Comms protocol | MCP / A2A / ANP / SLIM | stream 2 | MCP = per-agent tool layer (use); others = cross-org overkill (defer) |
| Coordination primitive | event log+pub/sub / blackboard / LangGraph / CRDT | E-06, stream 2 | ADOPT append-only event log + topic subscriptions |
| Existing comms MCP | Agent Mail, server-memory, mcp-memory-service | E-09 | ADAPT patterns; none adoptable as-is (auth/locking/footprint) |
| Storage | SQLite-WAL / Redis / NATS | E-07, stream 3 | ADOPT SQLite-WAL; broker only if we outgrow one host |
| Realtime | MCP notifications / broker | stream 3 | ADOPT MCP `notifications/resources/updated` (no broker) |

## Adopt / Adapt / Build Decisions

| Capability | Decision | Rationale | Risk |
|---|---|---|---|
| Server framework | ADOPT official MCP SDK (TS `@modelcontextprotocol/sdk` <2, matches repo's Node toolchain) | Maintained, MIT, auth helpers, Streamable HTTP + stdio | Anticipated SDK v2 / spec churn (date UNVERIFIED) → pin `<2` and re-check at implementation |
| Storage | BUILD on SQLite-WAL (`node:sqlite`, synchronous) | Single file, zero ops, snapshot isolation | Single-host only (accepted, C-01) |
| Event log + projections | BUILD (thin) | The core idea; small and ours | Must serialize writes (keyed mutex/queue) |
| Realtime | ADOPT MCP notifications | No broker, native | Subscription fan-out semantics to verify |
| File reservations | ADAPT Agent Mail pattern | Proven for coding agents | Advisory only (agents must honor) |
| Memory conflict | ADAPT Zep bi-temporal invalidation | Literature-endorsed; preserves provenance | More rows; pruning later |
| Memory ranking | ADAPT Generative Agents recency·importance·relevance + Mem0 ADD/UPDATE/NOOP operators | Simple, effective | Importance scoring heuristics |
| Recall | BUILD FTS5/BM25 (slice 1); ADD sqlite-vec hybrid (slice 2) | Minimal first; hybrid is best practice later | Vector quality deferred |
| Secret redaction | BUILD, matching agentmemory's v0.9.27 pattern set as the floor | Mandatory ingest control | Regex completeness — test-driven |
| Identity/auth | BUILD thin (stdio→process; HTTP→bearer+Host-validate+unix-socket); OAuth only if networked | MCP best practices ladder | Keep god-token out by design |

## Candidate Concepts

### Candidate A — Two separate MCP servers (memory MCP + comms MCP)

Clean separation of concerns. **Rejected:** doubles surface, duplicates identity/provenance/audit/auth, forces agents to register twice, and the two share the *same* substrate and *same* poisoning threat model (E-04, E-05). No evidence the concerns need independent deployment at this scale.

### Candidate B — Adopt agentmemory (patched) + add a sync layer

Reuse a mature store. **Rejected:** wrong shape (single-agent capture, E-03), massive surface (E-01), and the only thing missing — cross-agent sync — is exactly the part (mesh) that was its worst CVE class (E-01). Adding sync re-creates the danger.

### Candidate C — One `synapse` server: shared event log → {comms projection, memory projection} (SELECTED)

One SQLite-WAL file; append-only `events` table is source of truth; `bus_*` tools project messages/topics/reservations/presence, `memory_*` tools project consolidated facts with provenance/scope/invalidation; realtime via MCP notifications; secure-by-default transport ladder. Minimal, unified, covers both goals, eliminates the mesh class entirely (sync = shared local store, not P2P). (Tool names use underscores, not dots — portable across Claude/Codex/Kilo host adapters.)

## Adversarial Review

| Finding | Revision |
|---|---|
| "One server couples two concerns" | They share substrate + security model; tool namespaces keep APIs clean; event log decouples internally. Coupling is in deployment only, which is the point (one thing to secure). |
| "SQLite single-writer will bottleneck" | A handful of agents, serialized appends, `busy_timeout`; revisit broker only past one host (Q-02). |
| "Advisory locks don't enforce" | Correct — they're coordination hints; enforcement is social, matching the trust model of one user's orchestration. Documented, not hidden. |
| "BM25-only recall is weak" | Acceptable for slice 1; hybrid vector is slice 2 (E-10). Stated, not silently dropped. |
| "Notifications may not fan out reliably" | Spike before committing (S-01); fallback is short-poll the event log by offset. |
| "Redaction regex will miss formats" | Test-driven, includes formats agentmemory missed; defense-in-depth with private-by-default scope. |

## Selected Concept HLD

- **Boundary:** one MCP server process, one SQLite-WAL file, same host. **v0.1 is stdio-only** (HTTP deferred to v0.2 once identity binding + auth + host compat are proven); the later HTTP option is Streamable HTTP bound to 127.0.0.1 / unix socket. No outbound network, no mesh.
- **Core:** append-only `events(id, ts, agent_id, kind, topic/scope, payload_json, supersedes)` = source of truth (total order by `id`). Writes funnel through a single serialized queue (keyed mutex).
- **Projections / tool families:**
  - `bus_*` — `bus_publish`, `bus_subscribe`, `bus_messages` (by topic/since-offset), `bus_dm`, `bus_reserve`/`bus_release`/`bus_reservations` (advisory file locks w/ TTL), `bus_presence`.
  - `memory_*` — `memory_remember` (scope + provenance, redaction on ingest), `memory_recall` (FTS5/BM25 → hybrid later), `memory_forget` (importance×recency×frequency), `memory_supersede` (bi-temporal invalidation), `memory_history`.
- **Realtime:** MCP `notifications/resources/updated` on each committed event to subscribed clients; fallback = poll by offset.
- **Identity/provenance:** each agent has an id; every event carries an asserted (per-process, not cryptographic) writer id + ts. Scopes (v0.1): `private` (default) / `shared` (`group:<id>` reserved, future); cross-identity access rejected.
- **Security posture:** localhost/stdio default; never 0.0.0.0; bearer + Host validation if HTTP; data-never-instructions rendering; static pinned tool descriptions; strict schemas (`additionalProperties:false`, size caps); secret redaction on ingest; path containment on any export; human-auditable log.
- **Ops:** single file; backup = copy file; inspect = read the event log. No cloud, no providers.
- **Cost drivers:** none beyond local disk; no external API calls in core.
- **Failure behavior:** crash → recover to last committed event (WAL); writer contention → `busy_timeout` then retry; no partial state.

## First Production Slice

`synapse` v0.1, stdio transport, single SQLite-WAL file, the event-log core + serialized write queue + identity/provenance + secret redaction, with:

- `bus_publish` / `bus_subscribe` / `bus_messages` / `bus_reserve` / `bus_release` / `bus_presence`
- `memory_remember` / `memory_recall` (FTS5/BM25) / `memory_supersede`
- realtime via MCP notifications (fallback poll)
- security baseline (localhost/stdio, data-as-data, redaction, strict schemas, provenance, scopes)
- integration tests for Q-01..Q-05; runnable by ≥2 real coding agents against one store.

Deferred to v0.2+: sqlite-vec hybrid recall, importance-based forgetting, HTTP transport + bearer auth, group scopes ACL refinement.

## Open Questions and Spikes

| Question | Why it matters | How to resolve | Owner / next command |
|---|---|---|---|
| S-01: Does MCP `notifications/resources/updated` reliably fan out to N subscribed clients across SDKs? | Determines realtime vs poll | Spike with TS SDK + 2 clients | next: spike before arch |
| ~~Q-lang: TypeScript vs Python~~ — RESOLVED `USER_DECISION`: **TypeScript**, official `@modelcontextprotocol/sdk` pinned `<2` | House-stack fit | Decided 2026-06-26 | closed |
| Q-scope: exact default scope policy for `bus` events (shared vs topic-scoped) | Poisoning blast radius | Decide in arch | arch-roadmap |
| Q-redact: redaction pattern set completeness | Secret leakage | Test-driven list, reviewed | implementation |
| Q-reserve: reservation TTL + renewal defaults | Lock ergonomics | Pick defaults, tune in use | implementation |

## Handoff to Architecture and Roadmap

Carry into `arch-roadmap`: the event-log-as-source-of-truth core with serialized writes (C-01, E-06/07); the two tool namespaces over shared projections (Candidate C); the security baseline as hard requirements (E-05, E-08, C-02/03, Unacceptable Outcomes); the bi-temporal memory model and BM25→hybrid recall path (E-10); spike S-01 before fixing the realtime transport; and the language decision (recommend TypeScript, official MCP SDK pinned `<2`).
