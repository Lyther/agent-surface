// S-01 live proof: spawn the BUILT bridge as a subprocess (stdio), drive it as an MCP
// host, and confirm (a) tool calls proxy to the sidecar and (b) a sidecar
// resources/updated push is forwarded back over the bridge's stdio to the host.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createSidecar } from "../src/sidecar.js";

const TOKEN = "bridge-token-xyz";
const PROJECT = "/tmp/projBridgeTest";
const bridgeJs = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "bridge.js");
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const parseResults = (r: unknown): { results: unknown[] } =>
  JSON.parse((((r as { content?: { text: string }[] }).content ?? [])[0]!).text) as { results: unknown[] };

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
      throw error;
    }
    await delay(25);
  }
  return false;
}

test("bridge: proxies tools/list + tools/call AND forwards realtime resources/updated", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-br-"));
  const sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  const host = new Client({ name: "host", version: "0.0.1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bridgeJs],
    env: { ...(process.env as Record<string, string>), SYNAPSE_URL: sc.url, SYNAPSE_TOKEN: TOKEN, SYNAPSE_AGENT_ID: "bridge-agent", SYNAPSE_PROJECT: PROJECT },
  });
  try {
    await host.connect(transport);

    // (a) proxy: tools/list through the bridge
    const tools = await host.listTools();
    assert.equal(tools.tools.length, 7, "bridge proxies 7 tools");

    // (b) realtime: host subscribes via bridge; a DIRECT writer to the same project pushes
    const got: string[] = [];
    host.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => { got.push(n.params.uri); });
    const res = await host.listResources();
    const projectUri = res.resources.find((r) => r.uri.includes("/project/"))!.uri;
    await host.subscribeResource({ uri: projectUri });

    const writer = new Client({ name: "writer", version: "0.0.1" });
    await writer.connect(new StreamableHTTPClientTransport(new URL(sc.url), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}`, "x-synapse-agent": "writer", "x-synapse-project": PROJECT } },
    }));
    await writer.callTool({ name: "memory_remember", arguments: { content: "bridge realtime ping marker" } });

    const start = Date.now();
    while (got.length === 0 && Date.now() - start < 4000) await delay(50);
    assert.ok(got.includes(projectUri), `host received forwarded resources/updated (got ${JSON.stringify(got)})`);

    // pull floor still works through the bridge
    const recalled = parseResults(await host.callTool({ name: "memory_recall", arguments: { query: "bridge realtime" } }));
    assert.equal(recalled.results.length, 1, "pull via bridge returns the record");

    await writer.close();
  } finally { await host.close().catch(() => { }); await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("bridge: reconnects upstream and retries after a sidecar restart", async () => {
  // install.mjs redistribution kills and restarts the sidecar; the restarted sidecar has
  // an empty session map. Existing bridges must re-initialize their upstream session
  // instead of failing every subsequent call with "no valid session".
  const dir = mkdtempSync(join(tmpdir(), "synapse-restart-"));
  let sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  const port = sc.port;
  const host = new Client({ name: "host-restart", version: "0.0.1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bridgeJs],
    env: { ...(process.env as Record<string, string>), SYNAPSE_URL: sc.url, SYNAPSE_TOKEN: TOKEN, SYNAPSE_AGENT_ID: "restart-agent", SYNAPSE_PROJECT: PROJECT },
  });
  try {
    await host.connect(transport);
    assert.equal((await host.listTools()).tools.length, 7, "before restart: 7 tools");

    await sc.close();
    sc = await createSidecar({ token: TOKEN, port, dbDir: dir });

    assert.equal((await host.listTools()).tools.length, 7, "after restart: bridge re-initializes upstream and still serves 7 tools");
  } finally { await host.close().catch(() => { }); await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("bridge: exits when its stdio host disconnects", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-eof-"));
  const sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  const host = new Client({ name: "host-eof", version: "0.0.1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bridgeJs],
    env: { ...(process.env as Record<string, string>), SYNAPSE_URL: sc.url, SYNAPSE_TOKEN: TOKEN, SYNAPSE_PROJECT: PROJECT },
  });
  try {
    await host.connect(transport);
    const pid = transport.pid;
    assert.ok(pid, "spawned bridge pid is available");

    const closing = host.close();
    assert.equal(await waitForExit(pid, 750), true, "bridge exits from stdio EOF without waiting for forced termination");
    await closing;
  } finally {
    await host.close().catch(() => { });
    await sc.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// SUBSTITUTE_JUSTIFICATION
// - substitute: `stalled`, a local HTTP server that accepts but never answers the MCP request
// - replaces: the Synapse sidecar only at the pending HTTP initialization response boundary
// - necessity: the real sidecar answers initialization; it cannot safely and deterministically hold that response open
// - real-option: `createSidecar` is used by the adjacent lifecycle test, but cannot create the required stalled state
// - proof-limit: proves bridge shutdown while HTTP initialization is pending, not sidecar startup or behavior
// - real-proof: "bridge: exits when its stdio host disconnects" uses the real sidecar and distributed bridge entry
test("bridge: exits when its stdio host disconnects during stalled upstream startup", async () => {
  let markUpstreamRequest!: () => void;
  const upstreamRequested = new Promise<void>((resolve) => { markUpstreamRequest = resolve; });
  const stalled = createHttpServer((_req, _res) => { markUpstreamRequest(); /* intentionally never responds */ });
  await new Promise<void>((resolve) => stalled.listen(0, "127.0.0.1", resolve));
  const address = stalled.address();
  assert.ok(address && typeof address === "object");
  const host = new Client({ name: "host-startup-eof", version: "0.0.1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bridgeJs],
    env: {
      ...(process.env as Record<string, string>),
      SYNAPSE_URL: `http://127.0.0.1:${address.port}/mcp`,
      SYNAPSE_TOKEN: TOKEN,
      SYNAPSE_PROJECT: PROJECT,
    },
  });
  try {
    const connected = host.connect(transport).catch(() => { });
    await upstreamRequested;
    const pid = transport.pid;
    assert.ok(pid);
    const closing = transport.close();
    assert.equal(await waitForExit(pid, 750), true, "bridge exits even while upstream initialization is stalled");
    await closing;
    await connected;
  } finally {
    await host.close().catch(() => { });
    await new Promise<void>((resolve, reject) => stalled.close((error) => error ? reject(error) : resolve()));
  }
});

test("bridge: exits when its stdio host disconnects during zero-config sidecar discovery", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-discovery-eof-"));
  writeFileSync(join(dir, "sidecar.lock"), "held");
  const host = new Client({ name: "host-discovery-eof", version: "0.0.1" });
  const env = { ...(process.env as Record<string, string>) };
  delete env["SYNAPSE_URL"];
  delete env["SYNAPSE_TOKEN"];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bridgeJs],
    env: {
      ...env,
      SYNAPSE_DB_DIR: dir,
      SYNAPSE_PROJECT: PROJECT,
    },
  });
  try {
    const connected = host.connect(transport).catch(() => { });
    const pidDeadline = Date.now() + 1000;
    while (!transport.pid && Date.now() < pidDeadline) await delay(10);
    const pid = transport.pid;
    assert.ok(pid, "bridge process started before the PID deadline");
    const closing = transport.close();
    assert.equal(await waitForExit(pid, 750), true, "bridge exits while zero-config discovery is still waiting");
    await closing;
    await connected;
  } finally {
    await host.close().catch(() => { });
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bridge: zero-config autostart boots the sidecar (no URL/token)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-auto-"));
  const host = new Client({ name: "host2", version: "0.0.1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bridgeJs],
    env: { ...(process.env as Record<string, string>), SYNAPSE_DB_DIR: dir, SYNAPSE_PORT: "0", SYNAPSE_AGENT_ID: "auto-agent", SYNAPSE_PROJECT: "/tmp/projAuto" },
  });
  let sidecarPid: number | undefined;
  try {
    await host.connect(transport);
    const tools = await host.listTools();
    assert.equal(tools.tools.length, 7, "autostarted sidecar serves 7 tools");
    const w = await host.callTool({ name: "memory_remember", arguments: { content: "autostart works end to end" } });
    assert.ok(!(w as { isError?: boolean }).isError, "write succeeds via autostarted sidecar");
    const d = JSON.parse(readFileSync(join(dir, "sidecar.json"), "utf8")) as { pid: number; url: string };
    sidecarPid = d.pid;
    assert.ok(sidecarPid > 0 && d.url.startsWith("http://127.0.0.1:"), "discovery file written by autostarted sidecar");
  } finally {
    await host.close().catch(() => { });
    if (sidecarPid) { try { process.kill(sidecarPid, "SIGTERM"); } catch { /* already gone */ } }
    await delay(300);
    rmSync(dir, { recursive: true, force: true });
  }
});
