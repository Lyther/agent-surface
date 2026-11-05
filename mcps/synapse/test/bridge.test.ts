// S-01 live proof: spawn the BUILT bridge as a subprocess (stdio), drive it as an MCP
// host, and confirm (a) tool calls proxy to the sidecar and (b) a sidecar
// resources/updated push is forwarded back over the bridge's stdio to the host.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hashKey } from "../src/namespace.js";
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
  // A crashed or stopped sidecar comes back with an empty session map. Existing bridges
  // must re-initialize their upstream session
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

test("bridge: concurrent calls caught by one reconnect all recover, each write applied once", async () => {
  // The first call to fail after a restart reconnects, which closes the upstream client the others
  // are still waiting on. Those calls must recover through the same reconnect, not fail "Connection closed".
  const dir = mkdtempSync(join(tmpdir(), "synapse-concurrent-"));
  let sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  const port = sc.port;
  const host = new Client({ name: "host-concurrent", version: "0.0.1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bridgeJs],
    env: { ...(process.env as Record<string, string>), SYNAPSE_URL: sc.url, SYNAPSE_TOKEN: TOKEN, SYNAPSE_AGENT_ID: "concurrent-agent", SYNAPSE_PROJECT: PROJECT },
  });
  try {
    await host.connect(transport);
    await host.listTools();
    await sc.close();
    sc = await createSidecar({ token: TOKEN, port, dbDir: dir });

    const writes = Array.from({ length: 6 }, (_, i) => host.callTool({ name: "memory_remember", arguments: { content: `concurrent marker ${i}` } }));
    const lists = Array.from({ length: 6 }, () => host.listTools());
    const settled = await Promise.allSettled([...writes, ...lists]);
    const failures = settled.flatMap((s) => (s.status === "rejected" ? [String(s.reason)] : []));
    assert.deepEqual(failures, [], "no call fails because another call's reconnect closed its client");
    const recalled = parseResults(await host.callTool({ name: "memory_recall", arguments: { query: "concurrent marker" } }));
    assert.equal(recalled.results.length, 6, "each write is stored exactly once");
  } finally { await host.close().catch(() => { }); await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("bridge: a call that arrives during a reconnect waits for it", async () => {
  // The sidecar moves to a new port. The first call finds the old one unreachable and re-elects, and
  // a slow election keeps that reconnect open; a call sent meanwhile must not use the closed client.
  const dir = mkdtempSync(join(tmpdir(), "synapse-midreconnect-"));
  let sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  const targetFile = join(dir, "rediscover.json");
  writeFileSync(targetFile, JSON.stringify({ url: sc.url, token: TOKEN }));
  const bridgeWithSlowRediscover = [
    'import { readFileSync } from "node:fs";',
    `import { startBridge } from ${JSON.stringify(pathToFileURL(bridgeJs).href)};`,
    'const target = () => JSON.parse(readFileSync(process.env.SYNAPSE_TEST_TARGET, "utf8"));',
    "const slowly = async () => { await new Promise((r) => setTimeout(r, 600)); return target(); };",
    "await startBridge({ url: target().url, token: target().token, projectKeyValue: process.env.SYNAPSE_PROJECT, rediscover: slowly });",
    'process.stdin.once("end", () => process.exit(0));',
  ].join("\n");
  const host = new Client({ name: "host-midreconnect", version: "0.0.1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--input-type=module", "-e", bridgeWithSlowRediscover],
    env: { ...(process.env as Record<string, string>), SYNAPSE_TEST_TARGET: targetFile, SYNAPSE_PROJECT: PROJECT },
  });
  try {
    await host.connect(transport);
    await host.listTools();
    await sc.close();
    sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
    writeFileSync(targetFile, JSON.stringify({ url: sc.url, token: TOKEN }));

    const first = host.listTools();
    await delay(150);
    const meanwhile = host.listTools();
    const settled = await Promise.allSettled([first, meanwhile]);
    assert.deepEqual(settled.map((s) => (s.status === "fulfilled" ? s.value.tools.length : String(s.reason))), [7, 7]);
  } finally { await host.close().catch(() => { }); await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("bridge: after a refused reconnect, the next call reconnects once a current sidecar is back", async () => {
  // The election after a sidecar loss finds one without the features, so that reconnect is refused.
  // Once a current sidecar takes its place, the running bridge must recover on its next call instead of
  // failing every call until the host restarts it.
  const dir = mkdtempSync(join(tmpdir(), "synapse-refused-reconnect-"));
  let sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  const targetFile = join(dir, "rediscover.json");
  writeFileSync(targetFile, JSON.stringify({ url: sc.url, token: TOKEN }));
  const bridgeWithRediscover = [
    'import { readFileSync } from "node:fs";',
    `import { startBridge } from ${JSON.stringify(pathToFileURL(bridgeJs).href)};`,
    'const target = () => JSON.parse(readFileSync(process.env.SYNAPSE_TEST_TARGET, "utf8"));',
    "await startBridge({ url: target().url, token: target().token, projectKeyValue: process.env.SYNAPSE_PROJECT, rediscover: async () => target() });",
    'process.stdin.once("end", () => process.exit(0));',
  ].join("\n");
  const host = new Client({ name: "host-refused-reconnect", version: "0.0.1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--input-type=module", "-e", bridgeWithRediscover],
    env: { ...(process.env as Record<string, string>), SYNAPSE_TEST_TARGET: targetFile, SYNAPSE_PROJECT: PROJECT },
  });
  const refused = await sidecarWithoutFeatures();
  try {
    await host.connect(transport);
    await host.listTools();
    await sc.close();
    writeFileSync(targetFile, JSON.stringify({ url: refused.url, token: TOKEN }));
    await assert.rejects(host.listTools(), /earlier Synapse build/);

    await refused.close();
    sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
    writeFileSync(targetFile, JSON.stringify({ url: sc.url, token: TOKEN }));
    assert.equal((await host.listTools()).tools.length, 7, "the next call reconnected to the current sidecar");
    assert.deepEqual(refused.requests, [], "no call reached the refused sidecar");
  } finally { await host.close().catch(() => { }); await refused.close(); await sc.close(); rmSync(dir, { recursive: true, force: true }); }
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

test("bridge: SYNAPSE_URL and SYNAPSE_TOKEN must be set together", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-pair-"));
  // A held election lock: a bridge that wrongly fell back to discovery would wait here, never spawn.
  writeFileSync(join(dir, "sidecar.lock"), "held");
  const base: Record<string, string> = { ...(process.env as Record<string, string>), SYNAPSE_DB_DIR: dir, SYNAPSE_PROJECT: PROJECT };
  delete base["SYNAPSE_URL"];
  delete base["SYNAPSE_TOKEN"];
  const run = (env: Record<string, string>): Promise<{ code: number | null; stderr: string }> => new Promise((resolve, reject) => {
    // stdin stays open, so only the startup check can end the process
    const child = spawn(process.execPath, [bridgeJs], { env, stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (d: string) => { stderr += d; });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`bridge still running: ${stderr}`)); }, 5000);
    child.once("exit", (code) => { clearTimeout(timer); resolve({ code, stderr }); });
  });
  try {
    const halves: Record<string, string>[] = [{ SYNAPSE_URL: "http://127.0.0.1:1/mcp" }, { SYNAPSE_TOKEN: TOKEN }];
    for (const half of halves) {
      const r = await run({ ...base, ...half });
      assert.equal(r.code, 1, `${Object.keys(half)[0]} alone fails startup`);
      assert.match(r.stderr, /SYNAPSE_URL and SYNAPSE_TOKEN must be set together/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("bridge: sessions sharing SYNAPSE_AGENT_ID cannot release or overwrite each other's lock", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-locks-"));
  const sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  const hosts: Client[] = [];
  const open = async (name: string): Promise<Client> => {
    const host = new Client({ name, version: "0.0.1" });
    hosts.push(host);
    await host.connect(new StdioClientTransport({
      command: process.execPath,
      args: [bridgeJs],
      env: { ...(process.env as Record<string, string>), SYNAPSE_URL: sc.url, SYNAPSE_TOKEN: TOKEN, SYNAPSE_AGENT_ID: "shared-agent", SYNAPSE_PROJECT: PROJECT },
    }));
    return host;
  };
  const call = async <T>(host: Client, name: string, args: Record<string, unknown>): Promise<T> =>
    JSON.parse((((await host.callTool({ name, arguments: args })) as { content: { text: string }[] }).content[0]!).text) as T;
  try {
    const a = await open("host-a");
    const b = await open("host-b");
    const held = await call<{ ok: boolean; agentId: string }>(a, "lock_acquire", { glob: "src/shared.ts" });
    assert.equal(held.ok, true);
    assert.match(held.agentId, /^shared-agent#/, "the lease names the agent and its bridge");
    const taken = await call<{ ok: boolean; heldBy?: string }>(b, "lock_acquire", { glob: "src/shared.ts" });
    assert.equal(taken.ok, false, "the same agent id in another bridge cannot overwrite the lease");
    assert.equal(taken.heldBy, held.agentId);
    const released = await call<{ released: boolean }>(b, "lock_release", { glob: "src/shared.ts" });
    assert.equal(released.released, false, "nor release it");
    const listed = await call<{ locks: { agentId: string }[] }>(b, "lock_list", {});
    assert.deepEqual(listed.locks.map((l) => l.agentId), [held.agentId]);
    const w = await call<{ agentId: string }>(a, "memory_remember", { content: "lock owner provenance check" });
    assert.equal(w.agentId, "shared-agent", "memory provenance stays the agent id");
    assert.equal((await call<{ released: boolean }>(a, "lock_release", { glob: "src/shared.ts" })).released, true);
  } finally {
    for (const h of hosts) await h.close().catch(() => { });
    await sc.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// SUBSTITUTE_JUSTIFICATION
// - substitute: `lossy`, a local HTTP proxy that forwards the bridge's first memory_remember to the
//   real sidecar and drops the connection once the sidecar has answered
// - replaces: delivery of that one HTTP response between the bridge and the sidecar
// - necessity: a write that commits and then loses its response needs a crash or a network loss at
//   an exact moment, which the real sidecar and network cannot produce deterministically
// - real-option: real `createSidecar` instances serve every request, including the retry
// - proof-limit: proves the retry is answered from the committed record, not how often real
//   connections drop
// - real-proof: "a zero-config bridge re-elects a sidecar that died and retries the call" in
//   recovery.test.ts drives the same retry path through a real crash
test("bridge: a write whose response was lost is answered from its record by a restarted sidecar", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-lost-"));
  let sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  const targetFile = join(dir, "rediscover.json");
  writeFileSync(targetFile, JSON.stringify({ url: sc.url, token: TOKEN }));
  let dropped = false;
  const lossy = createHttpServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const lose = !dropped && body.includes("memory_remember");
      if (lose) dropped = true;
      const upstreamUrl = new URL(req.url ?? "/mcp", sc.url);
      const upstream = httpRequest(upstreamUrl, { method: req.method, headers: { ...req.headers, host: upstreamUrl.host } }, (response) => {
        if (!lose) { res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res); return; }
        response.resume();
        // The sidecar committed and answered. The bridge sees only a dropped connection, and its
        // retry reaches a restarted sidecar on the same database.
        response.on("end", () => {
          void (async () => {
            await sc.close();
            sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
            writeFileSync(targetFile, JSON.stringify({ url: sc.url, token: TOKEN }));
            res.destroy();
          })();
        });
      });
      upstream.on("error", () => res.destroy());
      upstream.end(body);
    });
  });
  await new Promise<void>((resolve) => lossy.listen(0, "127.0.0.1", resolve));
  const address = lossy.address();
  const proxyUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/mcp`;
  const bridgeWithRediscover = [
    'import { readFileSync } from "node:fs";',
    `import { startBridge } from ${JSON.stringify(pathToFileURL(bridgeJs).href)};`,
    'const target = () => JSON.parse(readFileSync(process.env.SYNAPSE_TEST_TARGET, "utf8"));',
    "await startBridge({ url: process.env.SYNAPSE_TEST_PROXY, token: target().token, projectKeyValue: process.env.SYNAPSE_PROJECT, rediscover: async () => target() });",
    'process.stdin.once("end", () => process.exit(0));',
  ].join("\n");
  const host = new Client({ name: "host-lost-response", version: "0.0.1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--input-type=module", "-e", bridgeWithRediscover],
    env: { ...(process.env as Record<string, string>), SYNAPSE_TEST_PROXY: proxyUrl, SYNAPSE_TEST_TARGET: targetFile, SYNAPSE_PROJECT: PROJECT },
  });
  try {
    await host.connect(transport);
    const reply = JSON.parse((((await host.callTool({ name: "memory_remember", arguments: { content: "one durable write whose response was lost" } })) as { content: { text: string }[] }).content[0]!).text) as { id: number };
    assert.equal(dropped, true, "premise: the first response was dropped after the sidecar answered");
    const stored = parseResults(await host.callTool({ name: "memory_recall", arguments: { query: "response was lost", mode: "full" } })).results as { id: number }[];
    assert.equal(stored.length, 1, "the retried write was not applied a second time");
    assert.equal(stored[0]!.id, reply.id, "the retry returned the committed record");
  } finally {
    await host.close().catch(() => { });
    lossy.closeAllConnections();
    await new Promise<void>((resolve) => lossy.close(() => resolve()));
    await sc.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bridge: a project path beyond Latin-1 routes to its own database", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-unicode-"));
  const project = join(dir, "项目");
  mkdirSync(project);
  const sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  const host = new Client({ name: "host-unicode", version: "0.0.1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bridgeJs],
    env: { ...(process.env as Record<string, string>), SYNAPSE_URL: sc.url, SYNAPSE_TOKEN: TOKEN, SYNAPSE_PROJECT: project },
  });
  try {
    await host.connect(transport);
    await host.callTool({ name: "memory_remember", arguments: { content: "unicode project marker" } });
    assert.equal(parseResults(await host.callTool({ name: "memory_recall", arguments: { query: "unicode project marker" } })).results.length, 1);
    assert.equal(existsSync(join(dir, `${hashKey("default")}.sqlite`)), false, "the key reached the sidecar instead of falling back to default");
  } finally { await host.close().catch(() => { }); await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

// SUBSTITUTE_JUSTIFICATION
// - replaces: the Synapse sidecar, with a real MCP server (SDK Server over Streamable HTTP) that
//   advertises none of SIDECAR_FEATURES
// - necessity: the assertion needs a sidecar without those features, and the sidecar this tree builds
//   always advertises them, so no real instance at this commit can be in that state
// - real-proof: by hand, start a sidecar built from bb71e16, which advertises neither feature, and run
//   this bridge with SYNAPSE_URL and SYNAPSE_TOKEN pointing at it: the bridge exits with this refusal
//   and that sidecar's databases stay empty. The test below proves the bridge's check only.
async function sidecarWithoutFeatures(): Promise<{ url: string; requests: string[]; close: () => Promise<void> }> {
  const requests: string[] = [];
  const http = createHttpServer((req, res) => {
    // Stateless, one MCP server per request: initialize advertises tools and resources but none of
    // SIDECAR_FEATURES, and any call that reaches this sidecar is recorded.
    const mcp = new Server({ name: "synapse", version: "0.4.0" }, { capabilities: { tools: {}, resources: { subscribe: true, listChanged: true } } });
    mcp.setRequestHandler(ListToolsRequestSchema, () => { requests.push("tools/list"); return { tools: [] }; });
    mcp.setRequestHandler(CallToolRequestSchema, () => { requests.push("tools/call"); return { content: [] }; });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    void mcp.connect(transport).then(() => transport.handleRequest(req, res));
  });
  await new Promise<void>((resolve) => { http.listen(0, "127.0.0.1", resolve); });
  const { port } = http.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    requests,
    close: () => new Promise<void>((resolve) => { http.closeAllConnections(); http.close(() => resolve()); }),
  };
}

test("bridge: refuses a sidecar without the features it relies on, before serving any call", async () => {
  // An earlier sidecar reads only the raw project header and keeps no operation records: serving
  // through it would pool this project into the shared default database and apply a retried write twice.
  const dir = mkdtempSync(join(tmpdir(), "synapse-earlier-"));
  const project = join(dir, "项目");
  mkdirSync(project);
  const upstream = await sidecarWithoutFeatures();
  const host = new Client({ name: "host-earlier", version: "0.0.1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bridgeJs],
    env: { ...(process.env as Record<string, string>), SYNAPSE_URL: upstream.url, SYNAPSE_TOKEN: TOKEN, SYNAPSE_PROJECT: project },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  try {
    await host.connect(transport);
    await assert.rejects(host.callTool({ name: "memory_remember", arguments: { content: "must not be written" } }));
    const deadline = Date.now() + 2000;
    while (!stderr.includes("earlier Synapse build") && Date.now() < deadline) await delay(25);
    assert.match(stderr, /earlier Synapse build \(it lacks synapse\/operationId, synapse\/encodedProject\)/);
    assert.deepEqual(upstream.requests, [], "no call reached that sidecar");
  } finally { await host.close().catch(() => { }); await upstream.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("bridge: a reconnect restores the host's resource subscriptions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-resubscribe-"));
  let sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir, coalesceMs: 0 });
  const port = sc.port;
  const host = new Client({ name: "host-resubscribe", version: "0.0.1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bridgeJs],
    env: { ...(process.env as Record<string, string>), SYNAPSE_URL: sc.url, SYNAPSE_TOKEN: TOKEN, SYNAPSE_PROJECT: PROJECT },
  });
  const got: string[] = [];
  const write = async (content: string): Promise<void> => {
    const writer = new Client({ name: "writer", version: "0.0.1" });
    await writer.connect(new StreamableHTTPClientTransport(new URL(sc.url), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}`, "x-synapse-agent": "writer", "x-synapse-project": PROJECT } },
    }));
    try { await writer.callTool({ name: "memory_remember", arguments: { content } }); } finally { await writer.close(); }
  };
  const waitFor = async (count: number): Promise<void> => {
    const start = Date.now();
    while (got.length < count && Date.now() - start < 4000) await delay(50);
  };
  try {
    await host.connect(transport);
    host.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => { got.push(n.params.uri); });
    const uri = (await host.listResources()).resources.find((r) => r.uri.includes("/project/"))!.uri;
    await host.subscribeResource({ uri });
    await write("before the restart");
    await waitFor(1);
    assert.equal(got.length, 1, "premise: the subscription delivers before the restart");

    await sc.close();
    sc = await createSidecar({ token: TOKEN, port, dbDir: dir, coalesceMs: 0 });
    await host.listTools();
    await write("after the reconnect");
    await waitFor(2);
    assert.equal(got.length, 2, "the subscription survives the reconnect without the host subscribing again");
  } finally { await host.close().catch(() => { }); await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});
