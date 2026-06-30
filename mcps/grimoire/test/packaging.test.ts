// Packaging + real-process runtime guards.
// F001: every package.json#bin target must exist after build, so install.sh wrappers
//       (derived from package.json#bin) can never point at a missing module.
// F003: the actual grimoire-server binary must serve over a spawned stdio process, not
//       only the in-process InMemoryTransport used by server.test.ts.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildIndex } from "../src/indexer.js";
import { FIXTURE_PACK } from "./helpers.js";

const HERE = dirname(fileURLToPath(import.meta.url)); // dist/test
const PKG_ROOT = join(HERE, "..", ".."); // mcps/grimoire
const SERVER_JS = join(HERE, "..", "src", "server.js"); // dist/src/server.js

test("every package.json#bin target exists after build (no installer wrapper drift)", () => {
  const bin = (JSON.parse(readFileSync(join(PKG_ROOT, "package.json"), "utf8")).bin ?? {}) as Record<string, string>;
  assert.ok(Object.keys(bin).length >= 2, "declares grimoire-server + grimoire-index");
  for (const [name, rel] of Object.entries(bin)) {
    assert.ok(existsSync(join(PKG_ROOT, rel)), `bin ${name} -> ${rel} must exist after build`);
  }
});

test("real stdio: the spawned grimoire-server serves search→get→file_get", async () => {
  const dir = mkdtempSync(join(tmpdir(), "grimoire-stdio-"));
  buildIndex({ packs: [{ serviceId: "fixture", path: FIXTURE_PACK, commit: "stdio" }], outDir: dir, indexedAt: "2026-01-01T00:00:00.000Z" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_JS],
    env: { ...process.env, GRIMOIRE_DIR: dir } as Record<string, string>,
  });
  const client = new Client({ name: "stdio-test", version: "0" });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 4, "4 tools over real stdio");
    const s = await client.callTool({ name: "grimoire_search", arguments: { query: "cobalt strike beacon" } });
    const sc = s.structuredContent as { status: string; hits: { id: string }[] };
    assert.equal(sc.status, "ok");
    assert.equal(sc.hits[0]!.id, "fixture:detecting-cobalt-strike-beacons");
    const g = await client.callTool({ name: "grimoire_get", arguments: { id: sc.hits[0]!.id } });
    const gc = g.structuredContent as { status: string; skill: { files: { path: string }[] } };
    assert.equal(gc.status, "ok");
    const f = await client.callTool({ name: "grimoire_file_get", arguments: { id: sc.hits[0]!.id, path: gc.skill.files[0]!.path } });
    assert.equal((f.structuredContent as { status: string }).status, "ok");
  } finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
