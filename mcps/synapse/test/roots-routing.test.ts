// P4.3: bridge MCP-roots routing. A host that launches the bridge outside the
// workspace must still isolate to the right project. The bridge resolves the project
// key from, in order: SYNAPSE_PROJECT env → the host's first MCP root (file:// URI) →
// cwd git-root. This test proves a roots-provided workspace routes to the right DB
// WITHOUT relying on the bridge process cwd, and that the explicit env override wins.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { startBridge } from "../src/bridge.js";
import { hashKey, projectKey } from "../src/namespace.js";
import { createSidecar, type SidecarHandle } from "../src/sidecar.js";

const TOKEN = "roots-token-p43";
interface RememberOut { id: number; agentId: string; redactions: number }
interface RecallOut { results: { id: number; snippet: string }[]; truncated: boolean; cursor: number }
function parse<T>(r: unknown): T {
  const content = (r as { content?: { type: string; text: string }[] }).content;
  if (!content || !content[0]) throw new Error("no content in tool result");
  return JSON.parse(content[0]!.text) as T;
}

/** A host client that advertises roots and answers roots/list with `roots`.
 *  Returns the client and the server-side transport; caller must connect the bridge
 *  server to the server-side transport (which completes the client's initialize). */
function hostWithRoots(roots: string[]): { client: Client; serverTransport: InMemoryTransport; ready: Promise<void> } {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "host", version: "0.0.1" },
    { capabilities: { roots: { listChanged: true } } },
  );
  client.setRequestHandler(ListRootsRequestSchema, () => ({ roots: roots.map((uri) => ({ uri })) }));
  // connect without awaiting — it completes once the bridge server connects to serverTransport
  const ready = client.connect(clientTransport).then(() => undefined);
  return { client, serverTransport, ready };
}

test("P4.3: bridge routes to the host's first root (file://) regardless of bridge cwd", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-roots-"));
  const sc: SidecarHandle = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  try {
    // A workspace path that is NOT the bridge/test process cwd, and not a git repo, so
    // the only way the bridge can route to it is via the roots list (proving cwd is unused).
    const workspace = join(dir, "host-workspace");
    const expectedKey = projectKey(workspace);
    const expectedDb = join(dir, `${hashKey(expectedKey)}.sqlite`);

    const { client: host, serverTransport, ready } = hostWithRoots([pathToFileURL(workspace).href]);
    const { close } = await startBridge({ url: sc.url, token: TOKEN, downstream: serverTransport });
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
  } finally { await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("P4.3: SYNAPSE_PROJECT override wins over roots and cwd", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-roots-ov-"));
  const sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  try {
    const override = "/tmp/explicit-override-project";
    const expectedDb = join(dir, `${hashKey(projectKey(override))}.sqlite`);
    const { client: host, serverTransport, ready } = hostWithRoots([pathToFileURL("/tmp/roots-should-be-ignored").href]);
    const { close } = await startBridge({ url: sc.url, token: TOKEN, downstream: serverTransport, projectKeyValue: override });
    await ready;
    try {
      parse<RememberOut>(await host.callTool({ name: "memory_remember", arguments: { content: "override wins" } }));
      assert.ok(fileExists(expectedDb), "override-derived DB used, roots ignored");
    } finally { await close(); await host.close(); }
  } finally { await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("P4.3: host without roots capability falls back to cwd git-root", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-roots-fb-"));
  const sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  try {
    // host advertises NO roots capability → bridge must fall back to cwd without erroring
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const host = new Client({ name: "host-noroots", version: "0.0.1" }, { capabilities: {} });
    const ready = host.connect(clientTransport).then(() => undefined);
    const expectedDb = join(dir, `${hashKey(projectKey(process.cwd()))}.sqlite`);
    const { close } = await startBridge({ url: sc.url, token: TOKEN, downstream: serverTransport });
    await ready;
    try {
      parse<RememberOut>(await host.callTool({ name: "memory_remember", arguments: { content: "cwd fallback" } }));
      assert.ok(fileExists(expectedDb), "cwd-derived DB used when host lacks roots");
    } finally { await close(); await host.close(); }
  } finally { await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

function fileExists(p: string): boolean {
  return existsSync(p);
}
