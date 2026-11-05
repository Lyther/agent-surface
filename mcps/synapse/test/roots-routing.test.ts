// P4.3: server MCP-roots routing. A host that launches the server outside the
// workspace must still isolate to the right project. The server resolves the project
// key from, in order: SYNAPSE_PROJECT env → the host's first MCP root (file:// URI) →
// cwd git-root; SYNAPSE_ROOTS=ignore skips the roots step for hosts that cannot serve roots. This test proves a roots-provided workspace routes to the right DB
// WITHOUT relying on the server process cwd, and that the explicit env override wins.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ErrorCode, ListRootsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { hashKey, projectKey } from "../src/namespace.js";
import { startServer } from "../src/server.js";

/*
SUBSTITUTE_JUSTIFICATION
- replaces: the stdio transport between the host client and the server (an InMemoryTransport pair; both ends are the real SDK client and server)
- necessity: the no-roots, roots-error and timeout cases hold initialize or roots/list open past a short deadline and observe when the server dispatches, which a stdio child process cannot be paused for without instrumenting it
- real-proof: test/server.test.ts runs the built server as a child process over real stdio
*/
// Startups that fail closed reject before any tool call, so no DB is ever opened here.
const unusedDbDir = join(tmpdir(), "synapse-roots-never-opened");
interface RememberOut { id: number; agentId: string }
interface RecallOut { results: { id: number; snippet: string }[]; truncated: boolean; cursor: number }
function parse<T>(r: unknown): T {
  const content = (r as { content?: { type: string; text: string }[] }).content;
  if (!content || !content[0]) throw new Error("no content in tool result");
  return JSON.parse(content[0]!.text) as T;
}

/** A host client that advertises roots and answers roots/list with `roots`.
 *  Returns the client and the server-side transport; caller must connect the
 *  server to the server-side transport (which completes the client's initialize). */
function hostWithRoots(roots: string[]): { client: Client; serverTransport: InMemoryTransport; ready: Promise<void> } {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "host", version: "0.0.1" },
    { capabilities: { roots: { listChanged: true } } },
  );
  client.setRequestHandler(ListRootsRequestSchema, () => ({ roots: roots.map((uri) => ({ uri })) }));
  // connect without awaiting — it completes once the server connects to serverTransport
  const ready = client.connect(clientTransport).then(() => undefined);
  return { client, serverTransport, ready };
}

test("P4.3: server routes to the host's first root (file://) regardless of server cwd", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-roots-"));
  try {
    // A workspace path that is NOT the server/test process cwd, and not a git repo, so
    // the only way the server can route to it is via the roots list (proving cwd is unused).
    const workspace = join(dir, "host-workspace");
    const expectedKey = projectKey(workspace);
    const expectedDb = join(dir, `${hashKey(expectedKey)}.sqlite`);

    const { client: host, serverTransport, ready } = hostWithRoots([pathToFileURL(workspace).href]);
    const { close } = await startServer({ dbDir: dir, downstream: serverTransport });
    await ready;
    try {
      const w = parse<RememberOut>(await host.callTool({ name: "memory_remember", arguments: { content: "routed via roots not cwd" } }));
      assert.ok(w.id > 0);
      // the project DB file for the root-derived key must exist (the write landed there)
      assert.ok(fileExists(expectedDb), "write routed to the root-derived project DB, not the cwd-derived one");
      // and a recall through the same host sees it
      const r = parse<RecallOut>(await host.callTool({ name: "memory_recall", arguments: { query: "routed via roots" } }));
      assert.equal(r.results.length, 1, "host recalls its own root-routed write");
    } finally { await close(); await host.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("P4.3: host root emitted as a raw absolute path (deprecated compat) routes correctly", async () => {
  // Cline and Cursor answer roots/list with a raw absolute path instead of a file://
  // URI. The server must normalize it instead of dying on strict schema validation.
  const dir = mkdtempSync(join(tmpdir(), "synapse-roots-raw-"));
  try {
    const workspace = join(dir, "raw-root-project");
    const expectedDb = join(dir, `${hashKey(projectKey(workspace))}.sqlite`);
    const { client: host, serverTransport, ready } = hostWithRoots([workspace]);
    const { close } = await startServer({ dbDir: dir, downstream: serverTransport });
    await ready;
    try {
      parse<RememberOut>(await host.callTool({ name: "memory_remember", arguments: { content: "raw path root" } }));
      assert.ok(fileExists(expectedDb), "raw absolute path root routes to its project DB");
    } finally { await close(); await host.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("P4.3: SYNAPSE_PROJECT override wins over roots and cwd", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-roots-ov-"));
  try {
    const override = "/tmp/explicit-override-project";
    const expectedDb = join(dir, `${hashKey(projectKey(override))}.sqlite`);
    const { client: host, serverTransport, ready } = hostWithRoots([pathToFileURL("/tmp/roots-should-be-ignored").href]);
    const { close } = await startServer({ dbDir: dir, downstream: serverTransport, projectKeyValue: override });
    await ready;
    try {
      parse<RememberOut>(await host.callTool({ name: "memory_remember", arguments: { content: "override wins" } }));
      assert.ok(fileExists(expectedDb), "override-derived DB used, roots ignored");
    } finally { await close(); await host.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("P4.3: host without roots capability falls back to cwd git-root", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-roots-fb-"));
  try {
    // host advertises NO roots capability → server must fall back to cwd without erroring
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const host = new Client({ name: "host-noroots", version: "0.0.1" }, { capabilities: {} });
    let rootsRequests = 0;
    const sendToHost = serverTransport.send.bind(serverTransport);
    serverTransport.send = async (message, options) => {
      if ("method" in message && message.method === "roots/list") rootsRequests += 1;
      await sendToHost(message, options);
    };
    const ready = host.connect(clientTransport).then(() => undefined);
    const expectedDb = join(dir, `${hashKey(projectKey(process.cwd()))}.sqlite`);
    const { close } = await startServer({ dbDir: dir, downstream: serverTransport });
    await ready;
    try {
      parse<RememberOut>(await host.callTool({ name: "memory_remember", arguments: { content: "cwd fallback" } }));
      assert.ok(fileExists(expectedDb), "cwd-derived DB used when host lacks roots");
      assert.equal(rootsRequests, 0, "server does not send roots/list when the host did not advertise roots");
    } finally { await close(); await host.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("P4.3: server fails closed when the downstream host never initializes", async () => {
  const [, serverTransport] = InMemoryTransport.createLinkedPair();
  await assert.rejects(
    startServer({
      dbDir: unusedDbDir,
      downstream: serverTransport,
      negotiationTimeoutMs: 20,
    }),
    /downstream initialize timed out/,
  );
});

test("P4.3: roots-capable host timeout fails closed instead of binding cwd", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const host = new Client(
    { name: "host-roots-timeout", version: "0.0.1" },
    { capabilities: { roots: { listChanged: true } } },
  );
  host.setRequestHandler(ListRootsRequestSchema, () => new Promise(() => { }));
  const ready = host.connect(clientTransport);
  try {
    await assert.rejects(
      startServer({
        dbDir: unusedDbDir,
        downstream: serverTransport,
        negotiationTimeoutMs: 20,
      }),
      /roots\/list timed out/,
    );
    await ready;
  } finally {
    await host.close();
  }
});

/** A host shaped like FastMCP's multi-server proxy: it advertises roots, then answers
 *  roots/list with an internal error because no request context is active. */
function hostWithFailingRoots(): { client: Client; serverTransport: InMemoryTransport; ready: Promise<void>; rootsRequests: () => number } {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "host-proxy", version: "0.0.1" },
    { capabilities: { roots: { listChanged: true } } },
  );
  let requests = 0;
  client.setRequestHandler(ListRootsRequestSchema, () => {
    requests += 1;
    throw new McpError(ErrorCode.InternalError, "No active context found.");
  });
  const ready = client.connect(clientTransport).then(() => undefined);
  return { client, serverTransport, ready, rootsRequests: () => requests };
}

test("P4.3: a roots error reply fails closed by default", async () => {
  const { client: host, serverTransport, ready, rootsRequests } = hostWithFailingRoots();
  try {
    await assert.rejects(
      startServer({ dbDir: unusedDbDir, downstream: serverTransport, negotiationTimeoutMs: 2000 }),
      /No active context found/,
    );
    await ready;
    assert.equal(rootsRequests(), 1);
  } finally {
    await host.close();
  }
});

/** Run `fn` with SYNAPSE_ROOTS set as an installed host config sets it, then restore it. */
async function withRootsEnv<T>(value: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env["SYNAPSE_ROOTS"];
  process.env["SYNAPSE_ROOTS"] = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env["SYNAPSE_ROOTS"];
    else process.env["SYNAPSE_ROOTS"] = previous;
  }
}

test("P4.3: SYNAPSE_ROOTS=ignore binds cwd without asking a roots-capable host", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-roots-ignore-"));
  try {
    const { client: host, serverTransport, ready, rootsRequests } = hostWithFailingRoots();
    const expectedDb = join(dir, `${hashKey(projectKey(process.cwd()))}.sqlite`);
    const { close } = await withRootsEnv("ignore", () => startServer({ dbDir: dir, downstream: serverTransport }));
    await ready;
    try {
      parse<RememberOut>(await host.callTool({ name: "memory_remember", arguments: { content: "roots ignored" } }));
      assert.ok(fileExists(expectedDb), "cwd-derived DB used when roots are ignored");
      assert.equal(rootsRequests(), 0, "server does not send roots/list when told to ignore roots");
    } finally { await close(); await host.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("P4.3: SYNAPSE_PROJECT still wins over SYNAPSE_ROOTS=ignore", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-roots-ignore-ov-"));
  try {
    const override = "/tmp/explicit-override-with-ignore";
    const expectedDb = join(dir, `${hashKey(projectKey(override, override))}.sqlite`);
    const { client: host, serverTransport, ready } = hostWithFailingRoots();
    const { close } = await withRootsEnv("ignore", () =>
      startServer({ dbDir: dir, downstream: serverTransport, projectKeyValue: override }));
    await ready;
    try {
      parse<RememberOut>(await host.callTool({ name: "memory_remember", arguments: { content: "override with ignore" } }));
      assert.ok(fileExists(expectedDb), "the explicit project key is used, not cwd");
    } finally { await close(); await host.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("P4.3: an unknown SYNAPSE_ROOTS fails startup even beside SYNAPSE_PROJECT", async () => {
  const { client: host, serverTransport, ready } = hostWithFailingRoots();
  try {
    await withRootsEnv("ignroe", () => assert.rejects(
      startServer({
        dbDir: unusedDbDir,
        downstream: serverTransport,
        projectKeyValue: "/tmp/explicit-override-bad-roots",
        negotiationTimeoutMs: 2000,
      }),
      /SYNAPSE_ROOTS must be "ignore" when set/,
    ));
    await ready;
  } finally {
    await host.close();
  }
});

function fileExists(p: string): boolean {
  return existsSync(p);
}
