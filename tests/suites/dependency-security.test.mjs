#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { installEnv, run } from "../../scripts/agent-surface/mcp-build.mjs";
import { root } from "../lib/helpers.mjs";

const lockfiles = [
  "package-lock.json",
  "mcps/synapse/package-lock.json",
  "mcps/grimoire/package-lock.json",
];

// Independent security thresholds from the reviewed advisories, not from current output:
// GHSA-7p8r-x3mc-p8w7 patches fast-uri's host-confusion flaw in 3.1.5.
// GHSA-mwp4-54f8-5fhr patches ip-address's leading-zero SSRF bypass in 10.3.1.
const advisoryFloors = new Map([
  ["fast-uri", { version: "3.1.5", advisory: "GHSA-7p8r-x3mc-p8w7" }],
  ["ip-address", { version: "10.3.1", advisory: "GHSA-mwp4-54f8-5fhr" }],
]);

function versionTuple(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  assert.ok(match, `expected an exact three-part dependency version, got ${JSON.stringify(version)}`);
  return match.slice(1).map(Number);
}

function versionAtLeast(version, floor) {
  const current = versionTuple(version);
  const minimum = versionTuple(floor);
  for (let index = 0; index < current.length; index += 1) {
    if (current[index] !== minimum[index]) return current[index] > minimum[index];
  }
  return true;
}

const seenIn = new Map([...advisoryFloors].map(([name]) => [name, new Set()]));
const violations = [];

for (const relativePath of lockfiles) {
  const lock = JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
  assert.ok(lock.packages && typeof lock.packages === "object", `${relativePath}: no packages map`);

  for (const [packagePath, metadata] of Object.entries(lock.packages)) {
    for (const [name, floor] of advisoryFloors) {
      if (packagePath !== `node_modules/${name}` && !packagePath.endsWith(`/node_modules/${name}`)) {
        continue;
      }
      assert.equal(typeof metadata.version, "string", `${relativePath}:${packagePath}: no version`);
      seenIn.get(name).add(relativePath);
      if (!versionAtLeast(metadata.version, floor.version)) {
        violations.push(
          `${relativePath}: ${name} ${metadata.version} < ${floor.version} (${floor.advisory})`,
        );
      }
    }
  }
}

assert.deepEqual(
  [...seenIn.get("fast-uri")],
  lockfiles,
  "fast-uri must be inspected in every lock",
);
assert.deepEqual(
  [...seenIn.get("ip-address")],
  lockfiles.slice(1),
  "ip-address must be inspected in both MCP locks",
);
assert.deepEqual(
  violations,
  [],
  `dependency advisory floors violated:\n${violations.map((item) => `- ${item}`).join("\n")}`,
);

// ---- the first-party MCP installers must never resolve dependencies with TLS disabled ----
// The installers are Node programs, so this is checked by RUNNING the path that launches npm rather
// than by reading the source for a shell command: a child is spawned with the override deliberately
// set in this process's environment, and it reports what it actually received.
const overrideEnv = { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0" };
assert.equal(installEnv(overrideEnv).NODE_TLS_REJECT_UNAUTHORIZED, undefined, "the install environment drops a disabled TLS check");
assert.equal(installEnv(overrideEnv).PATH, overrideEnv.PATH, "unrelated variables are preserved");

const probeDir = mkdtempSync(path.join(os.tmpdir(), "as-tls-probe-"));
try {
  const report = path.join(probeDir, "seen.txt");
  const probe = path.join(probeDir, "probe.mjs");
  writeFileSync(probe, "import { writeFileSync } from 'node:fs';\nwriteFileSync(process.argv[2], String(process.env.NODE_TLS_REJECT_UNAUTHORIZED));\n");
  // run() is the single door every installer command goes through, including npm.
  run(process.execPath, [probe, report], { env: installEnv(overrideEnv), label: "tls probe" });
  assert.equal(readFileSync(report, "utf8"), "undefined", "a command launched by the installer never inherits a disabled TLS check");
} finally {
  rmSync(probeDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

// A future installer must not reach around that door by spawning the package manager itself; both
// delegate to the shared build step, so neither names npm at all.
for (const relativePath of ["mcps/synapse/install.mjs", "mcps/grimoire/install.mjs"]) {
  const source = readFileSync(path.join(root, relativePath), "utf8");
  assert.doesNotMatch(source, /\bnpm\b/, `${relativePath}: must reach npm through the shared install step, not directly`);
  assert.match(source, /installAndBuild\(/, `${relativePath}: must build through the shared install step`);
}

console.log("dependency-security: ok");
