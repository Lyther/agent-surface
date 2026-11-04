import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { readOrCreateToken } from "../src/bootstrap.js";
import { FakeClock } from "../src/clock.js";
import type { CompactMemory, FullMemory, RecallQuery } from "../src/contract.js";
import { resolveProjectRef } from "../src/namespace.js";
import { createRedactor } from "../src/redactor.js";
import { Store } from "../src/store.js";
import { buildToolSet } from "../src/tools.js";

function setup() {
  const clock = new FakeClock(1000);
  const dir = mkdtempSync(join(tmpdir(), "synapse-"));
  const store = new Store({ clock, redactor: createRedactor(), dbDir: dir, globalDbPath: join(dir, "global.sqlite") });
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

test("redaction strips secrets on ingest", () => {
  const { store, P, cleanup } = setup();
  try {
    const w = store.remember({ projectDbPath: P, agentId: "a", content: "token sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX is the key" });
    assert.ok(w.redactions >= 1);
    const full = store.get({ projectDbPath: P, agentId: "a", ids: [w.id] });
    assert.doesNotMatch((full[0] as FullMemory).content, /ABCDEFGHIJKLMNOPQRSTUVWX/);
  } finally { cleanup(); }
});

test("redaction covers prefixed keys, JSON/YAML quoting, Basic auth and URL credentials", () => {
  const redactor = createRedactor();
  const basic = Buffer.from("fake-user:fake-pass-0006").toString("base64");
  const cases: [string, string][] = [
    ["DB_PASSWORD=FakeDbPassword0001", "FakeDbPassword0001"],
    ["export SYNAPSE_TOKEN=FakeSynapseToken0002", "FakeSynapseToken0002"],
    ["client_secret=FakeClientSecret0003", "FakeClientSecret0003"],
    ['{"token": "FakeJsonToken0004"}', "FakeJsonToken0004"],
    ["password: 'fake yaml pass 0005'", "fake yaml pass 0005"],
    [`curl -H "Authorization: Basic ${basic}"`, basic],
    ["postgres://fakeuser:FakeUrlPass0007@db.example.invalid/app", "FakeUrlPass0007"],
  ];
  for (const [input, secret] of cases) {
    const out = redactor.redact(input);
    assert.ok(!out.text.includes(secret), `${input} -> ${out.text}`);
    assert.equal(out.count, 1, `one redaction for ${input}`);
  }
  assert.equal(redactor.redact("DB_PASSWORD=FakeDbPassword0001").text, "DB_PASSWORD=[REDACTED]", "the key stays readable");
  assert.equal(redactor.redact("postgres://fakeuser:FakeUrlPass0007@db.example.invalid/app").text, "postgres://[REDACTED]@db.example.invalid/app");
  assert.equal(redactor.redact("clone ssh://git@github.com/org/repo.git via http://localhost:4319/mcp").count, 0, "a URL without a password is untouched");
  for (const [input, secret] of [
    ["AWS_SECRET_ACCESS_KEY=FakeAwsSecret0009", "FakeAwsSecret0009"],
    ["dbPassword: FakeCamelPass0010", "FakeCamelPass0010"],
    ["DB_PASSWORD=Fake$ymbol!Pass11", "Fake$ymbol!Pass11"],
  ] as [string, string][]) assert.ok(!redactor.redact(input).text.includes(secret), input);
  for (const prose of ['{"url":"http://localhost:8080","owner":"dev@example.invalid"}', "the token: string field", "secretary: abcdefghijkl"]) {
    assert.equal(redactor.redact(prose).text, prose, `untouched: ${prose}`);
  }
  for (const flood of ["a-".repeat(32000), "a_".repeat(32000)]) {
    const started = Date.now();
    redactor.redact(flood);
    assert.ok(Date.now() - started < 1000, "redaction stays linear on a long hyphenated run");
  }
});

test("remember redacts tags and counts those redactions", () => {
  const { store, P, cleanup } = setup();
  try {
    const w = store.remember({ projectDbPath: P, agentId: "a", content: "rotated the staging credential", tags: ["ops", "token=FakeTagToken0008"] });
    assert.equal(w.redactions, 1);
    assert.deepEqual(store.get({ projectDbPath: P, agentId: "a", ids: [w.id] })[0]?.tags, ["ops", "token=[REDACTED]"]);
    assert.equal(store.recall(recall(P, { query: "FakeTagToken0008" })).results.length, 0, "the raw tag value is not FTS-indexed");
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
  const tokenDir = mkdtempSync(join(tmpdir(), "synapse-tok-"));
  try {
    chmodSync(dir, 0o755);
    chmodSync(tokenDir, 0o755);
    store.remember({ projectDbPath: P, agentId: "a", content: "first write opens the project DB" });
    readOrCreateToken(tokenDir);
    assert.equal(statSync(dir).mode & 0o777, 0o700, "store DB directory");
    assert.equal(statSync(tokenDir).mode & 0o777, 0o700, "bootstrap token directory");
  } finally { cleanup(); rmSync(tokenDir, { recursive: true, force: true }); }
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

test("onCommit fires with global vs project channel", () => {
  const clock = new FakeClock(1000);
  const dir = mkdtempSync(join(tmpdir(), "synapse-"));
  const channels: string[] = [];
  const store = new Store({
    clock, redactor: createRedactor(), dbDir: dir, globalDbPath: join(dir, "global.sqlite"),
    onCommit: (c) => channels.push(c),
  });
  const P = join(dir, "p.sqlite");
  try {
    store.remember({ projectDbPath: P, agentId: "a", content: "project note" });
    store.remember({ projectDbPath: P, agentId: "a", content: "global note", global: true });
    assert.equal(channels[0], P);
    assert.equal(channels[1], "global");
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
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

test("F002: forget reason is redacted so secret-remediation never re-leaks the secret", () => {
  const { store, P, cleanup } = setup();
  try {
    const tok = "sk-proj-abcdefghijklmnopqrstuvwxyz012345"; // realistic length (> 20 chars)
    const w = store.remember({ projectDbPath: P, agentId: "a", content: "placeholder note to forget" });
    // The agent names the leaked value in the reason — the classic remediation foot-gun.
    store.forget({ projectDbPath: P, agentId: "a", id: w.id, reason: `purge leaked token ${tok}` });
    const db = new DatabaseSync(P);
    const row = db.prepare("SELECT content FROM memory WHERE id=?").get(w.id) as { content: string };
    db.close();
    assert.doesNotMatch(row.content, /sk-proj-abcdefghijklmnopqrstuvwxyz012345/, "secret in reason scrubbed from the raw tombstone");
    assert.match(row.content, /\[REDACTED: purge leaked token \[REDACTED\]\]/, "reason kept (redacted) for audit");
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

test("a repeated operation id returns the recorded result and applies once, after a reopen too", () => {
  const { clock, dir, store, P, cleanup } = setup();
  try {
    const remember = { projectDbPath: P, agentId: "a", content: "applied exactly once", operationId: "op-remember" };
    const written = store.remember(remember);
    assert.deepEqual(store.remember(remember), written, "a retried write answers with the first result");
    const forget = { projectDbPath: P, agentId: "a", id: written.id, reason: "stale", operationId: "op-forget" };
    const forgotten = store.forget(forget);
    assert.ok(forgotten, "the first forget redacts the record");
    assert.deepEqual(store.forget(forget), forgotten, "a retried forget is not reported as NOT_FOUND");
    const acquire = { projectDbPath: P, agentId: "a", glob: "src/x.ts", ttlMs: 60_000, operationId: "op-acquire" };
    const acquired = store.acquire(acquire);
    const release = { projectDbPath: P, agentId: "a", glob: "src/x.ts", operationId: "op-release" };
    const released = store.release(release);
    assert.deepEqual(released, { released: true });
    assert.deepEqual(store.release(release), released, "a retried release still reports the release");

    // A restarted sidecar opens the same files, so the records answer its retries as well. Time moves
    // on first, so an acquire that ran again would report a new lock and leave it held.
    clock.advance(5_000);
    const reopened = new Store({ clock, redactor: createRedactor(), dbDir: dir, globalDbPath: join(dir, "global.sqlite") });
    try {
      assert.deepEqual(reopened.remember(remember), written);
      assert.deepEqual(reopened.forget(forget), forgotten);
      assert.deepEqual(reopened.acquire(acquire), acquired);
      assert.deepEqual(reopened.release(release), released);
      assert.deepEqual(reopened.listLocks({ projectDbPath: P }), [], "a replayed acquire does not take back a released lock");
    } finally { reopened.close(); }
    const db = new DatabaseSync(P, { readOnly: true });
    try {
      assert.equal((db.prepare("SELECT COUNT(*) AS n FROM memory").get() as { n: number }).n, 1, "one row for one intended write");
    } finally { db.close(); }
  } finally { cleanup(); }
});
