// S-01 live proof: spawn the BUILT bridge as a subprocess (stdio), drive it as an MCP
// host, and confirm (a) tool calls proxy to the sidecar and (b) a sidecar
// resources/updated push is forwarded back over the bridge's stdio to the host.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { createSidecar } from "../src/sidecar.js";

const TOKEN = "bridge-token-xyz";
const PROJECT = "/tmp/projBridgeTest";
const bridgeJs = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "bridge.js");
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const parseResults = (r: unknown): { results: unknown[] } =>
  JSON.parse((((r as { content?: { text: string }[] }).content ?? [])[0]!).text) as { results: unknown[] };

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
  } finally { await host.close().catch(() => {}); await sc.close(); rmSync(dir, { recursive: true, force: true }); }
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
    await host.close().catch(() => {});
    if (sidecarPid) { try { process.kill(sidecarPid, "SIGTERM"); } catch { /* already gone */ } }
    await delay(300);
    rmSync(dir, { recursive: true, force: true });
  }
});
