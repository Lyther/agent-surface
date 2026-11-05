import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { FakeClock } from "../src/clock.js";
import type { CompactMemory, FullMemory, RecallQuery } from "../src/contract.js";
import { resolveProjectRef } from "../src/namespace.js";
import { Store } from "../src/store.js";
import { buildToolSet } from "../src/tools.js";

/*
SUBSTITUTE_JUSTIFICATION
- replaces: the system clock the store stamps records and lock leases with (FakeClock)
- necessity: lease-expiry and time-order cases assert exact times; the system clock needs real waits past each lease and stamps same-millisecond writes alike
- real-proof: test/multiprocess.test.ts runs real server processes on the system clock, including a lease that expires in real time
*/
function setup() {
  const clock = new FakeClock(1000);
  const dir = mkdtempSync(join(tmpdir(), "synapse-"));
  const store = new Store({ clock, dbDir: dir, globalDbPath: join(dir, "global.sqlite") });
  const P = join(dir, "p.sqlite");
  const cleanup = () => { store.close(); rmSync(dir, { recursive: true, force: true }); };
  return { clock, dir, store, P, cleanup };
}
const recall = (P: string, q: Partial<RecallQuery>): RecallQuery => ({
  projectDbPath: P, agentId: "tester", limit: 20, maxBytes: 8192, mode: "compact", ...q,
});

test("remember + recall returns the record with provenance", () => {
  const { store, P, cleanup } = setup();
  try {
    const w = store.remember({ projectDbPath: P, agentId: "agent-a", content: "04-cybersecurity rule is always-on", tags: ["rules"] });
    assert.ok(w.id > 0);
    const r = store.recall(recall(P, { query: "cybersecurity" }));
    assert.equal(r.results.length, 1);
    const rec = r.results[0] as CompactMemory;
    assert.equal(rec.agentId, "agent-a");
    assert.equal(rec.store, "project");
    assert.match(rec.snippet, /cybersecurity/);
  } finally { cleanup(); }
});

test("recall is byte-budgeted and reports truncation", () => {
  const { store, P, cleanup } = setup();
  try {
    for (let i = 0; i < 30; i++) store.remember({ projectDbPath: P, agentId: "a", content: `note ${i} ` + "x".repeat(200) });
    const r = store.recall(recall(P, { maxBytes: 500 }));
    assert.ok(r.truncated, "should truncate under tiny budget");
    const bytes = r.results.reduce((n, x) => n + Buffer.byteLength((x as CompactMemory).snippet, "utf8"), 0);
    assert.ok(bytes <= 500 + 260, `budget respected (got ${bytes})`);
  } finally { cleanup(); }
});

test("since cursor returns only newer records", () => {
  const { store, P, cleanup } = setup();
  try {
    store.remember({ projectDbPath: P, agentId: "a", content: "first decision about auth" });
    const cursor = store.recall(recall(P, {})).cursor;
    store.remember({ projectDbPath: P, agentId: "a", content: "second decision about cache" });
    const r2 = store.recall(recall(P, { since: cursor }));
    assert.equal(r2.results.length, 1);
    assert.match((r2.results[0] as CompactMemory).snippet, /cache/);
  } finally { cleanup(); }
});

test("memory_get expands ids to full content", () => {
  const { store, P, cleanup } = setup();
  try {
    const w = store.remember({ projectDbPath: P, agentId: "a", content: "the full body of a decision record" });
    const full = store.get({ projectDbPath: P, agentId: "a", ids: [w.id] });
    assert.equal(full.length, 1);
    assert.equal((full[0] as FullMemory).content, "the full body of a decision record");
  } finally { cleanup(); }
});

test("forget hides from recall and get; supersede replaces", () => {
  const { store, P, cleanup } = setup();
  try {
    const a = store.remember({ projectDbPath: P, agentId: "a", content: "cline target count is seventy one" });
    store.forget({ projectDbPath: P, agentId: "a", id: a.id, reason: "stale" });
    assert.equal(store.recall(recall(P, { query: "cline" })).results.length, 0);
    assert.equal(store.get({ projectDbPath: P, agentId: "a", ids: [a.id] }).length, 0);

    const b = store.remember({ projectDbPath: P, agentId: "a", content: "kilo uses model X" });
    const c = store.remember({ projectDbPath: P, agentId: "a", content: "kilo uses model Y", supersedes: b.id });
    const hits = store.recall(recall(P, { query: "kilo" }));
    assert.equal(hits.results.length, 1);
    assert.equal((hits.results[0] as CompactMemory).id, c.id);
  } finally { cleanup(); }
});

test("remember treats supersedes zero as no predecessor", () => {
  const { store, P, cleanup } = setup();
  try {
    const w = store.remember({ projectDbPath: P, agentId: "a", content: "standalone decision", supersedes: 0 });
    assert.ok(w.id > 0);
    assert.equal(store.recall(recall(P, { query: "standalone" })).results.length, 1);
  } finally { cleanup(); }
});

test("remember rejects a stale supersedes id with a domain error and no partial write", () => {
  const { store, P, cleanup } = setup();
  try {
    assert.throws(
      () => store.remember({ projectDbPath: P, agentId: "a", content: "replacement", supersedes: 999 }),
      /unknown supersedes id 999/,
    );
    assert.equal(store.recall(recall(P, { query: "replacement" })).results.length, 0);
  } finally { cleanup(); }
});

test("memory_remember exposes stale supersedes as typed INVALID_INPUT", () => {
  const { store, P, cleanup } = setup();
  try {
    const result = buildToolSet(store, { projectDbPath: P, agentId: "a" })
      .call("memory_remember", { content: "replacement", supersedes: 999 });
    assert.equal(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0]!.text), {
      code: "INVALID_INPUT",
      message: "unknown supersedes id 999",
    });
  } finally { cleanup(); }
});

test("project isolation: project B cannot recall A's memory; global is shared", () => {
  const { store, dir, cleanup } = setup();
  const A = join(dir, "projA.sqlite");
  const B = join(dir, "projB.sqlite");
  try {
    store.remember({ projectDbPath: A, agentId: "a", content: "alpha-only project secret plan" });
    store.remember({ projectDbPath: A, agentId: "a", content: "shared gamma preference", global: true });
    assert.equal(store.recall(recall(B, { query: "alpha" })).results.length, 0, "B must not see A project");
    assert.equal(store.recall(recall(B, { query: "gamma" })).results.length, 1, "B sees shared global");
  } finally { cleanup(); }
});

test("cross-project recall ids are read-only and its cursor belongs to the queried project", () => {
  const { store, dir, cleanup } = setup();
  const localDb = join(dir, "local.sqlite");
  const targetRoot = join(dir, "target-project");
  mkdirSync(targetRoot);
  const targetDb = resolveProjectRef(targetRoot, dir);
  try {
    const local = store.remember({ projectDbPath: localDb, agentId: "local", content: "local collision row" });
    store.remember({ projectDbPath: localDb, agentId: "local", content: "local second row" });
    const targetPredecessor = store.remember({ projectDbPath: targetDb, agentId: "remote", content: "remote predecessor" });
    const target = store.remember({
      projectDbPath: targetDb,
      agentId: "remote",
      content: "remote project marker",
      supersedes: targetPredecessor.id,
    });
    assert.equal(local.id, targetPredecessor.id, "the two physical project DBs reproduce the row-id collision");

    const result = store.recall(recall(localDb, { project: targetRoot, query: "remote project marker", mode: "full" }));
    assert.equal(result.results.length, 1);
    const remote = result.results[0] as FullMemory & { readOnly?: boolean };
    assert.ok(remote.id >= 2_000_000_000_000, "cross-project rows use the reserved read-only id range");
    assert.ok((remote.supersedes ?? 0) >= 2_000_000_000_000, "cross-project predecessor ids use the same read-only range");
    assert.equal(remote.readOnly, true);
    assert.equal(result.cursor, target.id, "cross-project cursor comes from the queried project DB");
    assert.throws(
      () => store.get({ projectDbPath: localDb, agentId: "local", ids: [remote.id] }),
      /cross-project memory ids are read-only/,
    );
    assert.throws(
      () => store.forget({ projectDbPath: localDb, agentId: "local", id: remote.id, reason: "must not touch local" }),
      /cross-project memory ids are read-only/,
    );
    assert.throws(
      () => store.remember({ projectDbPath: localDb, agentId: "local", content: "must not supersede local", supersedes: remote.supersedes }),
      /cross-project memory ids are read-only/,
    );
    assert.equal(store.get({ projectDbPath: localDb, agentId: "local", ids: [local.id] }).length, 1, "colliding local row remains live");
  } finally { cleanup(); }
});

test("locks: conflict returns holder; release frees; expiry frees", () => {
  const { store, P, clock, cleanup } = setup();
  try {
    assert.equal(store.acquire({ projectDbPath: P, agentId: "a", glob: "src/x.ts", ttlMs: 60000 }).ok, true);
    const r2 = store.acquire({ projectDbPath: P, agentId: "b", glob: "src/x.ts", ttlMs: 60000 });
    assert.equal(r2.ok, false);
    if (!r2.ok) assert.equal(r2.heldBy, "a");
    store.release({ projectDbPath: P, agentId: "a", glob: "src/x.ts" });
    assert.equal(store.acquire({ projectDbPath: P, agentId: "b", glob: "src/x.ts", ttlMs: 1000 }).ok, true);
    clock.advance(2000);
    assert.equal(store.acquire({ projectDbPath: P, agentId: "c", glob: "src/x.ts", ttlMs: 1000 }).ok, true);
    assert.equal(store.listLocks({ projectDbPath: P }).length, 1);
  } finally { cleanup(); }
});

test("forget purges a superseded record without corrupting the FTS index", () => {
  const { store, P, cleanup } = setup();
  try {
    const old = store.remember({ projectDbPath: P, agentId: "a", content: "staging deploy reads vault path alpha" });
    const next = store.remember({ projectDbPath: P, agentId: "a", content: "staging deploy reads vault path beta", supersedes: old.id });
    assert.ok(store.forget({ projectDbPath: P, agentId: "a", id: old.id, reason: "leaked path" }));
    const db = new DatabaseSync(P);
    try {
      db.exec("INSERT INTO memory_fts(memory_fts) VALUES('integrity-check')");
      const row = db.prepare("SELECT content,status FROM memory WHERE id=?").get(old.id) as { content: string; status: string };
      assert.equal(row.content, "[REDACTED: leaked path]");
      assert.equal(row.status, "redacted");
    } finally { db.close(); }
    assert.deepEqual(store.recall(recall(P, { query: "vault" })).results.map((r) => r.id), [next.id]);
  } finally { cleanup(); }
});

test("the data directory is narrowed to its owner", { skip: process.platform === "win32" }, () => {
  const { store, dir, P, cleanup } = setup();
  try {
    chmodSync(dir, 0o755);
    store.remember({ projectDbPath: P, agentId: "a", content: "first write opens the project DB" });
    assert.equal(statSync(dir).mode & 0o777, 0o700, "store DB directory");
  } finally { cleanup(); }
});

test("query recall pages through every match by following the cursor", () => {
  const { store, P, cleanup } = setup();
  try {
    for (let i = 0; i < 3; i++) store.remember({ projectDbPath: P, agentId: "a", content: `paging match ${i}` });
    let page = store.recall(recall(P, { query: "paging", limit: 2 }));
    assert.equal(page.results.length, 2);
    assert.equal(page.truncated, true);
    const seen = new Set(page.results.map((r) => r.id));
    for (let guard = 0; page.truncated && guard < 10; guard++) {
      page = store.recall(recall(P, { query: "paging", limit: 2, since: page.cursor }));
      for (const r of page.results) seen.add(r.id);
    }
    assert.equal(page.truncated, false, "paging terminates");
    assert.equal(seen.size, 3, "the match the first page left out is reachable through the cursor");
  } finally { cleanup(); }
});

test("F001: global memory round-trips recall -> get -> forget", () => {
  const { store, P, cleanup } = setup();
  try {
    const w = store.remember({ projectDbPath: P, agentId: "a", content: "global preference alpha", global: true });
    assert.ok(w.id >= 1_000_000_000_000, "global id is encoded");
    const r = store.recall(recall(P, { query: "alpha" }));
    assert.equal(r.results.length, 1);
    const rid = (r.results[0] as CompactMemory).id;
    assert.equal(rid, w.id, "recalled id == encoded written id");
    assert.equal((r.results[0] as CompactMemory).store, "global");
    assert.equal(store.get({ projectDbPath: P, agentId: "a", ids: [rid] }).length, 1, "get via recalled id works");
    assert.ok(store.forget({ projectDbPath: P, agentId: "a", id: rid, reason: "x" }), "forget via recalled id works");
    assert.equal(store.recall(recall(P, { query: "alpha" })).results.length, 0);
  } finally { cleanup(); }
});

test("F004: forget scrubs plaintext content (real redaction, audit kept)", () => {
  const { store, P, cleanup } = setup();
  try {
    const w = store.remember({ projectDbPath: P, agentId: "a", content: "leaked value ZZ9SECRET token", tags: ["t"] });
    store.forget({ projectDbPath: P, agentId: "a", id: w.id, reason: "leaked secret" });
    const db = new DatabaseSync(P);
    const row = db.prepare("SELECT content,tags,status FROM memory WHERE id=?").get(w.id) as { content: string; tags: string | null; status: string };
    db.close();
    assert.doesNotMatch(row.content, /ZZ9SECRET/, "secret scrubbed from stored content");
    assert.match(row.content, /\[REDACTED: leaked secret\]/, "reason tombstone kept for audit");
    assert.equal(row.status, "redacted");
    assert.equal(row.tags, null);
  } finally { cleanup(); }
});

test("F003: `since` is incremental for project but global is always re-scanned (documented)", () => {
  const { store, P, cleanup } = setup();
  try {
    store.remember({ projectDbPath: P, agentId: "a", content: "old global preference omega", global: true });
    const first = store.recall(recall(P, {}));
    const cursor = first.cursor; // project MAX(id); global rows are not reflected in the cursor
    store.remember({ projectDbPath: P, agentId: "a", content: "new project note delta" });
    const delta = store.recall(recall(P, { since: cursor }));
    const stores = delta.results.map((r) => r.store).sort();
    assert.ok(delta.results.some((r) => r.store === "project"), "new project record returned by since-cursor");
    assert.ok(delta.results.some((r) => r.store === "global"), "low-churn global is re-scanned (not filtered by since) — contract documents this");
    assert.deepEqual([...new Set(stores)], ["global", "project"]);
  } finally { cleanup(); }
});

test("R2: since-drain sees every project record when the backlog exceeds one page", () => {
  const { store, P, cleanup } = setup();
  try {
    for (let i = 0; i < 31; i++) store.remember({ projectDbPath: P, agentId: "a", content: `backlog record ${i}` });
    const seen = new Set<number>();
    let since = 0;
    for (let guard = 0; guard < 20; guard++) {
      const r = store.recall(recall(P, { since, limit: 20 }));
      for (const rec of r.results) if (rec.store === "project") seen.add(rec.id);
      if (!r.truncated) break;
      assert.ok(r.cursor > since, `cursor must advance past ${since}, got ${r.cursor}`);
      since = r.cursor;
    }
    assert.equal(seen.size, 31, `since-drain must eventually deliver all 31 records (saw ${seen.size})`);
  } finally { cleanup(); }
});

test("R2b: since-drain terminates once the project is drained even when global memory fills a page", () => {
  const { store, P, clock, cleanup } = setup();
  try {
    for (let i = 0; i < 31; i++) { clock.advance(1); store.remember({ projectDbPath: P, agentId: "a", content: `project record ${i}` }); }
    for (let i = 0; i < 40; i++) { clock.advance(1); store.remember({ projectDbPath: P, agentId: "a", content: `global pref ${i}`, global: true }); }
    const seen = new Set<number>();
    let since = 0, pages = 0;
    let last = store.recall(recall(P, { since, limit: 20 }));
    for (; pages < 100; pages++) {
      last = store.recall(recall(P, { since, limit: 20 }));
      for (const rec of last.results) if (rec.store === "project") seen.add(rec.id);
      if (!last.truncated) break;
      assert.ok(last.cursor > since, `cursor must advance while draining (was ${since}, got ${last.cursor})`);
      since = last.cursor;
    }
    assert.ok(pages < 100, "drain must terminate, not loop on re-scanned global memory");
    assert.equal(seen.size, 31, `all 31 project records delivered (saw ${seen.size})`);
    // The exact stranding case: project fully drained, global still returns a full page.
    const beyond = store.recall(recall(P, { since: 1_000_000, limit: 20 }));
    assert.ok(beyond.results.some((r) => r.store === "global") && beyond.results.every((r) => r.store === "global"), "global is still surfaced, no project rows remain");
    assert.equal(beyond.truncated, false, "project-exhausted drain must report not-truncated despite re-scanned global (no infinite loop)");
  } finally { cleanup(); }
});

test("R3: recall ranks project and global by recency, not by incomparable per-DB row ids", () => {
  const { store, P, clock, cleanup } = setup();
  try {
    for (let i = 0; i < 25; i++) store.remember({ projectDbPath: P, agentId: "a", content: `older global pref ${i}`, global: true });
    clock.advance(10_000);
    store.remember({ projectDbPath: P, agentId: "a", content: "fresh project decision phi" });
    const r = store.recall(recall(P, { limit: 20 }));
    assert.ok(
      r.results.some((x) => x.store === "project"),
      "the newest record (a project row) must survive ranking against many older, higher-rowid global rows",
    );
  } finally { cleanup(); }
});

test("R4: recall byte budget accounts for the whole serialized record, not just the snippet", () => {
  const { store, P, cleanup } = setup();
  try {
    for (let i = 0; i < 20; i++) {
      store.remember({ projectDbPath: P, agentId: "agent-with-long-identifier", content: `x${i}`, tags: ["alpha", "beta"] });
    }
    const r = store.recall(recall(P, { maxBytes: 256, limit: 200 }));
    const serialized = r.results.reduce((n, rec) => n + Buffer.byteLength(JSON.stringify(rec), "utf8"), 0);
    assert.ok(r.results.length >= 1, "always make progress with at least one record");
    assert.ok(serialized <= 256 + 300, `serialized results must respect maxBytes plus one record (got ${serialized} across ${r.results.length})`);
  } finally { cleanup(); }
});

test("R4b: memory_get fails loud (PAYLOAD_TOO_LARGE) when combined content is too large", () => {
  const { store, P, cleanup } = setup();
  try {
    const big = "z".repeat(40 * 1024); // < CONTENT_BYTES_MAX, so a single record is always fetchable
    const a = store.remember({ projectDbPath: P, agentId: "a", content: big });
    const b = store.remember({ projectDbPath: P, agentId: "a", content: big });
    const tools = buildToolSet(store, { projectDbPath: P, agentId: "a" });
    assert.ok(!tools.call("memory_get", { ids: [a.id] }).isError, "a single large record still fetches");
    const tooBig = tools.call("memory_get", { ids: [a.id, b.id] });
    assert.equal(tooBig.isError, true);
    assert.equal(JSON.parse(tooBig.content[0]!.text).code, "PAYLOAD_TOO_LARGE");
  } finally { cleanup(); }
});

test("a store failure is the call's INTERNAL tool error, not a thrown exception", () => {
  const { store, dir, cleanup } = setup();
  try {
    const broken = join(dir, "broken.sqlite");
    writeFileSync(broken, "this file is not a SQLite database, which every open of it reports");
    const result = buildToolSet(store, { projectDbPath: broken, agentId: "a" }).call("memory_remember", { content: "lands nowhere" });
    assert.equal(result.isError, true);
    const body = JSON.parse(result.content[0]!.text) as { code: string; message: string };
    assert.equal(body.code, "INTERNAL");
    assert.match(body.message, /not a database/);
  } finally { cleanup(); }
});

// One tagged record that lies outside the first `limit` rows both ways: it is the oldest (browse pages
// newest-first) and the longest (bm25 favors short documents), behind `limit + 1` untagged matches.
function seedTaggedBelowLimit(store: Store, P: string, limit: number): number {
  const tagged = store.remember({
    projectDbPath: P, agentId: "a", content: "rollout " + "padding ".repeat(60), tags: ["keep", "audit"],
  });
  for (let i = 0; i <= limit; i++) store.remember({ projectDbPath: P, agentId: "a", content: `rollout note ${i}` });
  return tagged.id;
}

test("tags filter runs before the row limit: query recall", () => {
  const { store, P, cleanup } = setup();
  try {
    const limit = 5;
    const tagged = seedTaggedBelowLimit(store, P, limit);
    const page = store.recall(recall(P, { query: "rollout", limit }));
    assert.equal(page.results.length, limit);
    assert.ok(!page.results.some((r) => r.id === tagged), "premise: the tagged record ranks below the first page");
    const hit = store.recall(recall(P, { query: "rollout", tags: ["audit", "keep"], limit }));
    assert.deepEqual(hit.results.map((r) => r.id), [tagged]);
    const miss = store.recall(recall(P, { query: "rollout", tags: ["keep", "absent"], limit }));
    assert.equal(miss.results.length, 0, "every requested tag is required");
  } finally { cleanup(); }
});

test("tags filter runs before the row limit: browse recall", () => {
  const { store, P, cleanup } = setup();
  try {
    const limit = 5;
    const tagged = seedTaggedBelowLimit(store, P, limit);
    const page = store.recall(recall(P, { limit }));
    assert.equal(page.results.length, limit);
    assert.ok(!page.results.some((r) => r.id === tagged), "premise: the tagged record is older than the newest page");
    const hit = store.recall(recall(P, { tags: ["audit", "keep"], limit }));
    assert.deepEqual(hit.results.map((r) => r.id), [tagged]);
    const miss = store.recall(recall(P, { tags: ["keep", "absent"], limit }));
    assert.equal(miss.results.length, 0, "every requested tag is required");
  } finally { cleanup(); }
});

// The v0.4 schema as synapse-v0.4.0 shipped it, operations table included.
const V04_SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, agent_id TEXT NOT NULL, content TEXT NOT NULL,
  tags TEXT, supersedes INTEGER REFERENCES memory(id),
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live','superseded','redacted'))
);
CREATE INDEX idx_memory_status_id ON memory(status, id);
CREATE VIRTUAL TABLE memory_fts USING fts5(content, tags, content='memory', content_rowid='id', tokenize='porter unicode61');
CREATE TABLE locks (glob TEXT PRIMARY KEY, agent_id TEXT NOT NULL, acquired_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX idx_locks_expiry ON locks(expires_at);
CREATE TABLE operations (id TEXT PRIMARY KEY, result TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX idx_operations_created ON operations(created_at);
`;

test("a v0.4 database opens with every row intact, and a v0.4 writer still running keeps writing", () => {
  const { store, P, cleanup } = setup();
  // Stands in for a v0.4 sidecar that outlives the upgrade: its own connection, the v0.4 statements.
  const old = new DatabaseSync(P);
  try {
    old.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
    old.exec(V04_SCHEMA);
    old.prepare("INSERT INTO meta(key,value) VALUES('schema_version','1')").run();
    const v04Remember = (ts: number, content: string, operation: string): void => {
      old.exec("BEGIN IMMEDIATE");
      const row = old.prepare("INSERT INTO memory(ts,agent_id,content,tags,status) VALUES(?,?,?,?,'live')").run(ts, "old-agent", content, '["v04"]');
      old.prepare("INSERT INTO memory_fts(rowid,content,tags) VALUES(?,?,?)").run(Number(row.lastInsertRowid), content, '["v04"]');
      old.prepare("INSERT INTO operations(id,result,created_at) VALUES(?,?,?)").run(operation, JSON.stringify({ id: Number(row.lastInsertRowid) }), ts);
      old.exec("COMMIT");
    };
    v04Remember(900, "v04 decision kept across the upgrade", "op-1");
    v04Remember(950, "v04 lesson kept across the upgrade", "op-2");
    old.prepare("INSERT INTO locks(glob,agent_id,acquired_at,expires_at) VALUES(?,?,?,?)").run("src/held.ts", "old-agent#b1", 900, 10_000_000);

    const recalled = store.recall(recall(P, { query: "upgrade", tags: ["v04"], mode: "full" }));
    assert.deepEqual(recalled.results.map((r) => (r as FullMemory).content).sort(), ["v04 decision kept across the upgrade", "v04 lesson kept across the upgrade"]);
    assert.deepEqual(store.listLocks({ projectDbPath: P }), [{ glob: "src/held.ts", agentId: "old-agent#b1", acquiredAt: 900, expiresAt: 10_000_000 }]);
    const written = store.remember({ projectDbPath: P, agentId: "new-agent", content: "first write after the upgrade" });
    assert.equal(written.id, 3, "new rows continue the v0.4 id sequence");

    v04Remember(1100, "v04 write after the upgrade", "op-3");
    assert.deepEqual(old.prepare("SELECT id FROM operations ORDER BY id").all().map((r) => (r as { id: string }).id), ["op-1", "op-2", "op-3"]);
    const latest = store.recall(recall(P, { query: "after upgrade", mode: "full" }));
    assert.deepEqual(latest.results.map((r) => (r as FullMemory).content).sort(), ["first write after the upgrade", "v04 write after the upgrade"]);
    assert.equal((old.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  } finally { old.close(); cleanup(); }
});
