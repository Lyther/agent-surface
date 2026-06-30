import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { REFERENCE_LABEL } from "../src/contract.js";
import { createServer } from "../src/server.js";
import { setupIndex } from "./helpers.js";

const COBALT = "fixture:detecting-cobalt-strike-beacons";

async function connect(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const { store, cleanup } = setupIndex();
  const server = createServer(store);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientT);
  return {
    client,
    cleanup: async () => { await client.close(); await server.close(); cleanup(); },
  };
}

test("tools/list exposes the 4 read-only tools", async () => {
  const { client, cleanup } = await connect();
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["grimoire_file_get", "grimoire_get", "grimoire_list", "grimoire_search"]);
    for (const t of tools) assert.equal(t.annotations?.readOnlyHint, true, `${t.name} is read-only`);
  } finally { await cleanup(); }
});

test("search → get → file_get round-trips with structuredContent + labeled text mirror", async () => {
  const { client, cleanup } = await connect();
  try {
    const s = await client.callTool({ name: "grimoire_search", arguments: { query: "cobalt strike beacon pcap" } });
    const sc = s.structuredContent as { status: string; hits: { id: string }[] };
    assert.equal(sc.status, "ok");
    assert.equal(sc.hits[0]!.id, COBALT);
    const text = (s.content as { type: string; text: string }[])[0]!.text;
    assert.ok(text.startsWith(REFERENCE_LABEL), "text mirror is labeled as reference data");

    const g = await client.callTool({ name: "grimoire_get", arguments: { id: COBALT } });
    const gc = g.structuredContent as { status: string; skill: { body: string; files: { path: string }[] } };
    assert.equal(gc.status, "ok");
    assert.match(gc.skill.body, /Cobalt Strike/);

    const f = await client.callTool({ name: "grimoire_file_get", arguments: { id: COBALT, path: gc.skill.files[0]!.path } });
    const fc = f.structuredContent as { status: string; file: { content: string } };
    assert.equal(fc.status, "ok");
    assert.match(fc.file.content, /<ioc type="ip">/);
  } finally { await cleanup(); }
});

test("schema-invalid args fail with an isError validation result before the handler runs", async () => {
  const { client, cleanup } = await connect();
  try {
    const miss = await client.callTool({ name: "grimoire_search", arguments: {} });
    assert.equal(miss.isError, true, "missing required query → isError");
    assert.match((miss.content as { text: string }[])[0]!.text, /-32602|[Vv]alidation/);
    const bad = await client.callTool({ name: "grimoire_get", arguments: { id: "Bad:Id" } });
    assert.equal(bad.isError, true, "id grammar enforced by schema → isError");
  } finally { await cleanup(); }
});
