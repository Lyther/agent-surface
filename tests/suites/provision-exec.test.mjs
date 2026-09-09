#!/usr/bin/env node
// Executor + authorization-policy tests. Recipes are NEVER real package managers here: an injected
// spawnFn either creates the expected binary (success) or returns non-zero (failure), and detection
// stays real (existsSync), so the suite proves the run → re-detect → wire/skip loop without touching
// the system.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { dedupeActions, provisioningDecision, runProvisioning } from "../../scripts/agent-surface/provision-exec.mjs";

const platform = process.platform;
const recipe = (run, extra = {}) => ({ [platform]: [{ run, ...extra }] });
const prereq = (id, targetPath, run, extra = {}) => ({
  id, kind: "tool", detect: { paths: [targetPath] },
  recipes: recipe(run, { source: `${id} via ${run[0]}`, ...extra }),
});

// ---- dedupeActions: identical run+cwd collapses to one ------------------------
{
  const actions = [
    { run: ["make", "/a"], cwd: null, source: "a" },
    { run: ["make", "/a"], cwd: null, source: "a-again" },
    { run: ["make", "/a"], cwd: "repo", source: "a-in-repo" },
    { run: ["make", "/b"], cwd: null, source: "b" },
  ];
  assert.deepEqual(dedupeActions(actions).map((a) => a.source), ["a", "a-in-repo", "b"], "same run+cwd collapses; different cwd or run is kept, order preserved");
}

// ---- provisioningDecision: the full authorization policy ----------------------
const req = [{ optional: false, source: "s" }];
const opt = [{ optional: true, source: "s" }];
assert.equal(provisioningDecision({ actions: [], blockers: [{ id: "x" }], interactive: true, authorized: true, dryRun: false }).kind, "block", "no-recipe blocker blocks even with -y");
assert.equal(provisioningDecision({ actions: [], blockers: [], interactive: false, authorized: false, dryRun: false }).kind, "proceed", "nothing missing → proceed");
assert.equal(provisioningDecision({ actions: req, blockers: [], interactive: false, authorized: false, dryRun: true }).kind, "proceed", "dry-run never runs recipes");
assert.equal(provisioningDecision({ actions: req, blockers: [], interactive: false, authorized: true, dryRun: false }).kind, "install", "-y authorizes");
const confirm = provisioningDecision({ actions: req, blockers: [], interactive: true, authorized: false, dryRun: false });
assert.equal(confirm.kind, "confirm", "a TTY asks once");
assert.equal(confirm.mustAuthorize, true, "required gaps make the confirm mandatory");
assert.equal(provisioningDecision({ actions: req, blockers: [], interactive: false, authorized: false, dryRun: false }).kind, "block", "headless + required gap + no -y → block");
assert.equal(provisioningDecision({ actions: req, blockers: [], interactive: false, authorized: false, dryRun: false }).reason, "needs-authorization");
assert.equal(provisioningDecision({ actions: opt, blockers: [], interactive: false, authorized: false, dryRun: false }).kind, "proceed", "headless + only OPTIONAL gap → proceed (skip optional)");
assert.equal(provisioningDecision({ actions: opt, blockers: [], interactive: true, authorized: false, dryRun: false }).mustAuthorize, false, "optional-only interactive confirm is not mandatory");

const dir = mkdtempSync(path.join(os.tmpdir(), "as-provexec-"));
try {
  const calls = [];
  const spawnFn = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === "make") { writeFileSync(args[0], "#!/bin/sh\n", { mode: 0o755 }); return { status: 0 }; }
    if (cmd === "boom") return { status: 1 };
    if (cmd === "enoent") return { status: null, error: new Error("spawn ENOENT") };
    return { status: 0 };
  };
  const run = (entries) => runProvisioning(entries, { platform, env: { PATH: dir }, homedir: dir, spawnFn, repoRoot: dir });

  // ---- success: recipe creates the binary → re-detect satisfied → nothing failed ----
  const aPath = path.join(dir, "toolA");
  const okResult = run([["svcA", { provisioning: { prerequisites: [prereq("toolA", aPath, ["make", aPath])] } }]]);
  assert.equal(okResult.failed.size, 0, "a recipe that produces its binary leaves the service satisfied");
  assert.ok(existsSync(aPath), "the binary the recipe created is present");
  assert.equal(okResult.ran[0].ok, true);

  // ---- failure: recipe runs but binary never appears → service failed -----------
  const bPath = path.join(dir, "toolB");
  const failResult = run([["svcB", { provisioning: { prerequisites: [prereq("toolB", bPath, ["boom"])] } }]]);
  assert.deepEqual([...failResult.failed], ["svcB"], "a service whose required prerequisite is still missing after the recipe is failed");
  assert.equal(failResult.ran[0].ok, false);

  // ---- ENOENT (recipe binary missing) is a failure, not a throw -----------------
  const cPath = path.join(dir, "toolC");
  const enoentResult = run([["svcC", { provisioning: { prerequisites: [prereq("toolC", cPath, ["enoent"])] } }]]);
  assert.deepEqual([...enoentResult.failed], ["svcC"], "a recipe whose command cannot spawn fails the service (no throw)");

  // ---- already satisfied: no recipe runs (completed work is reused) -------------
  const dPath = path.join(dir, "toolD");
  writeFileSync(dPath, "#!/bin/sh\n", { mode: 0o755 });
  calls.length = 0;
  const reuse = run([["svcD", { provisioning: { prerequisites: [prereq("toolD", dPath, ["make", dPath])] } }]]);
  assert.equal(reuse.failed.size, 0);
  assert.equal(calls.length, 0, "an already-satisfied prerequisite runs no recipe");

  // ---- dedup + dependency order across services: shared runtime installs once ---
  const shared = path.join(dir, "shared-node");
  const binE = path.join(dir, "binE");
  calls.length = 0;
  const ordered = run([
    ["svcE", { provisioning: { prerequisites: [
      prereq("node", shared, ["make", shared]),
      prereq("binE", binE, ["make", binE]),
    ] } }],
    ["svcF", { provisioning: { prerequisites: [
      prereq("node", shared, ["make", shared]),
    ] } }],
  ]);
  assert.equal(ordered.failed.size, 0, "both services satisfied after the shared runtime + their binaries install");
  const madeShared = calls.filter(([, p]) => p === shared);
  assert.equal(madeShared.length, 1, "the runtime shared by two services is installed exactly once");
  assert.deepEqual(calls.map(([, p]) => p), [shared, binE], "runtime installs before the binary that needs it; order preserved");

  // ---- same-run bootstrap: a tool installed OFF PATH by an earlier step is used by ABSOLUTE path --
  // The consumer recipe references the just-installed tool by its BARE name; the executor must
  // re-resolve it to the path the installer created (not on PATH) — a bare spawn would ENOENT. This
  // is the uv-installed-then-consumed-in-one-run bootstrap, minimized.
  const offPath = path.join(dir, "offpath");
  mkdirSync(offPath);
  const toolzPath = path.join(offPath, "toolz");
  const producedPath = path.join(offPath, "produced");
  const bootCalls = [];
  const bootSpawn = (cmd, args) => {
    bootCalls.push([cmd, ...args]);
    if (path.basename(cmd) === "install-toolz") { writeFileSync(args[0], "#!/bin/sh\n", { mode: 0o755 }); return { status: 0 }; }
    if (cmd === toolzPath) { writeFileSync(args[0], "#!/bin/sh\n", { mode: 0o755 }); return { status: 0 }; } // succeeds only via ABSOLUTE path
    if (cmd === "toolz") return { status: null, error: new Error("spawn toolz ENOENT") }; // bare name would fail
    return { status: 0 };
  };
  const bootstrap = [["boot", { provisioning: { prerequisites: [
    { id: "toolz", kind: "tool", detect: { paths: [toolzPath] }, recipes: recipe(["install-toolz", toolzPath], { source: "toolz installer" }) },
    { id: "consumer", kind: "tool", detect: { paths: [producedPath] }, recipes: recipe(["toolz", producedPath], { source: "runs toolz" }) },
  ] } }]];
  // env.PATH is `dir` only — offPath (where toolz lands) is NOT on PATH, so bare "toolz" is unresolvable.
  const bootResult = runProvisioning(bootstrap, { platform, env: { PATH: dir }, homedir: dir, spawnFn: bootSpawn, repoRoot: dir });
  assert.equal(bootResult.failed.size, 0, "both prerequisites satisfied — the off-PATH tool was invoked by absolute path (bare would ENOENT)");
  assert.ok(bootCalls.some(([cmd]) => cmd === toolzPath), "the consumer step launched toolz by its resolved absolute path, not the bare name");
  assert.ok(!bootCalls.some(([cmd]) => cmd === "toolz"), "the bare tool name is never spawned once it is installed off PATH");
  assert.ok(existsSync(producedPath), "the consumer produced its output");

  // ---- Windows: a recipe command that resolves to a batch shim runs through cmd.exe ----
  // npm links console entry points as .cmd on Windows and Node refuses to spawn one without a
  // shell, so a recipe like `npm run install:x` would die with EINVAL if spawned directly.
  const winBin = path.join(dir, "winmgr");
  mkdirSync(winBin);
  writeFileSync(path.join(winBin, "pkgmgr.cmd"), "@echo off\n", { mode: 0o644 });
  const winCalls = [];
  const winTarget = path.join(dir, "win-produced.exe");
  const winSpawn = (cmd, args) => {
    winCalls.push([cmd, ...args]);
    writeFileSync(winTarget, "MZ\n", { mode: 0o644 });
    return { status: 0 };
  };
  const winResult = runProvisioning(
    [["winsvc", { provisioning: { prerequisites: [
      { id: "thing", kind: "tool", detect: { paths: [winTarget] }, recipes: { win32: [{ run: ["pkgmgr", "install", "thing"], source: "pkgmgr thing" }] } },
    ] } }]],
    { platform: "win32", env: { PATH: winBin, PATHEXT: ".COM;.EXE;.BAT;.CMD" }, homedir: dir, spawnFn: winSpawn, repoRoot: dir },
  );
  assert.equal(winResult.failed.size, 0, "the Windows recipe ran and its output was detected (a .exe satisfies the PATHEXT rule)");
  assert.equal(path.basename(winCalls[0][0]).toLowerCase(), "cmd.exe", "a resolved .cmd recipe command is executed by cmd.exe, not spawned directly");
  assert.deepEqual(winCalls[0].slice(1, 4), ["/d", "/s", "/c"], "AutoRun disabled, outer quotes stripped verbatim");
  assert.match(winCalls[0][4], /pkgmgr\.cmd" "install" "thing"/, "the resolved absolute shim and its arguments are quoted per token");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("provision-exec: ok");
