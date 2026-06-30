// synapse sidecar — ONE local process: sole store owner + realtime hub for many
// concurrent agent sessions over Streamable HTTP (127.0.0.1 + bearer + DNS-rebind
// protection). Each session is a low-level MCP Server (so we can advertise + handle
// resources/subscribe, which the high-level McpServer does NOT) bound to the session's
// project namespace. On a committed write the store fires onCommit(channel) and we push
// notifications/resources/updated to sessions in that namespace subscribed to the URI.
// Push is best-effort; cursor pull (memory_recall{since}/lock_list) is the floor.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema,
  ReadResourceRequestSchema, SubscribeRequestSchema, UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { readOrCreateToken, removeDiscovery, writeDiscovery } from "./bootstrap.js";
import { SystemClock } from "./clock.js";
import { CONTRACT_VERSION, SERVER_INSTRUCTIONS, type IStore } from "./contract.js";
import { deriveAgentId } from "./identity.js";
import { hashKey, projectKey } from "./namespace.js";
import { createRedactor } from "./redactor.js";
import { GLOBAL_CHANNEL, Store } from "./store.js";
import { buildToolSet, type SessionCtx } from "./tools.js";

const GLOBAL_URI = "synapse://global/changes";
const BODY_TOO_LARGE = Symbol("synapse:body-too-large");
const projectUriFor = (projectDbPath: string): string => `synapse://project/${basename(projectDbPath).replace(/\.sqlite$/, "")}/changes`;
const DEFAULT_COALESCE_MS = 50;

/**
 * Leading+trailing-edge coalescer (per channel): the first commit fires immediately so
 * realtime latency stays low, and a burst of commits within `windowMs` collapses into at
 * most one trailing notification. This bounds host churn on burst writes (P4.2) while
 * keeping the correctness floor (cursor pull) untouched. Best-effort: a slow host that
 * ignores `resources/updated` still stays correct via `recall({since})`.
 */
class NotificationCoalescer {
  private pending = new Map<string, boolean>();
  private timers = new Map<string, NodeJS.Timeout>();
  constructor(private windowMs: number, private emit: (channel: string) => void) { }
  trigger(channel: string): void {
    if (this.windowMs <= 0) { this.emit(channel); return; }
    if (!this.pending.has(channel)) {
      // leading edge: first commit in a quiet period notifies immediately. The window-
      // close timer is still armed so the pending entry is cleared after windowMs; without
      // it the entry would leak and the next isolated write (any gap) would take the
      // trailing branch and be delayed by windowMs instead of emitted immediately.
      this.pending.set(channel, false);
      this.emit(channel);
    } else {
      // within the window: mark a trailing emission needed
      this.pending.set(channel, true);
    }
    // always (re)arm the window-close timer on both edges so the pending entry is reaped
    // and a quiet period after a lone write restores immediate leading-edge emission.
    const existing = this.timers.get(channel);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      if (this.pending.get(channel)) this.emit(channel);
      this.pending.delete(channel);
      this.timers.delete(channel);
    }, this.windowMs);
    t.unref?.();
    this.timers.set(channel, t);
  }
  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.pending.clear();
  }
}

interface Session { transport: StreamableHTTPServerTransport; server: Server; projectDbPath: string; projectUri: string; subscribed: Set<string> }

export interface SidecarOptions { store?: IStore; token: string; host?: string; port?: number; dbDir?: string; coalesceMs?: number }
export interface SidecarHandle { httpServer: HttpServer; url: string; port: number; close: () => Promise<void> }

export async function createSidecar(opts: SidecarOptions): Promise<SidecarHandle> {
  const host = opts.host ?? "127.0.0.1";
  const dbDir = opts.dbDir ?? process.env["SYNAPSE_DB_DIR"] ?? join(homedir(), ".synapse");
  const sessions = new Map<string, Session>();
  let boundPort = opts.port ?? 0;

  const emitNotification = (channel: string): void => {
    for (const s of sessions.values()) {
      let uri: string | undefined;
      if (channel === GLOBAL_CHANNEL && s.subscribed.has(GLOBAL_URI)) uri = GLOBAL_URI;
      else if (channel === s.projectDbPath && s.subscribed.has(s.projectUri)) uri = s.projectUri;
      if (uri) void s.server.sendResourceUpdated({ uri }).catch(() => { /* best-effort */ });
    }
  };
  const coalescer = new NotificationCoalescer(opts.coalesceMs ?? DEFAULT_COALESCE_MS, emitNotification);

  const store: IStore = opts.store ?? new Store({
    clock: new SystemClock(), redactor: createRedactor(), dbDir, globalDbPath: join(dbDir, "global.sqlite"),
    onCommit: (channel) => { coalescer.trigger(channel); },
  });

  const ctxFromHeaders = (req: IncomingMessage): SessionCtx => {
    const h = (k: string): string | undefined => { const v = req.headers[k]; return Array.isArray(v) ? v[0] : v; };
    // Identity is provenance only. With an explicit header use it; otherwise give this
    // SESSION a unique id (never the shared sidecar pid) so locks/provenance stay distinct.
    const explicit = h("x-synapse-agent");
    const agentId = explicit ? deriveAgentId(explicit, h("x-synapse-client")) : `anon-${randomUUID().slice(0, 8)}`;
    const key = h("x-synapse-project");
    return { agentId, projectDbPath: join(dbDir, `${hashKey(key ? projectKey(key) : "default")}.sqlite`) };
  };

  function newSession(ctx: SessionCtx): StreamableHTTPServerTransport {
    const projectUri = projectUriFor(ctx.projectDbPath);
    const subscribed = new Set<string>();
    const server = new Server(
      { name: "synapse", version: CONTRACT_VERSION },
      { capabilities: { tools: {}, resources: { subscribe: true, listChanged: true } }, instructions: SERVER_INSTRUCTIONS },
    );
    const tools = buildToolSet(store, ctx);
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.specs }));
    server.setRequestHandler(CallToolRequestSchema, async (req) => tools.call(req.params.name, req.params.arguments));
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        { uri: projectUri, name: "project-changes", description: "Dirty-bit for this project's memory/locks. On update, re-pull via memory_recall({since}) / lock_list." },
        { uri: GLOBAL_URI, name: "global-changes", description: "Dirty-bit for global memory." },
      ],
    }));
    server.setRequestHandler(ReadResourceRequestSchema, async (req) => ({ contents: [{ uri: req.params.uri, text: JSON.stringify({ changedAt: Date.now() }) }] }));
    server.setRequestHandler(SubscribeRequestSchema, async (req) => { subscribed.add(req.params.uri); return {}; });
    server.setRequestHandler(UnsubscribeRequestSchema, async (req) => { subscribed.delete(req.params.uri); return {}; });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: true,
      allowedHosts: [`127.0.0.1:${boundPort}`, `localhost:${boundPort}`],
      onsessioninitialized: (sid: string) => { sessions.set(sid, { transport, server, projectDbPath: ctx.projectDbPath, projectUri, subscribed }); },
    });
    transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
    void server.connect(transport);
    return transport;
  }

  const MAX_BODY_BYTES = 2 * 1024 * 1024; // hard cap before JSON.parse (F005)
  const readBody = (req: IncomingMessage): Promise<unknown> => new Promise((resolve) => {
    let raw = ""; let bytes = 0; let over = false;
    req.on("data", (c: Buffer) => {
      if (over) return;
      bytes += c.length;
      if (bytes > MAX_BODY_BYTES) { over = true; raw = ""; return; } // stop buffering (bound memory), drain to end
      raw += c;
    });
    req.on("end", () => { if (over) { resolve(BODY_TOO_LARGE); return; } try { resolve(raw ? JSON.parse(raw) : undefined); } catch { resolve(undefined); } });
    req.on("error", () => resolve(over ? BODY_TOO_LARGE : undefined));
  });
  const isInit = (b: unknown): boolean => typeof b === "object" && b !== null && (b as { method?: string }).method === "initialize";

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.method === "GET" && (req.url === "/health" || (req.url ?? "").startsWith("/health?"))) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, name: "synapse", version: CONTRACT_VERSION })); return;
      }
      if (req.headers.authorization !== `Bearer ${opts.token}`) {
        res.writeHead(401, { "content-type": "application/json", "www-authenticate": 'Bearer realm="synapse"' });
        res.end(JSON.stringify({ error: "unauthorized" })); return;
      }
      const sidRaw = req.headers["mcp-session-id"];
      const sid = Array.isArray(sidRaw) ? sidRaw[0] : sidRaw;
      const body = req.method === "POST" ? await readBody(req) : undefined;
      if (body === BODY_TOO_LARGE) { res.writeHead(413, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "payload too large" })); return; }
      let transport: StreamableHTTPServerTransport | undefined;
      if (sid && sessions.has(sid)) transport = sessions.get(sid)!.transport;
      else if (!sid && req.method === "POST" && isInit(body)) transport = newSession(ctxFromHeaders(req));
      else { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "no valid session" })); return; }
      await transport.handleRequest(req, res, body);
    } catch (e) {
      if (!res.headersSent) { res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: e instanceof Error ? e.message : "internal" })); }
    }
  });

  boundPort = await new Promise<number>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(opts.port ?? 0, host, () => {
      httpServer.removeListener("error", reject);
      const a = httpServer.address();
      resolve(typeof a === "object" && a ? a.port : (opts.port ?? 0));
    });
  });

  return {
    httpServer, port: boundPort, url: `http://${host}:${boundPort}/mcp`,
    close: () => new Promise<void>((resolve) => {
      coalescer.dispose();
      for (const s of sessions.values()) s.transport.close();
      store.close();
      httpServer.close(() => resolve());
    }),
  };
}

// ---- entrypoint ------------------------------------------------------------
async function main(): Promise<void> {
  const dbDir = process.env["SYNAPSE_DB_DIR"] ?? join(homedir(), ".synapse");
  const token = process.env["SYNAPSE_TOKEN"] ?? readOrCreateToken(dbDir);
  const port = process.env["SYNAPSE_PORT"] ? Number(process.env["SYNAPSE_PORT"]) : 4319;
  // SYNAPSE_COALESCE_MS overrides the dirty-bit coalesce window (default 50ms). Set 0 to
  // restore immediate-emit-on-every-commit semantics for rollout validation or hosts that
  // need the lowest possible notification latency. Non-numeric/invalid values fall back to
  // the default rather than producing a NaN window (which setTimeout would treat as ~0).
  const rawCoalesce = process.env["SYNAPSE_COALESCE_MS"];
  const coalesceMs = rawCoalesce !== undefined && rawCoalesce !== ""
    ? (Number.isFinite(Number(rawCoalesce)) ? Number(rawCoalesce) : undefined)
    : undefined;
  try {
    const h = await createSidecar({ token, port, dbDir, coalesceMs });
    writeDiscovery(dbDir, { url: h.url, token, port: h.port, pid: process.pid, startedAt: Date.now() });
    const cleanup = (): void => { try { removeDiscovery(dbDir); } catch { /* ignore */ } };
    process.on("SIGTERM", () => { cleanup(); process.exit(0); });
    process.on("SIGINT", () => { cleanup(); process.exit(0); });
    process.on("exit", cleanup);
    process.stderr.write(`[synapse] sidecar on ${h.url}\n`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") { process.stderr.write("[synapse] port busy; another sidecar is running — exiting\n"); process.exit(0); }
    throw e;
  }
}

if (process.argv[1] && process.argv[1].endsWith("sidecar.js")) {
  main().catch((e) => { process.stderr.write(`[synapse] fatal: ${e instanceof Error ? e.message : String(e)}\n`); process.exit(1); });
}
