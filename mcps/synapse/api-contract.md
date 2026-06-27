# API Contract (FROZEN — v0.1)

Status: PROPOSED
Source: mcps/synapse/architecture.md
Contract code: [src/contract.ts](src/contract.ts) — the binding artifact (zod schemas + internal interfaces)
Last updated: 2026-06-26

The MCP tool surface IS the API. This doc is the human-readable reference; `src/contract.ts` is the source of truth. Tool shapes are **frozen during implementation** — changing a shape is a contract revision, not an edit.

## Conventions

- **Tool names**: underscores, three prefixes — `synapse_*` (ops/lifecycle), `bus_*` (live coordination), `memory_*` (durable memory).
- **Channel invariant**: durable cross-time sync → `memory_*`; ephemeral live coordination → `bus_*`. An agent that was offline gets state back by `memory_recall`, not by replaying the bus.
- **Inputs**: every input schema is `.strict()` — unknown keys rejected. Validate at the boundary, fail fast.
- **Outputs are DTOs**: tools return mapped records (see DTOs), never raw SQLite rows. Provenance (`offset`, `agentId`, `ts`) on every record.
- **Cursor**: `offset` = `events.id`, monotonic total order. Bus reads are caller-supplied `since` (no server-persisted cursor — by design).
- **Identity**: asserted per-process (`SYNAPSE_AGENT_ID`/client info), not cryptographic auth. Mutating tools require a resolvable `agentId` or fail `IDENTITY_REQUIRED`.
- **Scope**: v0.1 accepts only `private` (default, agent-bound) / `shared`. `group:<id>` is reserved for a future version and is **not** an accepted input (no write-only data).
- **Byte caps**: `body`/`content` limits are UTF-8 **bytes** (`Buffer.byteLength`), not string length.
- **One way to mutate**: replace a fact via `memory_supersede`; remove one via `synapse_record_delete`. `memory_remember` never supersedes.

## Tool catalogue

| Tool | Mutating | Idempotent | Input → Output | Notes |
|---|---|---|---|---|
| `synapse_status` | no | yes | `{}` → status (versions, namespace, counts, latest offset, agents, warnings) | ops |
| `synapse_export` | no | yes | `{since?,until?,kinds?,scope?,limit}` → `{events[],nextOffset?,truncated}` | bounded, namespace-scoped |
| `synapse_record_delete` | yes (**destructive**) | yes | `{targetId,reason}` → `{offset,ts}` | tombstone a poisoned/leaked record; hard-hidden from recall, event log preserved |
| `bus_publish` | yes | **no** | `{topic,body,ttlMs?}` → `{offset,ts}` | append message event |
| `bus_subscribe` | no | yes | `{topics[]}` → `{ok,resourceUri,topics}` | registers interest; updates via `notifications/resources/updated` |
| `bus_messages` | no | yes | `{topic?,since,limit}` → `{messages[],nextOffset}` | read by cursor; **topic set** = that topic; **topic omitted** = DMs-to-caller + `shared` messages, merged in offset order |
| `bus_dm` | yes | **no** | `{to,body,ttlMs?}` → `{offset,ts}` | live/best-effort; durable → use memory |
| `bus_reserve` | yes | yes (holder renew) | `{resourceGlob,ttlMs}` → `{ok:true,reservation}` \| `{ok:false,heldBy,expiresAt}` | atomic check-and-insert |
| `bus_release` | yes | yes | `{resourceGlob}` → `{ok,released}` | no-op if absent |
| `bus_reservations` | no | yes | `{globFilter?}` → `{reservations[]}` | active locks |
| `bus_presence` | yes | yes | `{caps?}` → `{agents[]}` | heartbeat + roster |
| `memory_remember` | yes | **no** | `{content,type?,scope?,tags?,evidence?,confidence?}` → `{id,ts,redactions}` | creates new facts only; redaction on ingest; private default |
| `memory_recall` | no | yes | `{query,scope?,type?,tags?,limit}` → `{results[],truncated}` | FTS5/BM25, scope-filtered, excludes superseded |
| `memory_supersede` | yes | yes | `{targetId,content?,reason?}` → `{offset,ts}` | bi-temporal invalidate, never delete |
| `memory_history` | no | yes | `{id?\|query?,limit}` → `{records[]}` | includes superseded |

## Error model (one shape, everywhere)

Tools fail with an MCP `isError` result carrying `SynapseError = { code, message, details? }`. Codes:

| Code | When | Caller action |
|---|---|---|
| `INVALID_INPUT` | schema/limit violation | fix payload |
| `IDENTITY_REQUIRED` | mutating tool, no resolvable agentId | set `SYNAPSE_AGENT_ID` |
| `SCOPE_DENIED` | cross-identity read of `private`/`group` | not yours |
| `NOT_FOUND` | target id/glob absent | check id |
| `CONFLICT` | reserve on a glob held by another agent | back off / pick other work (also returned as `ok:false`) |
| `PAYLOAD_TOO_LARGE` | body/content over limit | shrink |
| `INTERNAL` | unexpected | retry / report |

## Idempotency & retry

- **Non-idempotent (append):** `bus_publish`, `bus_dm`, `memory_remember` — each call creates a new offset. Callers must not blind-retry on timeout without dedup logic; v0.1 has no idempotency key.
- **Idempotent:** all reads; `bus_reserve` (same agent re-reserving its glob renews TTL); `bus_release` (no-op if absent); `memory_supersede` (superseding an already-superseded target returns the existing supersede event); `synapse_record_delete` (re-tombstoning returns the existing tombstone event).

## Internal interfaces (low coupling)

Handlers depend on `IClock`, `IIdentity`, `IRedactor`, `IWatcher`, `IStore` ([src/contract.ts](src/contract.ts)) — never on `node:sqlite` / `fs` / `Date` directly. `IStore` is the only SQLite seam; everything runs inside its transactions. Inject all four for tests (time/IO/randomness isolation, per repo test policy).

## Frozen until

This contract is frozen through Phase 1–2 implementation (roadmap). Revisions require a version bump of `CONTRACT_VERSION` and a note here. The data model behind it is specified in [data-model.md](data-model.md).
