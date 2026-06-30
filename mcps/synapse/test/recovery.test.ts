// T2.2: concurrency + crash recovery. The sidecar is the SOLE node:sqlite owner
// writing through WAL (synchronous=NORMAL). A hard kill (SIGKILL) between writes must
// never lose a committed row nor corrupt the cursor: WAL frames for committed txns are
// durable on disk, and a fresh sidecar re-opens the same DB file and recovers to the
// last committed id. This spawns a REAL sidecar child process, kills it abruptly, and
// restarts a fresh one on the same dbDir to prove it.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const TOKEN = "recovery-token-777";
const PROJECT = "/tmp/projRecovery";
const sidecarJs = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "sidecar.js");
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface RememberOut { id: number; agentId: string; redactions: number }
interface RecallOut { results: { id: number; snippet: string }[]; truncated: boolean; cursor: number }
interface Discovery { url: string; token: string; port: number; pid: number; startedAt: number }

// Spawn on an ephemeral port (0) and read the bound port from the discovery file so
// concurrent test runs never collide on a fixed port.
function spawnSidecar(dbDir: string): ChildProcess {
  const env: Record<string, string> = { ...process.env as Record<string, string>, SYNAPSE_DB_DIR: dbDir, SYNAPSE_TOKEN: TOKEN, SYNAPSE_PORT: "0" };
  return spawn(process.execPath, [sidecarJs], { env, stdio: ["ignore", "pipe", "pipe"] });
}

function discoveryPath(dbDir: string): string { return join(dbDir, "sidecar.json"); }

async function waitForSidecar(dbDir: string, timeoutMs = 8000): Promise<Discovery> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(discoveryPath(dbDir))) {
      try {
        const d = JSON.parse(readFileSync(discoveryPath(dbDir), "utf8")) as Discovery;
        if (d.url && d.port) {
          try {
            const base = d.url.replace(/\/mcp$/, "");
            const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(500) });
            if (res.ok) return d;
          } catch { /* bound but not healthy yet */ }
        }
      } catch { /* partial write */ }
    }
    await delay(80);
  }
  throw new Error(`sidecar in ${dbDir} did not become healthy within ${timeoutMs}ms`);
}

async function connect(url: string, agent: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}`, "x-synapse-agent": agent, "x-synapse-project": PROJECT } },
  });
  const client = new Client({ name: agent, version: "0.0.1" });
  await client.connect(transport);
  return client;
}
function parse<T>(r: unknown): T {
  const content = (r as { content?: { type: string; text: string }[] }).content;
  if (!content || !content[0]) throw new Error("no content in tool result");
  return JSON.parse(content[0]!.text) as T;
}

async function killHard(child: ChildProcess): Promise<void> {
  // SIGKILL = no graceful close, no store.close(), no WAL checkpoint — true crash.
  child.kill("SIGKILL");
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
}

test("T2.2: kill mid-session then restart recovers all committed rows and last id (WAL durability)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-rec-"));
  const child = spawnSidecar(dir);
  try {
    const d = await waitForSidecar(dir);
    const url = d.url;
    const c = await connect(url, "agent-recovery");
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      const w = parse<RememberOut>(await c.callTool({ name: "memory_remember", arguments: { content: `durable decision #${i} about cache eviction`, tags: ["recovery"] } }));
      ids.push(w.id);
    }
    const beforeCrash = parse<RecallOut>(await c.callTool({ name: "memory_recall", arguments: { query: "durable decision" } }));
    assert.equal(beforeCrash.results.length, 5, "five writes committed before crash");
    const maxIdBefore = beforeCrash.cursor;
    await c.close();

    // HARD CRASH: SIGKILL the sidecar mid-session (no graceful shutdown). The discovery
    // file is removed by the dying process's exit handler only on graceful exit; on
    // SIGKILL it may linger — clear it so the restart isn't seen as "already healthy".
    await killHard(child);
    try { rmSync(discoveryPath(dir), { force: true }); } catch { /* may be gone */ }

    // RESTART a fresh sidecar on the same DB dir (new process, fresh Store open).
    const child2 = spawnSidecar(dir);
    try {
      const d2 = await waitForSidecar(dir);
      const c2 = await connect(d2.url, "agent-verifier");
      const after = parse<RecallOut>(await c2.callTool({ name: "memory_recall", arguments: { query: "durable decision" } }));
      assert.equal(after.results.length, 5, "all committed rows survived the hard crash");
      assert.equal(after.cursor, maxIdBefore, "cursor (max id) consistent after restart — no lost id, no duplicate");
      const sorted = after.results.map((r) => r.id).sort((a, b) => a - b);
      assert.deepEqual(sorted, ids.slice().sort((a, b) => a - b), "row ids match the originals");
      // a new write after restart continues the monotonic id (no gap, no overlap)
      const next = parse<RememberOut>(await c2.callTool({ name: "memory_remember", arguments: { content: "post-restart write continues the sequence" } }));
      assert.ok(next.id > maxIdBefore, "post-restart write id advances past the recovered max");
      await c2.close();
    } finally { child2.kill("SIGTERM"); await new Promise<void>((r) => child2.once("exit", () => r())); }
  } finally {
    try { child.kill("SIGKILL"); } catch { /* already dead */ }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T2.2: concurrent writes from many sessions all persist across a hard crash", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-conc-"));
  const child = spawnSidecar(dir);
  try {
    const d = await waitForSidecar(dir);
    const url = d.url;
    const N = 8;
    const clients = await Promise.all(Array.from({ length: N }, (_, i) => connect(url, `agent-${i}`)));
    // fan out concurrent writes (sole-writer sidecar serializes them via BEGIN IMMEDIATE)
    const writes = await Promise.all(clients.map((c, i) =>
      c.callTool({ name: "memory_remember", arguments: { content: `concurrent fact from agent-${i}` } }).then((r) => parse<RememberOut>(r).id),
    ));
    assert.equal(new Set(writes).size, N, "every concurrent write got a distinct id (no lost writes)");
    await Promise.all(clients.map((c) => c.close()));
    const maxIdBefore = Math.max(...writes);

    await killHard(child);
    try { rmSync(discoveryPath(dir), { force: true }); } catch { /* may be gone */ }

    const child2 = spawnSidecar(dir);
    try {
      const d2 = await waitForSidecar(dir);
      const v = await connect(d2.url, "verifier");
      const after = parse<RecallOut>(await v.callTool({ name: "memory_recall", arguments: { query: "concurrent fact" } }));
      assert.equal(after.results.length, N, "all N concurrent writes survived the crash");
      assert.equal(after.cursor, maxIdBefore, "max id consistent after restart");
      await v.close();
    } finally { child2.kill("SIGTERM"); await new Promise<void>((r) => child2.once("exit", () => r())); }
  } finally {
    try { child.kill("SIGKILL"); } catch { /* already dead */ }
    rmSync(dir, { recursive: true, force: true });
  }
});
