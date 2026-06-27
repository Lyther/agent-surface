// synapse MCP — internal data model: raw SQLite ROW entities + branded ids +
// row->DTO mappers. The DTOs (the API boundary) live in contract.ts; this file
// is the storage-facing side. Rows carry JSON-as-TEXT columns; mappers parse
// them into the validated DTOs. No `any`; parse at the boundary.

import { z } from "zod";
import {
  AgentId,
  EventKind,
  MemoryType,
  Scope,
  type EventRecord,
  type MemoryRecord,
  type MessageRecord,
  type PresenceRecord,
  type ReservationRecord,
} from "./contract.js";

export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Branded ids (Anti-String Law). `events.id` is reused as the stable memory id
// AND the cursor — brand it so a raw number can't be passed where an offset is
// expected. AgentId is re-exported from the contract (already validated there).
// ---------------------------------------------------------------------------
export type EventId = number & { readonly __brand: "EventId" };
export const EventId = (n: number): EventId => n as EventId;

export type Namespace = string & { readonly __brand: "Namespace" };
export const Namespace = (s: string): Namespace => s as Namespace;

// JSON column helpers ---------------------------------------------------------
const JsonStringArray = z
  .string()
  .nullable()
  .transform((s): string[] | undefined =>
    s == null ? undefined : z.array(z.string()).parse(JSON.parse(s)),
  );

// ---------------------------------------------------------------------------
// ROW entities — exact column shapes as returned by node:sqlite.
// SQLite has no boolean; `redacted` is 0|1.
// ---------------------------------------------------------------------------
export const EventRow = z.object({
  id: z.number().int(),
  ts: z.number().int(),
  agent_id: z.string(),
  kind: EventKind,
  topic: z.string().nullable(),
  to_agent: z.string().nullable(),
  scope: z.string(),
  payload: z.string(), // JSON
  supersedes: z.number().int().nullable(),
});
export type EventRow = z.infer<typeof EventRow>;

export const MemoryRow = z.object({
  id: z.number().int(),
  ts: z.number().int(),
  agent_id: z.string(),
  type: MemoryType,
  scope: z.string(),
  content: z.string(),
  tags: z.string().nullable(),
  evidence: z.string().nullable(),
  confidence: z.number().nullable(),
  valid_from: z.number().int(),
  valid_to: z.number().int().nullable(),
  superseded_by: z.number().int().nullable(),
  redacted: z.union([z.literal(0), z.literal(1)]),
});
export type MemoryRow = z.infer<typeof MemoryRow>;

export const ReservationRow = z.object({
  resource_glob: z.string(),
  agent_id: z.string(),
  acquired_at: z.number().int(),
  expires_at: z.number().int(),
  event_id: z.number().int(),
});
export type ReservationRow = z.infer<typeof ReservationRow>;

export const PresenceRow = z.object({
  agent_id: z.string(),
  last_seen: z.number().int(),
  caps: z.string().nullable(),
});
export type PresenceRow = z.infer<typeof PresenceRow>;

// message DM rows are just `events` rows of kind message|dm; payload = { body }.
const MessagePayload = z.object({ body: z.string(), expiresAt: z.number().int().optional() });

// ---------------------------------------------------------------------------
// Mappers: ROW -> DTO. Never return a row to a caller; always map. Each parses
// JSON columns and re-validates id/agent through the contract validators.
// ---------------------------------------------------------------------------
export function rowToEventRecord(r: EventRow): EventRecord {
  return {
    offset: r.id,
    ts: r.ts,
    agentId: AgentId.parse(r.agent_id),
    kind: r.kind,
    topic: r.topic ?? undefined,
    scope: Scope.parse(r.scope),
    payload: JSON.parse(r.payload) as unknown,
  };
}

export function rowToMessageRecord(r: EventRow): MessageRecord {
  const p = MessagePayload.parse(JSON.parse(r.payload));
  return {
    offset: r.id,
    ts: r.ts,
    agentId: AgentId.parse(r.agent_id),
    topic: r.topic ?? undefined,
    to: r.to_agent ?? undefined,
    body: p.body,
    expiresAt: p.expiresAt,
  };
}

export function rowToMemoryRecord(r: MemoryRow, rank?: number): MemoryRecord {
  return {
    id: r.id,
    ts: r.ts,
    agentId: AgentId.parse(r.agent_id),
    type: r.type,
    scope: Scope.parse(r.scope),
    content: r.content,
    tags: JsonStringArray.parse(r.tags),
    evidence: JsonStringArray.parse(r.evidence),
    confidence: r.confidence ?? undefined,
    supersededBy: r.superseded_by ?? undefined,
    rank,
  };
}

export function rowToReservationRecord(r: ReservationRow): ReservationRecord {
  return {
    resourceGlob: r.resource_glob,
    agentId: AgentId.parse(r.agent_id),
    acquiredAt: r.acquired_at,
    expiresAt: r.expires_at,
    offset: r.event_id,
  };
}

export function rowToPresenceRecord(r: PresenceRow): PresenceRecord {
  return {
    agentId: AgentId.parse(r.agent_id),
    lastSeen: r.last_seen,
    caps: JsonStringArray.parse(r.caps),
  };
}
