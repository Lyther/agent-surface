#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalJson, sha256 } from "../../scripts/agent-surface/util.mjs";
import { root, status } from "../lib/helpers.mjs";


/*
SUBSTITUTE_JUSTIFICATION
- substitute: controlled workflow run, boss, reviewer, monitor, and patch fixture records under /tmp
- replaces: long-lived multi-agent host sessions and their timing, workspace, and artifact state
- necessity: contradictory buckets, orphan task IDs, future clocks, stalls, overlapping writers, and symlink escapes require deterministic invalid states that a real healthy run cannot safely produce on demand
- real-option: real workflow processes cannot deterministically pause at each invalid transition without instrumenting or corrupting an active run
- proof-limit: these fixtures prove validator discrimination only; they do not prove host process supervision, runtime scheduling, or end-to-end workflow completion
- real-proof: BLOCKED: requires a bounded live workflow launched through each supported host with independently observed process and artifact state
*/
const workflowDest = "/tmp/agent-surface-workflow";
rmSync(workflowDest, { recursive: true, force: true });
const workflowRunDir = path.join(workflowDest, ".agent-surface", "workflows", "run-fixture-001");
mkdirSync(workflowRunDir, { recursive: true });
const workflowRun = JSON.parse(readFileSync(path.join(root, "tests", "fixtures", "workflow", "run.json"), "utf8"));
workflowRun.active_task_ids = ["T2"];
workflowRun.workflow_next_command = "workflow-reviewer";
writeFileSync(path.join(workflowRunDir, "run.json"), `${JSON.stringify(workflowRun, null, 2)}\n`);
const provenanceBoss = JSON.parse(readFileSync(path.join(root, "tests", "fixtures", "workflow", "boss-chore.json"), "utf8"));
provenanceBoss.round_id = 1;
provenanceBoss.tasks[0].task_id = "T2";
provenanceBoss.workflow.round_id = 1;
const provenanceBossDir = path.join(workflowRunDir, "rounds", "round-001");
mkdirSync(provenanceBossDir, { recursive: true });
const provenanceBossText = `${JSON.stringify(provenanceBoss, null, 2)}\n`;
writeFileSync(path.join(provenanceBossDir, "boss.json"), provenanceBossText);
const provenanceEventWithoutHash = {
  event_id: "workflow-boss-001",
  run_id: provenanceBoss.run_id,
  round_id: provenanceBoss.round_id,
  role: "workflow-boss",
  from: "workflow-boss",
  to: "workflow-reviewer",
  artifact: "rounds/round-001/boss.json",
  artifact_hash: `sha256:${sha256(provenanceBossText)}`,
  timestamp: "2026-01-01T00:00:00.000Z",
  summary: "Initialized the validated boss round.",
  prev_event_hash: null,
};
const provenanceEvent = {
  ...provenanceEventWithoutHash,
  event_hash: `sha256:${sha256(canonicalJson(provenanceEventWithoutHash))}`,
};
writeFileSync(path.join(workflowRunDir, "events.ndjson"), `${JSON.stringify(provenanceEvent)}\n`);
writeFileSync(
  path.join(workflowRunDir, "reviewer.json"),
  readFileSync(path.join(root, "tests", "fixtures", "workflow", "reviewer-refactor.json"), "utf8"),
);
const workflowApply = status(
  [
    "workflow",
    "apply",
    "--role",
    "workflow-reviewer",
    "--run",
    "run-fixture-001",
    "--artifact",
    path.join(".agent-surface", "workflows", "run-fixture-001", "reviewer.json"),
  ],
  { cwd: workflowDest },
);
assert.equal(workflowApply.status, 0, `${workflowApply.stdout}${workflowApply.stderr}`);
const appliedRun = JSON.parse(readFileSync(path.join(workflowRunDir, "run.json"), "utf8"));
assert.deepEqual(appliedRun.active_task_ids, []);
assert.deepEqual(appliedRun.rework_task_ids, ["T2"]);
assert.equal(appliedRun.workflow_next_command, "dev-refactor");
const workflowDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.equal(workflowDoctor.status, 0, `${workflowDoctor.stdout}${workflowDoctor.stderr}`);

const acceptedTransitionRun = {
  ...appliedRun,
  workflow_next_command: "workflow-reviewer",
  accepted_task_ids: ["T2"],
  rework_task_ids: [],
};
writeFileSync(path.join(workflowRunDir, "run.json"), `${JSON.stringify(acceptedTransitionRun, null, 2)}\n`);
const workflowReapply = status(
  [
    "workflow",
    "apply",
    "--role",
    "workflow-reviewer",
    "--run",
    "run-fixture-001",
    "--artifact",
    path.join(".agent-surface", "workflows", "run-fixture-001", "reviewer.json"),
  ],
  { cwd: workflowDest },
);
assert.equal(workflowReapply.status, 0, `${workflowReapply.stdout}${workflowReapply.stderr}`);
const transitionedRun = JSON.parse(readFileSync(path.join(workflowRunDir, "run.json"), "utf8"));
assert.deepEqual(transitionedRun.accepted_task_ids, []);
assert.deepEqual(transitionedRun.rework_task_ids, ["T2"]);

writeFileSync(
  path.join(workflowRunDir, "run.json"),
  `${JSON.stringify({ ...transitionedRun, deferred_task_ids: ["T2"] }, null, 2)}\n`,
);
const contradictoryStateDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(contradictoryStateDoctor.status, 0);
assert.match(
  `${contradictoryStateDoctor.stdout}${contradictoryStateDoctor.stderr}`,
  /task T2 appears in mutually exclusive state buckets: rework_task_ids, deferred_task_ids/,
);
writeFileSync(path.join(workflowRunDir, "run.json"), `${JSON.stringify(transitionedRun, null, 2)}\n`);

writeFileSync(
  path.join(workflowRunDir, "run.json"),
  `${JSON.stringify({ ...transitionedRun, rework_task_ids: ["ORPHAN"] }, null, 2)}\n`,
);
const orphanTaskDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(orphanTaskDoctor.status, 0);
assert.match(`${orphanTaskDoctor.stdout}${orphanTaskDoctor.stderr}`, /task ORPHAN has no validated current or historical workflow-boss provenance/);
writeFileSync(path.join(workflowRunDir, "run.json"), `${JSON.stringify(transitionedRun, null, 2)}\n`);

const forgedBoss = structuredClone(provenanceBoss);
forgedBoss.round_id = 2;
forgedBoss.tasks[0].task_id = "FORGED";
forgedBoss.workflow.round_id = 2;
const forgedBossDir = path.join(workflowRunDir, "rounds", "round-002");
mkdirSync(forgedBossDir, { recursive: true });
writeFileSync(path.join(forgedBossDir, "boss.json"), `${JSON.stringify(forgedBoss, null, 2)}\n`);
writeFileSync(
  path.join(workflowRunDir, "run.json"),
  `${JSON.stringify({ ...transitionedRun, rework_task_ids: ["FORGED"] }, null, 2)}\n`,
);
const forgedHistoryDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(forgedHistoryDoctor.status, 0);
assert.match(
  `${forgedHistoryDoctor.stdout}${forgedHistoryDoctor.stderr}`,
  /boss artifact is not referenced by a validated workflow-boss event/,
);
const forgedHistoryApply = status(
  [
    "workflow",
    "apply",
    "--role",
    "workflow-reviewer",
    "--run",
    "run-fixture-001",
    "--artifact",
    path.join(".agent-surface", "workflows", "run-fixture-001", "reviewer.json"),
  ],
  { cwd: workflowDest },
);
assert.notEqual(forgedHistoryApply.status, 0);
assert.match(
  `${forgedHistoryApply.stdout}${forgedHistoryApply.stderr}`,
  /boss artifact is not referenced by a validated workflow-boss event/,
);
rmSync(forgedBossDir, { recursive: true, force: true });
writeFileSync(path.join(workflowRunDir, "run.json"), `${JSON.stringify(transitionedRun, null, 2)}\n`);

const bossTransitionDest = "/tmp/agent-surface-workflow-boss-transition";
rmSync(bossTransitionDest, { recursive: true, force: true });
const bossTransitionRunDir = path.join(bossTransitionDest, ".agent-surface", "workflows", "run-fixture-001");
const bossTransitionRoundOneDir = path.join(bossTransitionRunDir, "rounds", "round-001");
mkdirSync(bossTransitionRoundOneDir, { recursive: true });
writeFileSync(path.join(bossTransitionRoundOneDir, "boss.json"), provenanceBossText);
writeFileSync(path.join(bossTransitionRunDir, "events.ndjson"), `${JSON.stringify(provenanceEvent)}\n`);
writeFileSync(
  path.join(bossTransitionRunDir, "run.json"),
  `${JSON.stringify({
    ...workflowRun,
    current_round: 1,
    workflow_next_command: "workflow-boss",
    active_task_ids: ["T2"],
  }, null, 2)}\n`,
);
const nextBoss = structuredClone(provenanceBoss);
nextBoss.round_id = 2;
nextBoss.tasks[0].task_id = "T3";
nextBoss.workflow.round_id = 2;
nextBoss.run_state = {
  active_task_ids: ["T3"],
  accepted_task_ids: [],
  rework_task_ids: [],
  deferred_task_ids: [],
  closed_task_ids: [],
};
const nextBossText = `${JSON.stringify(nextBoss, null, 2)}\n`;
const bossTransitionRoundTwoDir = path.join(bossTransitionRunDir, "rounds", "round-002");
mkdirSync(bossTransitionRoundTwoDir, { recursive: true });
writeFileSync(path.join(bossTransitionRoundTwoDir, "boss.json"), nextBossText);
writeFileSync(path.join(bossTransitionRunDir, "boss.json"), nextBossText);
const nextBossApply = status(
  [
    "workflow",
    "apply",
    "--role",
    "workflow-boss",
    "--run",
    "run-fixture-001",
    "--artifact",
    path.join(".agent-surface", "workflows", "run-fixture-001", "rounds", "round-002", "boss.json"),
  ],
  { cwd: bossTransitionDest },
);
assert.equal(nextBossApply.status, 0, `${nextBossApply.stdout}${nextBossApply.stderr}`);
const nextBossRun = JSON.parse(readFileSync(path.join(bossTransitionRunDir, "run.json"), "utf8"));
assert.equal(nextBossRun.current_round, 2);
assert.deepEqual(nextBossRun.active_task_ids, ["T3"]);
assert.equal(nextBossRun.workflow_next_command, "dev-chore");
const nextBossEvents = readFileSync(path.join(bossTransitionRunDir, "events.ndjson"), "utf8")
  .trim()
  .split(/\r?\n/)
  .map((line) => JSON.parse(line));
assert.equal(nextBossEvents.at(-1).role, "workflow-boss");
assert.equal(nextBossEvents.at(-1).artifact_hash, `sha256:${sha256(nextBossText)}`);
const nextBossDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: bossTransitionDest });
assert.equal(nextBossDoctor.status, 0, `${nextBossDoctor.stdout}${nextBossDoctor.stderr}`);
rmSync(bossTransitionDest, { recursive: true, force: true });

// Partial boss run_state must not wipe omitted buckets (Object.hasOwn merge).
const partialBossDest = "/tmp/agent-surface-workflow-partial-boss-run-state";
rmSync(partialBossDest, { recursive: true, force: true });
const partialBossRunDir = path.join(partialBossDest, ".agent-surface", "workflows", "run-fixture-001");
const partialBossRoundOneDir = path.join(partialBossRunDir, "rounds", "round-001");
mkdirSync(partialBossRoundOneDir, { recursive: true });
writeFileSync(path.join(partialBossRoundOneDir, "boss.json"), provenanceBossText);
writeFileSync(path.join(partialBossRunDir, "events.ndjson"), `${JSON.stringify(provenanceEvent)}\n`);
writeFileSync(
  path.join(partialBossRunDir, "run.json"),
  `${JSON.stringify({
    ...workflowRun,
    current_round: 1,
    workflow_next_command: "workflow-boss",
    active_task_ids: [],
    accepted_task_ids: ["T2"],
    rework_task_ids: [],
    deferred_task_ids: [],
    closed_task_ids: [],
  }, null, 2)}\n`,
);
const partialBoss = structuredClone(provenanceBoss);
partialBoss.round_id = 2;
partialBoss.tasks[0].task_id = "T3";
partialBoss.workflow.round_id = 2;
partialBoss.run_state = {
  active_task_ids: ["T3"],
};
const partialBossText = `${JSON.stringify(partialBoss, null, 2)}\n`;
const partialBossRoundTwoDir = path.join(partialBossRunDir, "rounds", "round-002");
mkdirSync(partialBossRoundTwoDir, { recursive: true });
writeFileSync(path.join(partialBossRoundTwoDir, "boss.json"), partialBossText);
writeFileSync(path.join(partialBossRunDir, "boss.json"), partialBossText);
const partialBossApply = status(
  [
    "workflow",
    "apply",
    "--role",
    "workflow-boss",
    "--run",
    "run-fixture-001",
    "--artifact",
    path.join(".agent-surface", "workflows", "run-fixture-001", "rounds", "round-002", "boss.json"),
  ],
  { cwd: partialBossDest },
);
assert.equal(partialBossApply.status, 0, `${partialBossApply.stdout}${partialBossApply.stderr}`);
const partialBossRun = JSON.parse(readFileSync(path.join(partialBossRunDir, "run.json"), "utf8"));
assert.deepEqual(partialBossRun.active_task_ids, ["T3"]);
assert.deepEqual(partialBossRun.accepted_task_ids, ["T2"], "omitted accepted_task_ids must survive partial boss run_state");
assert.deepEqual(partialBossRun.rework_task_ids, []);
assert.deepEqual(partialBossRun.deferred_task_ids, []);
assert.deepEqual(partialBossRun.closed_task_ids, []);
rmSync(partialBossDest, { recursive: true, force: true });

const foreignRunDest = "/tmp/agent-surface-workflow-foreign-run";
rmSync(foreignRunDest, { recursive: true, force: true });
const foreignRunDir = path.join(foreignRunDest, ".agent-surface", "workflows", "run-fixture-001");
mkdirSync(foreignRunDir, { recursive: true });
const foreignBoss = structuredClone(provenanceBoss);
foreignBoss.run_id = "run-foreign";
foreignBoss.workflow.run_id = "run-foreign";
const foreignBossText = `${JSON.stringify(foreignBoss, null, 2)}\n`;
writeFileSync(path.join(foreignRunDir, "boss.json"), foreignBossText);
const foreignEventWithoutHash = {
  ...provenanceEventWithoutHash,
  event_id: "workflow-boss-foreign",
  run_id: "run-foreign",
  artifact: "boss.json",
  artifact_hash: `sha256:${sha256(foreignBossText)}`,
};
const foreignEvent = {
  ...foreignEventWithoutHash,
  event_hash: `sha256:${sha256(canonicalJson(foreignEventWithoutHash))}`,
};
writeFileSync(path.join(foreignRunDir, "events.ndjson"), `${JSON.stringify(foreignEvent)}\n`);
writeFileSync(
  path.join(foreignRunDir, "run.json"),
  `${JSON.stringify({ ...workflowRun, active_task_ids: ["T2"] }, null, 2)}\n`,
);
const foreignRunDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: foreignRunDest });
assert.notEqual(foreignRunDoctor.status, 0);
assert.match(`${foreignRunDoctor.stdout}${foreignRunDoctor.stderr}`, /run_id run-foreign does not match workflow run run-fixture-001/);
rmSync(foreignRunDest, { recursive: true, force: true });

const workflowMonitor = JSON.parse(readFileSync(path.join(root, "tests", "fixtures", "workflow", "monitor.json"), "utf8"));
mkdirSync(path.join(workflowRunDir, "monitor"), { recursive: true });
writeFileSync(path.join(workflowRunDir, "monitor", "worker-001.json"), '{"event":"materialized"}\n');
writeFileSync(path.join(workflowRunDir, "agents.json"), `${JSON.stringify(workflowMonitor, null, 2)}\n`);
const monitorDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.equal(monitorDoctor.status, 0, `${monitorDoctor.stdout}${monitorDoctor.stderr}`);

const missingOutputMonitor = structuredClone(workflowMonitor);
missingOutputMonitor.agents[0].materialized_outputs = [
  ".agent-surface/workflows/run-fixture-001/evidence/missing-output.json",
];
writeFileSync(path.join(workflowRunDir, "agents.json"), `${JSON.stringify(missingOutputMonitor, null, 2)}\n`);
const missingOutputDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(missingOutputDoctor.status, 0);
assert.match(`${missingOutputDoctor.stdout}${missingOutputDoctor.stderr}`, /materialized output does not exist/);

const preexistingOutputMonitor = structuredClone(workflowMonitor);
const currentAttempt = Date.now();
preexistingOutputMonitor.policy.time_to_first_output_ms = 1000;
preexistingOutputMonitor.policy.no_progress_timeout_ms = 600_000;
preexistingOutputMonitor.policy.role_timeout_ms = 600_000;
preexistingOutputMonitor.agents[0].status = "running";
preexistingOutputMonitor.agents[0].started_at = new Date(currentAttempt - 5000).toISOString();
preexistingOutputMonitor.agents[0].last_progress_at = new Date(currentAttempt).toISOString();
preexistingOutputMonitor.agents[0].budgets = {
  time_to_first_output_ms: 1000,
  no_progress_timeout_ms: 600_000,
  role_timeout_ms: 600_000,
};
preexistingOutputMonitor.agents[0].materialized_outputs = [
  ".agent-surface/workflows/run-fixture-001/run.json",
];
const oldOutputTimestamp = new Date(currentAttempt - 60_000);
utimesSync(path.join(workflowRunDir, "run.json"), oldOutputTimestamp, oldOutputTimestamp);
writeFileSync(path.join(workflowRunDir, "agents.json"), `${JSON.stringify(preexistingOutputMonitor, null, 2)}\n`);
const preexistingOutputDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(preexistingOutputDoctor.status, 0);
assert.match(`${preexistingOutputDoctor.stdout}${preexistingOutputDoctor.stderr}`, /workflow control file cannot be used as materialized output/);
assert.match(`${preexistingOutputDoctor.stdout}${preexistingOutputDoctor.stderr}`, /without materialized output/);

const reviewerControlOutputMonitor = structuredClone(preexistingOutputMonitor);
reviewerControlOutputMonitor.agents[0].agent_id = "reviewer-001";
reviewerControlOutputMonitor.agents[0].role_class = "reviewer";
utimesSync(path.join(workflowRunDir, "run.json"), new Date(currentAttempt), new Date(currentAttempt));
writeFileSync(path.join(workflowRunDir, "agents.json"), `${JSON.stringify(reviewerControlOutputMonitor, null, 2)}\n`);
const reviewerControlOutputDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(reviewerControlOutputDoctor.status, 0);
assert.match(`${reviewerControlOutputDoctor.stdout}${reviewerControlOutputDoctor.stderr}`, /workflow control file cannot be used as materialized output/);
assert.match(`${reviewerControlOutputDoctor.stdout}${reviewerControlOutputDoctor.stderr}`, /without materialized output/);

const staleOutputPath = path.join(workflowRunDir, "monitor", "stale-worker.json");
writeFileSync(staleOutputPath, '{"event":"from-prior-attempt"}\n');
utimesSync(staleOutputPath, oldOutputTimestamp, oldOutputTimestamp);
const staleOutputMonitor = structuredClone(preexistingOutputMonitor);
staleOutputMonitor.agents[0].materialized_outputs = [
  ".agent-surface/workflows/run-fixture-001/monitor/stale-worker.json",
];
writeFileSync(path.join(workflowRunDir, "agents.json"), `${JSON.stringify(staleOutputMonitor, null, 2)}\n`);
const staleOutputDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(staleOutputDoctor.status, 0);
assert.match(`${staleOutputDoctor.stdout}${staleOutputDoctor.stderr}`, /materialized output predates its current attempt/);
assert.match(`${staleOutputDoctor.stdout}${staleOutputDoctor.stderr}`, /without materialized output/);
rmSync(staleOutputPath, { force: true });

const futureOutputPath = path.join(workflowRunDir, "monitor", "future-worker.json");
writeFileSync(futureOutputPath, '{"event":"from-future"}\n');
const futureOutputTimestamp = new Date(currentAttempt + 3_600_000);
utimesSync(futureOutputPath, futureOutputTimestamp, futureOutputTimestamp);
const futureOutputMonitor = structuredClone(preexistingOutputMonitor);
futureOutputMonitor.agents[0].materialized_outputs = [
  ".agent-surface/workflows/run-fixture-001/monitor/future-worker.json",
];
writeFileSync(path.join(workflowRunDir, "agents.json"), `${JSON.stringify(futureOutputMonitor, null, 2)}\n`);
const futureOutputDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(futureOutputDoctor.status, 0);
assert.match(`${futureOutputDoctor.stdout}${futureOutputDoctor.stderr}`, /materialized output is in the future/);
assert.match(`${futureOutputDoctor.stdout}${futureOutputDoctor.stderr}`, /without materialized output/);
rmSync(futureOutputPath, { force: true });

const symlinkEscapeRoot = mkdtempSync("/tmp/agent-surface-monitor-escape-");
writeFileSync(path.join(symlinkEscapeRoot, "external.json"), '{"event":"outside"}\n');
symlinkSync(symlinkEscapeRoot, path.join(workflowRunDir, "escaped-monitor"));
const symlinkEscapeMonitor = structuredClone(workflowMonitor);
symlinkEscapeMonitor.agents[0].materialized_outputs = [
  ".agent-surface/workflows/run-fixture-001/escaped-monitor/external.json",
];
writeFileSync(path.join(workflowRunDir, "agents.json"), `${JSON.stringify(symlinkEscapeMonitor, null, 2)}\n`);
const symlinkEscapeDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(symlinkEscapeDoctor.status, 0);
assert.match(`${symlinkEscapeDoctor.stdout}${symlinkEscapeDoctor.stderr}`, /materialized output resolves outside the workflow run/);
unlinkSync(path.join(workflowRunDir, "escaped-monitor"));
rmSync(symlinkEscapeRoot, { recursive: true, force: true });

const overlappingWriters = structuredClone(workflowMonitor);
const currentMonitorTimestamp = new Date().toISOString();
overlappingWriters.agents[0].status = "running";
overlappingWriters.agents[0].workspace_ref = "/tmp/worktree-one";
overlappingWriters.agents[0].started_at = currentMonitorTimestamp;
overlappingWriters.agents[0].last_progress_at = currentMonitorTimestamp;
overlappingWriters.agents.push({
  ...structuredClone(overlappingWriters.agents[0]),
  agent_id: "worker-002",
  task_ids: ["T2"],
  workspace_ref: "/tmp/worktree-two",
});
writeFileSync(path.join(workflowRunDir, "agents.json"), `${JSON.stringify(overlappingWriters, null, 2)}\n`);
const overlappingWritersDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(overlappingWritersDoctor.status, 0);
assert.match(`${overlappingWritersDoctor.stdout}${overlappingWritersDoctor.stderr}`, /concurrent writers .* have overlapping filescope/);

const staleMonitor = structuredClone(workflowMonitor);
staleMonitor.policy.time_to_first_output_ms = 1000;
staleMonitor.policy.no_progress_timeout_ms = 1000;
staleMonitor.policy.role_timeout_ms = 1000;
staleMonitor.agents[0].status = "running";
staleMonitor.agents[0].started_at = "2026-01-01T00:00:00.000Z";
staleMonitor.agents[0].last_progress_at = "2026-01-01T00:00:00.000Z";
staleMonitor.agents[0].materialized_outputs = [];
writeFileSync(path.join(workflowRunDir, "agents.json"), `${JSON.stringify(staleMonitor, null, 2)}\n`);
const staleMonitorDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(staleMonitorDoctor.status, 0);
assert.match(`${staleMonitorDoctor.stdout}${staleMonitorDoctor.stderr}`, /exceeded no_progress_timeout_ms/);
assert.match(`${staleMonitorDoctor.stdout}${staleMonitorDoctor.stderr}`, /without materialized output/);

const futureMonitor = structuredClone(workflowMonitor);
futureMonitor.agents[0].status = "running";
futureMonitor.agents[0].started_at = new Date(Date.now() + 3_600_000).toISOString();
futureMonitor.agents[0].last_progress_at = new Date(Date.now() + 1_800_000).toISOString();
writeFileSync(path.join(workflowRunDir, "agents.json"), `${JSON.stringify(futureMonitor, null, 2)}\n`);
const futureMonitorDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(futureMonitorDoctor.status, 0);
assert.match(`${futureMonitorDoctor.stdout}${futureMonitorDoctor.stderr}`, /started_at is after last_progress_at/);
assert.match(`${futureMonitorDoctor.stdout}${futureMonitorDoctor.stderr}`, /started_at is in the future/);
assert.match(`${futureMonitorDoctor.stdout}${futureMonitorDoctor.stderr}`, /last_progress_at is in the future/);
rmSync(path.join(workflowRunDir, "agents.json"), { force: true });

const invalidBoss = JSON.parse(readFileSync(path.join(root, "tests", "fixtures", "workflow", "boss-chore.json"), "utf8"));
invalidBoss.tasks[0].suggested_runtime = "not-a-runtime";
writeFileSync(path.join(workflowRunDir, "boss.json"), `${JSON.stringify(invalidBoss, null, 2)}\n`);
const invalidRuntimeDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(invalidRuntimeDoctor.status, 0);
assert.match(`${invalidRuntimeDoctor.stdout}${invalidRuntimeDoctor.stderr}`, /suggested_runtime is not in the workflow runtime taxonomy/);
invalidBoss.tasks[0].suggested_runtime = "kilo-cli";
invalidBoss.tasks[0].parallel_group = "G1";
writeFileSync(path.join(workflowRunDir, "boss.json"), `${JSON.stringify(invalidBoss, null, 2)}\n`);
const invalidBossDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(invalidBossDoctor.status, 0);
assert.match(`${invalidBossDoctor.stdout}${invalidBossDoctor.stderr}`, /serial_required tasks must not set parallel_group/);
invalidBoss.tasks[0].isolation = "same_worktree_read_only";
invalidBoss.tasks[0].suggested_runtime = "kilo-cli";
invalidBoss.tasks[0].subagent_suitable = true;
writeFileSync(path.join(workflowRunDir, "boss.json"), `${JSON.stringify(invalidBoss, null, 2)}\n`);
const mixedFanoutDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(mixedFanoutDoctor.status, 0);
assert.match(
  `${mixedFanoutDoctor.stdout}${mixedFanoutDoctor.stderr}`,
  /parallel_group and subagent_suitable=true are mutually exclusive/,
);
delete invalidBoss.tasks[0].parallel_group;
invalidBoss.tasks[0].subagent_suitable = false;
invalidBoss.tasks[0].isolation = "separate_worktree";
invalidBoss.tasks[0].patch_required = false;
writeFileSync(path.join(workflowRunDir, "boss.json"), `${JSON.stringify(invalidBoss, null, 2)}\n`);
const unisolatedParallelDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(unisolatedParallelDoctor.status, 0);
assert.match(`${unisolatedParallelDoctor.stdout}${unisolatedParallelDoctor.stderr}`, /require patch_required=true/);
rmSync(path.join(workflowRunDir, "boss.json"), { force: true });
const noPatchWorker = JSON.parse(readFileSync(path.join(root, "tests", "fixtures", "workflow", "worker-chore.json"), "utf8"));
noPatchWorker.tasks_processed[0].patch_required = false;
for (const key of ["name_status_ref", "patch_ref", "patch_hash", "pre_tree_hash", "post_tree_hash", "applies_cleanly"]) {
  delete noPatchWorker.tasks_processed[0][key];
}
writeFileSync(path.join(workflowRunDir, "worker.json"), `${JSON.stringify(noPatchWorker, null, 2)}\n`);
const noPatchWorkerDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.equal(noPatchWorkerDoctor.status, 0, `${noPatchWorkerDoctor.stdout}${noPatchWorkerDoctor.stderr}`);
noPatchWorker.tasks_processed[0].patch_required = true;
writeFileSync(path.join(workflowRunDir, "worker.json"), `${JSON.stringify(noPatchWorker, null, 2)}\n`);
const missingRequiredPatchDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(missingRequiredPatchDoctor.status, 0);
assert.match(`${missingRequiredPatchDoctor.stdout}${missingRequiredPatchDoctor.stderr}`, /must have required property 'patch_ref'/);

const invalidBlockedWorker = JSON.parse(readFileSync(path.join(root, "tests", "fixtures", "workflow", "worker-blocked-legacy.json"), "utf8"));
delete invalidBlockedWorker.tasks_processed[0].blocker;
writeFileSync(path.join(workflowRunDir, "worker.json"), `${JSON.stringify(invalidBlockedWorker, null, 2)}\n`);
const invalidBlockedDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: workflowDest });
assert.notEqual(invalidBlockedDoctor.status, 0);
assert.match(`${invalidBlockedDoctor.stdout}${invalidBlockedDoctor.stderr}`, /worker\.json/);
rmSync(workflowDest, { recursive: true, force: true });

const patchDest = "/tmp/agent-surface-patch";
rmSync(patchDest, { recursive: true, force: true });
mkdirSync(path.join(patchDest, "src"), { recursive: true });
execFileSync("git", ["init"], { cwd: patchDest, encoding: "utf8" });
writeFileSync(path.join(patchDest, "src", "example.txt"), "before\n");
execFileSync("git", ["add", "src/example.txt"], { cwd: patchDest, encoding: "utf8" });
const unsafePatch = status(
  ["workflow", "patch", "begin", "--run", "run-fixture-001", "--round", "1", "--task", "T1", "--file", "../escape.txt"],
  { cwd: patchDest },
);
assert.notEqual(unsafePatch.status, 0);
assert.match(`${unsafePatch.stdout}${unsafePatch.stderr}`, /unsafe --file/);
const patchBegin = status(
  ["workflow", "patch", "begin", "--run", "run-fixture-001", "--round", "1", "--task", "T1", "--file", "src/example.txt"],
  { cwd: patchDest },
);
assert.equal(patchBegin.status, 0, `${patchBegin.stdout}${patchBegin.stderr}`);
writeFileSync(path.join(patchDest, "src", "example.txt"), "after\n");
const patchEnd = status(["workflow", "patch", "end", "--run", "run-fixture-001", "--round", "1", "--task", "T1"], {
  cwd: patchDest,
});
assert.equal(patchEnd.status, 0, `${patchEnd.stdout}${patchEnd.stderr}`);
const patchVerify = status(["workflow", "patch", "verify", "--run", "run-fixture-001", "--round", "1", "--task", "T1"], {
  cwd: patchDest,
});
assert.equal(patchVerify.status, 0, `${patchVerify.stdout}${patchVerify.stderr}`);
const patchManifest = JSON.parse(
  readFileSync(path.join(patchDest, ".agent-surface", "workflows", "run-fixture-001", "rounds", "round-001", "patches", "T1.patch.json"), "utf8"),
);
assert.equal(patchManifest.status, "verified");
assert.equal(patchManifest.applies_cleanly, true);
assert.deepEqual(patchManifest.changed_files, ["src/example.txt"]);
assert.match(patchManifest.patch_hash, /^sha256:[a-f0-9]{64}$/);
const patchRunDir = path.join(patchDest, ".agent-surface", "workflows", "run-fixture-001");
writeFileSync(path.join(patchRunDir, "run.json"), readFileSync(path.join(root, "tests", "fixtures", "workflow", "run.json"), "utf8"));
const patchBoss = JSON.parse(readFileSync(path.join(root, "tests", "fixtures", "workflow", "boss-chore.json"), "utf8"));
patchBoss.round_id = 1;
patchBoss.workflow.round_id = 1;
const patchBossText = `${JSON.stringify(patchBoss, null, 2)}\n`;
writeFileSync(path.join(patchRunDir, "rounds", "round-001", "boss.json"), patchBossText);
const patchBossEventWithoutHash = {
  event_id: "workflow-boss-patch-001",
  run_id: patchBoss.run_id,
  round_id: patchBoss.round_id,
  role: "workflow-boss",
  from: "workflow-boss",
  to: "dev-chore",
  artifact: "rounds/round-001/boss.json",
  artifact_hash: `sha256:${sha256(patchBossText)}`,
  timestamp: "2026-01-01T00:00:00.000Z",
  summary: "Initialized the patch-validation boss round.",
  prev_event_hash: null,
};
writeFileSync(
  path.join(patchRunDir, "events.ndjson"),
  `${JSON.stringify({
    ...patchBossEventWithoutHash,
    event_hash: `sha256:${sha256(canonicalJson(patchBossEventWithoutHash))}`,
  })}\n`,
);
const patchDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: patchDest });
assert.equal(patchDoctor.status, 0, `${patchDoctor.stdout}${patchDoctor.stderr}`);
const patchManifestPath = path.join(patchRunDir, "rounds", "round-001", "patches", "T1.patch.json");
writeFileSync(patchManifestPath, `${JSON.stringify({ ...patchManifest, patch_hash: `sha256:${"0".repeat(64)}` }, null, 2)}\n`);
const badPatchHashDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: patchDest });
assert.notEqual(badPatchHashDoctor.status, 0);
assert.match(`${badPatchHashDoctor.stdout}${badPatchHashDoctor.stderr}`, /patch_hash does not match/);
writeFileSync(patchManifestPath, `${JSON.stringify({ ...patchManifest, applies_cleanly: false }, null, 2)}\n`);
const badPatchDoctor = status(["workflow", "doctor", "--run", "run-fixture-001"], { cwd: patchDest });
assert.notEqual(badPatchDoctor.status, 0);
assert.match(`${badPatchDoctor.stdout}${badPatchDoctor.stderr}`, /applies_cleanly/);
rmSync(patchDest, { recursive: true, force: true });

// git quotes non-ASCII paths in line output, and hashing a symlink stores its target's bytes.
const pathsDest = "/tmp/agent-surface-patch-paths";
rmSync(pathsDest, { recursive: true, force: true });
mkdirSync(path.join(pathsDest, "src"), { recursive: true });
execFileSync("git", ["init"], { cwd: pathsDest, encoding: "utf8" });
const accentedFile = path.join("src", "café-ü.txt");
writeFileSync(path.join(pathsDest, accentedFile), "before\n");
writeFileSync(path.join(pathsDest, "outside.txt"), "outside\n");
execFileSync("git", ["add", "-A"], { cwd: pathsDest, encoding: "utf8" });
const pathsPatch = (subcommand, round, ...rest) => status(
  ["workflow", "patch", subcommand, "--run", "run-paths", "--round", String(round), "--task", "T1", ...rest],
  { cwd: pathsDest },
);
const accentedBegin = pathsPatch("begin", 1, "--file", "src");
assert.equal(accentedBegin.status, 0, `${accentedBegin.stdout}${accentedBegin.stderr}`);
writeFileSync(path.join(pathsDest, accentedFile), "after\n");
const accentedEnd = pathsPatch("end", 1);
assert.equal(accentedEnd.status, 0, `${accentedEnd.stdout}${accentedEnd.stderr}`);
const accentedVerify = pathsPatch("verify", 1);
assert.equal(accentedVerify.status, 0, `${accentedVerify.stdout}${accentedVerify.stderr}`);
const accentedPatchDir = path.join(pathsDest, ".agent-surface", "workflows", "run-paths", "rounds", "round-001", "patches");
assert.deepEqual(JSON.parse(readFileSync(path.join(accentedPatchDir, "T1.patch.json"), "utf8")).changed_files, ["src/café-ü.txt"]);
assert.match(readFileSync(path.join(accentedPatchDir, "T1.patch"), "utf8"), /^-before\n\+after$/m);
// A link is captured as git stores one, so the file it points at, here outside the
// scope, never enters the patch; an untouched link does not block a later round.
const symlinkBegin = pathsPatch("begin", 2, "--file", "src");
assert.equal(symlinkBegin.status, 0, `${symlinkBegin.stdout}${symlinkBegin.stderr}`);
symlinkSync(path.join("..", "outside.txt"), path.join(pathsDest, "src", "link.txt"));
for (const step of ["end", "verify"]) {
  const result = pathsPatch(step, 2);
  assert.equal(result.status, 0, `${step}: ${result.stdout}${result.stderr}`);
}
const linkPatch = readFileSync(path.join(pathsDest, ".agent-surface", "workflows", "run-paths", "rounds", "round-002", "patches", "T1.patch"), "utf8");
assert.match(linkPatch, /^new file mode 120000$/m);
assert.match(linkPatch, /^\+\.\.\/outside\.txt$/m);
assert.doesNotMatch(linkPatch, /^\+outside$/m, "the link target's content is not in the patch");
const untouchedLink = pathsPatch("begin", 3, "--file", "src");
assert.equal(untouchedLink.status, 0, `${untouchedLink.stdout}${untouchedLink.stderr}`);
// A tracked directory replaced by a link elsewhere is captured as git sees it, whether the scope
// names the directory (T1) or the file (T2): a file reached through the link, here one named like
// the tracked file, never enters the patch.
const fileScope = (subcommand, ...rest) => status(
  ["workflow", "patch", subcommand, "--run", "run-paths", "--round", "3", "--task", "T2", ...rest],
  { cwd: pathsDest },
);
const fileScopeBegin = fileScope("begin", "--file", accentedFile);
assert.equal(fileScopeBegin.status, 0, `${fileScopeBegin.stdout}${fileScopeBegin.stderr}`);
const linkedDirTarget = mkdtempSync("/tmp/agent-surface-patch-outside-");
writeFileSync(path.join(linkedDirTarget, "café-ü.txt"), "OUTSIDE_SENTINEL\n");
rmSync(path.join(pathsDest, "src"), { recursive: true, force: true });
symlinkSync(linkedDirTarget, path.join(pathsDest, "src"));
for (const [task, step] of [["T2", (name) => fileScope(name)], ["T1", (name) => pathsPatch(name, 3)]]) {
  for (const name of ["end", "verify"]) {
    const result = step(name);
    assert.equal(result.status, 0, `${task} ${name}: ${result.stdout}${result.stderr}`);
  }
  const patch = readFileSync(path.join(pathsDest, ".agent-surface", "workflows", "run-paths", "rounds", "round-003", "patches", `${task}.patch`), "utf8");
  assert.doesNotMatch(patch, /OUTSIDE_SENTINEL/, task);
}
rmSync(linkedDirTarget, { recursive: true, force: true });
rmSync(pathsDest, { recursive: true, force: true });

// Boss and close write the ledger only through the CLI: init, a boss apply, then close.
const lifecycleDest = "/tmp/agent-surface-workflow-lifecycle";
rmSync(lifecycleDest, { recursive: true, force: true });
mkdirSync(lifecycleDest, { recursive: true });
const lifecycleGit = (...args) => execFileSync("git", [
  "-c", "user.name=workflow", "-c", "user.email=workflow@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null",
  ...args,
], { cwd: lifecycleDest, encoding: "utf8" }).trim();
lifecycleGit("init");
writeFileSync(path.join(lifecycleDest, "README.md"), "lifecycle\n");
lifecycleGit("add", "README.md");
lifecycleGit("commit", "-m", "base");
const lifecycle = (...args) => status(["workflow", ...args], { cwd: lifecycleDest });
const lifecycleRunDir = path.join(lifecycleDest, ".agent-surface", "workflows", "run-fixture-001");
const currentPath = path.join(lifecycleDest, ".agent-surface", "workflows", "current.json");
const lifecycleInit = lifecycle("init", "--run", "run-fixture-001");
assert.equal(lifecycleInit.status, 0, `${lifecycleInit.stdout}${lifecycleInit.stderr}`);
const initRun = JSON.parse(readFileSync(path.join(lifecycleRunDir, "run.json"), "utf8"));
assert.equal(initRun.base_commit, lifecycleGit("rev-parse", "HEAD"));
assert.equal(initRun.base_tree_hash, lifecycleGit("rev-parse", "HEAD^{tree}"));
assert.equal(initRun.workflow_next_command, "workflow-boss");
assert.match(lifecycle("init", "--run", "run-fixture-001").stderr, /workflow run already exists/);
assert.equal(JSON.parse(readFileSync(currentPath, "utf8")).run_id, "run-fixture-001", "init points current.json at the new run");
assert.match(lifecycle("init", "--run", "run-fixture-002").stderr, /workflow run run-fixture-001 is still active; close it before starting another/);
assert.match(lifecycle("init", "--run", "current.json").stderr, /current\.json is reserved/);
const lifecycleBoss = JSON.parse(readFileSync(path.join(root, "tests", "fixtures", "workflow", "boss-chore.json"), "utf8"));
lifecycleBoss.run_state = { active_task_ids: ["T1"] };
const lifecycleBossText = `${JSON.stringify(lifecycleBoss, null, 2)}\n`;
mkdirSync(path.join(lifecycleRunDir, "rounds", "round-000"), { recursive: true });
writeFileSync(path.join(lifecycleRunDir, "rounds", "round-000", "boss.json"), lifecycleBossText);
writeFileSync(path.join(lifecycleRunDir, "boss.json"), lifecycleBossText);
// An artifact must live in the run directory itself, not behind a link to a file the run does not own.
const externalBossDir = mkdtempSync("/tmp/agent-surface-external-boss-");
writeFileSync(path.join(externalBossDir, "boss.json"), lifecycleBossText);
symlinkSync(path.join(externalBossDir, "boss.json"), path.join(lifecycleRunDir, "rounds", "round-000", "linked-boss.json"));
const linkedApply = lifecycle(
  "apply", "--role", "workflow-boss", "--run", "run-fixture-001",
  "--artifact", path.join(".agent-surface", "workflows", "run-fixture-001", "rounds", "round-000", "linked-boss.json"),
);
assert.notEqual(linkedApply.status, 0, "a linked artifact is refused");
assert.match(linkedApply.stderr, /artifact must be inside the workflow run directory/);
unlinkSync(path.join(lifecycleRunDir, "rounds", "round-000", "linked-boss.json"));
rmSync(externalBossDir, { recursive: true, force: true });
const lifecycleApply = lifecycle(
  "apply", "--role", "workflow-boss", "--run", "run-fixture-001",
  "--artifact", path.join(".agent-surface", "workflows", "run-fixture-001", "rounds", "round-000", "boss.json"),
);
assert.equal(lifecycleApply.status, 0, `${lifecycleApply.stdout}${lifecycleApply.stderr}`);
const activeDoctor = lifecycle("doctor", "--run", "run-fixture-001");
assert.equal(activeDoctor.status, 0, `${activeDoctor.stdout}${activeDoctor.stderr}`);
assert.equal(JSON.parse(readFileSync(currentPath, "utf8")).run_id, "run-fixture-001");
assert.match(lifecycle("close", "--run", "run-fixture-001", "--state", "done").stderr, /--state must be one of: closed, quarantined, aborted/);
const lifecycleClose = lifecycle("close", "--run", "run-fixture-001", "--state", "closed");
assert.equal(lifecycleClose.status, 0, `${lifecycleClose.stdout}${lifecycleClose.stderr}`);
const closedRun = JSON.parse(readFileSync(path.join(lifecycleRunDir, "run.json"), "utf8"));
assert.equal(closedRun.status, "closed");
assert.equal(closedRun.workflow_next_command, null);
const lifecycleEvents = readFileSync(path.join(lifecycleRunDir, "events.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
assert.deepEqual(lifecycleEvents.map((event) => [event.role, event.from, event.to]), [
  ["workflow-boss", "workflow-boss", "dev-chore"],
  ["workflow-close", "dev-chore", null],
]);
assert.equal(JSON.parse(readFileSync(currentPath, "utf8")).run_id, null);
const closedDoctor = lifecycle("doctor", "--run", "run-fixture-001");
assert.equal(closedDoctor.status, 0, `${closedDoctor.stdout}${closedDoctor.stderr}`);

// A terminal state is final: another state and further applies are refused, and rerunning
// the same state appends nothing.
const lifecycleEventCount = () => readFileSync(path.join(lifecycleRunDir, "events.ndjson"), "utf8").trim().split("\n").length;
const reclose = lifecycle("close", "--run", "run-fixture-001", "--state", "aborted");
assert.notEqual(reclose.status, 0);
assert.match(reclose.stderr, /workflow run is already closed; it cannot be closed as aborted/);
assert.equal(JSON.parse(readFileSync(path.join(lifecycleRunDir, "run.json"), "utf8")).status, "closed");
const closedApply = lifecycle(
  "apply", "--role", "workflow-boss", "--run", "run-fixture-001",
  "--artifact", path.join(".agent-surface", "workflows", "run-fixture-001", "rounds", "round-000", "boss.json"),
);
assert.notEqual(closedApply.status, 0);
assert.match(closedApply.stderr, /workflow run is closed; apply needs an active run/);
assert.equal(lifecycleEventCount(), 2);

// A close interrupted after run.json but before its event fails doctor until the same
// close is rerun.
const interruptedEvents = path.join(lifecycleRunDir, "events.ndjson");
const fullLog = readFileSync(interruptedEvents, "utf8");
writeFileSync(interruptedEvents, `${fullLog.trim().split("\n").slice(0, -1).join("\n")}\n`);
const interruptedDoctor = lifecycle("doctor", "--run", "run-fixture-001");
assert.notEqual(interruptedDoctor.status, 0);
assert.match(interruptedDoctor.stderr, /run\.json is closed but events\.ndjson ends without its close event; rerun `agent-surface workflow close --run run-fixture-001 --state closed`/);
const finishClose = lifecycle("close", "--run", "run-fixture-001", "--state", "closed");
assert.equal(finishClose.status, 0, `${finishClose.stdout}${finishClose.stderr}`);
const finishedDoctor = lifecycle("doctor", "--run", "run-fixture-001");
assert.equal(finishedDoctor.status, 0, `${finishedDoctor.stdout}${finishedDoctor.stderr}`);

// Closing one run never clears a pointer that names another.
const secondInit = lifecycle("init", "--run", "run-fixture-002");
assert.equal(secondInit.status, 0, `${secondInit.stdout}${secondInit.stderr}`);
const sameStateClose = lifecycle("close", "--run", "run-fixture-001", "--state", "closed");
assert.equal(sameStateClose.status, 0, `${sameStateClose.stdout}${sameStateClose.stderr}`);
assert.equal(lifecycleEventCount(), 2);
assert.equal(JSON.parse(readFileSync(currentPath, "utf8")).run_id, "run-fixture-002");
const secondClose = lifecycle("close", "--run", "run-fixture-002", "--state", "aborted");
assert.equal(secondClose.status, 0, `${secondClose.stdout}${secondClose.stderr}`);
assert.equal(JSON.parse(readFileSync(currentPath, "utf8")).run_id, null);
rmSync(lifecycleDest, { recursive: true, force: true });

console.log("workflow: ok");
