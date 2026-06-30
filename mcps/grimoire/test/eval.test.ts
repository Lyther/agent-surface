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
import { Store } from "../src/store.js";
import { FIXTURE_QUERIES, setupIndex } from "./helpers.js";

interface EvalQuery { query: string; expect: string[]; negatives?: string[] }

// Resolve the pinned source pack at the repo root (4 levels up from dist/test). The
// real-pack eval is gated on it being checked out so grimoire's unit suite never hard-
// fails on a submodule-less checkout, but CI (which pins the submodule) runs it.
const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_PACK = join(HERE, "..", "..", "..", "..", "external", "anthropic-cybersecurity-skills");
const REAL_QUERIES = join(HERE, "..", "..", "test", "fixtures", "queries", "real-pack.json");

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

// Real 754-pack retrieval gate (roadmap P0/P2). Baseline measured on the pinned commit:
// hit@1 0.60, hit@5 0.80, MRR 0.686 with BM25 v0 (name^10/desc^5/body^1) on 30 reviewed,
// paraphrased queries. Floors sit below baseline with margin so they catch a real
// regression without flaking. If a change pushes below the floor (or higher recall is
// needed), the documented next step is hybrid/embeddings — see architecture.md (not built).
const HIT5_FLOOR = 0.70;
const MRR_FLOOR = 0.55;
test("real-pack eval: hit@5/MRR meet the regression floor", { skip: existsSync(REAL_PACK) ? false : "anthropic-cybersecurity-skills submodule not checked out" }, () => {
  const queries = JSON.parse(readFileSync(REAL_QUERIES, "utf8")) as EvalQuery[];
  assert.ok(queries.length >= 30, "real-pack query set has >= 30 reviewed queries");
  const dir = mkdtempSync(join(tmpdir(), "grimoire-realeval-"));
  const store = new Store({ dir });
  try {
    buildIndex({ packs: [{ serviceId: "anthropic-cybersecurity-skills", path: REAL_PACK, commit: "eval" }], outDir: dir, indexedAt: "2026-01-01T00:00:00.000Z" });
    let hits = 0;
    let rrSum = 0;
    for (const q of queries) {
      const r = store.search(q.query, 5);
      assert.equal(r.status, "ok");
      if (r.status !== "ok") continue;
      const ids = r.hits.map((h) => h.id);
      let best = Infinity;
      for (const e of q.expect) { const k = ids.indexOf(e); if (k >= 0) best = Math.min(best, k); }
      if (best < 5) { hits++; rrSum += 1 / (best + 1); }
    }
    const hitAt5 = hits / queries.length;
    const mrr = rrSum / queries.length;
    assert.ok(hitAt5 >= HIT5_FLOOR, `hit@5 ${hitAt5.toFixed(3)} >= ${HIT5_FLOOR}`);
    assert.ok(mrr >= MRR_FLOOR, `MRR ${mrr.toFixed(3)} >= ${MRR_FLOOR}`);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
