// P4.2: dirty-bit coalescing. A burst of writes to one channel must collapse into a
// bounded number of `resources/updated` notifications (leading edge + one trailing),
// not one notification per write. The correctness floor (cursor pull) is unaffected;
// this bounds host churn on high-frequency writers. Uses a real sidecar and counts the
// notifications delivered to a subscribed session.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createSidecar, type SidecarHandle } from "../src/sidecar.js";

const TOKEN = "coalesce-token-p42";
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
interface RememberOut { id: number; ts: number; agentId: string; redactions: number }
// The coalescer re-arms its window on every commit, so a burst stays within one window only while no
// gap between commits reaches the window. This one is wide enough that only a stalled run leaves such
// a gap, and the test measures the gaps itself, so a stall fails the precondition, not the coalescing.
const BURST_WINDOW_MS = 1000;
function parse<T>(r: unknown): T {
  const content = (r as { content?: { type: string; text: string }[] }).content;
  if (!content || !content[0]) throw new Error("no content in tool result");
  return JSON.parse(content[0]!.text) as T;
}

async function connect(url: string, agent: string, project: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}`, "x-synapse-agent": agent, "x-synapse-project": project } },
  });
  const client = new Client({ name: agent, version: "0.0.1" });
  await client.connect(transport);
  return client;
}

test("P4.2: a burst of writes collapses into bounded notifications (coalescing)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-coal-"));
  const sc: SidecarHandle = await createSidecar({ token: TOKEN, port: 0, dbDir: dir, coalesceMs: BURST_WINDOW_MS });
  try {
    const sub = await connect(sc.url, "subscriber", "/tmp/projCoalesce");
    const writer = await connect(sc.url, "writer", "/tmp/projCoalesce");
    const got: string[] = [];
    sub.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => { got.push(n.params.uri); });
    const res = await sub.listResources();
    const projectUri = res.resources.find((r) => r.uri.includes("/project/"))!.uri;
    await sub.subscribeResource({ uri: projectUri });

    // BURST: 20 rapid writes to the same project channel. Without coalescing this would
    // produce ~20 notifications; with leading+trailing coalescing it produces at most 2.
    const commits: number[] = [];
    for (let i = 0; i < 20; i++) {
      commits.push(parse<RememberOut>(await writer.callTool({ name: "memory_remember", arguments: { content: `burst fact #${i}` } })).ts);
    }
    const widestGap = Math.max(...commits.slice(1).map((ts, i) => ts - commits[i]!));
    assert.ok(widestGap < BURST_WINDOW_MS, `precondition: no gap between burst commits reached the window (widest ${widestGap} ms)`);
    // allow the trailing-edge window to flush
    await delay(BURST_WINDOW_MS + 200);

    assert.ok(got.length >= 1, "at least the leading-edge notification arrived");
    assert.ok(got.length <= 2, `burst collapsed to <=2 notifications (got ${got.length}), not one-per-write`);
    // correctness floor unaffected: cursor pull returns all 20 committed rows
    const recalled = parse<{ results: unknown[]; cursor: number }>(await sub.callTool({ name: "memory_recall", arguments: { query: "burst fact" } }));
    assert.equal(recalled.results.length, 20, "all 20 burst writes are durable and cursor-retrievable");
    await sub.close(); await writer.close();
  } finally { await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("P4.2: writes spaced beyond the window each notify (no over-coalescing)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-coal-space-"));
  const sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir, coalesceMs: 30 });
  try {
    const sub = await connect(sc.url, "subscriber", "/tmp/projSpace");
    const writer = await connect(sc.url, "writer", "/tmp/projSpace");
    const got: string[] = [];
    sub.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => { got.push(n.params.uri); });
    const res = await sub.listResources();
    const projectUri = res.resources.find((r) => r.uri.includes("/project/"))!.uri;
    await sub.subscribeResource({ uri: projectUri });

    // 3 writes each spaced well beyond the coalesce window → 3 leading-edge notifications
    for (let i = 0; i < 3; i++) {
      parse<RememberOut>(await writer.callTool({ name: "memory_remember", arguments: { content: `spaced fact #${i}` } }));
      await delay(80);
    }
    await delay(60);
    assert.equal(got.length, 3, `widely-spaced writes each notify (got ${got.length}), coalescing does not drop them`);
    await sub.close(); await writer.close();
  } finally { await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("P4.2/F001: an isolated write after a prior one notifies immediately (no leaked pending delay)", async () => {
  // Regression for the leading-edge pending-entry leak: the first write emits immediately
  // and arms the window-close timer; after the window passes the pending entry is reaped,
  // so the NEXT isolated write (any gap) takes the leading branch again and emits at once
  // — not delayed by windowMs. Before the fix the leading branch armed no timer, the entry
  // leaked forever, and every subsequent isolated write was delayed by windowMs.
  const dir = mkdtempSync(join(tmpdir(), "synapse-coal-f001-"));
  const coalesceMs = 500;
  const sc: SidecarHandle = await createSidecar({ token: TOKEN, port: 0, dbDir: dir, coalesceMs });
  try {
    const sub = await connect(sc.url, "subscriber", "/tmp/projF001");
    const writer = await connect(sc.url, "writer", "/tmp/projF001");
    let notifications = 0;
    sub.setNotificationHandler(ResourceUpdatedNotificationSchema, () => { notifications += 1; });
    const res = await sub.listResources();
    const projectUri = res.resources.find((r) => r.uri.includes("/project/"))!.uri;
    await sub.subscribeResource({ uri: projectUri });

    parse<RememberOut>(await writer.callTool({ name: "memory_remember", arguments: { content: "first write" } }));
    // Wait past the window so the pending entry is reaped.
    await delay(750);
    assert.equal(notifications, 1, "the first isolated write notified once");

    parse<RememberOut>(await writer.callTool({ name: "memory_remember", arguments: { content: "second isolated write" } }));
    const deadline = Date.now() + (coalesceMs / 2);
    while (notifications < 2 && Date.now() < deadline) await delay(20);
    assert.equal(notifications, 2, "the second isolated write uses the leading edge, not the delayed trailing edge");
    await sub.close(); await writer.close();
  } finally { await sc.close(); rmSync(dir, { recursive: true, force: true }); }
});
