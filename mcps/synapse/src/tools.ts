// synapse — transport-agnostic tool set: JSON-Schema specs (for tools/list) + a
// validated dispatcher (for tools/call). Results are JSON-in-text (data, not
// instructions). Lock denials carry in-band hints. Used by the low-level sidecar
// Server; the bridge proxies upstream instead.
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  LIMITS, TOOLS, TOOL_DESCRIPTIONS,
  type IStore,
  type LockAcquireArgs, type LockListArgs, type LockReleaseArgs,
  type MemoryForgetArgs, type MemoryGetArgs, type MemoryRecallArgs, type MemoryRememberArgs,
} from "./contract.js";

export interface SessionCtx { agentId: string; projectDbPath: string }
export interface ToolSpec { name: string; description: string; inputSchema: Record<string, unknown> }
export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data) }] });
const fail = (code: string, message: string): ToolResult => ({ content: [{ type: "text", text: JSON.stringify({ code, message }) }], isError: true });

export function toolSpecs(): ToolSpec[] {
  return (Object.keys(TOOLS) as (keyof typeof TOOLS)[]).map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name]!,
    inputSchema: zodToJsonSchema(TOOLS[name].input, { target: "jsonSchema7" }) as Record<string, unknown>,
  }));
}

export function buildToolSet(store: IStore, ctx: SessionCtx): { specs: ToolSpec[]; call: (name: string, rawArgs: unknown) => ToolResult } {
  const handlers: Record<string, (a: unknown) => ToolResult> = {
    memory_remember: (raw) => {
      const a = raw as MemoryRememberArgs;
      const r = store.remember({ projectDbPath: ctx.projectDbPath, agentId: ctx.agentId, content: a.content, tags: a.tags, global: a.global, supersedes: a.supersedes });
      return ok({ id: r.id, ts: r.ts, agentId: ctx.agentId, redactions: r.redactions });
    },
    memory_recall: (raw) => {
      const a = raw as MemoryRecallArgs;
      const r = store.recall({
        projectDbPath: ctx.projectDbPath, agentId: ctx.agentId,
        query: a.query, since: a.since, tags: a.tags, project: a.project,
        limit: a.limit ?? LIMITS.PAGE_LIMIT_DEFAULT, maxBytes: a.maxBytes ?? LIMITS.MAXBYTES_DEFAULT, mode: a.mode ?? "compact",
      });
      return ok({ results: r.results, truncated: r.truncated, cursor: r.cursor });
    },
    memory_get: (raw) => ok({ records: store.get({ projectDbPath: ctx.projectDbPath, agentId: ctx.agentId, ids: (raw as MemoryGetArgs).ids }) }),
    memory_forget: (raw) => {
      const a = raw as MemoryForgetArgs;
      const r = store.forget({ projectDbPath: ctx.projectDbPath, agentId: ctx.agentId, id: a.id, reason: a.reason });
      return r ? ok({ id: r.id, ts: r.ts, status: "redacted" }) : fail("NOT_FOUND", `no live memory with id ${a.id}`);
    },
    lock_acquire: (raw) => {
      const a = raw as LockAcquireArgs;
      const r = store.acquire({ projectDbPath: ctx.projectDbPath, agentId: ctx.agentId, glob: a.glob, ttlMs: a.ttlMs ?? LIMITS.RESERVE_TTL_MS_DEFAULT });
      return r.ok
        ? ok({ ok: true, glob: r.lock.glob, agentId: r.lock.agentId, expiresAt: r.lock.expiresAt })
        : ok({ ok: false, heldBy: r.heldBy, expiresAt: r.expiresAt, suggestion: `Held by ${r.heldBy} until ${new Date(r.expiresAt).toISOString()}. Pick other work or retry after it expires.` });
    },
    lock_release: (raw) => ok({ ok: true, released: store.release({ projectDbPath: ctx.projectDbPath, agentId: ctx.agentId, glob: (raw as LockReleaseArgs).glob }).released }),
    lock_list: (raw) => ok({ locks: store.listLocks({ projectDbPath: ctx.projectDbPath, globFilter: (raw as LockListArgs).globFilter }) }),
  };

  return {
    specs: toolSpecs(),
    call(name, rawArgs) {
      const tool = (TOOLS as Record<string, { input: { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: { message: string }[] } } } }>)[name];
      const handler = handlers[name];
      if (!tool || !handler) return fail("INVALID_INPUT", `unknown tool: ${name}`);
      const parsed = tool.input.safeParse(rawArgs ?? {});
      if (!parsed.success) return fail("INVALID_INPUT", (parsed.error?.issues ?? []).map((i) => i.message).join("; ") || "invalid arguments");
      return handler(parsed.data);
    },
  };
}
