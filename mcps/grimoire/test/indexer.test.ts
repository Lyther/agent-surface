import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { buildIndex, parseFrontmatter, resolveSkillsRel, type PackSpec } from "../src/indexer.js";
import { Store } from "../src/store.js";
import { FIXTURE_COMMIT, FIXTURE_PACK, setupIndex } from "./helpers.js";

const ATTRIBUTION = "Fixture skill pack for Grimoire tests.";

test("resolveSkillsRel rejects absolute and traversal paths", () => {
  assert.equal(resolveSkillsRel(undefined), "skills");
  assert.equal(resolveSkillsRel(".claude/skills"), ".claude/skills");
  assert.throws(() => resolveSkillsRel(".."), /invalid skillsRel/);
  assert.throws(() => resolveSkillsRel("/tmp/skills"), /invalid skillsRel/);
  assert.throws(() => resolveSkillsRel("foo/../bar"), /invalid skillsRel/);
  assert.throws(() => resolveSkillsRel("..\\outside"), /invalid skillsRel/);
  assert.throws(() => resolveSkillsRel("C:\\outside"), /invalid skillsRel/);
});
test("parseFrontmatter reads inline + folded multi-line scalars", () => {
  const p = parseFrontmatter("---\nname: foo-bar\ndescription: line one\n  continues here\n  and here\ntags:\n- a\n- b\n---\nBODY TEXT\n");
  assert.ok(p);
  assert.equal(p!.fields["name"], "foo-bar");
  assert.equal(p!.fields["description"], "line one continues here and here");
  assert.equal(p!.body, "BODY TEXT\n");
  assert.equal(parseFrontmatter("# no frontmatter\n"), null);
});
test("parseFrontmatter exposes the string entries of the metadata map", () => {
  const p = parseFrontmatter("---\nname: foo-bar\nmetadata:\n  author: Jane Roe\n  version: 2\n---\nBODY\n");
  assert.deepEqual(p?.metadata, { author: "Jane Roe" });
  assert.equal(p?.fields["metadata"], undefined, "the map itself is not a scalar field");
});

test("a Git-less nested pack cannot inherit a declared clean commit", () => {
  const parentHead = execFileSync("git", ["-C", FIXTURE_PACK, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.match(parentHead, /^[0-9a-f]{40}$/);
  assert.notEqual(parentHead, FIXTURE_COMMIT);
  const { res, cleanup } = setupIndex();
  try {
    assert.equal(res.manifest.packs[0]!.commit, "uncommitted");
  } finally {
    cleanup();
  }
});

test("buildIndex requires explicit nonblank attribution", () => {
  const dir = join(tmpdir(), `grimoire-attribution-${process.pid}-${Date.now()}`);
  // Boundary-negative case: bypass the static type so runtime validation is exercised.
  const missingAttribution = { serviceId: "fixture", path: FIXTURE_PACK } as unknown as PackSpec;
  try {
    assert.throws(
      () => buildIndex({ packs: [missingAttribution], outDir: dir }),
      /attribution is required/,
    );
    assert.throws(
      () => buildIndex({ packs: [{ serviceId: "fixture", path: FIXTURE_PACK, attribution: "  " }], outDir: dir }),
      /attribution is required/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("non-UTF-8 SKILL.md fails instead of being silently corrupted", () => {
  const dir = join(tmpdir(), `grimoire-binary-skill-${process.pid}-${Date.now()}`);
  const pack = join(dir, "pack");
  const skillDir = join(pack, "skills", "binary-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), Buffer.from([0xff, 0xfe, 0xfd]));
  try {
    assert.throws(
      () => buildIndex({
        packs: [{ serviceId: "fixture", path: pack, attribution: ATTRIBUTION }],
        outDir: join(dir, "out"),
      }),
      /SKILL\.md is not UTF-8 text/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("symbolic SKILL.md is rejected instead of indexing its target", () => {
  const dir = join(tmpdir(), `grimoire-symbolic-skill-${process.pid}-${Date.now()}`);
  const pack = join(dir, "pack");
  const skillDir = join(pack, "skills", "linked-skill");
  const outside = join(dir, "outside.md");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(outside, "---\nname: linked-skill\ndescription: Outside the pack.\n---\nDo not index this.\n");
  symlinkSync(outside, join(skillDir, "SKILL.md"));
  try {
    assert.throws(
      () => buildIndex({
        packs: [{ serviceId: "fixture", path: pack, attribution: ATTRIBUTION }],
        outDir: join(dir, "out"),
      }),
      /symbolic SKILL\.md/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildIndex validates + skips malformed, stores valid skills and files", () => {
  const { res, dir, cleanup } = setupIndex();
  try {
    assert.equal(res.skills, 3, "3 valid skills indexed");
    assert.equal(res.files, 2, "iocs.md + run.py stored; mfa has none");
    assert.ok(res.skipped.some((s) => s.dir === "no-frontmatter-bad" && /frontmatter/.test(s.reason)), "malformed skill skipped, not crashed");

    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    assert.equal(manifest.schemaVersion, 3);
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
      () => buildIndex({ packs: [{ serviceId: "ghost", path: join(dir, "no-such-pack"), commit: "c", attribution: ATTRIBUTION }], outDir: dir }),
      /no skills directory/,
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

test("sourceHash changes when indexed frontmatter changes", () => {
  const dir = join(tmpdir(), `grimoire-frontmatter-hash-${process.pid}-${Date.now()}`);
  const pack = join(dir, "pack");
  const skillDir = join(pack, "skills", "same-body");
  mkdirSync(skillDir, { recursive: true });
  const skill = join(skillDir, "SKILL.md");
  try {
    writeFileSync(skill, "---\nname: same-body\ndescription: First description.\n---\nSame body.\n");
    const first = buildIndex({ packs: [{ serviceId: "fixture", path: pack, attribution: ATTRIBUTION }], outDir: join(dir, "one") });
    writeFileSync(skill, "---\nname: same-body\ndescription: Second description.\n---\nSame body.\n");
    const second = buildIndex({ packs: [{ serviceId: "fixture", path: pack, attribution: ATTRIBUTION }], outDir: join(dir, "two") });
    assert.notEqual(first.manifest.packs[0]!.sourceHash, second.manifest.packs[0]!.sourceHash);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildIndex rejects invalid and duplicate pack ids", () => {
  const dir = join(tmpdir(), `grimoire-pack-id-${process.pid}-${Date.now()}`);
  try {
    assert.throws(
      () => buildIndex({ packs: [{ serviceId: "bad:id", path: FIXTURE_PACK, attribution: ATTRIBUTION }], outDir: join(dir, "bad") }),
      /invalid pack id/,
    );
    assert.throws(
      () => buildIndex({
        packs: [
          { serviceId: "fixture", path: FIXTURE_PACK, attribution: ATTRIBUTION },
          { serviceId: "fixture", path: FIXTURE_PACK, attribution: ATTRIBUTION },
        ],
        outDir: join(dir, "duplicate"),
      }),
      /duplicate pack id/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("per-pack file_count is not cumulative across packs", () => {
  const dir = join(tmpdir(), `grimoire-pack-count-${process.pid}-${Date.now()}`);
  try {
    buildIndex({
      packs: [
        { serviceId: "alpha", path: FIXTURE_PACK, commit: "alpha-commit", attribution: ATTRIBUTION },
        { serviceId: "beta", path: FIXTURE_PACK, commit: "beta-commit", attribution: ATTRIBUTION },
      ],
      outDir: dir,
    });
    const db = new DatabaseSync(join(dir, "index.sqlite"), { readOnly: true });
    try {
      const counts = db.prepare("SELECT key,value FROM index_meta WHERE key LIKE 'pack:%:file_count' ORDER BY key")
        .all().map((row) => ({ ...(row as { key: string; value: string }) }));
      assert.deepEqual(counts, [
        { key: "pack:alpha:file_count", value: "2" },
        { key: "pack:beta:file_count", value: "2" },
      ]);
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a dirty Git pack is not attributed to its clean HEAD commit", () => {
  const dir = join(tmpdir(), `grimoire-dirty-${process.pid}-${Date.now()}`);
  const pack = join(dir, "pack");
  const out = join(dir, "out");
  const skillDir = join(pack, "skills", "useful-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: useful-skill\ndescription: Useful test skill.\n---\nUse the clean procedure.\n");
  execFileSync("git", ["init", "-q", pack]);
  execFileSync("git", ["-C", pack, "add", "."]);
  execFileSync("git", ["-C", pack, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial"]);
  const cleanHead = execFileSync("git", ["-C", pack, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: useful-skill\ndescription: Useful changed skill.\n---\nUse the changed procedure.\n");

  try {
    const result = buildIndex({ packs: [{ serviceId: "fixture", path: pack, attribution: ATTRIBUTION }], outDir: out });
    assert.notEqual(result.manifest.packs[0]!.commit, cleanHead);
    assert.equal(result.manifest.packs[0]!.commit, `${cleanHead}-dirty`);
    const store = new Store({ dir: out });
    try {
      assert.deepEqual(store.indexStatus(), { status: "ok" });
      const indexed = store.get("fixture:useful-skill");
      assert.equal(indexed.status, "ok");
      if (indexed.status === "ok") {
        assert.equal(indexed.skill.provenance.sourceCommit, `${cleanHead}-dirty`);
      }
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ignored files included in the index mark Git provenance dirty", () => {
  const dir = join(tmpdir(), `grimoire-ignored-${process.pid}-${Date.now()}`);
  const pack = join(dir, "pack");
  const out = join(dir, "out");
  const skillDir = join(pack, "skills", "useful-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(pack, ".gitignore"), "skills/*/references/ignored.md\n");
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: useful-skill\ndescription: Useful test skill.\n---\nUse references/ignored.md.\n");
  execFileSync("git", ["init", "-q", pack]);
  execFileSync("git", ["-C", pack, "add", "."]);
  execFileSync("git", ["-C", pack, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial"]);
  const cleanHead = execFileSync("git", ["-C", pack, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  mkdirSync(join(skillDir, "references"));
  writeFileSync(join(skillDir, "references", "ignored.md"), "Local ignored procedure.\n");

  try {
    const result = buildIndex({ packs: [{ serviceId: "fixture", path: pack, attribution: ATTRIBUTION }], outDir: out });
    assert.equal(result.files, 1, "ignored supporting file was part of the indexed bytes");
    assert.equal(result.manifest.packs[0]!.commit, `${cleanHead}-dirty`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// SUBSTITUTE_JUSTIFICATION
// - substitute: onSourceRead callback controlling the exact source-change interleaving in the two tests below
// - replaces: nondeterministic child-process scheduling around post-read restoration and a concurrent Git commit
// - necessity: the exact read-then-change order cannot be made deterministic with wall-clock delays
// - real-option: a real child process with a fixed delay was used and failed nondeterministically under load
// - proof-limit: proves snapshot and HEAD re-verification for these interleavings, not atomic exclusion of source writes
// - real-proof: the adjacent real-Git dirty and ignored-file cases exercise normal buildIndex provenance behavior
test("source restored after an indexed read is still marked dirty", () => {
  const dir = join(tmpdir(), `grimoire-race-${process.pid}-${Date.now()}`);
  const pack = join(dir, "pack");
  const out = join(dir, "out");
  const skillDir = join(pack, "skills", "useful-skill");
  const skillPath = join(skillDir, "SKILL.md");
  const clean = "---\nname: useful-skill\ndescription: Clean skill.\n---\nUse the clean procedure.\n";
  const mutated = "---\nname: useful-skill\ndescription: Mutated skill.\n---\nUse the transient procedure.\n";
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(skillPath, clean);
  execFileSync("git", ["init", "-q", pack]);
  execFileSync("git", ["-C", pack, "add", "."]);
  execFileSync("git", ["-C", pack, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial"]);
  const initialHead = execFileSync("git", ["-C", pack, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  writeFileSync(skillPath, mutated);

  try {
    let restored = false;
    const result = buildIndex({
      packs: [{ serviceId: "fixture", path: pack, commit: initialHead, attribution: ATTRIBUTION }],
      outDir: out,
      onSourceRead: (file: string) => {
        if (file === skillPath) {
          writeFileSync(skillPath, clean);
          restored = true;
        }
      },
    });
    assert.equal(restored, true, "the source was restored immediately after its indexed read");
    assert.equal(readFileSync(skillPath, "utf8"), clean, "source was restored before the build completed");
    assert.equal(result.manifest.packs[0]!.commit, `${initialHead}-dirty`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a clean HEAD change while indexing is not attributed to the initial commit", () => {
  const dir = join(tmpdir(), `grimoire-head-race-${process.pid}-${Date.now()}`);
  const pack = join(dir, "pack");
  const out = join(dir, "out");
  const skillDir = join(pack, "skills", "useful-skill");
  const skillPath = join(skillDir, "SKILL.md");
  const referencePath = join(skillDir, "reference.md");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(skillPath, "---\nname: useful-skill\ndescription: Useful test skill.\n---\nUse reference.md.\n");
  writeFileSync(referencePath, "Initial procedure.\n");
  execFileSync("git", ["init", "-q", pack]);
  execFileSync("git", ["-C", pack, "add", "."]);
  execFileSync("git", ["-C", pack, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial"]);
  const initialHead = execFileSync("git", ["-C", pack, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  try {
    let committed = false;
    const result = buildIndex({
      packs: [{ serviceId: "fixture", path: pack, attribution: ATTRIBUTION }],
      outDir: out,
      onSourceRead: (file: string) => {
        if (file !== skillPath || committed) return;
        writeFileSync(referencePath, "Committed while indexing.\n");
        execFileSync("git", ["-C", pack, "add", "skills"]);
        execFileSync("git", ["-C", pack, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "change reference"]);
        committed = true;
      },
    });
    const finalHead = execFileSync("git", ["-C", pack, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    assert.equal(committed, true);
    assert.notEqual(finalHead, initialHead);
    assert.equal(execFileSync("git", ["-C", pack, "status", "--porcelain"], { encoding: "utf8" }), "");
    assert.equal(result.manifest.packs[0]!.commit, `${initialHead}-dirty`);

    const store = new Store({ dir: out });
    try {
      const indexed = store.get("fixture:useful-skill");
      assert.equal(indexed.status, "ok");
      if (indexed.status === "ok") {
        assert.equal(indexed.skill.provenance.sourceCommit, `${initialHead}-dirty`);
      }
      const reference = store.fileGet("fixture:useful-skill", "reference.md");
      assert.equal(reference.status, "ok");
      if (reference.status === "ok") assert.equal(reference.file.content, "Committed while indexing.\n");
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("declared --commit that does not match a clean git HEAD is refused", () => {
  const dir = join(tmpdir(), `grimoire-commit-mismatch-${process.pid}-${Date.now()}`);
  const pack = join(dir, "pack");
  const out = join(dir, "out");
  const skillDir = join(pack, "skills", "useful-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: useful-skill\ndescription: Useful test skill.\n---\nUse the clean procedure.\n");
  execFileSync("git", ["init", "-q", pack]);
  execFileSync("git", ["-C", pack, "add", "."]);
  execFileSync("git", ["-C", pack, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial"]);
  const head = execFileSync("git", ["-C", pack, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  try {
    assert.throws(
      () => buildIndex({ packs: [{ serviceId: "fixture", path: pack, commit: "a".repeat(40), attribution: ATTRIBUTION }], outDir: out }),
      /git HEAD .* != declared commit/,
    );
    assert.throws(
      () => buildIndex({ packs: [{ serviceId: "fixture", path: pack, commit: `${head}-dirty`, attribution: ATTRIBUTION }], outDir: out }),
      /declared commit must be a clean 40-hex Git revision/,
    );
    const ok = buildIndex({ packs: [{ serviceId: "fixture", path: pack, commit: head, attribution: ATTRIBUTION }], outDir: out });
    assert.equal(ok.manifest.packs[0]!.commit, head);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// SUBSTITUTE_JUSTIFICATION
// - substitute: hand-built temp catalogs in the nested-discovery and frontmatter-notice tests below
// - replaces: real nested third-party catalogs such as the pinned tech-leads-club pack
// - necessity: the pinned catalogs hold no symlinks, duplicate names, depth-3 skills, empty roots or a controlled license/author mix
// - real-option: npm run install:grimoire indexes the real pinned catalogs, nested tech-leads-club included
// - proof-limit: proves discovery and notice rules on controlled trees, not real-catalog content or licensing
// - real-proof: a real-corpus index served over stdio, then grimoire_get on a tech-leads-club skill that declares its license and author
test("buildIndex discovers nested-catalog skills at any depth and stops at each skill root", () => {
  const dir = join(tmpdir(), `grimoire-nested-${process.pid}-${Date.now()}`);
  const pack = join(dir, "pack");
  const out = join(dir, "out");
  const mkSkill = (relDir: string, name: string): string => {
    const abs = join(pack, "skills", relDir);
    mkdirSync(abs, { recursive: true });
    writeFileSync(join(abs, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} skill.\n---\nBody of ${name}.\n`);
    return abs;
  };
  // Flat (depth 1), a parenthesized category (depth 2, the tech-leads-club layout) and depth 3, all
  // in one pack. Category/intermediate dirs carry no SKILL.md and must be traversed, not skipped.
  mkSkill("flat-skill", "flat-skill");
  const archSkill = mkSkill("(architecture)/designing-systems", "designing-systems");
  mkSkill("migration/migrating-db", "migrating-db");
  mkSkill("deep/inner/deeply-nested", "deeply-nested");
  // A companion file, and a VALID SKILL.md BELOW a discovered root: the latter must stay a companion
  // (would be indexed as its own skill if the walker failed to stop at the root).
  mkdirSync(join(archSkill, "refs"), { recursive: true });
  writeFileSync(join(archSkill, "refs", "notes.md"), "Companion notes.\n");
  mkdirSync(join(archSkill, "nested-extra"), { recursive: true });
  writeFileSync(join(archSkill, "nested-extra", "SKILL.md"), "---\nname: nested-extra\ndescription: Must not be indexed.\n---\nBelow a root.\n");
  // Intermediate dirs with no SKILL.md beneath, plus a loose file: traversed/ignored, never skipped.
  mkdirSync(join(pack, "skills", "empty-cat", "placeholder"), { recursive: true });
  writeFileSync(join(pack, "skills", "loose.txt"), "ignored loose file\n");
  try {
    const res = buildIndex({ packs: [{ serviceId: "catalog", path: pack, commit: "c", attribution: ATTRIBUTION }], outDir: out });
    assert.equal(res.skills, 4, "flat + depth-2 + depth-3 discovered; the SKILL.md below a root is not a skill");
    assert.deepEqual(res.skipped, [], "intermediate dirs traversed; nothing below a skill root re-discovered");
    const store = new Store({ dir: out });
    try {
      assert.equal(store.get("catalog:nested-extra").status, "NOT_FOUND", "a SKILL.md below a skill root is never a second skill");
      assert.equal(store.get("catalog:flat-skill").status, "ok");
      const deep = store.get("catalog:deeply-nested");
      assert.equal(deep.status, "ok");
      if (deep.status === "ok") assert.match(deep.skill.provenance.sourcePath, /skills\/deep\/inner\/deeply-nested\/SKILL\.md$/);
      const arch = store.get("catalog:designing-systems");
      assert.equal(arch.status, "ok");
      if (arch.status === "ok") {
        assert.match(arch.skill.provenance.sourcePath, /skills\/\(architecture\)\/designing-systems\/SKILL\.md$/);
        assert.ok(arch.skill.files.some((f) => f.path === "refs/notes.md"), "companion file kept");
        assert.ok(arch.skill.files.some((f) => f.path === "nested-extra/SKILL.md"), "nested SKILL.md kept as a companion");
      }
    } finally { store.close(); }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a symbolic SKILL.md nested under a category folder is still rejected", () => {
  const dir = join(tmpdir(), `grimoire-nested-symlink-${process.pid}-${Date.now()}`);
  const pack = join(dir, "pack");
  const skillDir = join(pack, "skills", "(category)", "linked-skill");
  const outside = join(dir, "outside.md");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(outside, "---\nname: linked-skill\ndescription: Outside the pack.\n---\nDo not index this.\n");
  symlinkSync(outside, join(skillDir, "SKILL.md"));
  try {
    assert.throws(
      () => buildIndex({ packs: [{ serviceId: "catalog", path: pack, attribution: ATTRIBUTION }], outDir: join(dir, "out") }),
      /symbolic SKILL\.md/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildIndex does not follow directory symlinks (aliases ignored, no cycle)", () => {
  const dir = join(tmpdir(), `grimoire-symdir-${process.pid}-${Date.now()}`);
  const pack = join(dir, "pack");
  const out = join(dir, "out");
  const realSkill = join(pack, "skills", "real-cat", "real-skill");
  mkdirSync(realSkill, { recursive: true });
  writeFileSync(join(realSkill, "SKILL.md"), "---\nname: real-skill\ndescription: The only real skill.\n---\nReal.\n");
  // A directory alias to the whole category and a self-loop inside it: both are directory symlinks
  // and must be skipped, so discovery neither double-counts the aliased skill nor loops forever.
  symlinkSync(join(pack, "skills", "real-cat"), join(pack, "skills", "alias-cat"));
  symlinkSync(join(pack, "skills", "real-cat"), join(pack, "skills", "real-cat", "loop"));
  try {
    const res = buildIndex({ packs: [{ serviceId: "catalog", path: pack, commit: "c", attribution: ATTRIBUTION }], outDir: out });
    assert.equal(res.skills, 1, "directory symlinks are not followed");
    assert.deepEqual(res.skipped, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the same skill name in two categories indexes the first path and skips the rest", () => {
  const dir = join(tmpdir(), `grimoire-dup-${process.pid}-${Date.now()}`);
  const pack = join(dir, "pack");
  const out = join(dir, "out");
  for (const cat of ["(a)", "(b)"]) {
    const d = join(pack, "skills", cat, "dup");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "SKILL.md"), `---\nname: dup\ndescription: ${cat} copy.\n---\nFrom ${cat}.\n`);
  }
  try {
    const res = buildIndex({ packs: [{ serviceId: "catalog", path: pack, commit: "c", attribution: ATTRIBUTION }], outDir: out });
    assert.equal(res.skills, 1, "only the first path for a colliding id is indexed");
    assert.deepEqual(res.skipped, [{ dir: "(b)/dup", reason: "duplicate skill id: catalog:dup" }]);
    const store = new Store({ dir: out });
    try {
      const got = store.get("catalog:dup");
      assert.equal(got.status, "ok");
      if (got.status === "ok") assert.match(got.skill.provenance.sourcePath, /skills\/\(a\)\/dup\/SKILL\.md$/);
    } finally { store.close(); }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a skills root with no SKILL.md anywhere fails the build (fail closed)", () => {
  const dir = join(tmpdir(), `grimoire-empty-${process.pid}-${Date.now()}`);
  const pack = join(dir, "pack");
  mkdirSync(join(pack, "skills", "category", "placeholder"), { recursive: true });
  writeFileSync(join(pack, "skills", "loose.txt"), "not a skill\n");
  try {
    assert.throws(
      () => buildIndex({ packs: [{ serviceId: "catalog", path: pack, commit: "c", attribution: ATTRIBUTION }], outDir: join(dir, "out") }),
      /no skills found under/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a skill's own license, author and license file travel with its served attribution", () => {
  const dir = join(tmpdir(), `grimoire-notice-${process.pid}-${Date.now()}`);
  const pack = join(dir, "pack");
  const out = join(dir, "out");
  const mkSkill = (name: string, extra: string): string => {
    const abs = join(pack, "skills", "(cat)", name);
    mkdirSync(abs, { recursive: true });
    writeFileSync(join(abs, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} skill.\n${extra}---\nBody.\n`);
    return abs;
  };
  const declared = mkSkill("declared-skill", "license: CC-BY-4.0\nmetadata:\n  author: Jane Roe - example.invalid/jane\n");
  writeFileSync(join(declared, "notes.md"), "Notes.\n");
  const authorOnlyDir = mkSkill("author-only", "author: Top Level\n");
  writeFileSync(join(authorOnlyDir, "LICENSE.txt"), "Upstream license text.\n");
  mkSkill("plain-skill", "");
  const declaredAttribution = `${ATTRIBUTION} Skill declares license CC-BY-4.0; author Jane Roe - example.invalid/jane.`;
  try {
    buildIndex({ packs: [{ serviceId: "catalog", path: pack, commit: "c", attribution: ATTRIBUTION }], outDir: out });
    const store = new Store({ dir: out });
    try {
      const got = store.get("catalog:declared-skill");
      assert.equal(got.status === "ok" && got.skill.provenance.attribution, declaredAttribution);
      const file = store.fileGet("catalog:declared-skill", "notes.md");
      assert.equal(file.status === "ok" && file.file.attribution, declaredAttribution, "supporting files carry the same notice");
      const authorOnly = store.get("catalog:author-only");
      assert.equal(
        authorOnly.status === "ok" && authorOnly.skill.provenance.attribution,
        `${ATTRIBUTION} Skill declares author Top Level; license file LICENSE.txt.`,
        "a license file in the skill root is named in the notice",
      );
      const plain = store.get("catalog:plain-skill");
      assert.equal(plain.status === "ok" && plain.skill.provenance.attribution, ATTRIBUTION, "no declarations keep the pack attribution");
    } finally { store.close(); }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("skillsRel indexes a non-default skills directory", () => {
  const dir = join(tmpdir(), `grimoire-skillsrel-${process.pid}-${Date.now()}`);
  const pack = join(dir, "pack");
  const out = join(dir, "out");
  const skillDir = join(pack, ".claude", "skills", "re-ghidra");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: re-ghidra\ndescription: Ghidra reverse engineering.\n---\nUse Ghidra.\n");
  try {
    assert.throws(
      () => buildIndex({ packs: [{ serviceId: "rev-skills", path: pack, commit: "c", attribution: ATTRIBUTION }], outDir: out }),
      /no skills directory/,
    );
    const result = buildIndex({
      packs: [{ serviceId: "rev-skills", path: pack, commit: "c", skillsRel: ".claude/skills", attribution: ATTRIBUTION }],
      outDir: out,
    });
    assert.equal(result.skills, 1);
    const store = new Store({ dir: out });
    try {
      const got = store.get("rev-skills:re-ghidra");
      assert.equal(got.status, "ok");
      if (got.status === "ok") {
        assert.equal(got.skill.category, "reverse");
        assert.match(got.skill.provenance.sourcePath, /^\.claude\/skills\/re-ghidra\/SKILL\.md$/);
      }
      const listed = store.list("re");
      assert.equal(listed.status, "ok");
      if (listed.status === "ok") {
        assert.equal(listed.items.length, 1);
        assert.equal(listed.items[0]!.id, "rev-skills:re-ghidra");
      }
    } finally { store.close(); }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
