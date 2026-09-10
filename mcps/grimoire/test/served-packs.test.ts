import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { indexerArgv, loadRegistry, servedPacksFromRegistry } from "../src/served-packs.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

test("servedPacksFromRegistry reads the real optional-services registry", () => {
  const packs = servedPacksFromRegistry(REPO, loadRegistry(REPO));
  const byId = new Map(packs.map((p) => [p.serviceId, p]));
  assert.equal(byId.get("anthropic-cybersecurity-skills")?.skillsRel, "skills");
  assert.equal(byId.get("hack-skills")?.skillsRel, "skills");
  assert.equal(byId.get("hack-skills")?.required, true);
  assert.match(byId.get("hack-skills")?.commit ?? "", /^[0-9a-f]{40}$/);
  assert.match(byId.get("hack-skills")?.attribution ?? "", /Yaklang.*MIT/);
  assert.equal(byId.get("rev-skills")?.skillsRel, ".claude/skills");
  assert.equal(byId.get("rev-skills")?.required, true);
  assert.match(byId.get("rev-skills")?.commit ?? "", /^[0-9a-f]{40}$/);
  assert.match(
    byId.get("rev-skills")?.attribution ?? "",
    /DslsDZC.*CC BY 4\.0/,
  );
});

test("indexerArgv fail-closes a required pack whose skills dir is absent", () => {
  // SUBSTITUTE_JUSTIFICATION
  // - substitute: temp repo root with a copied registry path and no checkout
  // - replaces: a real required submodule that is missing from disk
  // - necessity: cannot delete external/rev-skills from this checkout without breaking the real 121-skill eval
  // - real-option: a disposable clone without the submodule still needs a registry; this isolates the missing-dir branch
  // - proof-limit: proves argv omission + missingRequired, not install.mjs or a live index rebuild
  // - real-proof: npm run install:grimoire on a machine with both submodules present
  const dir = mkdtempSync(join(tmpdir(), "grimoire-served-missing-"));
  try {
    const registry = loadRegistry(REPO);
    mkdirSync(join(dir, "external", "rev-skills", ".claude", "skills"), { recursive: true });
    writeFileSync(join(dir, "external", "rev-skills", ".claude", "skills", ".keep"), "");
    const packs = servedPacksFromRegistry(dir, registry);
    const result = indexerArgv(packs);
    assert.ok(result.missingRequired.some((p) => p.serviceId === "anthropic-cybersecurity-skills"));
    assert.deepEqual(result.args.slice(0, 2), ["--pack", `rev-skills:${join(dir, "external", "rev-skills")}`]);
    assert.ok(result.args.includes(".claude/skills"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
