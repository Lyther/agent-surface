import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { FakeClock } from "../src/clock.js";
import type { CompactMemory, FullMemory, RecallQuery } from "../src/contract.js";
import { createRedactor } from "../src/redactor.js";
import { Store } from "../src/store.js";

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
