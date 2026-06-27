// synapse MCP — FROZEN tool I/O contract (v0.1).
// Source of truth for tool schemas, DTOs, error model, and internal interfaces.
// Do NOT change shapes during implementation; changing a shape = a contract revision.
// Channel invariant: durable cross-time sync -> memory_*; ephemeral live coordination -> bus_*.

import { z } from "zod";

export const CONTRACT_VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// Limits (validate-early, fail-fast). Enforced at the zod boundary.
// ---------------------------------------------------------------------------
export const LIMITS = {
  TOPIC_MAX: 128,
  BODY_BYTES_MAX: 64 * 1024, // bus message / dm body
  CONTENT_BYTES_MAX: 256 * 1024, // memory content
  TAG_MAX: 64,
  TAGS_MAX: 32,
  EVIDENCE_MAX: 32,
  GLOB_MAX: 512,
  QUERY_MAX: 1024,
  PAGE_LIMIT_DEFAULT: 50,
  PAGE_LIMIT_MAX: 500,
  RESERVE_TTL_MS_MAX: 24 * 60 * 60 * 1000,
  DM_TTL_MS_MAX: 7 * 24 * 60 * 60 * 1000,
} as const;

// ---------------------------------------------------------------------------
// Byte-accurate string caps (z.string().max counts UTF-16 units, not bytes).
// ---------------------------------------------------------------------------
const withinBytes = (max: number) => (s: string) => Buffer.byteLength(s, "utf8") <= max;
const byteString = (max: number, label: string, allowEmpty = false) => {
  const base = allowEmpty ? z.string() : z.string().min(1);
  return base.refine(withinBytes(max), { message: `${label} exceeds ${max} UTF-8 bytes` });
};

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------
/** events.id — monotonic, total-order cursor. */
export const Offset = z.number().int().nonnegative();
export type Offset = z.infer<typeof Offset>;

export const AgentId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, "agentId: [A-Za-z0-9._:-]");
export type AgentId = z.infer<typeof AgentId>;

export const Topic = z
  .string()
  .min(1)
  .max(LIMITS.TOPIC_MAX)
  .regex(/^[A-Za-z0-9._:/-]+$/, "topic: [A-Za-z0-9._:/-]");

/**
 * Visibility namespace. v0.1 accepts ONLY private|shared so no write-only data
 * can be created. `group:<id>` is reserved for a future version and is
 * deliberately NOT an accepted input value here.
 */
export const Scope = z.enum(["private", "shared"]);
export type Scope = z.infer<typeof Scope>;

export const MemoryType = z.enum(["fact", "decision", "lesson", "note"]);
export type MemoryType = z.infer<typeof MemoryType>;

/** Append-only event kinds (the SoR vocabulary). */
export const EventKind = z.enum([
  "message",
  "dm",
  "reservation",
  "reservation_release",
  "presence",
  "memory",
  "memory_supersede",
  "tombstone",
]);
export type EventKind = z.infer<typeof EventKind>;

/** Provenance carried on every returned record. */
export const Provenance = z.object({
  offset: Offset,
  agentId: AgentId,
  ts: z.number().int(), // epoch ms
});
export type Provenance = z.infer<typeof Provenance>;

const Tags = z.array(z.string().min(1).max(LIMITS.TAG_MAX)).max(LIMITS.TAGS_MAX);
const Evidence = z.array(z.string().min(1).max(512)).max(LIMITS.EVIDENCE_MAX);
const PageLimit = z.number().int().min(1).max(LIMITS.PAGE_LIMIT_MAX).default(LIMITS.PAGE_LIMIT_DEFAULT);

// ---------------------------------------------------------------------------
// Error model — ONE shape, everywhere. Tools return isError results carrying this.
// ---------------------------------------------------------------------------
export const ErrorCode = z.enum([
  "INVALID_INPUT", // failed schema / limit
  "IDENTITY_REQUIRED", // write attempted without a resolvable agentId
  "SCOPE_DENIED", // cross-identity access to private/group
  "NOT_FOUND", // target id/glob absent
  "CONFLICT", // reservation already held by another agent
  "PAYLOAD_TOO_LARGE", // body/content exceeds limit
  "INTERNAL", // unexpected
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const SynapseError = z.object({
  code: ErrorCode,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type SynapseError = z.infer<typeof SynapseError>;

// ---------------------------------------------------------------------------
// Record DTOs (what tools return — NEVER raw rows; map row -> DTO).
// ---------------------------------------------------------------------------
export const MessageRecord = z.object({
  offset: Offset,
  ts: z.number().int(),
  agentId: AgentId, // sender (provenance)
  topic: Topic.optional(),
  to: AgentId.optional(), // set for dm
  body: z.string(),
  expiresAt: z.number().int().optional(),
});
export type MessageRecord = z.infer<typeof MessageRecord>;

export const ReservationRecord = z.object({
  resourceGlob: z.string(),
  agentId: AgentId,
  acquiredAt: z.number().int(),
  expiresAt: z.number().int(),
  offset: Offset,
});
export type ReservationRecord = z.infer<typeof ReservationRecord>;

export const PresenceRecord = z.object({
  agentId: AgentId,
  lastSeen: z.number().int(),
  caps: z.array(z.string()).optional(),
});
export type PresenceRecord = z.infer<typeof PresenceRecord>;

export const MemoryRecord = z.object({
  id: Offset, // the originating event offset = stable memory id
  ts: z.number().int(),
  agentId: AgentId,
  type: MemoryType,
  scope: Scope,
  content: z.string(),
  tags: Tags.optional(),
  evidence: Evidence.optional(),
  confidence: z.number().min(0).max(1).optional(),
  supersededBy: Offset.optional(), // present iff invalidated
  rank: z.number().optional(), // bm25 score on recall
});
export type MemoryRecord = z.infer<typeof MemoryRecord>;

export const EventRecord = z.object({
  offset: Offset,
  ts: z.number().int(),
  agentId: AgentId,
  kind: EventKind,
  topic: Topic.optional(),
  scope: Scope,
  payload: z.unknown(),
});
export type EventRecord = z.infer<typeof EventRecord>;

// ===========================================================================
// TOOL CONTRACTS  (name -> input schema + output schema)
// All inputs are .strict(): unknown keys are rejected (validate-early).
// ===========================================================================

// ---- synapse_* : ops / lifecycle -----------------------------------------
export const SynapseStatusInput = z.object({}).strict();
export const SynapseStatusOutput = z.object({
  contractVersion: z.string(),
  schemaVersion: z.number().int(),
  namespace: z.string(),
  dbPath: z.string(),
  agentId: AgentId,
  eventCount: z.number().int(),
  latestOffset: Offset,
  agents: z.array(PresenceRecord),
  warnings: z.array(z.string()),
});

export const SynapseExportInput = z
  .object({
    since: Offset.optional(),
    until: Offset.optional(),
    kinds: z.array(EventKind).optional(),
    scope: Scope.optional(),
    limit: PageLimit,
  })
  .strict();
export const SynapseExportOutput = z.object({
  events: z.array(EventRecord),
  nextOffset: Offset.optional(),
  truncated: z.boolean(),
});

// ---- bus_* : live coordination (ephemeral, best-effort for online agents)--
export const BusPublishInput = z
  .object({
    topic: Topic,
    body: byteString(LIMITS.BODY_BYTES_MAX, "body"),
    ttlMs: z.number().int().positive().max(LIMITS.DM_TTL_MS_MAX).optional(),
  })
  .strict();
export const BusPublishOutput = z.object({ offset: Offset, ts: z.number().int() });

export const BusSubscribeInput = z.object({ topics: z.array(Topic).min(1).max(64) }).strict();
export const BusSubscribeOutput = z.object({
  ok: z.literal(true),
  resourceUri: z.string(), // subscribable MCP resource; updates arrive via notifications/resources/updated
  topics: z.array(Topic),
});

// DM read semantics (frozen):
//   topic SET     -> messages on that topic since `since` (no DMs).
//   topic OMITTED -> DMs addressed to the caller + `shared` topic messages
//                    visible to the caller, since `since`, merged in offset order.
// (No server-persisted cursor: `since` is caller-supplied by design.)
export const BusMessagesInput = z
  .object({
    topic: Topic.optional(),
    since: Offset,
    limit: PageLimit,
  })
  .strict();
export const BusMessagesOutput = z.object({
  messages: z.array(MessageRecord),
  nextOffset: Offset,
});

export const BusDmInput = z
  .object({
    to: AgentId,
    body: byteString(LIMITS.BODY_BYTES_MAX, "body"),
    ttlMs: z.number().int().positive().max(LIMITS.DM_TTL_MS_MAX).optional(),
  })
  .strict();
export const BusDmOutput = z.object({ offset: Offset, ts: z.number().int() });

export const BusReserveInput = z
  .object({
    resourceGlob: z.string().min(1).max(LIMITS.GLOB_MAX),
    ttlMs: z.number().int().positive().max(LIMITS.RESERVE_TTL_MS_MAX),
  })
  .strict();
// Atomic check-and-insert. Re-reserving own glob renews (idempotent for the holder).
export const BusReserveOutput = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), reservation: ReservationRecord }),
  z.object({ ok: z.literal(false), heldBy: AgentId, expiresAt: z.number().int() }),
]);

export const BusReleaseInput = z.object({ resourceGlob: z.string().min(1).max(LIMITS.GLOB_MAX) }).strict();
export const BusReleaseOutput = z.object({ ok: z.literal(true), released: z.boolean() }); // idempotent

export const BusReservationsInput = z.object({ globFilter: z.string().max(LIMITS.GLOB_MAX).optional() }).strict();
export const BusReservationsOutput = z.object({ reservations: z.array(ReservationRecord) });

// Heartbeat + list in one call (upsert presence, return current roster).
export const BusPresenceInput = z.object({ caps: z.array(z.string().max(64)).max(32).optional() }).strict();
export const BusPresenceOutput = z.object({ agents: z.array(PresenceRecord) });

// ---- memory_* : durable shared knowledge (cross-time sync channel) ---------
// Note: there is exactly ONE way to replace a fact — `memory_supersede`.
// `memory_remember` only creates new facts (no `supersedes` convenience).
export const MemoryRememberInput = z
  .object({
    content: byteString(LIMITS.CONTENT_BYTES_MAX, "content"),
    type: MemoryType.default("fact"),
    scope: Scope.default("private"), // private-by-default
    tags: Tags.optional(),
    evidence: Evidence.optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();
export const MemoryRememberOutput = z.object({
  id: Offset,
  ts: z.number().int(),
  redactions: z.number().int(), // count of secrets stripped on ingest
});

export const MemoryRecallInput = z
  .object({
    query: z.string().min(1).max(LIMITS.QUERY_MAX),
    scope: Scope.optional(), // omitted = own private + shared
    type: MemoryType.optional(),
    tags: Tags.optional(),
    limit: PageLimit,
  })
  .strict();
export const MemoryRecallOutput = z.object({
  results: z.array(MemoryRecord), // excludes superseded by default
  truncated: z.boolean(),
});

export const MemorySupersedeInput = z
  .object({
    targetId: Offset,
    content: byteString(LIMITS.CONTENT_BYTES_MAX, "content").optional(), // optional replacement fact
    reason: z.string().max(512).optional(),
  })
  .strict();
export const MemorySupersedeOutput = z.object({
  offset: Offset, // the supersede/replacement event
  ts: z.number().int(),
});

// ---- synapse_* : destructive record removal (tombstone) -------------------
// Hard-hide a poisoned/leaked record (maps to Unacceptable Outcomes). Emits a
// `tombstone` event; the target row is marked redacted and dropped from recall,
// but the event log (audit trail) is preserved. Idempotent: tombstoning an
// already-tombstoned target returns the existing tombstone event.
export const SynapseRecordDeleteInput = z
  .object({
    targetId: Offset,
    reason: z.string().min(1).max(512),
  })
  .strict();
export const SynapseRecordDeleteOutput = z.object({
  offset: Offset, // the tombstone event
  ts: z.number().int(),
});

export const MemoryHistoryInput = z
  .object({
    id: Offset.optional(),
    query: z.string().max(LIMITS.QUERY_MAX).optional(),
    limit: PageLimit,
  })
  .strict()
  .refine((v) => v.id !== undefined || v.query !== undefined, "id or query required");
export const MemoryHistoryOutput = z.object({
  records: z.array(MemoryRecord), // includes superseded, ordered by ts
});

// ---------------------------------------------------------------------------
// Tool registry (single source the server iterates to register tools).
// `mutating` => requires a resolvable agentId (else IDENTITY_REQUIRED).
// `idempotent` documented per EXECUTION RULES.
// ---------------------------------------------------------------------------
export const TOOLS = {
  synapse_status: { input: SynapseStatusInput, output: SynapseStatusOutput, mutating: false, idempotent: true, destructive: false },
  synapse_export: { input: SynapseExportInput, output: SynapseExportOutput, mutating: false, idempotent: true, destructive: false },
  synapse_record_delete: { input: SynapseRecordDeleteInput, output: SynapseRecordDeleteOutput, mutating: true, idempotent: true, destructive: true },

  bus_publish: { input: BusPublishInput, output: BusPublishOutput, mutating: true, idempotent: false },
  bus_subscribe: { input: BusSubscribeInput, output: BusSubscribeOutput, mutating: false, idempotent: true },
  bus_messages: { input: BusMessagesInput, output: BusMessagesOutput, mutating: false, idempotent: true },
  bus_dm: { input: BusDmInput, output: BusDmOutput, mutating: true, idempotent: false },
  bus_reserve: { input: BusReserveInput, output: BusReserveOutput, mutating: true, idempotent: true }, // holder renew
  bus_release: { input: BusReleaseInput, output: BusReleaseOutput, mutating: true, idempotent: true },
  bus_reservations: { input: BusReservationsInput, output: BusReservationsOutput, mutating: false, idempotent: true },
  bus_presence: { input: BusPresenceInput, output: BusPresenceOutput, mutating: true, idempotent: true },

  memory_remember: { input: MemoryRememberInput, output: MemoryRememberOutput, mutating: true, idempotent: false },
  memory_recall: { input: MemoryRecallInput, output: MemoryRecallOutput, mutating: false, idempotent: true },
  memory_supersede: { input: MemorySupersedeInput, output: MemorySupersedeOutput, mutating: true, idempotent: true },
  memory_history: { input: MemoryHistoryInput, output: MemoryHistoryOutput, mutating: false, idempotent: true },
} as const;

export type ToolName = keyof typeof TOOLS;

// ===========================================================================
// INTERNAL INTERFACES (Anti-Spaghetti). Handlers depend on these, not on
// node:sqlite / fs / Date directly. Inject for testability (time/IO/random).
// ===========================================================================
export interface IClock {
  now(): number; // epoch ms
}

export interface IIdentity {
  agentId(): string | null; // null => writes fail IDENTITY_REQUIRED
  namespace(): string;
  dbPath(): string;
}

export interface IRedactor {
  redact(text: string): { text: string; count: number };
}

/** Cross-process change feed: poll(offset) is the guaranteed floor; fs.watch only accelerates wake. */
export interface IWatcher {
  start(): void;
  stop(): void;
  onChange(cb: (latestOffset: Offset) => void): void;
}

/** The only seam to SQLite. All methods run inside the store's own transactions. */
export interface IStore {
  schemaVersion(): number;
  latestOffset(): Offset;
  eventCount(): number;

  /** Append one event + update its projection in a single txn; returns provenance. */
  appendEvent(input: {
    agentId: string;
    kind: EventKind;
    scope: Scope;
    topic?: string;
    toAgent?: string;
    payload: unknown;
    supersedes?: Offset;
  }): { offset: Offset; ts: number };

  queryMessages(q: { agentId: string; topic?: string; to?: string; since: Offset; limit: number }): MessageRecord[];
  exportEvents(q: { since?: Offset; until?: Offset; kinds?: EventKind[]; scope?: Scope; limit: number }): {
    events: EventRecord[];
    nextOffset?: Offset;
    truncated: boolean;
  };

  /** Atomic check-and-insert reservation. */
  reserve(q: { agentId: string; resourceGlob: string; ttlMs: number }):
    | { ok: true; reservation: ReservationRecord }
    | { ok: false; heldBy: string; expiresAt: number };
  release(q: { agentId: string; resourceGlob: string }): { released: boolean };
  listReservations(q: { globFilter?: string }): ReservationRecord[];

  upsertPresence(q: { agentId: string; caps?: string[] }): void;
  listPresence(): PresenceRecord[];

  recall(q: { agentId: string; query: string; scope?: Scope; type?: MemoryType; tags?: string[]; limit: number }): {
    results: MemoryRecord[];
    truncated: boolean;
  };
  history(q: { agentId: string; id?: Offset; query?: string; limit: number }): MemoryRecord[];

  /** Supersede a memory record: enforce visibility/ownership, then append
   *  `memory_supersede` event + bi-temporal invalidation. Optionally insert
   *  a replacement fact if `content` is provided. */
  supersede(q: { agentId: string; targetId: Offset; content?: string; reason?: string }): { offset: Offset; ts: number };

  /** Tombstone a record: append `tombstone` event, mark target redacted, drop from FTS. */
  tombstone(q: { agentId: string; targetId: Offset; reason: string }): { offset: Offset; ts: number };

  /** Drop and replay projections from the event log (boot-time on version mismatch). */
  rebuildProjections(): void;
}
