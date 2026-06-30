import assert from "node:assert/strict";
import { test } from "node:test";
import { FileGetInput, GetInput, SearchInput, SKILL_ID_RE } from "../src/contract.js";
import { decId, extId } from "../src/model.js";

test("id codec round-trips across packs and splits on the first colon", () => {
  for (const [pack, name] of [["fixture", "detecting-cobalt-strike-beacons"], ["anthropic-cybersecurity-skills", "implementing-mfa-enforcement"]] as const) {
    const id = extId(pack, name);
    assert.match(id, SKILL_ID_RE);
    assert.deepEqual(decId(id), { pack, name });
  }
});

test("decId rejects malformed ids (incl. extra colons, since slugs have none)", () => {
  for (const bad of ["nopack", ":name", "pack:", "Pack:Name", "p p:n", "", "a:b:c"]) {
    assert.equal(decId(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test("SearchInput enforces query and k bounds", () => {
  assert.equal(SearchInput.safeParse({ query: "cobalt" }).success, true);
  assert.equal(SearchInput.safeParse({ query: "cobalt", k: 5 }).success, true);
  assert.equal(SearchInput.safeParse({ query: "" }).success, false);
  assert.equal(SearchInput.safeParse({ query: "x".repeat(513) }).success, false);
  assert.equal(SearchInput.safeParse({ query: "x", k: 0 }).success, false);
  assert.equal(SearchInput.safeParse({ query: "x", k: 51 }).success, false);
  assert.equal(SearchInput.safeParse({ query: "x", extra: 1 }).success, false, "strict: no extra keys");
});

test("GetInput / FileGetInput validate the id grammar", () => {
  assert.equal(GetInput.safeParse({ id: "fixture:detecting-cobalt-strike-beacons" }).success, true);
  assert.equal(GetInput.safeParse({ id: "Bad:Id" }).success, false);
  assert.equal(GetInput.safeParse({ id: "nocolon" }).success, false);
  assert.equal(FileGetInput.safeParse({ id: "fixture:x", path: "references/iocs.md" }).success, true);
  assert.equal(FileGetInput.safeParse({ id: "fixture:x", path: "" }).success, false);
});
