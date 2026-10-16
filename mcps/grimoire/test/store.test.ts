import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { LIMITS } from "../src/contract.js";
import { buildIndex } from "../src/indexer.js";
import { SCHEMA_VERSION } from "../src/model.js";
import { Store } from "../src/store.js";
import { FIXTURE_ATTRIBUTION, FIXTURE_PACK, setupIndex } from "./helpers.js";

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

test("search: a word no skill contains does not exclude the match", () => {
  const { store, cleanup } = setupIndex();
  try {
    // "kubernetes" and "yesterday" appear in no fixture skill; the beacon skill is still the
    // best lexical match for the rest of the sentence. Requiring every word returned nothing.
    const wordy = store.search("detect cobalt strike beacon in a kubernetes pcap from yesterday", 5);
    assert.equal(wordy.status, "ok");
    if (wordy.status === "ok") assert.equal(wordy.hits[0]?.id, COBALT);

    // Terms are OR-ed, so two unrelated words each match their own skill: ranking, not
    // eligibility, keeps an irrelevant skill down. Requiring both words returned neither.
    const split = store.search("ghidra mfa", 5);
    assert.equal(split.status, "ok");
    if (split.status !== "ok") return;
    assert.deepEqual(split.hits.map((h) => h.id).sort(), ["fixture:analyzing-malware-with-ghidra", "fixture:implementing-mfa-enforcement"]);

    // The skill containing every term outranks one that shares a single common word with the query.
    const ranked = store.search("ghidra decompiled control flow", 5);
    assert.equal(ranked.status, "ok");
    if (ranked.status !== "ok") return;
    assert.equal(ranked.hits[0]?.id, "fixture:analyzing-malware-with-ghidra");
  } finally { cleanup(); }
});

test("search: filler-only and operator-shaped queries stay safe", () => {
  const { store, cleanup } = setupIndex();
  try {
    // Every word is filler, so none can be dropped and the query runs as written. "the" is in
    // the fixture bodies, so the fallback is observable: dropping the words instead would
    // search nothing and return nothing.
    const filler = store.search("the and of", 5);
    assert.equal(filler.status, "ok");
    if (filler.status !== "ok") return;
    assert.ok(filler.hits.length > 0, "a filler-only query keeps its words rather than searching nothing");

    // A word absent from every skill matches no row: breadth never pads the result.
    const absent = store.search("sourdough marzipan", 5);
    assert.equal(absent.status, "ok");
    if (absent.status !== "ok") return;
    assert.equal(absent.hits.length, 0);

    // FTS5 operators and punctuation are quoted into literal terms, never query syntax.
    for (const q of ["beacon OR NOT mfa", "pcap AND (ghidra", 'beacon "unterminated', "NEAR(beacon pcap)", "*", "^beacon", "-"]) {
      const r = store.search(q, 5);
      assert.equal(r.status, "ok", `"${q}" must not raise an FTS5 syntax error`);
    }

    // A bare operator is filler, so the fallback searches the literal word "or" instead of
    // injecting an operator into the expression.
    const op = store.search("OR", 5);
    assert.equal(op.status, "ok");

    // One term joins the expression per query word, so a maximum-length query of the shortest
    // possible terms builds the longest chain the input limit allows. FTS5 must still parse it.
    const widest = Array.from({ length: 256 }, (_, i) => String.fromCharCode(97 + (i % 26))).join(" ").slice(0, LIMITS.QUERY_MAX);
    assert.equal(widest.length, 511);
    assert.equal(store.search(widest, 5).status, "ok", "the widest query the input limit allows must parse");
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
      assert.equal(g.skill.provenance.attribution, FIXTURE_ATTRIBUTION);
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
    const raw = store.fileGet(COBALT, "references/iocs.md");
    assert.equal(raw.status, "ok");
    if (raw.status === "ok") {
      assert.equal(raw.file.attribution, FIXTURE_ATTRIBUTION);
    }
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

test("INDEX_STALE when the index was built under an earlier schema version", () => {
  const { dir, cleanup } = setupIndex();
  try {
    const mp = join(dir, "manifest.json");
    const m = JSON.parse(readFileSync(mp, "utf8"));
    m.schemaVersion = SCHEMA_VERSION - 1;
    writeFileSync(mp, JSON.stringify(m));
    const db = new DatabaseSync(join(dir, "index.sqlite"));
    db.prepare("UPDATE index_meta SET value=? WHERE key='schema_version'").run(String(SCHEMA_VERSION - 1));
    db.close();
    const store = new Store({ dir });
    const status = store.indexStatus();
    assert.equal(status.status, "INDEX_STALE");
    assert.match("hint" in status ? status.hint : "", /schema changed/);
    store.close();
  } finally { cleanup(); }
});

test("INDEX_STALE when the manifest omits a pack still present in the index", () => {
  const dir = mkdtempSync(join(tmpdir(), "grimoire-pack-subset-"));
  const store = new Store({ dir });
  try {
    buildIndex({
      packs: [
        { serviceId: "alpha", path: FIXTURE_PACK, commit: "alpha-commit", attribution: FIXTURE_ATTRIBUTION },
        { serviceId: "beta", path: FIXTURE_PACK, commit: "beta-commit", attribution: FIXTURE_ATTRIBUTION },
      ],
      outDir: dir,
    });
    const manifestPath = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.packs = manifest.packs.filter((pack: { serviceId: string }) => pack.serviceId === "alpha");
    writeFileSync(manifestPath, JSON.stringify(manifest));

    assert.equal(store.search("cobalt").status, "INDEX_STALE");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a long-lived Store reopens the index after an atomic rebuild", () => {
  const dir = mkdtempSync(join(tmpdir(), "grimoire-reopen-"));
  const pack = join(dir, "pack");
  cpSync(FIXTURE_PACK, pack, { recursive: true });
  const store = new Store({ dir });
  try {
    buildIndex({
      packs: [{ serviceId: "fixture", path: pack, attribution: FIXTURE_ATTRIBUTION }],
      outDir: dir,
    });
    const before = store.get(COBALT);
    assert.equal(before.status, "ok");
    if (before.status !== "ok") return;
    const skillPath = join(pack, "skills", "detecting-cobalt-strike-beacons", "SKILL.md");
    writeFileSync(skillPath, `${readFileSync(skillPath, "utf8")}\nSecond build marker.\n`);

    buildIndex({
      packs: [{ serviceId: "fixture", path: pack, attribution: FIXTURE_ATTRIBUTION }],
      outDir: dir,
    });
    const after = store.get(COBALT);
    assert.equal(after.status, "ok");
    if (after.status === "ok") {
      assert.doesNotMatch(before.skill.body, /Second build marker/);
      assert.match(after.skill.body, /Second build marker/);
    }
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
