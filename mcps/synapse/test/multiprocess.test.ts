// Q-03: several real server processes share one DB directory. SQLite serializes their writers;
// a process killed with writes in flight takes nothing with it that it had acknowledged, and leaves
// no half-written record: each write and its full-text entry commit together or not at all.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { spawnServer, type SpawnedServer } from "./helpers.js";

const WRITERS = 4;
const WRITES_EACH = 40;
const KILL_AFTER = 10;
// The killed process gets its whole burst at once. Its answers can trail its commits by the whole
// burst, so the kill follows its commits in the DB rather than the answers.
const VICTIM_BURST = 400;
const KILLED = 2;

interface Recalled { results: { id: number; snippet: string }[]; truncated: boolean; cursor: number }
type Acquire = { ok: boolean; agentId?: string; heldBy?: string; expiresAt: number };

async function drain(server: SpawnedServer): Promise<Set<string>> {
  const seen = new Set<string>();
  let since = 0;
  for (let page = 0; page < 50; page++) {
    const r = await server.call<Recalled>("memory_recall", { since, limit: 200, maxBytes: 65536 });
    for (const rec of r.results) seen.add(rec.snippet);
    if (!r.truncated) return seen;
    since = r.cursor;
  }
  throw new Error("recall did not drain");
}

const projectDb = (dbDir: string): string => {
  const files = readdirSync(dbDir).filter((name) => name.endsWith(".sqlite") && name !== "global.sqlite");
  assert.equal(files.length, 1, "every process wrote the same project DB");
  return join(dbDir, files[0]!);
};

test("four server processes write one DB at once; one SIGKILLed with writes in flight loses no acknowledged record and leaves no partial one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-mp-"));
  const dbDir = join(dir, "db");
  const project = join(dir, "project");
  mkdirSync(project);
  const env = { SYNAPSE_DB_DIR: dbDir, SYNAPSE_PROJECT: project, SYNAPSE_AGENT_ID: "mp" };
  const servers: SpawnedServer[] = [];
  try {
    for (let i = 0; i < WRITERS; i++) servers.push(await spawnServer(env));
    const acked: string[][] = servers.map(() => []);
    const steady = servers.map(async (server, i) => {
      if (i === KILLED) return;
      for (let n = 0; n < WRITES_EACH; n++) {
        const content = `writer ${i} record ${n}`;
        await server.call("memory_remember", { content });
        acked[i]!.push(content);
      }
    });
    const victim = servers[KILLED]!;
    await victim.call("memory_remember", { content: `writer ${KILLED} first` });
    acked[KILLED]!.push(`writer ${KILLED} first`);
    const watcher = new DatabaseSync(projectDb(dbDir));
    const victimRows = (): number =>
      (watcher.prepare("SELECT COUNT(*) AS n FROM memory WHERE content LIKE ?").get(`writer ${KILLED} record %`) as { n: number }).n;
    const burst = Array.from({ length: VICTIM_BURST }, async (_, n) => {
      const content = `writer ${KILLED} record ${n}`;
      try {
        await victim.call("memory_remember", { content });
      } catch { return; } // its connection died with it
      acked[KILLED]!.push(content);
    });
    while (victimRows() < KILL_AFTER) await delay(1);
    process.kill(victim.pid, "SIGKILL");
    await Promise.all([...steady, ...burst]);
    const victimCommitted = victimRows();
    watcher.close();
    assert.ok(victimCommitted < VICTIM_BURST, `the kill landed with writes in flight: ${victimCommitted} of ${VICTIM_BURST} committed`);
    for (const [i, list] of acked.entries()) if (i !== KILLED) assert.equal(list.length, WRITES_EACH);

    const fresh = await spawnServer(env);
    servers.push(fresh);
    const committed = acked.flat();
    for (const reader of [...servers.filter((_, i) => i !== KILLED)]) {
      const seen = await drain(reader);
      for (const content of committed) assert.ok(seen.has(content), `${content} is visible to every other process`);
    }
    const db = new DatabaseSync(projectDb(dbDir));
    try {
      assert.equal((db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
      // Compares the full-text index with the memory table row by row; a record without its entry fails.
      db.exec("INSERT INTO memory_fts(memory_fts, rank) VALUES('integrity-check', 1)");
    } finally { db.close(); }
  } finally {
    await Promise.allSettled(servers.map((server) => server.close()));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a lock belongs to one process: another is refused until release or expiry", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-mp-lock-"));
  const project = join(dir, "project");
  mkdirSync(project);
  const env = { SYNAPSE_DB_DIR: join(dir, "db"), SYNAPSE_PROJECT: project, SYNAPSE_AGENT_ID: "same-agent" };
  const servers: SpawnedServer[] = [];
  try {
    const [a, b] = [await spawnServer(env), await spawnServer(env)];
    servers.push(a, b);
    const held = await a.call<Acquire>("lock_acquire", { glob: "src/shared.ts" });
    assert.deepEqual([held.ok, held.agentId], [true, `same-agent#${a.pid}`]);
    const refused = await b.call<Acquire>("lock_acquire", { glob: "src/shared.ts" });
    assert.deepEqual([refused.ok, refused.heldBy], [false, `same-agent#${a.pid}`], "the same agent id in another process does not own the lock");
    assert.deepEqual(await b.call("lock_release", { glob: "src/shared.ts" }), { ok: true, released: false });
    assert.deepEqual(await a.call("lock_release", { glob: "src/shared.ts" }), { ok: true, released: true });
    assert.equal((await b.call<Acquire>("lock_acquire", { glob: "src/shared.ts" })).ok, true);

    assert.equal((await a.call<Acquire>("lock_acquire", { glob: "src/ttl.ts", ttlMs: 300 })).ok, true);
    assert.equal((await b.call<Acquire>("lock_acquire", { glob: "src/ttl.ts" })).ok, false);
    await delay(400);
    assert.equal((await b.call<Acquire>("lock_acquire", { glob: "src/ttl.ts" })).ok, true, "an expired lock is free");
  } finally {
    await Promise.allSettled(servers.map((server) => server.close()));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a lease runs from when the write lock is won, not from when the call began waiting for it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-mp-lease-"));
  const project = join(dir, "project");
  mkdirSync(project);
  const dbDir = join(dir, "db");
  const servers: SpawnedServer[] = [];
  try {
    const server = await spawnServer({ SYNAPSE_DB_DIR: dbDir, SYNAPSE_PROJECT: project, SYNAPSE_AGENT_ID: "waiter" });
    servers.push(server);
    await server.call("lock_list", {});
    // Another process's long write: the server's acquire waits in busy_timeout until it commits.
    const holder = new DatabaseSync(projectDb(dbDir));
    holder.exec("BEGIN IMMEDIATE");
    const pending = server.call<Acquire>("lock_acquire", { glob: "src/waited.ts", ttlMs: 300 });
    await delay(600);
    holder.exec("COMMIT");
    holder.close();
    const lease = await pending;
    assert.equal(lease.ok, true);
    assert.ok(lease.expiresAt > Date.now(), `the 300 ms lease had not expired on arrival (expired ${Date.now() - lease.expiresAt} ms ago)`);
  } finally {
    await Promise.allSettled(servers.map((server) => server.close()));
    rmSync(dir, { recursive: true, force: true });
  }
});
