// synapse MCP — integration tests (node:test).
// Tests the full store + identity + redactor + scope enforcement + projections.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { FakeClock } from "../src/clock.js";
import { EnvIdentity } from "../src/identity.js";
import { createRedactor } from "../src/redactor.js";
import { Store } from "../src/store.js";

function setupStore(agentId: string, clock: FakeClock): { store: Store; dir: string; identity: EnvIdentity } {
  const dir = mkdtempSync(join(tmpdir(), "synapse-test-"));
  const identity = new EnvIdentity({
    agentId,
    namespace: "test-ns",
    dbDir: dir,
  });
  const store = new Store(identity, clock);
  return { store, dir, identity };
}

describe("Store — events + projections", () => {
  let dir: string;
  let store: Store;
  let clock: FakeClock;

  beforeEach(() => {
    clock = new FakeClock(1000);
    const setup = setupStore("agent-a", clock);
    store = setup.store;
    dir = setup.dir;
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("appends events with monotonic ids", () => {
    const e1 = store.appendEvent({ agentId: "agent-a", kind: "message", scope: "shared", topic: "t1", payload: { body: "hello" } });
    const e2 = store.appendEvent({ agentId: "agent-a", kind: "message", scope: "shared", topic: "t1", payload: { body: "world" } });
    assert.equal(e1.offset, 1);
    assert.equal(e2.offset, 2);
    assert.ok(e2.ts >= e1.ts);
  });

  it("bus_messages reads by topic", () => {
    store.appendEvent({ agentId: "agent-a", kind: "message", scope: "shared", topic: "t1", payload: { body: "msg1" } });
    store.appendEvent({ agentId: "agent-a", kind: "message", scope: "shared", topic: "t2", payload: { body: "msg2" } });
    const msgs = store.queryMessages({ agentId: "agent-a", topic: "t1", since: 0, limit: 10 });
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].body, "msg1");
  });

  it("bus_messages without topic returns DMs + shared messages", () => {
    store.appendEvent({ agentId: "agent-a", kind: "message", scope: "shared", topic: "general", payload: { body: "shared-msg" } });
    store.appendEvent({ agentId: "agent-b", kind: "dm", scope: "shared", toAgent: "agent-a", payload: { body: "dm-to-a" } });
    store.appendEvent({ agentId: "agent-b", kind: "dm", scope: "shared", toAgent: "agent-c", payload: { body: "dm-to-c" } });
    const msgs = store.queryMessages({ agentId: "agent-a", since: 0, limit: 10 });
    assert.equal(msgs.length, 2); // shared-msg + dm-to-a (not dm-to-c)
    assert.ok(msgs.some((m) => m.body === "shared-msg"));
    assert.ok(msgs.some((m) => m.body === "dm-to-a"));
  });

  it("bus_messages (topic-less) filters expired BEFORE limit so live messages aren't hidden (R3-F003)", () => {
    // clock.now() === 1000. Five expired (expiresAt 500) then one live (5000).
    for (let i = 0; i < 5; i++) {
      store.appendEvent({
        agentId: "agent-a",
        kind: "message",
        scope: "shared",
        topic: "general",
        payload: { body: `expired-${i}`, expiresAt: 500 },
      });
    }
    store.appendEvent({
      agentId: "agent-a",
      kind: "message",
      scope: "shared",
      topic: "general",
      payload: { body: "live-msg", expiresAt: 5000 },
    });
    // Small limit: pre-fix this returned [] because expired rows consumed the page.
    const msgs = store.queryMessages({ agentId: "agent-a", since: 0, limit: 3 });
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].body, "live-msg");
  });

  it("bus_reserve acquires and blocks conflict", () => {
    const r1 = store.reserve({ agentId: "agent-a", resourceGlob: "src/x.ts", ttlMs: 60000 });
    assert.equal(r1.ok, true);
    const r2 = store.reserve({ agentId: "agent-b", resourceGlob: "src/x.ts", ttlMs: 60000 });
    assert.equal(r2.ok, false);
    assert.equal(r2.heldBy, "agent-a");
  });

  it("bus_reserve renews own reservation", () => {
    store.reserve({ agentId: "agent-a", resourceGlob: "src/x.ts", ttlMs: 60000 });
    const r2 = store.reserve({ agentId: "agent-a", resourceGlob: "src/x.ts", ttlMs: 120000 });
    assert.equal(r2.ok, true);
  });

  it("bus_release removes reservation", () => {
    store.reserve({ agentId: "agent-a", resourceGlob: "src/x.ts", ttlMs: 60000 });
    const result = store.release({ agentId: "agent-a", resourceGlob: "src/x.ts" });
    assert.equal(result.released, true);
    const reservations = store.listReservations({});
    assert.equal(reservations.length, 0);
  });

  it("bus_presence upserts + lists", () => {
    store.upsertPresence({ agentId: "agent-a", caps: ["code", "review"] });
    store.upsertPresence({ agentId: "agent-b" });
    const agents = store.listPresence();
    assert.equal(agents.length, 2);
  });

  it("memory_remember + memory_recall round-trip", () => {
    store.appendEvent({
      agentId: "agent-a",
      kind: "memory",
      scope: "shared",
      payload: { type: "fact", content: "The API uses JWT auth at /v2/token" },
    });
    store.appendEvent({
      agentId: "agent-a",
      kind: "memory",
      scope: "shared",
      payload: { type: "note", content: "Redis runs on port 6379" },
    });
    const result = store.recall({ agentId: "agent-a", query: "JWT auth API", limit: 10 });
    assert.ok(result.results.length > 0);
    assert.ok(result.results.some((r) => r.content.includes("JWT")));
  });

  it("memory private scope is invisible to other agents", () => {
    store.appendEvent({
      agentId: "agent-a",
      kind: "memory",
      scope: "private",
      payload: { type: "fact", content: "secret finding only for agent-a" },
    });
    // agent-b recalls: should not see agent-a's private memory.
    const result = store.recall({ agentId: "agent-b", query: "secret finding", limit: 10 });
    assert.equal(result.results.length, 0);
    // agent-a recalls: should see own private.
    const own = store.recall({ agentId: "agent-a", query: "secret finding", limit: 10 });
    assert.ok(own.results.length > 0);
  });

  it("memory_supersede invalidates old fact", () => {
    const e1 = store.appendEvent({
      agentId: "agent-a",
      kind: "memory",
      scope: "shared",
      payload: { type: "fact", content: "Port is 3000" },
    });
    store.appendEvent({
      agentId: "agent-a",
      kind: "memory_supersede",
      scope: "shared",
      payload: { reason: "port changed", content: "Port is 8080" },
      supersedes: e1.offset,
    });
    // Recall should find the new fact, not the old.
    const result = store.recall({ agentId: "agent-a", query: "Port", limit: 10 });
    assert.ok(result.results.some((r) => r.content.includes("8080")));
    assert.ok(!result.results.some((r) => r.content.includes("3000")));
    // History should show both.
    const history = store.history({ agentId: "agent-a", query: "Port", limit: 10 });
    assert.ok(history.length >= 2);
  });

  it("tombstone hides record from recall but preserves in history", () => {
    const e1 = store.appendEvent({
      agentId: "agent-a",
      kind: "memory",
      scope: "shared",
      payload: { type: "fact", content: "leaked secret key sk-proj-abc" },
    });
    store.tombstone({ agentId: "agent-a", targetId: e1.offset, reason: "leaked secret" });
    // Recall should not find it.
    const result = store.recall({ agentId: "agent-a", query: "leaked secret", limit: 10 });
    assert.equal(result.results.length, 0);
    // History should still have it.
    const history = store.history({ agentId: "agent-a", id: e1.offset, limit: 10 });
    assert.equal(history.length, 1);
  });

  it("export returns events bounded", () => {
    store.appendEvent({ agentId: "agent-a", kind: "message", scope: "shared", topic: "t", payload: { body: "a" } });
    store.appendEvent({ agentId: "agent-a", kind: "message", scope: "shared", topic: "t", payload: { body: "b" } });
    const result = store.exportEvents({ agentId: "agent-a", limit: 1 });
    assert.equal(result.events.length, 1);
    assert.equal(result.truncated, true);
    assert.ok(result.nextOffset);
  });

  it("export excludes other agents' private events", () => {
    store.appendEvent({ agentId: "agent-a", kind: "message", scope: "private", topic: "t", payload: { body: "private-a" } });
    store.appendEvent({ agentId: "agent-b", kind: "message", scope: "private", topic: "t", payload: { body: "private-b" } });
    const result = store.exportEvents({ agentId: "agent-a", limit: 10 });
    assert.ok(result.events.some((e) => e.payload && JSON.stringify(e.payload).includes("private-a")));
    assert.ok(!result.events.some((e) => e.payload && JSON.stringify(e.payload).includes("private-b")));
  });

  it("reservation TTL expiry frees the glob", () => {
    store.reserve({ agentId: "agent-a", resourceGlob: "src/x.ts", ttlMs: 1000 });
    clock.advance(1001);
    const r2 = store.reserve({ agentId: "agent-b", resourceGlob: "src/x.ts", ttlMs: 5000 });
    assert.equal(r2.ok, true, "expired reservation should be reaped, allowing agent-b to reserve");
  });

  it("release rejected for non-holder", () => {
    store.reserve({ agentId: "agent-a", resourceGlob: "src/y.ts", ttlMs: 60000 });
    const result = store.release({ agentId: "agent-b", resourceGlob: "src/y.ts" });
    assert.equal(result.released, false, "non-holder cannot release");
    // Holder can still release.
    const result2 = store.release({ agentId: "agent-a", resourceGlob: "src/y.ts" });
    assert.equal(result2.released, true);
  });

  it("tombstone on superseded row is idempotent", () => {
    const e1 = store.appendEvent({ agentId: "agent-a", kind: "memory", scope: "shared", payload: { type: "fact", content: "v1" } });
    store.appendEvent({ agentId: "agent-a", kind: "memory_supersede", scope: "shared", payload: { content: "v2" }, supersedes: e1.offset });
    // Tombstone the superseded row.
    const t1 = store.tombstone({ agentId: "agent-a", targetId: e1.offset, reason: "cleanup" });
    // Tombstone again — should return the SAME tombstone event (idempotent).
    const t2 = store.tombstone({ agentId: "agent-a", targetId: e1.offset, reason: "cleanup again" });
    assert.equal(t1.offset, t2.offset, "re-tombstone returns the existing tombstone event");
  });

  it("history by id enforces private scope", () => {
    const e1 = store.appendEvent({ agentId: "agent-a", kind: "memory", scope: "private", payload: { type: "fact", content: "agent-a private" } });
    // agent-b cannot see agent-a's private memory by id.
    const history = store.history({ agentId: "agent-b", id: e1.offset, limit: 10 });
    assert.equal(history.length, 0, "agent-b cannot read agent-a's private memory by id");
    // agent-a can see own.
    const own = store.history({ agentId: "agent-a", id: e1.offset, limit: 10 });
    assert.equal(own.length, 1);
  });

  it("cross-agent tombstone rejected for private memory", () => {
    const e1 = store.appendEvent({ agentId: "agent-a", kind: "memory", scope: "private", payload: { type: "fact", content: "private" } });
    // agent-b tries to tombstone agent-a's private memory — should fail NOT_FOUND (scope-filtered).
    assert.throws(() => store.tombstone({ agentId: "agent-b", targetId: e1.offset, reason: "malicious" }), /NOT_FOUND/);
  });

  // F002 regression: cross-agent supersede on private memory must be rejected.
  it("cross-agent supersede rejected for private memory", () => {
    const e1 = store.appendEvent({ agentId: "agent-a", kind: "memory", scope: "private", payload: { type: "fact", content: "agent-a private fact" } });
    // agent-b tries to supersede agent-a's private memory.
    assert.throws(
      () => store.supersede({ agentId: "agent-b", targetId: e1.offset, content: "overwritten by b", reason: "malicious" }),
      /NOT_FOUND/,
    );
    // agent-a's private memory should still be intact in recall.
    const recall = store.recall({ agentId: "agent-a", query: "private fact", limit: 10 });
    assert.ok(recall.results.some((r) => r.content.includes("agent-a private fact")), "private memory should be intact after blocked supersede");
  });

  it("supersede via store.supersede() is idempotent", () => {
    const e1 = store.appendEvent({ agentId: "agent-a", kind: "memory", scope: "shared", payload: { type: "fact", content: "v1" } });
    const s1 = store.supersede({ agentId: "agent-a", targetId: e1.offset, content: "v2", reason: "update" });
    const s2 = store.supersede({ agentId: "agent-a", targetId: e1.offset, content: "v2-dup", reason: "dup" });
    assert.equal(s1.offset, s2.offset, "re-supersede returns the same event offset");
  });

  // R2-F005 regression: expired bus messages must be filtered on read.
  it("expired bus messages are filtered on read", () => {
    // Write a message with expiresAt in the past.
    store.appendEvent({
      agentId: "agent-a",
      kind: "message",
      scope: "shared",
      topic: "ttl-test",
      payload: { body: "expires soon", expiresAt: 500 },
    });
    // Write a message with no expiry.
    store.appendEvent({
      agentId: "agent-a",
      kind: "message",
      scope: "shared",
      topic: "ttl-test",
      payload: { body: "permanent" },
    });
    // Clock is at 1000; the first message expired at 500.
    const msgs = store.queryMessages({ agentId: "agent-a", topic: "ttl-test", since: 0, limit: 10 });
    assert.ok(!msgs.some((m) => m.body === "expires soon"), "expired message should not appear");
    assert.ok(msgs.some((m) => m.body === "permanent"), "non-expired message should appear");
  });

  it("crash recovery: rebuildProjections replays events", () => {
    store.appendEvent({ agentId: "agent-a", kind: "memory", scope: "shared", payload: { type: "fact", content: "test fact" } });
    store.upsertPresence({ agentId: "agent-a" });
    const beforeCount = store.eventCount();
    store.rebuildProjections();
    assert.equal(store.eventCount(), beforeCount);
    const result = store.recall({ agentId: "agent-a", query: "test fact", limit: 10 });
    assert.ok(result.results.length > 0, "projections rebuilt from events");
  });
});

describe("Redactor", () => {
  const redactor = createRedactor();

  it("redacts Bearer tokens", () => {
    const { text, count } = redactor.redact("Authorization: Bearer ya29.a0ARrdaM-abc123");
    assert.ok(text.includes("[REDACTED]"));
    assert.ok(count >= 1);
  });

  it("redacts OpenAI keys", () => {
    const { text, count } = redactor.redact("sk-proj-abc123def456ghi789jkl012mno345");
    assert.ok(text.includes("[REDACTED]"));
    assert.ok(count >= 1);
  });

  it("redacts GitHub tokens", () => {
    const { text, count } = redactor.redact("Token: ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD");
    assert.ok(text.includes("[REDACTED]"));
    assert.ok(count >= 1);
  });

  it("redacts private key blocks", () => {
    const { text, count } = redactor.redact(
      "-----BEGIN RSA PRIVATE KEY-----\nMIIabc...\n-----END RSA PRIVATE KEY-----",
    );
    assert.ok(text.includes("[REDACTED:private-key]"));
    assert.ok(count >= 1);
  });

  it("preserves clean text", () => {
    const { text, count } = redactor.redact("This is a normal fact about the codebase.");
    assert.equal(text, "This is a normal fact about the codebase.");
    assert.equal(count, 0);
  });

  it("redacts multiple secrets", () => {
    const { count } = redactor.redact("Bearer token1xyz and Bearer token2abc and ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD");
    assert.ok(count >= 3, `expected >=3 redactions, got ${count}`);
  });

  // R2-F007 regression: password assignment must preserve the key name.
  it("redacts password assignment preserving key", () => {
    const { text } = redactor.redact("password=supersecret123");
    assert.ok(text.includes("password="), "key name should be preserved");
    assert.ok(text.includes("[REDACTED]"), "value should be redacted");
    assert.ok(!text.includes("supersecret123"), "secret value must not appear");
    assert.ok(!text.includes("$1"), "literal $1 must not appear");
  });
});

describe("Identity", () => {
  it("resolves agentId from env", () => {
    process.env.SYNAPSE_AGENT_ID = "test-agent";
    const id = new EnvIdentity({ namespace: "x", dbDir: tmpdir() });
    assert.equal(id.agentId(), "test-agent");
    delete process.env.SYNAPSE_AGENT_ID;
  });

  it("returns null when no agentId set", () => {
    delete process.env.SYNAPSE_AGENT_ID;
    const id = new EnvIdentity({ namespace: "x", dbDir: tmpdir() });
    assert.equal(id.agentId(), null);
  });

  it("resolves namespace from constructor", () => {
    const id = new EnvIdentity({ namespace: "custom-ns", dbDir: tmpdir() });
    assert.equal(id.namespace(), "custom-ns");
  });
});
