// G1.5 acceptance: the real served packs, built with the real grimoire-index entry point and
// served by the real grimoire-server over stdio. Every process gets GRIMOIRE_DIR pointed at a
// temp directory, so ~/.grimoire is never read or written.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { indexerArgv, servedPacksFromRegistry } from "../src/served-packs.js";

const HERE = dirname(fileURLToPath(import.meta.url)); // dist/test
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const INDEXER_JS = join(HERE, "..", "src", "indexer.js"); // dist/src/indexer.js
const SERVER_JS = join(HERE, "..", "src", "server.js"); // dist/src/server.js

const COBALT = "anthropic-cybersecurity-skills:hunting-for-cobalt-strike-beacons";
const allServed = servedPacksFromRegistry(REPO_ROOT);
// indexerArgv leaves out an optional pack that is not checked out; the query needs only the anthropic pack.
const { args, missingRequired } = indexerArgv(allServed);
const anthropic = allServed.find((p) => p.serviceId === "anthropic-cybersecurity-skills");
const runnable = missingRequired.length === 0 && anthropic !== undefined && existsSync(join(anthropic.absPath, anthropic.skillsRel));

test("acceptance: real packs built with grimoire-index serve search → get → file_get over stdio", { skip: runnable ? false : "a required pack submodule is not checked out" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "grimoire-acceptance-"));
  try {
    execFileSync(process.execPath, [INDEXER_JS, ...args, "--out", dir], { stdio: "pipe" });
    assert.ok(existsSync(join(dir, "index.sqlite")), "grimoire-index published index.sqlite");

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER_JS],
      env: { ...process.env, GRIMOIRE_DIR: dir } as Record<string, string>,
    });
    const client = new Client({ name: "acceptance", version: "0" });
    try {
      await client.connect(transport);
      const s = await client.callTool({ name: "grimoire_search", arguments: { query: "cobalt strike beacon pcap", k: 5 } });
      const sc = s.structuredContent as { status: string; hits: { id: string }[] };
      assert.equal(sc.status, "ok");
      assert.equal(sc.hits[0]!.id, COBALT, "the known query ranks its expected skill first");

      const g = await client.callTool({ name: "grimoire_get", arguments: { id: COBALT } });
      const gc = g.structuredContent as { status: string; skill: { body: string; files: { path: string; size: number }[] } };
      assert.equal(gc.status, "ok");
      assert.match(gc.skill.body, /Cobalt Strike/, "get returns the skill's body");
      assert.ok(gc.skill.files.length > 0, "the skill lists supporting files");

      const file = gc.skill.files[0]!;
      const f = await client.callTool({ name: "grimoire_file_get", arguments: { id: COBALT, path: file.path } });
      const fc = f.structuredContent as { status: string; file: { path: string; content: string; size: number } };
      assert.equal(fc.status, "ok");
      assert.equal(fc.file.path, file.path, "file_get returns one of the listed files");
      assert.ok(fc.file.content.length > 0);
      assert.equal(fc.file.size, Buffer.byteLength(fc.file.content, "utf8"));
    } finally {
      await client.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
