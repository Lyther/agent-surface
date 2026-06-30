// synapse — row entities + mappers + the canonical runtime schema (mirrors schema.sql).
import type { CompactMemory, FullMemory, LockRecord, MemoryStatus, Store } from "./contract.js";
import { LIMITS } from "./contract.js";

export const SCHEMA_VERSION = 1;

// External id codec: global ext-id = BASE + rowid; project ext-id = rowid. Keeps the
// two physical id-spaces disjoint so recall -> get/forget round-trips across files.
export const GLOBAL_BASE = 1_000_000_000_000;
export const extId = (store: Store, rowid: number): number => (store === "global" ? GLOBAL_BASE + rowid : rowid);
export const decId = (id: number): { store: Store; rowid: number } =>
  id >= GLOBAL_BASE ? { store: "global", rowid: id - GLOBAL_BASE } : { store: "project", rowid: id };

// Inlined so the compiled sidecar needs no file lookup. Keep in sync with schema.sql.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  supersedes INTEGER REFERENCES memory(id),
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live','superseded','redacted'))
);
CREATE INDEX IF NOT EXISTS idx_memory_status_id ON memory(status, id);
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  content, tags, content='memory', content_rowid='id', tokenize='porter unicode61'
);
CREATE TABLE IF NOT EXISTS locks (
  glob TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_locks_expiry ON locks(expires_at);
`;

export interface MemoryRow {
  id: number; ts: number; agent_id: string; content: string;
  tags: string | null; supersedes: number | null; status: string;
}
export interface LockRow { glob: string; agent_id: string; acquired_at: number; expires_at: number }

function parseTags(raw: string | null): string[] | undefined {
  if (raw == null) return undefined;
  const v = JSON.parse(raw) as unknown;
  if (!Array.isArray(v) || !v.every((t) => typeof t === "string")) return undefined;
  return v as string[];
}

export function rowToCompact(r: MemoryRow, store: Store, rank?: number): CompactMemory {
  const out: CompactMemory = {
    id: extId(store, r.id), ts: r.ts, agentId: r.agent_id, store,
    snippet: r.content.length > LIMITS.SNIPPET_CHARS ? r.content.slice(0, LIMITS.SNIPPET_CHARS) + "…" : r.content,
  };
  const tags = parseTags(r.tags);
  if (tags) out.tags = tags;
  if (rank !== undefined) out.rank = rank;
  return out;
}

export function rowToFull(r: MemoryRow, store: Store): FullMemory {
  const out: FullMemory = {
    id: extId(store, r.id), ts: r.ts, agentId: r.agent_id, store,
    content: r.content, status: r.status as MemoryStatus,
  };
  const tags = parseTags(r.tags);
  if (tags) out.tags = tags;
  if (r.supersedes != null) out.supersedes = extId(store, r.supersedes);
  return out;
}

export function rowToLock(r: LockRow): LockRecord {
  return { glob: r.glob, agentId: r.agent_id, acquiredAt: r.acquired_at, expiresAt: r.expires_at };
}
