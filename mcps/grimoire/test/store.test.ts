import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Store } from "../src/store.js";
import { setupIndex } from "./helpers.js";

const COBALT = "fixture:detecting-cobalt-strike-beacons";

test("search ranks the relevant skill first and respects k", () => {
  const { store, cleanup } = setupIndex();
  try {
    const r = store.search("cobalt strike beacon pcap", 5);
    assert.equal(r.status, "ok");
    if (r.status === "ok") {
      assert.ok(r.hits.length >= 1);
      assert.equal(r.hits[0]!.id, COBALT);
      assert.equal(typeof r.hits[0]!.score, "number");
    }
    const one = store.search("malware ghidra reverse", 1);
    if (one.status === "ok") assert.ok(one.hits.length <= 1);
  } finally { cleanup(); }
});

test("list: all / by derived category / unknown category / cursor paging", () => {
  const { store, cleanup } = setupIndex();
  try {
    const all = store.list();
    assert.equal(all.status, "ok");
    if (all.status !== "ok") return;
    assert.equal(all.items.length, 3);
    assert.equal(all.nextCursor, undefined, "3 skills < page size → no cursor");

    const det = store.list("detecting");
    if (det.status === "ok") { assert.equal(det.items.length, 1); assert.equal(det.items[0]!.id, COBALT); }
    const impl = store.list("implementing");
    if (impl.status === "ok") assert.equal(impl.items[0]!.id, "fixture:implementing-mfa-enforcement");
    const none = store.list("nonexistent");
    if (none.status === "ok") assert.equal(none.items.length, 0);

    // cursor boundary: id > firstId returns the remaining skills, never the first.
    const firstId = all.items[0]!.id;
    const cursor = Buffer.from(firstId, "utf8").toString("base64url");
    const rest = store.list(undefined, cursor);
    if (rest.status === "ok") {
      assert.equal(rest.items.length, 2);
      assert.ok(!rest.items.some((i) => i.id === firstId));
    }
    assert.equal(store.list(undefined, "").status, "INVALID_INPUT", "empty cursor is invalid");
  } finally { cleanup(); }
});

test("get returns body + provenance + file manifest; unknown/invalid ids handled", () => {
  const { store, cleanup } = setupIndex();
  try {
    const g = store.get(COBALT);
    assert.equal(g.status, "ok");
    if (g.status === "ok") {
      assert.match(g.skill.body, /Cobalt Strike/);
      assert.equal(g.skill.provenance.sourceCommit.length > 0, true);
      assert.deepEqual(g.skill.files.map((f) => f.path), ["references/iocs.md"]);
      assert.equal(g.skill.categorySource, "derived");
    }
    assert.equal(store.get("fixture:does-not-exist").status, "NOT_FOUND");
    assert.equal(store.get("not-an-id").status, "INVALID_INPUT");
  } finally { cleanup(); }
});

test("fileGet: raw content; not-in-manifest → NOT_FOUND; traversal/absolute → INVALID_INPUT", () => {
  const { store, cleanup } = setupIndex();
  try {
    assert.equal(store.fileGet(COBALT, "references/iocs.md").status, "ok");
    assert.equal(store.fileGet(COBALT, "references/missing.md").status, "NOT_FOUND");
    assert.equal(store.fileGet("fixture:does-not-exist", "references/iocs.md").status, "NOT_FOUND");
    assert.equal(store.fileGet(COBALT, "../../../etc/passwd").status, "INVALID_INPUT");
    assert.equal(store.fileGet(COBALT, "/etc/passwd").status, "INVALID_INPUT");
  } finally { cleanup(); }
});

test("INDEX_MISSING when nothing is built", () => {
  const dir = mkdtempSync(join(tmpdir(), "grimoire-empty-"));
  const store = new Store({ dir });
  try {
    assert.equal(store.search("x").status, "INDEX_MISSING");
    assert.equal(store.list().status, "INDEX_MISSING");
    assert.equal(store.get("fixture:x").status, "INDEX_MISSING");
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("INDEX_STALE when the installed manifest no longer matches the index", () => {
  const { dir, cleanup } = setupIndex();
  try {
    const mp = join(dir, "manifest.json");
    const m = JSON.parse(readFileSync(mp, "utf8"));
    m.packs[0].commit = "0000000000000000000000000000000000000000"; // pretend the source moved
    writeFileSync(mp, JSON.stringify(m));
    const store = new Store({ dir });
    assert.equal(store.search("cobalt").status, "INDEX_STALE");
    store.close();
  } finally { cleanup(); }
});
