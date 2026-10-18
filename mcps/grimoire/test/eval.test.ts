// Retrieval eval over committed fixture queries. This is the harness; on the REAL pack
// it becomes the hit@5/MRR gate (roadmap P0/P2). On fixtures it asserts the path works
// and ranking separates well-formed queries (hit@5 == 1, MRR high, negatives never #1).
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildIndex } from "../src/indexer.js";
import { servedPacksFromRegistry } from "../src/served-packs.js";
import { Store } from "../src/store.js";
import { FIXTURE_QUERIES, setupIndex } from "./helpers.js";

interface EvalQuery { query: string; expect: string[]; negatives?: string[] }

// Resolve the pinned source pack at the repo root (4 levels up from dist/test). The
// real-pack eval is gated on it being checked out so grimoire's unit suite never hard-
// fails on a submodule-less checkout, but CI (which pins the submodule) runs it.
const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_PACK = join(HERE, "..", "..", "..", "..", "external", "anthropic-cybersecurity-skills");
const REAL_QUERIES = join(HERE, "..", "..", "test", "fixtures", "queries", "real-pack.json");
const REWORDED_QUERIES = join(HERE, "..", "..", "test", "fixtures", "queries", "reworded.json");
const HELD_OUT_QUERIES = join(HERE, "..", "..", "test", "fixtures", "queries", "held-out.json");
const REPO_ROOT = join(HERE, "..", "..", "..", "..");

function realPackStore(): { store: Store; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "grimoire-realeval-"));
  const store = new Store({ dir });
  buildIndex({ packs: [{ serviceId: "anthropic-cybersecurity-skills", path: REAL_PACK, attribution: "Anthropic Cybersecurity Skills test index." }], outDir: dir, indexedAt: "2026-01-01T00:00:00.000Z" });
  return { store, cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}

function rank(store: Store, query: string, expect: string[]): number {
  const r = store.search(query, 5);
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return Infinity;
  const ids = r.hits.map((h) => h.id);
  let best = Infinity;
  for (const e of expect) { const k = ids.indexOf(e); if (k >= 0) best = Math.min(best, k); }
  return best;
}

test("fixture eval: hit@5 == 1.0, MRR >= 0.8, no negative ranked first", () => {
  const queries = JSON.parse(readFileSync(FIXTURE_QUERIES, "utf8")) as EvalQuery[];
  assert.ok(queries.length >= 5, "have a query set");
  const { store, cleanup } = setupIndex();
  try {
    let hits = 0;
    let rrSum = 0;
    for (const q of queries) {
      const r = store.search(q.query, 5);
      assert.equal(r.status, "ok");
      if (r.status !== "ok") continue;
      const ids = r.hits.map((h) => h.id);
      const want = q.expect[0]!;
      const rank = ids.indexOf(want);
      if (rank >= 0) { hits++; rrSum += 1 / (rank + 1); }
      assert.ok(rank >= 0, `expected ${want} in top-5 for "${q.query}" (got ${ids.join(", ")})`);
      if (ids[0]) assert.ok(!q.negatives?.includes(ids[0]), `a negative ranked #1 for "${q.query}"`);
    }
    const hitAt5 = hits / queries.length;
    const mrr = rrSum / queries.length;
    assert.equal(hitAt5, 1.0, `hit@5 (${hitAt5})`);
    assert.ok(mrr >= 0.8, `MRR ${mrr.toFixed(3)} >= 0.8`);
  } finally { cleanup(); }
});

// Real-pack retrieval gate (roadmap P0/P2). Measured on the pinned commit with the current
// any-word BM25 query (name^10/desc^5/body^1) over the 30 reviewed, paraphrased queries:
// hit@1 23/30, hit@5 0.967, MRR 0.836. The earlier all-words-required query scored
// hit@1 19/30, hit@5 0.800, MRR 0.711, so these floors sit below today's baseline with
// margin and above the conjunctive behavior they replaced — reverting it fails them.
const HIT5_FLOOR = 0.85;
const MRR_FLOOR = 0.75;
test("real-pack eval: hit@5/MRR meet the regression floor", { skip: existsSync(REAL_PACK) ? false : "anthropic-cybersecurity-skills submodule not checked out" }, () => {
  const queries = JSON.parse(readFileSync(REAL_QUERIES, "utf8")) as EvalQuery[];
  assert.ok(queries.length >= 30, "real-pack query set has >= 30 reviewed queries");
  const { store, cleanup } = realPackStore();
  try {
    let hits = 0;
    let rrSum = 0;
    for (const q of queries) {
      const best = rank(store, q.query, q.expect);
      if (best < 5) { hits++; rrSum += 1 / (best + 1); }
    }
    const hitAt5 = hits / queries.length;
    const mrr = rrSum / queries.length;
    assert.ok(hitAt5 >= HIT5_FLOOR, `hit@5 ${hitAt5.toFixed(3)} >= ${HIT5_FLOOR}`);
    assert.ok(mrr >= MRR_FLOOR, `MRR ${mrr.toFixed(3)} >= ${MRR_FLOOR}`);
  } finally { cleanup(); }
});

// A caller describes a task in a sentence, so the query carries words no skill's text has
// ("please", "one of my services"). Requiring every word dropped the intended skill from
// these outright; each is now a hit, and five of the seven rank first.
test("real-pack eval: a sentence-shaped query still finds its skill", { skip: existsSync(REAL_PACK) ? false : "anthropic-cybersecurity-skills submodule not checked out" }, () => {
  const queries = JSON.parse(readFileSync(REWORDED_QUERIES, "utf8")) as EvalQuery[];
  assert.ok(queries.length >= 7, "reworded query set has >= 7 cases");
  const { store, cleanup } = realPackStore();
  try {
    let first = 0;
    for (const q of queries) {
      const best = rank(store, q.query, q.expect);
      assert.ok(best < 5, `expected ${q.expect[0]} in top-5 for "${q.query}" (rank ${best === Infinity ? "absent" : best + 1})`);
      if (best === 0) first++;
    }
    // 5 of 7 rank first today; the floor leaves one case of margin for a pack-pin update.
    assert.ok(first >= 4, `${first}/${queries.length} ranked first, want >= 4`);
  } finally { cleanup(); }
});

const REV_PACK = join(HERE, "..", "..", "..", "..", "external", "rev-skills");
const REV_SKILLS = join(REV_PACK, ".claude", "skills");
test("rev-skills pack: 121 skills, ghidra search, get", { skip: existsSync(REV_SKILLS) ? false : "rev-skills submodule not checked out" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "grimoire-revskills-"));
  const store = new Store({ dir });
  try {
    const built = buildIndex({
      packs: [{ serviceId: "rev-skills", path: REV_PACK, skillsRel: ".claude/skills", attribution: "rev-skills test index." }],
      outDir: dir,
      indexedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(built.skills, 121, `expected 121 rev-skills, got ${built.skills} skipped=${built.skipped.map((s) => s.dir).join(",")}`);
    const search = store.search("ghidra", 5);
    assert.equal(search.status, "ok");
    if (search.status === "ok") {
      assert.equal(search.hits[0]?.id, "rev-skills:re-ghidra");
    }
    const got = store.get("rev-skills:re-analyze");
    assert.equal(got.status, "ok");
    if (got.status === "ok") {
      assert.equal(got.skill.pack, "rev-skills");
      assert.equal(got.skill.category, "reverse");
      assert.match(got.skill.body, /./);
    }
    const cracking = store.get("rev-skills:re-cracking");
    assert.equal(cracking.status, "ok");
    if (cracking.status === "ok") {
      assert.match(cracking.skill.body, /授权边界|authorized|CTF/i);
    }
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

const HACK_PACK = join(HERE, "..", "..", "..", "..", "external", "hack-skills");
const HACK_SKILLS = join(HACK_PACK, "skills");
test("hack-skills pack: 103 skills and direct retrieval", { skip: existsSync(HACK_SKILLS) ? false : "hack-skills submodule not checked out" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "grimoire-hackskills-"));
  const store = new Store({ dir });
  try {
    const built = buildIndex({
      packs: [{ serviceId: "hack-skills", path: HACK_PACK, attribution: "hack-skills test index." }],
      outDir: dir,
      indexedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(built.skills, 103);
    const got = store.get("hack-skills:api-auth-and-jwt-abuse");
    assert.equal(got.status, "ok");
    if (got.status === "ok") {
      assert.equal(got.skill.pack, "hack-skills");
      assert.match(got.skill.body, /JWT/i);
    }
    const added = store.get("hack-skills:attack-surface-mapping");
    assert.equal(added.status, "ok", "the newly pinned attack-surface-mapping skill is retrievable");
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

// Held-out gate across every served pack. The 52 requests were written by a separate agent that
// never saw the index, so their wording owes nothing to skill names; two independent raters graded
// every pooled candidate (exact agreement 91.6%, useful-vs-not kappa 0.86) and the lower grade was
// kept. "useful" holds the ids graded 1 (partial) or 2 (direct); a request with none is uncovered.
// Measured with the shipped query: a useful skill in the top 5 for 40/42 covered requests and a
// direct one for 30/33. The conjunctive query it replaced managed 11/42 and 10/33, returning
// nothing at all for 29 covered requests. Tuning against this set ends its held-out status, so a
// change that does should say so and freeze a fresh set.
interface HeldOutCase { id: string; query: string; class: "direct" | "partial" | "uncovered"; useful: Record<string, number> }
const USEFUL5_FLOOR = 0.85;
const DIRECT5_FLOOR = 0.80;
const servedPacks = servedPacksFromRegistry(REPO_ROOT).filter((p) => existsSync(join(p.absPath, p.skillsRel)));
const allPacks = servedPacks.length === servedPacksFromRegistry(REPO_ROOT).length;
test("held-out eval: useful skills reach the top 5 across all served packs", { skip: allPacks ? false : "a served pack submodule is not checked out" }, () => {
  const cases = JSON.parse(readFileSync(HELD_OUT_QUERIES, "utf8")) as HeldOutCase[];
  assert.ok(cases.length >= 50, "held-out set has >= 50 cases");
  const dir = mkdtempSync(join(tmpdir(), "grimoire-heldout-"));
  const store = new Store({ dir });
  try {
    buildIndex({ packs: servedPacks.map((p) => ({ serviceId: p.serviceId, path: p.absPath, skillsRel: p.skillsRel, attribution: p.attribution })), outDir: dir, indexedAt: "2026-01-01T00:00:00.000Z" });
    let covered = 0, useful5 = 0, direct = 0, direct5 = 0;
    for (const c of cases) {
      if (c.class === "uncovered") continue;
      const r = store.search(c.query, 5);
      assert.equal(r.status, "ok", `search failed for ${c.id}`);
      if (r.status !== "ok") continue;
      const grades = r.hits.map((h) => c.useful[h.id] ?? 0);
      covered++;
      if (grades.some((g) => g >= 1)) useful5++;
      if (c.class === "direct") { direct++; if (grades.some((g) => g === 2)) direct5++; }
    }
    assert.ok(useful5 / covered >= USEFUL5_FLOOR, `useful@5 ${useful5}/${covered} >= ${USEFUL5_FLOOR}`);
    assert.ok(direct5 / direct >= DIRECT5_FLOOR, `direct@5 ${direct5}/${direct} >= ${DIRECT5_FLOOR}`);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
