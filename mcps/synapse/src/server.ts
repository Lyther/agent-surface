// synapse MCP — Server: MCP stdio server wiring all tools via the official SDK.
// Tools are registered from the TOOLS registry in contract.ts. Each handler
// validates input (zod .strict()), enforces identity/scope, calls the store,
// and returns a mapped DTO. Errors use the SynapseError model (isError results).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { RealClock } from "./clock.js";
import { TOOLS, type EventKind, type MemoryType, type Offset, type Scope, type SynapseError, type ToolName } from "./contract.js";
import { EnvIdentity } from "./identity.js";
import { createRedactor } from "./redactor.js";
import { Store } from "./store.js";
import { PollWatcher } from "./watcher.js";

process.stderr.write("[synapse] imports resolved\n");

export interface SynapseServer {
  server: McpServer;
  store: Store;
  watcher: PollWatcher;
}

function synapseError(code: string, message: string, details?: Record<string, unknown>): { isError: true; content: { type: "text"; text: string }[] } {
  const err: SynapseError = { code: code as SynapseError["code"], message, details };
  return { isError: true, content: [{ type: "text", text: JSON.stringify(err) }] };
}

function ok(data: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

export function createServer(): SynapseServer {
  const identity = new EnvIdentity();
  const clock = new RealClock();
  const store = new Store(identity, clock);
  const redactor = createRedactor();
  const watcher = new PollWatcher(store, process.env.SYNAPSE_DB_DIR ?? join(homedir(), ".synapse"), identity.namespace(), parseInt(process.env.SYNAPSE_POLL_MS ?? "200", 10));

  const server = new McpServer({
    name: "synapse",
    version: "0.1.0",
  });

  function requireAgent(): string | null {
    return identity.agentId();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers: Record<string, (args: any) => any> = {
    synapse_status: () => {
      const agents = store.listPresence();
      return {
        contractVersion: "0.1.0",
        schemaVersion: store.schemaVersion(),
        namespace: identity.namespace(),
        dbPath: identity.dbPath(),
        agentId: identity.agentId() ?? "unknown",
        eventCount: store.eventCount(),
        latestOffset: store.latestOffset(),
        agents,
        warnings: [],
      };
    },

    synapse_export: (args: { since?: Offset; until?: Offset; kinds?: EventKind[]; scope?: Scope; limit: number }) => {
      const agentId = requireAgent() ?? "anonymous";
      return store.exportEvents({ agentId, ...args });
    },

    synapse_record_delete: (args: { targetId: Offset; reason: string }) => {
      const agentId = requireAgent();
      if (!agentId) return synapseError("IDENTITY_REQUIRED", "mutating tool requires SYNAPSE_AGENT_ID");
      // Redact the reason (F007).
      const redactedReason = redactor.redact(args.reason).text;
      try {
        return store.tombstone({ agentId, targetId: args.targetId, reason: redactedReason });
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") return synapseError("NOT_FOUND", "target record not found");
        throw e;
      }
    },

    bus_publish: (args: { topic: string; body: string; ttlMs?: number }) => {
      const agentId = requireAgent();
      if (!agentId) return synapseError("IDENTITY_REQUIRED", "mutating tool requires SYNAPSE_AGENT_ID");
      // Redact body before persistence (F007).
      const redactedBody = redactor.redact(args.body).text;
      return store.appendEvent({
        agentId,
        kind: "message",
        scope: "shared",
        topic: args.topic,
        payload: { body: redactedBody, expiresAt: args.ttlMs ? Date.now() + args.ttlMs : undefined },
      });
    },

    bus_subscribe: (args: { topics: string[] }) => {
      return { ok: true, resourceUri: "synapse://events", topics: args.topics };
    },

    bus_messages: (args: { topic?: string; since: Offset; limit: number }) => {
      const agentId = requireAgent() ?? "anonymous";
      const messages = store.queryMessages({ agentId, topic: args.topic, since: args.since, limit: args.limit });
      return { messages, nextOffset: messages.length > 0 ? messages[messages.length - 1].offset + 1 : args.since };
    },

    bus_dm: (args: { to: string; body: string; ttlMs?: number }) => {
      const agentId = requireAgent();
      if (!agentId) return synapseError("IDENTITY_REQUIRED", "mutating tool requires SYNAPSE_AGENT_ID");
      // Redact body before persistence (F007).
      const redactedBody = redactor.redact(args.body).text;
      return store.appendEvent({
        agentId,
        kind: "dm",
        scope: "shared",
        toAgent: args.to,
        payload: { body: redactedBody, expiresAt: args.ttlMs ? Date.now() + args.ttlMs : undefined },
      });
    },

    bus_reserve: (args: { resourceGlob: string; ttlMs: number }) => {
      const agentId = requireAgent();
      if (!agentId) return synapseError("IDENTITY_REQUIRED", "mutating tool requires SYNAPSE_AGENT_ID");
      return store.reserve({ agentId, resourceGlob: args.resourceGlob, ttlMs: args.ttlMs });
    },

    bus_release: (args: { resourceGlob: string }) => {
      const agentId = requireAgent();
      if (!agentId) return synapseError("IDENTITY_REQUIRED", "mutating tool requires SYNAPSE_AGENT_ID");
      return store.release({ agentId, resourceGlob: args.resourceGlob });
    },

    bus_reservations: (args: { globFilter?: string }) => {
      return { reservations: store.listReservations(args) };
    },

    bus_presence: (args: { caps?: string[] }) => {
      const agentId = requireAgent();
      if (!agentId) return synapseError("IDENTITY_REQUIRED", "mutating tool requires SYNAPSE_AGENT_ID");
      store.upsertPresence({ agentId, caps: args.caps });
      return { agents: store.listPresence() };
    },

    memory_remember: (args: { content: string; type?: MemoryType; scope?: Scope; tags?: string[]; evidence?: string[]; confidence?: number }) => {
      const agentId = requireAgent();
      if (!agentId) return synapseError("IDENTITY_REQUIRED", "mutating tool requires SYNAPSE_AGENT_ID");
      const { text: redactedContent, count: redactions } = redactor.redact(args.content);
      const scope = args.scope ?? "private";
      const result = store.appendEvent({
        agentId,
        kind: "memory",
        scope,
        payload: {
          type: args.type ?? "fact",
          content: redactedContent,
          tags: args.tags,
          evidence: args.evidence,
          confidence: args.confidence,
        },
      });
      return { id: result.offset, ts: result.ts, redactions };
    },

    memory_recall: (args: { query: string; scope?: Scope; type?: MemoryType; tags?: string[]; limit: number }) => {
      const agentId = requireAgent() ?? "anonymous";
      return store.recall({ agentId, query: args.query, scope: args.scope, type: args.type, tags: args.tags, limit: args.limit });
    },

    memory_supersede: (args: { targetId: Offset; content?: string; reason?: string }) => {
      const agentId = requireAgent();
      if (!agentId) return synapseError("IDENTITY_REQUIRED", "mutating tool requires SYNAPSE_AGENT_ID");
      // F002: enforce visibility/ownership before superseding.
      // The store.supersede method checks scope and ownership atomically.
      let redactedContent: string | undefined;
      if (args.content) {
        redactedContent = redactor.redact(args.content).text;
      }
      const redactedReason = args.reason ? redactor.redact(args.reason).text : undefined;
      try {
        return store.supersede({
          agentId,
          targetId: args.targetId,
          content: redactedContent,
          reason: redactedReason,
        });
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") return synapseError("NOT_FOUND", "target record not found or not visible to you");
        throw e;
      }
    },

    memory_history: (args: { id?: Offset; query?: string; limit: number }) => {
      const agentId = requireAgent() ?? "anonymous";
      return { records: store.history({ agentId, id: args.id, query: args.query, limit: args.limit }) };
    },
  };

  // Register all tools via the SDK.
  for (const [name, spec] of Object.entries(TOOLS)) {
    const toolName = name as ToolName;
    const handler = handlers[name];
    if (!handler) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.registerTool(
      toolName,
      {
        description: toolName.replace(/_/g, " "),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputSchema: spec.input as any,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const parsed = (spec.input as any).safeParse(args);
          if (!parsed.success) {
            return synapseError("INVALID_INPUT", parsed.error.issues.map((i: any) => i.message).join("; "));
          }
          const result = handler(parsed.data);
          if (result && typeof result === "object" && "isError" in result) {
            return result;
          }
          return ok(result);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return synapseError("INTERNAL", msg);
        }
      },
    );
  }

  // Register a subscribable resource so sendResourceUpdated works.
  server.resource(
    "events",
    "synapse://events",
    async () => ({
      contents: [
        {
          uri: "synapse://events",
          text: JSON.stringify({ latestOffset: store.latestOffset() }),
          mimeType: "application/json",
        },
      ],
    }),
  );

  // Start the watcher (notifications to this client).
  watcher.start();
  // F006: wire tick() into the store's append path so cross-process
  // watchers get woken immediately after a write.
  store.onAppend = () => { void watcher.tick(); };
  watcher.onChange(() => {
    server.server.sendResourceUpdated({ uri: "synapse://events" }).catch(() => {
      // Best-effort; client polls as fallback.
    });
  });

  return { server, store, watcher };
}

export async function main(): Promise<void> {
  const { server, store, watcher } = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const keepAlive = setInterval(() => { }, 1 << 30);
  const cleanup = () => {
    clearInterval(keepAlive);
    watcher.stop();
    store.close();
    process.exit(0);
  };
  process.once("SIGTERM", cleanup);
  process.once("SIGINT", cleanup);
}

main().catch((e) => {
  process.stderr.write("[synapse] fatal: " + (e as Error).message + "\n");
  process.exit(1);
});
