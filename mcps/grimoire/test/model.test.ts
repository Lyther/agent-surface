import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { LIMITS } from "../src/contract.js";
import { SCHEMA_SQL, deriveCategory, rowToFull, rowToRef, type SkillRow } from "../src/model.js";

test("SCHEMA_SQL loads and the external-content FTS matches over skills", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  const res = db.prepare(
    "INSERT INTO skills(id,pack,name,description,body,category) VALUES(?,?,?,?,?,?)",
  ).run("p:detecting-x", "p", "detecting-x", "find beacons", "body about cobalt strike", "detecting");
  const rowid = Number(res.lastInsertRowid);
  db.prepare("INSERT INTO skills_fts(rowid,name,description,body) VALUES(?,?,?,?)").run(rowid, "detecting-x", "find beacons", "body about cobalt strike");
  const hit = db.prepare(
    "SELECT s.id, -bm25(skills_fts,10.0,5.0,1.0) AS score FROM skills_fts JOIN skills s ON s.rowid=skills_fts.rowid WHERE skills_fts MATCH ?",
  ).get('"cobalt"') as { id: string; score: number } | undefined;
  db.close();
  assert.ok(hit, "FTS should match");
  assert.equal(hit!.id, "p:detecting-x");
  assert.equal(typeof hit!.score, "number");
});

test("deriveCategory maps the leading token; unknown -> other; always derived", () => {
  assert.deepEqual(deriveCategory("detecting-cobalt-strike-beacons"), { category: "detecting", categorySource: "derived" });
  assert.deepEqual(deriveCategory("reverse-engineering-malware"), { category: "reverse", categorySource: "derived" });
  assert.deepEqual(deriveCategory("re-ghidra"), { category: "reverse", categorySource: "derived" });
  assert.deepEqual(deriveCategory("zzz-unmapped-thing"), { category: "other", categorySource: "derived" });
});

test("rowToRef truncates the summary to the limit; rowToFull carries the file manifest", () => {
  const long = "x".repeat(LIMITS.SUMMARY_CHARS + 50);
  const row: SkillRow = {
    id: "p:n", pack: "p", name: "n", description: long, body: "B",
    category: "other", category_source: "derived",
  };
  const ref = rowToRef(row);
  assert.ok(ref.summary.length <= LIMITS.SUMMARY_CHARS);
  assert.ok(ref.summary.endsWith("…"));
  const full = rowToFull(row, [{ path: "references/a.md", size: 3 }]);
  assert.equal(full.body, "B");
  assert.equal(full.categorySource, "derived");
  assert.equal(full.files[0]!.path, "references/a.md");
});
