// synapse bridge — universal-compat entry for stdio-only hosts. NOT a raw byte relay:
// downstream is a low-level MCP Server over stdio; upstream is an MCP Client over
// Streamable HTTP to the sidecar. Tool/resource calls proxy upstream; the upstream's
// resources/updated + list_changed notifications are forwarded downstream so realtime
// push reaches the stdio host. One bridge process per host MCP client.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema,
  ResourceListChangedNotificationSchema, ResourceUpdatedNotificationSchema, SubscribeRequestSchema, UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureSidecar } from "./bootstrap.js";
import { CONTRACT_VERSION, SERVER_INSTRUCTIONS } from "./contract.js";
import { projectKey } from "./namespace.js";

export interface BridgeOptions { url: string; token: string; agentId?: string; projectKeyValue?: string; downstream?: Transport }

/**
 * Resolve the project key for isolation. Precedence (highest wins), all funnelled
 * through `projectKey()` so the override contract is single-sourced:
 *   1. `SYNAPSE_PROJECT` env / opts.projectKeyValue (bridge-level override)
 *   2. `SYNAPSE_NAMESPACE` env (namespace-level override, honoured inside projectKey)
 *   3. the host's first MCP root (file:// URI), so a host that launches the bridge
 *      outside the workspace still isolates to the right project (P4.3)
 *   4. cwd git-root (the default physical-isolation path)
 * Roots are fetched from the connected host client; if unavailable/empty we fall back.
 */
async function resolveProjectKey(server: Server, fallbackCwd: string, override?: string): Promise<string> {
  const explicit = override ?? process.env["SYNAPSE_PROJECT"];
  // An explicit bridge override wins outright and is resolved/hashed by projectKey (which
  // also honours SYNAPSE_NAMESPACE when no explicit override is supplied). Single-sourcing
  // here keeps the override contract consistent across bridge and namespace callers.
  if (explicit && explicit.trim()) return projectKey(explicit, explicit);
  // Ask the host for its first root (file:// URI) so a host that launches the bridge
  // outside the workspace still isolates to the right project (P4.3). The request queues
  // until the host finishes initialize; a host that lacks the roots capability throws a
  // catchable -32601. Either way we fall back to the cwd git-root. Bounded so a host
  // that never responds can't wedge bridge startup.
  try {
    const res = await withTimeout(server.listRoots(), 2000);
    const first = res.roots?.[0]?.uri;
    if (first) {
      const local = first.startsWith("file:") ? fileURLToPath(first) : first;
      return projectKey(local);
    }
  } catch { /* host lacks roots, timed out, or returned none — fall back to cwd */ }
  return projectKey(fallbackCwd);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("roots/list timed out")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function startBridge(opts: BridgeOptions): Promise<{ server: Server; client: Client; close: () => Promise<void> }> {
  // The downstream (host) is connected first so we can ask it for roots; the upstream
  // sidecar client is then connected with the resolved project key in the header. This
  // keeps isolation correct even when the host launches the bridge outside the workspace.
  // Because the host may send requests immediately after initialize, the request handlers
  // gate on `upstreamReady` so they never fire before the sidecar client is connected.
  const downstream = opts.downstream ?? new StdioServerTransport();
  const server = new Server(
    { name: "synapse", version: CONTRACT_VERSION },
    { capabilities: { tools: {}, resources: { subscribe: true, listChanged: true } }, instructions: SERVER_INSTRUCTIONS },
  );
  let client!: Client;
  let settleUpstream!: (err?: unknown) => void;
  // `upstreamReady` resolves once the sidecar client connects, or rejects if it fails so
  // gated host requests get an error instead of hanging forever (a request that arrived
  // between server.connect and client.connect would otherwise wait on a never-settling
  // promise if client.connect threw and startBridge rejected).
  const upstreamReady = new Promise<void>((resolve, reject) => { settleUpstream = (err) => err ? reject(err) : resolve(); });
  // Attach a no-op rejection consumer so that if client.connect fails before any host
  // request has arrived (no whenUpstream chain yet attached), the rejected promise does
  // not surface as an unhandled rejection. The thrown error from startBridge is the real
  // signal; this just prevents a stray process warning in embedded/test callers.
  upstreamReady.catch(() => { });
  const whenUpstream = <T>(fn: () => Promise<T>): Promise<T> => upstreamReady.then(() => fn());
  server.setRequestHandler(ListToolsRequestSchema, () => whenUpstream(() => client.listTools()));
  server.setRequestHandler(CallToolRequestSchema, (req) => whenUpstream(() => client.callTool(req.params)));
  server.setRequestHandler(ListResourcesRequestSchema, () => whenUpstream(() => client.listResources()));
  server.setRequestHandler(ReadResourceRequestSchema, (req) => whenUpstream(() => client.readResource(req.params)));
  server.setRequestHandler(SubscribeRequestSchema, (req) => whenUpstream(() => client.subscribeResource(req.params)));
  server.setRequestHandler(UnsubscribeRequestSchema, (req) => whenUpstream(() => client.unsubscribeResource(req.params)));
  await server.connect(downstream);
  const projectKeyValue = await resolveProjectKey(server, process.cwd(), opts.projectKeyValue);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
    "x-synapse-project": projectKeyValue,
    // always send identity: this bridge process is per host-client, so its pid is a
    // stable distinct fallback when SYNAPSE_AGENT_ID is unset (fixes shared-pid collisions).
    "x-synapse-agent": opts.agentId ?? `agent-${process.pid}`,
  };

  try {
    client = new Client({ name: "synapse-bridge", version: CONTRACT_VERSION });
    await client.connect(new StreamableHTTPClientTransport(new URL(opts.url), { requestInit: { headers } }));
    client.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => { void server.sendResourceUpdated(n.params); });
    client.setNotificationHandler(ResourceListChangedNotificationSchema, () => { void server.sendResourceListChanged(); });
    settleUpstream();
  } catch (err) {
    settleUpstream(err);
    throw err;
  }

  return { server, client, close: async () => { await server.close(); await client.close(); } };
}

async function main(): Promise<void> {
  const dbDir = process.env["SYNAPSE_DB_DIR"] ?? join(homedir(), ".synapse");
  let url = process.env["SYNAPSE_URL"];
  let token = process.env["SYNAPSE_TOKEN"];
  if (!url || !token) {
    // zero-config: discover or autostart the shared sidecar
    const port = process.env["SYNAPSE_PORT"] ? Number(process.env["SYNAPSE_PORT"]) : undefined;
    const d = await ensureSidecar(dbDir, port);
    url = url ?? d.url;
    token = token ?? d.token;
  }
  const opts: BridgeOptions = { url, token };
  const agent = process.env["SYNAPSE_AGENT_ID"];
  if (agent) opts.agentId = agent;
  const proj = process.env["SYNAPSE_PROJECT"];
  if (proj) opts.projectKeyValue = proj;
  await startBridge(opts);
  process.stderr.write(`[synapse-bridge] relaying stdio <-> ${url}\n`);
}

if (process.argv[1] && process.argv[1].endsWith("bridge.js")) {
  main().catch((e) => { process.stderr.write(`[synapse-bridge] fatal: ${e instanceof Error ? e.message : String(e)}\n`); process.exit(1); });
}
