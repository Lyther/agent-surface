#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GRIMOIRE_SCHEMA_VERSION } from "../../scripts/agent-surface/doctor.mjs";
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

// The child prints from a script file, so only the output path can redact these lines; the
// last line echoes an argv secret without its option name.
const outputRedactionRoot = mkdtempSync(path.join(tmpdir(), "agent-surface-output-redaction-"));
try {
  const outputRedactionCases = [
    ['{"password":"sentinel-json-value"}', '{"password":"[REDACTED]"}'],
    ['password="sentinel quoted words"', 'password="[REDACTED]"'],
    ["Set-Cookie: sid=sentinel-cookie-header; Path=/", "Set-Cookie: [REDACTED]"],
    ['{"set-cookie":"sid=sentinel-cookie-json"}', '{"set-cookie":"[REDACTED]"}'],
    // Node's inspect and indented JSON print a header array across lines.
    ["  'set-cookie': [\n    'session=sentinel-inspect-array; Path=/; HttpOnly'\n  ]", "  'set-cookie': [REDACTED]"],
    ['  "set-cookie": [\n    "sid=sentinel-indented-json"\n  ]', '  "set-cookie": [REDACTED]'],
    // A `]` inside a value does not end the array early.
    ["  'set-cookie': [\n    'prefs=[dark]; Path=/',\n    'session=sentinel-after-bracket'\n  ]", "  'set-cookie': [REDACTED]"],
    ['"{\\"password\\":\\"sentinel-escaped-json\\"}"', '"{\\"password\\":\\"[REDACTED]\\"}"'],
    ['{"Authorization": "Bearer sentinel-json-bearer"}', '{"Authorization": "Bearer [REDACTED]"}'],
    // A value inside twice-serialized JSON keeps its own escaped quotes; the match ends at the closing one.
    [JSON.stringify(JSON.stringify({ password: 'sentinel-"quoted"-tail' })), JSON.stringify(JSON.stringify({ password: "[REDACTED]" }))],
    // A header printed as an array, here by indented JSON.
    [JSON.stringify({ Authorization: ["Bearer sentinel-auth-array"] }, null, 2), JSON.stringify({ Authorization: ["Bearer [REDACTED]"] }, null, 2)],
    // Every credential in a header array is removed; the run of them becomes one marker.
    ["{ authorization: [ 'Bearer sentinel-first', 'Basic sentinel-second' ] }", "{ authorization: [ 'Bearer [REDACTED]' ] }"],
    [JSON.stringify({ Authorization: ["Bearer sentinel-first", "Bearer sentinel-second"] }, null, 2), JSON.stringify({ Authorization: ["Bearer [REDACTED]"] }, null, 2)],
    ["status: ok", "status: ok"],
  ];
  const emitter = path.join(outputRedactionRoot, "emit.mjs");
  writeFileSync(emitter, `process.stdout.write(${JSON.stringify(outputRedactionCases.map(([line]) => line).join("\n"))} + "\\necho: " + process.argv.at(-1) + "\\n");\n`);
  const out = path.join(outputRedactionRoot, "out");
  run(["run", "--task", "T1", "--class", "read_only", "--timeout", "5000", "--out", out, "--", process.execPath, emitter, "--token", SENTINEL]);
  const redactionEvidence = JSON.parse(readFileSync(files(out).find((file) => file.endsWith(".evidence.json")), "utf8"));
  const redactedLines = readFileSync(path.join(out, path.basename(redactionEvidence.stdout_ref)), "utf8").split("\n");
  assert.deepEqual(redactedLines, [...outputRedactionCases.flatMap(([, expected]) => expected.split("\n")), "echo: [REDACTED]", ""]);
  for (const pattern of ["authorization-header", "secret-assignment", "cookie-header", "argv-secret-echo"]) {
    assert.ok(redactionEvidence.redaction.patterns.includes(pattern), pattern);
  }
} finally {
  rmSync(outputRedactionRoot, { recursive: true, force: true });
}

// A child that exits 0 on SIGTERM still timed out, so exit_code must not read as success.
const timeoutDest = mkdtempSync(path.join(tmpdir(), "agent-surface-evidence-timeout-"));
try {
  const timedOut = status([
    "run", "--task", "T1", "--class", "read_only", "--timeout", "1000", "--out", timeoutDest, "--",
    process.execPath, "-e", "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);",
  ]);
  assert.equal(timedOut.status, 124, `${timedOut.stdout}${timedOut.stderr}`);
  const timeoutEvidence = JSON.parse(readFileSync(files(timeoutDest).find((file) => file.endsWith(".evidence.json")), "utf8"));
  assert.equal(timeoutEvidence.signal, "SIGKILL", "a timeout kills the child, so its SIGTERM handler never runs");
  assert.equal(timeoutEvidence.timed_out, true);
  assert.equal(timeoutEvidence.exit_code, 124);
} finally {
  rmSync(timeoutDest, { recursive: true, force: true });
}

// A child that ignores SIGTERM still ends at the timeout, and the run writes its evidence. The
// harness timeout turns a regression into a failure instead of a hung suite.
const ignoringDest = mkdtempSync(path.join(tmpdir(), "agent-surface-evidence-ignore-term-"));
try {
  const ignored = status([
    "run", "--task", "T1", "--class", "read_only", "--timeout", "500", "--out", ignoringDest, "--",
    process.execPath, "-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
  ], { timeout: 15000 });
  assert.equal(ignored.status, 124, `${ignored.error?.code ?? ""}${ignored.stdout}${ignored.stderr}`);
  const ignoredEvidence = JSON.parse(readFileSync(files(ignoringDest).find((file) => file.endsWith(".evidence.json")), "utf8"));
  assert.equal(ignoredEvidence.timed_out, true);
  assert.equal(ignoredEvidence.signal, "SIGKILL");
} finally {
  rmSync(ignoringDest, { recursive: true, force: true });
}

// tree_hash is HEAD's tree whatever the worktree holds; dirty records uncommitted changes.
const dirtyRepo = mkdtempSync(path.join(tmpdir(), "agent-surface-evidence-repo-"));
const dirtyOut = mkdtempSync(path.join(tmpdir(), "agent-surface-evidence-out-"));
try {
  const git = (...args) => execFileSync("git", [
    "-c", "user.name=evidence", "-c", "user.email=evidence@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null",
    ...args,
  ], { cwd: dirtyRepo, encoding: "utf8" }).trim();
  git("init");
  writeFileSync(path.join(dirtyRepo, "tracked.txt"), "committed\n");
  git("add", "tracked.txt");
  git("commit", "-m", "base");
  const headTree = git("rev-parse", "HEAD^{tree}");
  const evidenceIn = (label) => {
    const out = path.join(dirtyOut, label);
    run(["run", "--task", "T1", "--class", "read_only", "--timeout", "5000", "--out", out, "--", process.execPath, "-e", "0"], { cwd: dirtyRepo });
    return JSON.parse(readFileSync(files(out).find((file) => file.endsWith(".evidence.json")), "utf8"));
  };
  const clean = evidenceIn("clean");
  assert.equal(clean.tree_hash, headTree);
  assert.equal(clean.dirty, false);
  writeFileSync(path.join(dirtyRepo, "tracked.txt"), "uncommitted\n");
  const dirty = evidenceIn("dirty");
  assert.equal(dirty.tree_hash, headTree, "tree_hash stays HEAD's tree");
  assert.equal(dirty.dirty, true);
} finally {
  rmSync(dirtyRepo, { recursive: true, force: true });
  rmSync(dirtyOut, { recursive: true, force: true });
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

// doctor runs without a Grimoire build, so it keeps its own copy of the schema version the indexer writes.
const indexerSchemaVersion = Number(/export const SCHEMA_VERSION = (\d+);/.exec(
  readFileSync(path.join(root, "mcps", "grimoire", "src", "model.ts"), "utf8"),
)?.[1]);
assert.equal(GRIMOIRE_SCHEMA_VERSION, indexerSchemaVersion, "doctor's Grimoire schema version matches the indexer's");

console.log("runtime: ok");
