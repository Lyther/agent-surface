import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildIndex, parseFrontmatter } from "../src/indexer.js";
import { Store } from "../src/store.js";
import { setupIndex } from "./helpers.js";

test("parseFrontmatter reads inline + folded multi-line scalars", () => {
  const p = parseFrontmatter("---\nname: foo-bar\ndescription: line one\n  continues here\n  and here\ntags:\n- a\n- b\n---\nBODY TEXT\n");
  assert.ok(p);
  assert.equal(p!.fields["name"], "foo-bar");
  assert.equal(p!.fields["description"], "line one continues here and here");
  assert.equal(p!.body, "BODY TEXT\n");
  assert.equal(parseFrontmatter("# no frontmatter\n"), null);
});

test("buildIndex validates + skips malformed, stores valid skills and files", () => {
  const { res, dir, cleanup } = setupIndex();
  try {
    assert.equal(res.skills, 3, "3 valid skills indexed");
    assert.equal(res.files, 2, "iocs.md + run.py stored; mfa has none");
    assert.ok(res.skipped.some((s) => s.dir === "no-frontmatter-bad" && /frontmatter/.test(s.reason)), "malformed skill skipped, not crashed");

    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.packs[0].serviceId, "fixture");
    assert.match(manifest.packs[0].sourceHash, /^[0-9a-f]{64}$/);
    assert.ok(existsSync(join(dir, "index.sqlite")));
  } finally { cleanup(); }
});

test("supporting-file content is stored RAW (angle brackets / XML survive)", () => {
  const { store, cleanup } = setupIndex();
  try {
    const f = store.fileGet("fixture:detecting-cobalt-strike-beacons", "references/iocs.md");
    assert.equal(f.status, "ok");
    if (f.status === "ok") {
      assert.match(f.file.content, /<ioc type="ip">203\.0\.113\.5<\/ioc>/, "raw XML preserved verbatim");
      assert.match(f.file.content, /id=<beacon-id>/, "angle brackets not stripped");
    }
  } finally { cleanup(); }
});

test("a requested pack with no skills/ dir FAILS the build and never touches an existing index", () => {
  const { dir, store, cleanup } = setupIndex(); // good index already built in dir
  try {
    const before = store.search("cobalt", 1);
    assert.equal(before.status, "ok");
    // Re-index the SAME dir pointing at an absent pack: must throw, not silently empty-build.
    assert.throws(
      () => buildIndex({ packs: [{ serviceId: "ghost", path: join(dir, "no-such-pack"), commit: "c" }], outDir: dir }),
      /no skills\/ directory/,
    );
    // Non-destructive: the prior index + manifest survive and still serve; no temp leaked.
    const after = new Store({ dir });
    try { assert.equal(after.search("cobalt", 1).status, "ok", "existing index untouched after failed rebuild"); }
    finally { after.close(); }
    assert.ok(!readdirSync(dir).some((f) => f.includes(".tmp.")), "half-written temp db cleaned up");
  } finally { cleanup(); }
});

test("sourceHash is stable across identical rebuilds (drift detection)", () => {
  const a = setupIndex();
  const b = setupIndex();
  try {
    assert.equal(a.res.manifest.packs[0]!.sourceHash, b.res.manifest.packs[0]!.sourceHash);
  } finally { a.cleanup(); b.cleanup(); }
});
