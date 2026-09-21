#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { files, root, run, status } from "../lib/helpers.mjs";

const evidenceDest = "/tmp/agent-surface-evidence";
rmSync(evidenceDest, { recursive: true, force: true });
const evidenceRun = run([
  "run",
  "--task",
  "T1",
  "--class",
  "read_only",
  "--timeout",
  "5000",
  "--out",
  evidenceDest,
  "--",
  process.execPath,
  "-e",
  "process.stdout.write('ok\\n' + 'API' + '_KEY=abc123'); process.stderr.write('Authorization: ' + 'Bearer secret-token');",
]);
assert.match(evidenceRun, /exit_code: 0/);
const evidenceFiles = files(evidenceDest);
const evidenceJson = evidenceFiles.find((file) => file.endsWith(".evidence.json"));
assert.ok(evidenceJson);
const evidence = JSON.parse(readFileSync(evidenceJson, "utf8"));
assert.equal(evidence.task_id, "T1");
assert.equal(evidence.class, "read_only");
assert.equal(evidence.exit_code, 0);
const redactedApiKeyPattern = new RegExp("^ok\\n" + "API" + "_KEY=\\[REDACTED\\]$");
const redactedAuthPattern = new RegExp("^Authorization: " + "Bearer \\[REDACTED\\]$");
assert.match(readFileSync(path.join(evidenceDest, path.basename(evidence.stdout_ref)), "utf8"), redactedApiKeyPattern);
assert.match(readFileSync(path.join(evidenceDest, path.basename(evidence.stderr_ref)), "utf8"), redactedAuthPattern);
assert.match(evidence.stdout_hash, /^sha256:/);
assert.match(evidence.stdout_raw_hash, /^sha256:/);
assert.equal(evidence.stdout_raw_stored, false);
assert.match(evidence.stderr_raw_hash, /^sha256:/);
assert.equal(evidence.stderr_raw_stored, false);
assert.equal(evidence.redaction.applied, true);
rmSync(evidenceDest, { recursive: true, force: true });

// Command-array redaction is a separate path from stdout/stderr text redaction.
const SENTINEL = "sentinel-sensitive-value-9f3c";
const argvRedactionCases = [
  {
    name: "space-separated token",
    args: ["--token", SENTINEL],
    expectTail: ["--token", "[REDACTED]"],
  },
  {
    name: "equals-form token",
    args: [`--token=${SENTINEL}`],
    expectTail: ["--token=[REDACTED]"],
  },
  {
    name: "leading-dash token value",
    args: ["--token", `-${SENTINEL}`],
    expectTail: ["--token", "[REDACTED]"],
  },
  {
    name: "compound access-token",
    args: ["--access-token", SENTINEL],
    expectTail: ["--access-token", "[REDACTED]"],
  },
  {
    name: "compound client-secret",
    args: ["--client-secret", SENTINEL],
    expectTail: ["--client-secret", "[REDACTED]"],
  },
  {
    name: "compound db-password",
    args: ["--db-password", SENTINEL],
    expectTail: ["--db-password", "[REDACTED]"],
  },
  {
    name: "adjacent secret options keep second value redacted",
    args: ["--token", "--password", SENTINEL],
    expectTail: ["--token", "--password", "[REDACTED]"],
  },
  {
    name: "mid-name secret segment aws-secret-access-key",
    args: ["--aws-secret-access-key", SENTINEL],
    expectTail: ["--aws-secret-access-key", "[REDACTED]"],
  },
  {
    name: "equals-form compound access-token",
    args: [`--access-token=${SENTINEL}`],
    expectTail: ["--access-token=[REDACTED]"],
  },
  {
    name: "double-dash token value",
    args: ["--token", `--${SENTINEL}`],
    expectTail: ["--token", "[REDACTED]"],
  },
  {
    name: "prefixed AWS secret assignment",
    args: [`AWS_SECRET_ACCESS_KEY=${SENTINEL}`],
    expectTail: ["AWS_SECRET_ACCESS_KEY=[REDACTED]"],
    expectPattern: "secret-assignment",
  },
  {
    name: "prefixed GitHub token assignment",
    args: [`GITHUB_TOKEN=${SENTINEL}`],
    expectTail: ["GITHUB_TOKEN=[REDACTED]"],
    expectPattern: "secret-assignment",
  },
];

for (const testCase of argvRedactionCases) {
  const dest = `/tmp/agent-surface-arg-secret-${testCase.name.replace(/\W+/g, "-")}`;
  rmSync(dest, { recursive: true, force: true });
  try {
    const output = run([
      "run",
      "--task",
      "T1",
      "--class",
      "read_only",
      "--timeout",
      "5000",
      "--out",
      dest,
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
      "--",
      ...testCase.args,
    ]);
    assert.match(output, /exit_code: 0/, testCase.name);
    const evidenceJson = files(dest).find((file) => file.endsWith(".evidence.json"));
    const evidence = JSON.parse(readFileSync(evidenceJson, "utf8"));
    if (!testCase.allowSentinel) {
      assert.equal(
        JSON.stringify(evidence.cmd).includes(SENTINEL),
        false,
        `${testCase.name}: sentinel leaked in cmd`,
      );
      assert.equal(
        evidence.redaction.patterns.includes(testCase.expectPattern ?? "secret-flag"),
        true,
        testCase.name,
      );
    }
    assert.deepEqual(
      evidence.cmd.slice(-testCase.expectTail.length),
      testCase.expectTail,
      testCase.name,
    );
    assert.match(evidence.cmd_hash_raw, /^sha256:/, testCase.name);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

const fullConsentClassDest = "/tmp/agent-surface-full-consent-class";
rmSync(fullConsentClassDest, { recursive: true, force: true });
const fullConsentClass = status([
  "run",
  "--task",
  "T1",
  "--class",
  "deployment",
  "--timeout",
  "5000",
  "--out",
  fullConsentClassDest,
  "--",
  process.execPath,
  "-e",
  "process.exit(0)",
]);
assert.equal(fullConsentClass.status, 0, `${fullConsentClass.stdout}${fullConsentClass.stderr}`);
const fullConsentEvidenceJson = files(fullConsentClassDest).find((file) => file.endsWith(".evidence.json"));
const fullConsentEvidence = JSON.parse(readFileSync(fullConsentEvidenceJson, "utf8"));
assert.equal(fullConsentEvidence.class, "deployment");
assert.deepEqual(fullConsentEvidence.execution_consent, {
  mode: "full-access",
  source: "rules/00-precedence-and-safety.mdc",
});
assert.equal(Object.hasOwn(fullConsentEvidence, "approval"), false);
rmSync(fullConsentClassDest, { recursive: true, force: true });

// SUBSTITUTE_JUSTIFICATION
// - substitute: dirtyDoctorHome
// - replaces: the operator's user-level ~/.grimoire index and manifest
// - necessity: the dirty-manifest diagnostic requires exact state that a test cannot safely create in the operator's live index
// - real-option: the installed index was checked live, but its state is mutable and must not be overwritten by the suite
// - proof-limit: this test proves doctor output only, not index installation or Grimoire runtime behavior
// - real-proof: npm run install:grimoire, then node scripts/agent-surface.mjs doctor against the installed index
const dirtyDoctorHome = mkdtempSync(path.join(tmpdir(), "agent-surface-doctor-dirty-"));
try {
  const grimoireDir = path.join(dirtyDoctorHome, ".grimoire");
  mkdirSync(grimoireDir, { recursive: true });
  writeFileSync(path.join(grimoireDir, "index.sqlite"), "present");
  const registry = JSON.parse(readFileSync(path.join(root, "registry", "optional-services.json"), "utf8"));
  const serviceId = "trailofbits-static-analysis";
  const pin = registry.services[serviceId].commit;
  const sourcePath = registry.services[serviceId].path;
  const otherServedPacks = Object.entries(registry.services)
    .filter(([id, service]) => id !== serviceId && service.served_by?.includes("grimoire"))
    .map(([id, service]) => ({ serviceId: id, commit: service.commit }));
  writeFileSync(path.join(grimoireDir, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    packs: [
      { serviceId, commit: `${pin}-dirty` },
      ...otherServedPacks,
    ],
  }));

  const result = status(["doctor"], { env: { ...process.env, HOME: dirtyDoctorHome } });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, new RegExp(
    `grimoire-index: stale: ${serviceId} built from a dirty worktree of pinned ${pin.slice(0, 8)}`,
  ));
  // serviceId is trailofbits-static-analysis but the checkout is external/trailofbits-skills: the hint
  // must name the registered source path, not external/<serviceId>.
  assert.match(result.stdout, new RegExp(`clean or commit ${sourcePath}, then run npm run install:grimoire`));
  assert.doesNotMatch(result.stdout, new RegExp(`installed ${pin.slice(0, 8)} but repo pins ${pin.slice(0, 8)}`));
} finally {
  rmSync(dirtyDoctorHome, { recursive: true, force: true });
}

// SUBSTITUTE_JUSTIFICATION
// - substitute: attributionDriftHome
// - replaces: an installed Grimoire manifest built with the prior registry attribution
// - necessity: mutating the operator's live attribution metadata would make the real index intentionally stale
// - real-option: the live index proves current attribution, but cannot safely represent historical drift
// - proof-limit: proves doctor detects registry-attribution drift before SQLite inspection, not index rebuilding
// - real-proof: npm run install:grimoire, then node scripts/agent-surface.mjs doctor against the installed index
const attributionDriftHome = mkdtempSync(path.join(tmpdir(), "agent-surface-doctor-attribution-"));
try {
  const grimoireDir = path.join(attributionDriftHome, ".grimoire");
  mkdirSync(grimoireDir, { recursive: true });
  writeFileSync(path.join(grimoireDir, "index.sqlite"), "present");
  const registry = JSON.parse(readFileSync(path.join(root, "registry", "optional-services.json"), "utf8"));
  writeFileSync(path.join(grimoireDir, "manifest.json"), JSON.stringify({
    schemaVersion: 2,
    packs: Object.entries(registry.services)
      .filter(([, service]) => service.served_by?.includes("grimoire"))
      .map(([serviceId, service]) => ({
        serviceId,
        commit: service.commit,
        sourceHash: "a".repeat(64),
        attribution: serviceId === "rev-skills" ? "stale attribution" : service.attribution,
      })),
  }));
  const result = status(["doctor"], { env: { ...process.env, HOME: attributionDriftHome } });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /grimoire-index: stale: rev-skills attribution differs from registry/);
} finally {
  rmSync(attributionDriftHome, { recursive: true, force: true });
}

// SUBSTITUTE_JUSTIFICATION
// - substitute: missingPackHome
// - replaces: an operator ~/.grimoire built before rev-skills was a served pack
// - necessity: cannot delete rev-skills from the live index without destroying the just-built 875-skill proof
// - real-option: a second disposable index would still be a substitute for the operator home
// - proof-limit: proves doctor text for a missing required pack, not install:grimoire
// - real-proof: npm run install:grimoire after adding the pack, then doctor
const missingPackHome = mkdtempSync(path.join(tmpdir(), "agent-surface-doctor-missing-pack-"));
try {
  const grimoireDir = path.join(missingPackHome, ".grimoire");
  mkdirSync(grimoireDir, { recursive: true });
  writeFileSync(path.join(grimoireDir, "index.sqlite"), "present");
  const registry = JSON.parse(readFileSync(path.join(root, "registry", "optional-services.json"), "utf8"));
  writeFileSync(path.join(grimoireDir, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    packs: [{ serviceId: "anthropic-cybersecurity-skills", commit: registry.services["anthropic-cybersecurity-skills"].commit }],
  }));
  const result = status(["doctor"], { env: { ...process.env, HOME: missingPackHome } });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /grimoire-index: stale: manifest pack set differs from registry/);
} finally {
  rmSync(missingPackHome, { recursive: true, force: true });
}

console.log("runtime: ok");
