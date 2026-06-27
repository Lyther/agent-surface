# Data Model (v0.1, schema_version = 1)

Status: PROPOSED
Source: mcps/synapse/architecture.md, api-contract.md
Binding artifacts: [schema.sql](schema.sql) (DDL) · [src/model.ts](src/model.ts) (row entities + mappers) · [src/contract.ts](src/contract.ts) (DTOs)
Last updated: 2026-06-26

## Principle

`events` is the **single source of truth** (append-only, never UPDATE/DELETE). Everything else — `memory`, `memory_fts`, `reservations`, `presence` — is a **projection** updated in the *same write transaction* as its source event and **fully rebuildable** by replaying `events` in `id` order. Entities (raw rows) are separate from DTOs (the tool boundary); rows are always mapped to DTOs, never returned directly.

## Entities

| Table | Role | Key | Lifecycle |
|---|---|---|---|
| `meta` | schema/contract version, namespace, created_at | `key` | written once on create |
| `events` | system of record | `id` (autoincrement = cursor) | append-only |
| `memory` | bi-temporal current+historical facts | `id` (= source event id) | projection |
| `memory_fts` | FTS5 lexical index over `memory` | `rowid` (= `memory.id`) | projection (external-content) |
| `reservations` | active advisory locks | `resource_glob` | projection (lazy-reaped) |
| `presence` | latest heartbeat per agent | `agent_id` | projection |

## Identity & branded types

`events.id` is reused three ways — primary key, total-order **cursor** (`offset`), and the **stable memory id**. It is branded `EventId` internally ([src/model.ts](src/model.ts)) so a raw number can't be passed where an offset is required. `agent_id` is validated as `AgentId` at every boundary. Money/floats: N/A. SQLite booleans: stored as `0|1` (`redacted`).

## Event payloads (kind → JSON)

| kind | topic | to_agent | payload | projection effect |
|---|---|---|---|---|
| `message` | set | — | `{body, expiresAt?}` | read via `bus_messages` |
| `dm` | — | set | `{body, expiresAt?}` | read via `bus_messages` (to me) |
| `reservation` | — | — | `{resourceGlob, ttlMs}` | upsert `reservations` |
| `reservation_release` | — | — | `{resourceGlob}` | delete from `reservations` |
| `presence` | — | — | `{caps?}` | upsert `presence` |
| `memory` | — | — | `{type,content,tags?,evidence?,confidence?}` | insert `memory` + `memory_fts` |
| `memory_supersede` | — | — | `{reason?, content?}` (`supersedes` = target id) | set old row `valid_to`+`superseded_by`, FTS delete; optional new `memory` |
| `tombstone` | — | — | `{reason}` (`supersedes` = target id) — created by `synapse_record_delete` | set `redacted=1`, `valid_to`, FTS delete |

## Bi-temporal memory

Two time axes, per the Zep/Graphiti model (concept E-10):

- **Transaction time** = `events.id`/`ts` ordering — immutable; the log is the audit trail.
- **Valid time** = `[valid_from, valid_to)` on the `memory` projection. A live fact has `valid_to = NULL` and `superseded_by = NULL`.

Supersede never deletes: it stamps the old row's `valid_to`/`superseded_by`, removes it from `memory_fts` (so default recall skips it), and — if a replacement was provided — inserts a new `memory` row from the supersede event. `memory_history` reads the `memory` table directly (including non-live rows); `memory_recall` joins `memory_fts` so it sees only live, non-redacted rows.

```text
recall:  memory_fts MATCH q  ⋈ memory (superseded_by IS NULL AND redacted=0 AND scope visible)
history: memory WHERE id=? OR content LIKE ?  (any valid_to / superseded_by)
```

## Scope & visibility

v0.1 `scope ∈ { private, shared }` (the contract rejects anything else; `group:<id>` is reserved for a future version and is not an accepted input — so no write-only data can exist). Recall/read predicate:

- `private` → visible only to `agent_id = caller`.
- `shared` → visible to all agents in the namespace.

Cross-identity read of a `private` row → `SCOPE_DENIED`.

## Integrity rules

1. `events` is append-only — enforced by code path (only `appendEvent`); no UPDATE/DELETE statements against it exist.
2. Every projection mutation happens in the **same transaction** as the `appendEvent` that caused it (atomic; crash leaves no half-applied projection).
3. `memory.id`, `reservations.event_id`, `memory.superseded_by` all FK to `events.id`.
4. Secrets are redacted **before** the `memory` event is appended (never stored, never logged).
5. Reservation conflict is exact-`resource_glob` (advisory; documented non-overlap limitation).

## Projection rebuild (recovery)

On open, the store compares `meta.schema_version` and a projection checksum/version. On mismatch (or explicit `rebuildProjections()`): drop `memory`, `memory_fts`, `reservations`, `presence`; replay `events` in `id` order applying each kind's projection effect; expired reservations are simply not re-created. `events` (the SoR) is never touched. This backs Q-05 (crash recovery) and makes projections disposable.

## Indexes (rationale)

| Index | Serves |
|---|---|
| `events(kind,id)` | export / replay by kind |
| `events(topic,id)` partial | `bus_messages` by topic + since |
| `events(to_agent,id)` partial | dm fetch for a recipient |
| `memory(scope,superseded_by,redacted)` | recall live-row filter (aligned with predicate) |
| `memory(agent_id)` | private-scope + history by author |
| `reservations(expires_at)` | lazy reap of expired locks |

## Migrations

`schema_version` starts at 1. Forward migrations are additive DDL guarded by the version in `meta`; because projections are rebuildable, a projection-shape change is "bump version → rebuild from events," not a data migration. Only an `events`-table change is a true migration (reversible, reviewed).
