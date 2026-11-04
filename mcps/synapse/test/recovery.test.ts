// T2.2: concurrency + crash recovery. The sidecar is the SOLE node:sqlite owner
// writing through WAL (synchronous=NORMAL). A hard kill (SIGKILL) between writes must
// never lose a committed row nor corrupt the cursor: WAL frames for committed txns are
// durable on disk, and a fresh sidecar re-opens the same DB file and recovers to the
// last committed id. This spawns a REAL sidecar child process, kills it abruptly, and
// restarts a fresh one on the same dbDir to prove it.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureSidecar } from "../src/bootstrap.js";
import { createSidecar } from "../src/sidecar.js";
import { hashKey } from "../src/namespace.js";

const TOKEN = "recovery-token-777";
const PROJECT = "/tmp/projRecovery";
const sidecarJs = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "sidecar.js");
const bridgeJs = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "bridge.js");
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface RememberOut { id: number; agentId: string; redactions: number }
interface RecallOut { results: { id: number; snippet: string }[]; truncated: boolean; cursor: number }
interface Discovery { url: string; token: string; port: number; pid: number; startedAt: number }

// Spawn on an ephemeral port (0) and read the bound port from the discovery file so
// concurrent test runs never collide on a fixed port.
function spawnSidecar(dbDir: string, extraEnv: Record<string, string> = {}): ChildProcess {
  const env: Record<string, string> = { ...process.env as Record<string, string>, SYNAPSE_DB_DIR: dbDir, SYNAPSE_TOKEN: TOKEN, SYNAPSE_PORT: "0", ...extraEnv };
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

async function connect(url: string, agent: string, project = PROJECT): Promise<Client> {
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
  return JSON.parse(content[0]!.text) as T;
}

async function killHard(child: ChildProcess): Promise<void> {
  // SIGKILL = no graceful close, no store.close(), no WAL checkpoint — true crash.
  child.kill("SIGKILL");
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
}

async function stopPid(pid: number, timeoutMs = 3000): Promise<void> {
  try { process.kill(pid, "SIGTERM"); } catch { return; }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch { return; }
    await delay(25);
  }
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

test("ensureSidecar does not trust a discovery file whose pid is gone, even when its port answers", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-stale-"));
  const child = spawnSidecar(dir);
  // Not a stand-in for the sidecar: this is the foreign process a stale discovery would hand the token to.
  const imposter = createServer((_req, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end("{\"ok\":true}"); });
  let freshPid: number | undefined;
  try {
    const stale = await waitForSidecar(dir);
    await killHard(child);
    assert.ok(existsSync(discoveryPath(dir)), "premise: SIGKILL leaves the discovery file behind");
    await new Promise<void>((resolve) => imposter.listen(stale.port, "127.0.0.1", resolve));

    const fresh = await ensureSidecar(dir, 0);
    freshPid = fresh.pid;
    assert.notEqual(fresh.pid, stale.pid, "the dead sidecar's discovery is ignored");
    assert.notEqual(fresh.url, stale.url, "the token goes to a newly elected sidecar, not whatever holds the old port");
    assert.doesNotThrow(() => process.kill(fresh.pid, 0), "the returned sidecar is alive");
  } finally {
    if (freshPid) await stopPid(freshPid);
    await new Promise<void>((resolve) => imposter.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a sidecar ignores session routing env it inherited: each project key keeps its own DB", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-env-"));
  const projA = realpathSync(mkdtempSync(join(tmpdir(), "synapse-projA-")));
  const projB = realpathSync(mkdtempSync(join(tmpdir(), "synapse-projB-")));
  const child = spawnSidecar(dir, { SYNAPSE_NAMESPACE: "x" });
  try {
    const d = await waitForSidecar(dir);
    const a = await connect(d.url, "agent-a", projA);
    const b = await connect(d.url, "agent-b", projB);
    await a.callTool({ name: "memory_remember", arguments: { content: "alpha routing marker" } });
    await b.callTool({ name: "memory_remember", arguments: { content: "beta routing marker" } });
    assert.ok(existsSync(join(dir, `${hashKey(projA)}.sqlite`)), "project A has its own DB file");
    assert.ok(existsSync(join(dir, `${hashKey(projB)}.sqlite`)), "project B has its own DB file");
    assert.equal(existsSync(join(dir, `${hashKey("x")}.sqlite`)), false, "the sidecar's own SYNAPSE_NAMESPACE routes nothing");
    const own = parse<RecallOut>(await a.callTool({ name: "memory_recall", arguments: { query: "routing marker" } }));
    assert.deepEqual(own.results.map((r) => r.snippet), ["alpha routing marker"]);
    // An explicit cross-project ref is resolved by the sidecar itself, so it proves the env boundary.
    const cross = parse<RecallOut>(await a.callTool({ name: "memory_recall", arguments: { query: "routing marker", project: projB } }));
    assert.deepEqual(cross.results.map((r) => r.snippet), ["beta routing marker"]);
    await a.close(); await b.close();
  } finally {
    if (child.exitCode === null) { child.kill("SIGTERM"); await new Promise<void>((r) => child.once("exit", () => r())); }
    for (const p of [dir, projA, projB]) rmSync(p, { recursive: true, force: true });
  }
});

test("a zero-config bridge re-elects a sidecar that died and retries the call", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-reelect-"));
  const host = new Client({ name: "host", version: "0.0.1" });
  const env: Record<string, string> = { ...(process.env as Record<string, string>), SYNAPSE_DB_DIR: dir, SYNAPSE_PORT: "0", SYNAPSE_PROJECT: PROJECT };
  delete env["SYNAPSE_URL"];
  delete env["SYNAPSE_TOKEN"];
  let lastPid: number | undefined;
  try {
    await host.connect(new StdioClientTransport({ command: process.execPath, args: [bridgeJs], env }));
    await host.callTool({ name: "memory_remember", arguments: { content: "written before the sidecar died" } });
    const first = JSON.parse(readFileSync(discoveryPath(dir), "utf8")) as Discovery;
    lastPid = first.pid;
    process.kill(first.pid, "SIGKILL");
    await stopPid(first.pid);

    const after = await host.callTool({ name: "memory_remember", arguments: { content: "written after the sidecar died" } });
    assert.notEqual((after as { isError?: boolean }).isError, true, "the call succeeds through a re-elected sidecar");
    const second = JSON.parse(readFileSync(discoveryPath(dir), "utf8")) as Discovery;
    lastPid = second.pid;
    assert.notEqual(second.pid, first.pid, "a new sidecar was elected");
    const recall = parse<RecallOut>(await host.callTool({ name: "memory_recall", arguments: { query: "sidecar died" } }));
    assert.equal(recall.results.length, 2, "both writes landed in the same project database");
  } finally {
    await host.close().catch(() => { });
    if (lastPid) await stopPid(lastPid);
    rmSync(dir, { recursive: true, force: true });
  }
});

// The installer's stop step, run as the installer runs it: a separate Node process reading the record.
const stopSidecarMjs = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "stop-sidecar.mjs");
function runStop(dbDir: string): Promise<string> {
  const code = `import { stopRunningSidecar } from ${JSON.stringify(pathToFileURL(stopSidecarMjs).href)}; await stopRunningSidecar(process.argv[1]);`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", code, dbDir], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout!.on("data", (c: Buffer) => { output += c; });
  child.stderr!.on("data", (c: Buffer) => { output += c; });
  return new Promise((resolve) => child.once("exit", () => resolve(output)));
}

test("the installer's stop step signals no process when a different sidecar answers the record's address", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-stop-stale-"));
  const sc = await createSidecar({ token: TOKEN, port: 0, dbDir: dir });
  // Not a stand-in for the sidecar: this is the unrelated process a recycled pid would belong to.
  const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  try {
    writeFileSync(discoveryPath(dir), JSON.stringify({ pid: unrelated.pid, url: sc.url }));
    await runStop(dir);
    await delay(200);
    assert.equal(unrelated.exitCode === null && unrelated.signalCode === null, true, "the unrelated process is still running");
  } finally {
    unrelated.kill("SIGKILL");
    await sc.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the installer's stop step stops the sidecar its record names", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-stop-live-"));
  const child = spawnSidecar(dir);
  try {
    await waitForSidecar(dir);
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    const output = await runStop(dir);
    await exited;
    assert.match(output, /stopped the running sidecar/);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  }
});
