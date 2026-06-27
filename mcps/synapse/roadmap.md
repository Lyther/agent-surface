# Roadmap

## Status

Status: PROPOSED
Source architecture: mcps/synapse/architecture.md
Last updated: 2026-06-26

## Roadmap Principles

- Preserve the selected concept (one MCP, event log + `bus_*`/`memory_*`).
- Ship a production-shaped walking skeleton (≥2 real agents, one DB) before feature breadth.
- Resolve the one irreversible-ish risk — cross-process realtime — with a spike before building on it.
- Every task carries observable acceptance evidence (a test, command, or demo).
- v0.1 is stdio-only; HTTP/auth, vector recall, and forgetting are later phases.

## Phase 0: Decision Closure and Spikes

| Task | Why now | Output | Acceptance evidence |
|---|---|---|---|
| S-01 Cross-process realtime spike | ADR-05 is the load-bearing unknown | throwaway script: 2 node procs, one WAL file, writer bumps tick-file, reader `fs.watch`+poll | measured p50/p95 wake latency on macOS+Linux; decision recorded (interval value, fswatch yes/no, fallback) |
| S-02 node:sqlite WAL multi-writer probe | confirm C-01/Q-02 assumption | script: K procs append M rows w/ `busy_timeout` | 0 lost writes, contiguous `id` total order, no corruption; chosen `busy_timeout` |
| S-03 Subproject scaffold decision | repo root has no TS build | `mcps/synapse/package.json`, `tsconfig.json`, bundler (tsup/tsdown), test runner (vitest or node:test) | `npm run build` + `npm test` green on an empty stub |
| Concept convergence | DONE — `mcp/agent-sync/` removed; namespace-resolver + status/heartbeat/export folded into `synapse`; checkpoint deferred to Later | n/a | already reflected in concept/architecture/api |

Exit gate: S-01 + S-02 pass (or realtime mechanism re-decided); scaffold builds.

## Phase 1: Production-Shaped Walking Skeleton

| Task | Scope | Acceptance evidence | Dependencies |
|---|---|---|---|
| T1.1 Store core | `events` table, WAL pragmas, `appendEvent()` txn, schema version | unit: append returns monotonic id; pragmas asserted | S-02, S-03 |
| T1.2 Identity + namespace resolver | env `SYNAPSE_AGENT_ID`/`SYNAPSE_NAMESPACE`, project-root hash fallback, DB path (mode 600) | unit: resolution precedence; write without id → error | S-03 |
| T1.3 MCP stdio server | SDK wiring, tool registration, stderr-only logging, `synapse_status` | integration: client lists tools; `synapse_status` returns counts/offset | T1.1 |
| T1.4 `bus_publish` / `bus_messages` | append message event; bounded query by topic + since-offset | integration: publish then read-by-cursor returns it w/ provenance | T1.1, T1.3 |
| T1.5 Realtime watcher | poll offset + fswatch tick → `notifications/resources/updated` | Q-01: 2 clients, publish on A, B notified < gate; cursor re-read works | S-01, T1.4 |
| T1.6 `bus_reserve`/`bus_release`/`bus_reservations` | advisory locks w/ TTL over `reservations` projection | Q-02: concurrent reserve → exactly one holder; loser sees holder+expiry | T1.1 |
| T1.7 `bus_presence` | heartbeat → `presence` projection | integration: two agents visible with last_seen | T1.1 |
| T1.8 Walking-skeleton demo | end-to-end with two real coding agents on one namespace | demo: agent A reserves file + posts event; agent B sees both, avoids the file | T1.4–T1.7 |

Exit gate: Q-01 + Q-02 pass; two agents coordinate through the server with no manual state merge.

## Phase 2: Core Product Capability

| Task | Scope | Acceptance evidence | Dependencies |
|---|---|---|---|
| T2.1 `memory_remember` | scoped write (private default), provenance, ingest redaction | Q-04: redaction unit suite passes (floor = agentmemory v0.9.27 patterns) | T1.1 |
| T2.2 `memory_recall` (FTS5/BM25) | bounded hybrid lexical recall, scope-filtered, provenance in results | integration: seeded facts retrieved; cross-identity `private` excluded | T2.1 |
| T2.3 `memory_supersede` + `memory_history` | bi-temporal invalidation (no blind delete); history view | unit: superseded fact hidden from default recall, present in history | T2.1 |
| T2.4 Anti-poisoning rendering | typed/quoted data; static tool descriptions; provenance labels | Q-03: stored injection never surfaces as instruction/description | T2.2 |
| T2.5 `synapse_export` | bounded, namespace-scoped export | export bounded + truncation flag honored | T2.1 |
| T2.6 `synapse_record_delete` (tombstone) | destructive removal of poisoned/leaked records | tombstone event in `events`; target redacted + excluded from recall; preserved in history | T2.1 |

Exit gate: Q-03 + Q-04 pass; memory recall usable by agents with provenance and scope isolation.

## Phase 3: Hardening and Launch Readiness

| Task | Scope | Acceptance evidence | Dependencies |
|---|---|---|---|
| T3.1 Crash/recovery + projection rebuild | kill-during-write; boot-time version check → replay | Q-05: recover to last committed event; projections consistent | Phase 2 |
| T3.2 Concurrency stress | K-process write/read load at target N | benchmark: latency + integrity at N agents; documented ceiling | T1.5, T1.6 |
| T3.3 Distribution wiring | `registry/optional-services.json` entry (kind mcp), adapter render | `node scripts/agent-surface.mjs check generated --target all` passes; `.mcp.json` emitted | Phase 2 |
| T3.4 Docs + threat model | README, config/env reference, security model, operator runbook | docs present; security checklist mapped to Unacceptable Outcomes | Phase 2 |
| T3.5 Dependency + build hardening | pin SDK `<2`, prebuilt node:sqlite, `npm audit` clean | CI green across supported Node; audit no high/critical | T3.3 |

Exit gate: all Q-01..Q-05 pass; distributed via adapters; threat model documented.

## Later / Not Now

| Idea | Revisit trigger | Reason deferred |
|---|---|---|
| Streamable HTTP transport + bearer/Host auth + OAuth | agents on separate hosts / single shared server wanted | adds auth+network surface; stdio suffices for one host |
| `sqlite-vec` hybrid (vector+BM25 RRF) recall | measured BM25 recall failures | embeddings cost/complexity; BM25 first |
| `memory_forget` (importance×recency×frequency) | store growth hurts recall | needs scoring heuristics + eviction policy |
| Event-log compaction | file size pressure | premature before real volume |
| Single shared HTTP server (in-proc notifications) | write contention at high N (T3.2) | only if stdio multi-proc hits limits |
| Checkpoint primitive (human/external gate that blocks work) | orchestrations need explicit gating | scope creep for v0.1; expressible via bus/memory by convention meanwhile |
| `group:<id>` scope | multi-team use on one host | private/shared cover v0.1; reserved, not accepted input |

## Cross-Phase Gates

| Gate | Required before | Evidence |
|---|---|---|
| Realtime mechanism decided | Phase 1 build of T1.5 | S-01 result recorded in ADR-05 |
| WAL multi-writer safe | any concurrent-write feature | S-02 integrity result |
| No-secret-in-store | any memory write ships | Q-04 redaction suite |
| Data-as-data invariant | any recall ships | Q-03 poisoning test |
| Durability | launch | Q-05 crash/recovery test |
| Scope isolation | launch | cross-identity `private` exclusion test |
