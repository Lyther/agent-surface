import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createSidecar, type SidecarHandle } from "../src/sidecar.js";

const TOKEN = "smoke-token-123";
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface RememberOut { id: number; agentId: string; redactions: number }
interface RecallOut { results: { id: number; snippet: string }[]; truncated: boolean; cursor: number }

async function connect(url: string, agent: string, project: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}`, "x-synapse-agent": agent, "x-synapse-project": project } },
  });
  const client = new Client({ name: agent, version: "0.0.1" });
  await client.connect(transport);
  return client;
}
function parse<T>(r: unknown): T {
  const content = (r as { content?: { type: string; text: string }[] }).content;
  if (!content || !content[0]) throw new Error("no content in tool result");
  return JSON.parse(content[0].text) as T;
}

test("sidecar: initialize + tools/list + remember + recall over real HTTP", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-sc-"));
  const sc: SidecarHandle = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  try {
    const c = await connect(sc.url, "agent-a", "/tmp/projX");
    const tools = await c.listTools();
    assert.equal(tools.tools.length, 7, "exposes 7 tools");
    assert.ok(tools.tools.every((t) => (t.description ?? "").length > 40), "tools have real descriptions");

    const w = parse<RememberOut>(await c.callTool({ name: "memory_remember", arguments: { content: "the http path works end to end", tags: ["smoke"] } }));
    assert.ok(w.id > 0 && w.agentId === "agent-a");

    const r = parse<RecallOut>(await c.callTool({ name: "memory_recall", arguments: { query: "http path" } }));
    assert.equal(r.results.length, 1);
    assert.match(r.results[0]!.snippet, /http path works/);
    await c.close();
  } finally { await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("sidecar: rejects missing bearer", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-sc-"));
  const sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  try {
    const res = await fetch(sc.url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "0" } } }),
    });
    assert.equal(res.status, 401);
  } finally { await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("sidecar: two sessions in same project see each other's memory; other project isolated", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-sc-"));
  const sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  try {
    const a = await connect(sc.url, "agent-a", "/tmp/projShared");
    const b = await connect(sc.url, "agent-b", "/tmp/projShared");
    parse<RememberOut>(await a.callTool({ name: "memory_remember", arguments: { content: "shared decision: use gvisor" } }));
    const r = parse<RecallOut>(await b.callTool({ name: "memory_recall", arguments: { query: "gvisor" } }));
    assert.equal(r.results.length, 1, "B sees A's project memory");
    const c = await connect(sc.url, "agent-c", "/tmp/projOther");
    const r2 = parse<RecallOut>(await c.callTool({ name: "memory_recall", arguments: { query: "gvisor" } }));
    assert.equal(r2.results.length, 0, "other project isolated");
    await a.close(); await b.close(); await c.close();
  } finally { await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("S-01: subscriber receives resources/updated when a peer writes (realtime push)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-sc-"));
  const sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  try {
    const a = await connect(sc.url, "agent-a", "/tmp/projRT");
    const b = await connect(sc.url, "agent-b", "/tmp/projRT");
    const got: string[] = [];
    a.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => { got.push(n.params.uri); });
    const res = await a.listResources();
    const projectUri = res.resources.find((r) => r.uri.includes("/project/"))!.uri;
    await a.subscribeResource({ uri: projectUri });
    await b.callTool({ name: "memory_remember", arguments: { content: "realtime ping over http" } });
    const start = Date.now();
    while (got.length === 0 && Date.now() - start < 3000) await delay(50);
    assert.ok(got.includes(projectUri), `A received resources/updated for its project (got ${JSON.stringify(got)})`);
    await a.close(); await b.close();
  } finally { await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

async function connectAnon(url: string, project: string): Promise<Client> {
  // no x-synapse-agent header → exercises the sidecar's anonymous-identity path
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}`, "x-synapse-project": project } },
  });
  const client = new Client({ name: "anon", version: "0.0.1" });
  await client.connect(transport);
  return client;
}

test("F002: anonymous sessions are distinct (lock conflict enforced, no shared pid identity)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-sc-"));
  const sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  try {
    const a = await connectAnon(sc.url, "/tmp/projAnon");
    const b = await connectAnon(sc.url, "/tmp/projAnon");
    const ra = parse<{ ok: boolean }>(await a.callTool({ name: "lock_acquire", arguments: { glob: "src/x.ts" } }));
    assert.equal(ra.ok, true, "first anon agent acquires");
    const rb = parse<{ ok: boolean; heldBy?: string }>(await b.callTool({ name: "lock_acquire", arguments: { glob: "src/x.ts" } }));
    assert.equal(rb.ok, false, "second anon agent denied — distinct identity, not shared sidecar pid");
    await a.close(); await b.close();
  } finally { await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("F005: oversized request body returns 413 before parse", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-sc-"));
  const sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  try {
    const big = "x".repeat(3 * 1024 * 1024);
    const res = await fetch(sc.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { big } }),
    });
    assert.equal(res.status, 413);
  } finally { await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("sidecar: a UTF-8 character split across POST chunks is stored intact", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-sc-"));
  const sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  const transport = new StreamableHTTPClientTransport(new URL(sc.url), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}`, "x-synapse-agent": "agent-u", "x-synapse-project": "/tmp/projUtf8" } },
  });
  const c = new Client({ name: "agent-u", version: "0.0.1" });
  try {
    await c.connect(transport);
    const sid = transport.sessionId;
    assert.ok(sid, "session established");
    const content = "a chunk boundary inside 中文 must not corrupt it";
    const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "memory_remember", arguments: { content } } }));
    const split = body.indexOf(Buffer.from("中")) + 1; // inside the character's 3-byte sequence
    const reply = await new Promise<{ status: number | undefined; text: string }>((resolve, reject) => {
      const req = request(sc.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": sid },
      }, (res) => { let text = ""; res.setEncoding("utf8"); res.on("data", (d: string) => { text += d; }); res.on("end", () => resolve({ status: res.statusCode, text })); });
      req.on("error", reject);
      // No content-length, so each write is its own HTTP chunk and the server reads the halves separately.
      req.write(body.subarray(0, split));
      void delay(50).then(() => req.end(body.subarray(split)));
    });
    assert.equal(reply.status, 200, reply.text);
    const message = JSON.parse(reply.text.match(/^data: (.+)$/m)?.[1] ?? reply.text) as { result: unknown };
    const { id } = parse<RememberOut>(message.result);
    const got = parse<{ records: { content: string }[] }>(await c.callTool({ name: "memory_get", arguments: { ids: [id] } }));
    assert.equal(got.records[0]?.content, content);
  } finally { await c.close(); await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});
