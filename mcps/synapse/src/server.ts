// synapse server — one stdio MCP server per host session. It serves the seven tools straight from
// the SQLite files under SYNAPSE_DB_DIR (default ~/.synapse). Every session's server opens those
// files itself; SQLite serializes their writers, so no process owns the data.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { SystemClock } from "./clock.js";
import { CONTRACT_VERSION, SERVER_INSTRUCTIONS } from "./contract.js";
import { deriveAgentId } from "./identity.js";
import { canonicalRoot, hashKey, projectKey } from "./namespace.js";
import { Store } from "./store.js";
import { buildToolSet, toolSpecs, type SessionCtx } from "./tools.js";

// Deprecated compatibility: Cline and Cursor answer roots/list with raw absolute paths
// instead of file:// URIs. The SDK's typed listRoots() validates the strict result
// schema and throws before a conversion can run, so parse loosely here and normalize
// below. New hosts should emit file:// URIs; raw paths are accepted, not encouraged.
const CompatListRootsResultSchema = z.object({
  roots: z.array(z.object({ uri: z.string() }).passthrough()).optional(),
}).passthrough();

export interface ServerOptions {
  dbDir: string;
  downstream?: Transport;
  agentId?: string;
  projectKeyValue?: string;
  negotiationTimeoutMs?: number;
}

/**
 * Resolve the project key for isolation. Precedence (highest wins):
 *   1. `SYNAPSE_PROJECT` env / opts.projectKeyValue, canonicalized to its git root realpath
 *   2. `SYNAPSE_NAMESPACE` env (namespace-level override, honoured inside projectKey)
 *   3. the host's first MCP root (file:// URI), so a host that launches the server
 *      outside the workspace still isolates to the right project
 *   4. cwd git-root (the default physical-isolation path)
 * An initialized host that advertises no roots, or returns an explicit empty list,
 * falls back to cwd. Failed or timed-out roots negotiation fails server startup,
 * unless `SYNAPSE_ROOTS=ignore` skips roots for this host.
 */
async function resolveProjectKey(server: Server, fallbackCwd: string, timeoutMs: number, override?: string): Promise<string> {
  // Validated first, so a bad value fails startup even when an explicit project wins below.
  const skipRoots = ignoresRoots(process.env["SYNAPSE_ROOTS"]);
  const explicit = override ?? process.env["SYNAPSE_PROJECT"];
  // An explicit project wins outright, even over SYNAPSE_NAMESPACE (which projectKey honours
  // below), and gets the same git-root canonicalization a cwd gets.
  if (explicit && explicit.trim()) return canonicalRoot(explicit.trim());
  // FastMCP's multi-server proxy advertises roots but answers roots/list with an error
  // outside a request, so its hosts can never negotiate roots. The installer opts out only
  // for hosts verified to start this server in the workspace, where cwd is the project.
  if (skipRoots) return projectKey(fallbackCwd);
  // Ask the host for its first root only when initialize advertised roots support. Some
  // clients treat an unsupported roots/list request as a protocol warning even when the
  // server catches the response, so capability-gating is part of correct MCP behavior.
  // The request remains bounded so a roots-capable host cannot wedge server startup.
  // A failed request cannot safely fall back: cwd may belong to a different project.
  if (!server.getClientCapabilities()?.roots) return projectKey(fallbackCwd);
  const res = await withTimeout(server.request({ method: "roots/list" }, CompatListRootsResultSchema), timeoutMs, "roots/list");
  const first = res.roots?.[0]?.uri;
  if (first) {
    const local = first.startsWith("file:") ? fileURLToPath(first) : first;
    return projectKey(local);
  }
  return projectKey(fallbackCwd);
}

// An unknown value fails startup rather than silently keeping or dropping roots routing.
function ignoresRoots(mode: string | undefined): boolean {
  if (mode === undefined || mode === "") return false;
  if (mode === "ignore") return true;
  throw new Error(`SYNAPSE_ROOTS must be "ignore" when set, got ${JSON.stringify(mode)}`);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function startServer(opts: ServerOptions): Promise<{ server: Server; ctx: SessionCtx; close: () => Promise<void> }> {
  const downstream = opts.downstream ?? new StdioServerTransport();
  const negotiationTimeoutMs = opts.negotiationTimeoutMs ?? 10_000;
  if (!Number.isInteger(negotiationTimeoutMs) || negotiationTimeoutMs <= 0) {
    throw new Error("negotiationTimeoutMs must be a positive integer");
  }
  const server = new Server({ name: "synapse", version: CONTRACT_VERSION }, { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS });
  const store = new Store({ clock: new SystemClock(), dbDir: opts.dbDir, globalDbPath: join(opts.dbDir, "global.sqlite") });
  let settleInitialized!: () => void;
  const initialized = new Promise<void>((resolve) => { settleInitialized = resolve; });
  server.oninitialized = settleInitialized;
  // The project is known only after initialize (it may come from the host's roots), so a call that
  // arrives first waits for it; a failed resolution fails the call instead of leaving it pending.
  let settleTools!: (tools: ReturnType<typeof buildToolSet> | Error) => void;
  const toolsReady = new Promise<ReturnType<typeof buildToolSet>>((resolve, reject) => {
    settleTools = (t) => (t instanceof Error ? reject(t) : resolve(t));
  });
  toolsReady.catch(() => { });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolSpecs() }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => (await toolsReady).call(req.params.name, req.params.arguments));
  await server.connect(downstream);
  let ctx: SessionCtx;
  try {
    // Server.connect starts the passive transport and can return before the host's
    // initialize exchange arrives; roots support is known only after it.
    await withTimeout(initialized, negotiationTimeoutMs, "downstream initialize");
    const key = await resolveProjectKey(server, process.cwd(), negotiationTimeoutMs, opts.projectKeyValue);
    const agentId = deriveAgentId(opts.agentId, server.getClientVersion()?.name);
    // Locks belong to this process, not to its agent id, which every session of one host shares.
    ctx = { agentId, lockOwner: `${agentId}#${process.pid}`, projectDbPath: join(opts.dbDir, `${hashKey(key)}.sqlite`) };
  } catch (err) {
    settleTools(err instanceof Error ? err : new Error(String(err)));
    await server.close().catch(() => { });
    store.close();
    throw err;
  }
  settleTools(buildToolSet(store, ctx));
  return { server, ctx, close: async () => { await server.close(); store.close(); } };
}

async function main(): Promise<void> {
  let running: Awaited<ReturnType<typeof startServer>> | undefined;
  let closing = false;
  const closeWhenHostLeaves = (): void => {
    if (closing) return;
    closing = true;
    if (!running) process.exit(0);
    void running.close()
      .catch((e) => { process.stderr.write(`[synapse] close failed: ${e instanceof Error ? e.message : String(e)}\n`); })
      .finally(() => { process.exit(0); });
  };
  process.stdin.once("end", closeWhenHostLeaves);
  process.stdin.once("close", closeWhenHostLeaves);
  const opts: ServerOptions = { dbDir: process.env["SYNAPSE_DB_DIR"] ?? join(homedir(), ".synapse"), downstream: new StdioServerTransport() };
  const agent = process.env["SYNAPSE_AGENT_ID"];
  if (agent) opts.agentId = agent;
  running = await startServer(opts);
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  main().catch((e) => { process.stderr.write(`[synapse] fatal: ${e instanceof Error ? e.message : String(e)}\n`); process.exit(1); });
}
