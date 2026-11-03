// The workflow subsystem: the `workflow` command tree (init, doctor, apply, close,
// patch) that drives the validated run ledger under .agent-surface/workflows/<run_id>.
// Owns run.json ledger advancement, the hash-chained events.ndjson (the chain catches
// hand edits, not a rewrite that recomputes hashes), and git-tree-based patch
// capture/verify. Schema validation lives in check.mjs.
import { spawnSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { checkBossArtifactCoherence, createAjv, formatAjvErrors, readWorkflowJson, validateWorkflowJson, validateWorkflowPatchManifests, workflowSchemaFiles } from "./check.mjs";
import { readFileIfExists } from "./io.mjs";
import { gitNulFields, gitOutput, gitValue } from "./proc.mjs";
import { root } from "./registry.mjs";
import { argValues, canonicalJson, exists, fail, isPathInside, isSafeRelativePath, requiredArgValue, safeFilename, sha256, uniqueStrings } from "./util.mjs";

const workflowTaskStateKeys = [
  "active_task_ids",
  "accepted_task_ids",
  "rework_task_ids",
  "deferred_task_ids",
  "closed_task_ids",
];
const workflowClockSkewMs = 60_000;
const workflowCloseStates = ["closed", "quarantined", "aborted"];

export async function workflow(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === "init") {
    await workflowInit(rest);
    return;
  }
  if (subcommand === "doctor") {
    await workflowDoctor(rest);
    return;
  }
  if (subcommand === "apply") {
    await workflowApply(rest);
    return;
  }
  if (subcommand === "close") {
    await workflowClose(rest);
    return;
  }
  if (subcommand === "patch") {
    await workflowPatch(rest);
    return;
  }
  fail("workflow requires init, doctor, apply, close, or patch");
}

// Creates run.json bound to the current git HEAD, an empty event log, and a current.json
// naming the run; the first workflow-boss apply appends the first event. One run is
// active per checkout, so init refuses while current.json names another active run. The
// check is not atomic: like apply, lifecycle commands assume one controller at a time.
async function workflowInit(args) {
  const runId = requiredSafeId(args, "--run");
  const runDir = workflowRunDir(runId);
  const runPath = path.join(runDir, "run.json");
  const eventsPath = path.join(runDir, "events.ndjson");
  if (await exists(runPath) || await exists(eventsPath)) fail(`workflow run already exists: ${path.relative(process.cwd(), runDir)}`);
  const activeRunId = await workflowCurrentRunId(path.dirname(runDir));
  if (activeRunId && activeRunId !== runId && (await workflowRunStatus(activeRunId)) === "active") {
    fail(`workflow run ${activeRunId} is still active; close it before starting another`);
  }
  const baseCommit = gitValue(["rev-parse", "HEAD"]) ?? fail("workflow init requires a git repository with a commit");
  const runData = {
    schema_version: "workflow.v3",
    status: "active",
    run_id: runId,
    branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
    base_commit: baseCommit,
    base_tree_hash: gitValue(["rev-parse", "HEAD^{tree}"]),
    current_round: 0,
    workflow_next_command: "workflow-boss",
    ...Object.fromEntries(workflowTaskStateKeys.map((key) => [key, []])),
    last_artifact_hashes: {},
  };
  await writeWorkflowFile(runPath, `${JSON.stringify(runData, null, 2)}\n`);
  await writeWorkflowFile(eventsPath, "");
  await writeWorkflowCurrent(runDir, runId, runData);
  console.log(`workflow init: ok (${path.relative(process.cwd(), runPath)})`);
}

// Records a terminal state through the same event writer as apply. Like apply, it
// refuses an invalid run.json or a broken event chain rather than append to it. A
// terminal state is final; rerunning the same state only finishes a partial close.
async function workflowClose(args) {
  const runId = requiredSafeId(args, "--run");
  const state = requiredArgValue(args, "--state");
  if (!workflowCloseStates.includes(state)) fail(`--state must be one of: ${workflowCloseStates.join(", ")}`);
  const runDir = workflowRunDir(runId);
  const runPath = path.join(runDir, "run.json");
  const errors = [];
  const schemas = await workflowSchemaValidators(errors);
  const runData = await readWorkflowJson(runPath, schemas.get("workflow.run.schema.json"), errors);
  if (runData && runData.run_id !== runId) errors.push(`run.json: run_id ${runData.run_id} does not match --run ${runId}`);
  const { events } = await readWorkflowEvents(path.join(runDir, "events.ndjson"), schemas, errors, runId);
  if (runData && runData.status !== "active" && runData.status !== state) {
    errors.push(`workflow run is already ${runData.status}; it cannot be closed as ${state}`);
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }
  if (runData.status === state && events.at(-1)?.role === "workflow-close") {
    await writeWorkflowCurrent(runDir, runId, runData);
    console.log(`workflow close: ok (already ${state})`);
    return;
  }

  const fromCommand = runData.workflow_next_command ?? null;
  runData.status = state;
  runData.workflow_next_command = null;
  await writeWorkflowFile(runPath, `${JSON.stringify(runData, null, 2)}\n`);
  const eventHash = await appendWorkflowEvent(runDir, {
    event_id: `workflow-close-${Date.now()}`,
    run_id: runId,
    round_id: runData.current_round,
    role: "workflow-close",
    from: fromCommand,
    to: null,
    timestamp: new Date().toISOString(),
    summary: `Closed the run as ${state}.`,
  });
  await writeWorkflowCurrent(runDir, runId, runData);
  console.log(`workflow close: ok (${state})`);
  console.log(`event_hash: ${eventHash}`);
}

async function workflowDoctor(args) {
  const runId = requiredSafeId(args, "--run");
  const runDir = workflowRunDir(runId);
  const errors = [];
  const schemas = await workflowSchemaValidators(errors);
  const requiredFiles = ["run.json", "events.ndjson"];

  for (const file of requiredFiles) {
    if (!(await exists(path.join(runDir, file)))) errors.push(`missing workflow file: ${file}`);
  }

  const runData = await readWorkflowJson(path.join(runDir, "run.json"), schemas.get("workflow.run.schema.json"), errors);
  if (runData && runData.run_id !== runId) {
    errors.push(`run.json: run_id ${runData.run_id} does not match --run ${runId}`);
  }
  const eventsPath = path.join(runDir, "events.ndjson");
  const { events, lastTransition } = await readWorkflowEvents(eventsPath, schemas, errors, runId);
  const bossHistory = await readWorkflowBossHistory(runDir, schemas, events, errors, { expectedRunId: runId });
  for (const [file, schemaName] of [
    ["worker.json", "workflow.worker.schema.json"],
    ["reviewer.json", "workflow.reviewer.schema.json"],
    ["judger.json", "workflow.judger.schema.json"],
    ["rescue.json", "workflow.rescue.schema.json"],
  ]) {
    const artifact = path.join(runDir, file);
    if (await exists(artifact)) await validateWorkflowJson(artifact, schemas.get(schemaName), errors);
  }
  if (runData) errors.push(...workflowTaskStateErrors(runData, bossHistory, "run.json"));

  const monitorPath = path.join(runDir, "agents.json");
  if (await exists(monitorPath)) {
    const monitor = await readWorkflowJson(monitorPath, schemas.get("workflow.monitor.schema.json"), errors);
    if (monitor) errors.push(...await workflowMonitorErrors(monitor, runData, runDir));
  }
  await validateWorkflowPatchManifests(runDir, schemas.get("workflow.patch.schema.json"), errors);

  // apply writes run.json and its event together, so a mismatch means run.json was
  // edited by hand or an apply did not finish. An artifact that was never applied
  // changes neither file and passes this check.
  if (runData && lastTransition && runData.status === "active") {
    const ledgerNext = runData.workflow_next_command ?? null;
    const transitionTo = lastTransition.to ?? null;
    if (ledgerNext !== transitionTo) {
      errors.push(
        `run.json.workflow_next_command (${JSON.stringify(ledgerNext)}) does not match the latest transition in events.ndjson (to=${JSON.stringify(transitionTo)}); run.json changed outside a completed \`agent-surface workflow apply\``,
      );
    }
  }
  // close writes run.json before its event, so a terminal run whose last event is not
  // the close was interrupted; rerunning the same close appends the missing event.
  if (runData && runData.status !== "active" && events.at(-1)?.role !== "workflow-close") {
    errors.push(`run.json is ${runData.status} but events.ndjson ends without its close event; rerun \`agent-surface workflow close --run ${runId} --state ${runData.status}\``);
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`workflow doctor: ok (${path.relative(process.cwd(), runDir)})`);
}

// apply checks schemas, owner, run_id, an active run, boss provenance of task IDs,
// and bucket coherence. It trusts the caller for the rest: one writer at a time (concurrent
// applies lose events), only the current round's artifact for the role run.json
// routes to, and a run_state_update that matches the artifact's verdict.
async function workflowApply(args) {
  const role = requiredArgValue(args, "--role");
  const runId = requiredSafeId(args, "--run");
  const artifactArg = requiredArgValue(args, "--artifact");
  const runDir = workflowRunDir(runId);
  const artifactPath = path.resolve(artifactArg);
  const roleSchemas = {
    "workflow-boss": "workflow.boss.schema.json",
    "dev-feature": "workflow.worker.schema.json",
    "dev-fix": "workflow.worker.schema.json",
    "dev-chore": "workflow.worker.schema.json",
    "dev-refactor": "workflow.worker.schema.json",
    "workflow-reviewer": "workflow.reviewer.schema.json",
    "workflow-judger": "workflow.judger.schema.json",
    "workflow-rescue": "workflow.rescue.schema.json",
  };
  const schemaName = roleSchemas[role] ?? fail(`unsupported workflow apply role: ${role}`);
  const errors = [];
  const schemas = await workflowSchemaValidators(errors);
  const runPath = path.join(runDir, "run.json");

  // Physically inside: an artifact behind a link would leave the run's history depending on a file
  // the run does not own. A missing file keeps its lexical check and fails below as unreadable.
  const realArtifact = await realpath(artifactPath).catch(() => artifactPath);
  const realRunDir = await realpath(runDir).catch(() => runDir);
  if (!isPathInside(runDir, artifactPath) || !isPathInside(realRunDir, realArtifact)) fail("artifact must be inside the workflow run directory");

  const runData = await readWorkflowJson(runPath, schemas.get("workflow.run.schema.json"), errors);
  const artifact = await readWorkflowJson(artifactPath, schemas.get(schemaName), errors);
  if (runData && runData.run_id !== runId) {
    errors.push(`run.json: run_id ${runData.run_id} does not match --run ${runId}`);
  }
  if (runData && runData.status !== "active") errors.push(`workflow run is ${runData.status}; apply needs an active run`);
  if (artifact && (artifact.run_id !== runId || artifact.workflow?.run_id !== runId)) {
    errors.push(`artifact run_id does not match --run ${runId}`);
  }
  const artifactHash = artifact ? `sha256:${sha256(await readFile(artifactPath))}` : null;
  const { events } = await readWorkflowEvents(path.join(runDir, "events.ndjson"), schemas, errors, runId);
  const bossHistory = await readWorkflowBossHistory(runDir, schemas, events, errors, {
    expectedRunId: runId,
    pendingUnlinkedBossHashes: role === "workflow-boss" && artifactHash ? new Set([artifactHash]) : new Set(),
  });
  const artifactBossHistory = role === "workflow-boss"
    ? extendBossHistory(bossHistory, artifact)
    : bossHistory;
  if (role === "workflow-boss") {
    checkBossArtifactCoherence(artifact, path.relative(process.cwd(), artifactPath), errors);
  }
  if (runData) errors.push(...workflowTaskStateErrors(runData, bossHistory, "run.json"));
  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  if (artifact.workflow?.owner !== role) fail("artifact owner does not match --role");

  const fromCommand = runData.workflow_next_command ?? null;
  const nextCommand = artifact.workflow.next_command ?? null;
  const update = artifact.run_state_update ?? {};
  const updateErrors = workflowTaskStateErrors(update, artifactBossHistory, "artifact run_state_update", false);
  if (updateErrors.length > 0) fail(updateErrors.join("; "));
  const moved = new Set(workflowTaskStateKeys.flatMap((key) => Array.isArray(update[key]) ? update[key] : []));

  runData.current_round = Math.max(runData.current_round, artifact.round_id);
  runData.workflow_next_command = nextCommand;
  for (const key of workflowTaskStateKeys) {
    runData[key] = uniqueStrings([
      ...(runData[key] ?? []).filter((taskId) => !moved.has(taskId)),
      ...(update[key] ?? []),
    ]);
  }
  if (role === "workflow-boss" && artifact.run_state) {
    for (const key of workflowTaskStateKeys) {
      if (Object.hasOwn(artifact.run_state, key)) {
        runData[key] = uniqueStrings(artifact.run_state[key] ?? []);
      }
    }
  }
  runData.last_artifact_hashes = {
    ...(runData.last_artifact_hashes ?? {}),
    [role]: artifactHash,
  };
  if (role === "workflow-judger" && ["MERGE", "MERGE_PARTIAL"].includes(artifact.final_verdict) && nextCommand === "workflow-close") {
    runData.workflow_next_command = "workflow-close";
  }

  const nextStateErrors = workflowTaskStateErrors(runData, artifactBossHistory, "run.json");
  if (nextStateErrors.length > 0) fail(`updated run state is incoherent: ${nextStateErrors.join("; ")}`);

  const runValidate = schemas.get("workflow.run.schema.json");
  if (runValidate && !runValidate(runData)) {
    fail(`updated run.json failed schema validation: ${formatAjvErrors(runValidate.errors)}`);
  }

  await writeWorkflowFile(runPath, `${JSON.stringify(runData, null, 2)}\n`);
  const eventHash = await appendWorkflowEvent(runDir, {
    event_id: `${safeFilename(role)}-${Date.now()}`,
    run_id: runId,
    round_id: artifact.round_id,
    role,
    from: fromCommand,
    to: nextCommand ?? null,
    artifact: path.relative(runDir, artifactPath),
    artifact_hash: artifactHash,
    timestamp: new Date().toISOString(),
    summary: `Applied ${role} state update.`,
  });
  await writeWorkflowCurrent(runDir, runId, runData);

  console.log(`workflow apply: ok (${role})`);
  console.log(`run: ${path.relative(process.cwd(), runPath)}`);
  console.log(`event_hash: ${eventHash}`);
}

function workflowTaskStateErrors(state, bossHistory = null, source = "run.json", requireCurrentTasks = true) {
  if (!state || typeof state !== "object") return [];

  const errors = [];
  const memberships = new Map();
  for (const key of workflowTaskStateKeys) {
    for (const taskId of Array.isArray(state[key]) ? state[key] : []) {
      const keys = memberships.get(taskId) ?? [];
      keys.push(key);
      memberships.set(taskId, keys);
    }
  }

  for (const [taskId, keys] of memberships) {
    if (keys.length > 1) {
      errors.push(`${source}: task ${taskId} appears in mutually exclusive state buckets: ${keys.join(", ")}`);
    }
  }

  const allowedTaskIds = bossHistory?.allowedTaskIds ?? new Set();
  for (const taskId of memberships.keys()) {
    if (!allowedTaskIds.has(taskId)) {
      errors.push(`${source}: task ${taskId} has no validated current or historical workflow-boss provenance`);
    }
  }

  if (requireCurrentTasks) {
    for (const taskId of bossHistory?.currentTaskIds ?? []) {
      if (!memberships.has(taskId)) errors.push(`${source}: boss task ${taskId} is missing from every task-state bucket`);
    }
  }

  return errors;
}

async function readWorkflowBossHistory(runDir, schemas, events, errors, options = {}) {
  const artifacts = [];
  const pendingArtifacts = [];
  const expectedRunId = options.expectedRunId ?? null;
  const pendingUnlinkedBossHashes = options.pendingUnlinkedBossHashes ?? new Set();
  const eventBackedBosses = new Set(
    events
      .filter((event) => event.role === "workflow-boss" && typeof event.artifact_hash === "string")
      .map((event) => `${event.run_id}\0${event.round_id}\0${event.artifact_hash}`),
  );
  const addArtifact = async (artifactPath, expectedRoundId = null) => {
    const errorCount = errors.length;
    const boss = await readWorkflowJson(artifactPath, schemas.get("workflow.boss.schema.json"), errors);
    if (!boss) return;
    checkBossArtifactCoherence(boss, path.relative(process.cwd(), artifactPath), errors);
    if (expectedRunId !== null && (boss.run_id !== expectedRunId || boss.workflow?.run_id !== expectedRunId)) {
      errors.push(`${path.relative(process.cwd(), artifactPath)}: boss run_id does not match workflow run ${expectedRunId}`);
    }
    if (errors.length !== errorCount) return;
    if (expectedRoundId !== null && boss.round_id !== expectedRoundId) {
      errors.push(`${path.relative(process.cwd(), artifactPath)}: round_id does not match its canonical round directory`);
      return;
    }
    const artifactHash = `sha256:${sha256(await readFile(artifactPath))}`;
    const provenanceKey = `${boss.run_id}\0${boss.round_id}\0${artifactHash}`;
    if (eventBackedBosses.has(provenanceKey)) {
      artifacts.push({ boss, artifactPath, artifactHash });
    } else if (pendingUnlinkedBossHashes.has(artifactHash)) {
      pendingArtifacts.push({ boss, artifactPath, artifactHash });
    } else {
      errors.push(`${path.relative(process.cwd(), artifactPath)}: boss artifact is not referenced by a validated workflow-boss event`);
    }
  };

  const rootBossPath = path.join(runDir, "boss.json");
  if (await exists(rootBossPath)) await addArtifact(rootBossPath);

  const roundsDir = path.join(runDir, "rounds");
  try {
    const entries = await readdir(roundsDir, { withFileTypes: true });
    for (const entry of entries
      .filter((item) => item.isDirectory() && /^round-\d+$/.test(item.name))
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const bossPath = path.join(roundsDir, entry.name, "boss.json");
      if (await exists(bossPath)) await addArtifact(bossPath, Number(entry.name.slice("round-".length)));
    }
  } catch (error) {
    if (error?.code !== "ENOENT") errors.push(`failed to read workflow boss history: ${error.message}`);
  }

  const visibleArtifacts = [...artifacts, ...pendingArtifacts];
  const rootArtifact = visibleArtifacts.find((item) => item.artifactPath === rootBossPath) ?? null;
  const latestCanonical = visibleArtifacts
    .filter((item) => item.artifactPath !== rootBossPath)
    .sort((left, right) => (right.boss.round_id ?? -1) - (left.boss.round_id ?? -1))[0] ?? null;
  if (rootArtifact && latestCanonical && rootArtifact.artifactHash !== latestCanonical.artifactHash) {
    errors.push(`${path.relative(process.cwd(), rootBossPath)}: latest-role copy does not match the latest canonical workflow-boss artifact`);
  }
  const latestEventBackedBoss = artifacts
    .filter((item) => item.artifactPath !== rootBossPath)
    .sort((left, right) => (right.boss.round_id ?? -1) - (left.boss.round_id ?? -1))[0]?.boss
    ?? artifacts.find((item) => item.artifactPath === rootBossPath)?.boss
    ?? null;
  return {
    allowedTaskIds: new Set(artifacts.flatMap((item) => item.boss.tasks?.map((task) => task.task_id) ?? [])),
    currentTaskIds: new Set(latestEventBackedBoss?.tasks?.map((task) => task.task_id) ?? []),
  };
}

async function readWorkflowEvents(eventsPath, schemas, errors, expectedRunId = null) {
  const events = [];
  let lastTransition = null;
  if (!(await exists(eventsPath))) return { events, lastTransition };

  const text = await readFile(eventsPath, "utf8");
  let previousHash = null;
  for (const [index, line] of text.split(/\r?\n/).filter(Boolean).entries()) {
    const errorCount = errors.length;
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      errors.push(`events.ndjson:${index + 1}: invalid JSON: ${error.message}`);
      continue;
    }
    const validate = schemas.get("workflow.event.schema.json");
    if (validate && !validate(event)) errors.push(`events.ndjson:${index + 1}: ${formatAjvErrors(validate.errors)}`);
    if (expectedRunId !== null && event.run_id !== expectedRunId) {
      errors.push(`events.ndjson:${index + 1}: run_id ${event.run_id} does not match workflow run ${expectedRunId}`);
    }
    if (event.prev_event_hash !== previousHash) {
      errors.push(`events.ndjson:${index + 1}: prev_event_hash does not match previous event`);
    }
    const { event_hash: eventHash, ...eventWithoutHash } = event;
    const computedHash = `sha256:${sha256(canonicalJson(eventWithoutHash))}`;
    if (eventHash !== computedHash) {
      errors.push(`events.ndjson:${index + 1}: event_hash does not match event content`);
    }
    previousHash = event.event_hash;
    if (errors.length !== errorCount) continue;
    events.push(event);
    if ("to" in event) lastTransition = event;
  }
  return { events, lastTransition };
}

function extendBossHistory(history, boss) {
  const taskIds = new Set(boss?.tasks?.map((task) => task.task_id) ?? []);
  return {
    allowedTaskIds: new Set([...(history?.allowedTaskIds ?? []), ...taskIds]),
    currentTaskIds: taskIds,
  };
}

async function workflowMonitorErrors(monitor, runData, runDir, nowMs = Date.now()) {
  const errors = [];
  const realRunDir = await realpath(runDir);
  if (runData && monitor.run_id !== runData.run_id) {
    errors.push(`agents.json: run_id ${monitor.run_id} does not match run.json ${runData.run_id}`);
  }

  const policy = monitor.policy ?? {};
  const agents = Array.isArray(monitor.agents) ? monitor.agents : [];
  const knownTaskIds = new Set(
    workflowTaskStateKeys.flatMap((key) => Array.isArray(runData?.[key]) ? runData[key] : []),
  );
  for (const agent of agents) {
    for (const taskId of Array.isArray(agent.task_ids) ? agent.task_ids : []) {
      if (runData && !knownTaskIds.has(taskId)) {
        errors.push(`agents.json: agent ${agent.agent_id} references unknown task ${taskId}`);
      }
    }
  }
  const activeWriters = agents.filter(
    (agent) => agent.role_class === "worker" && ["starting", "running"].includes(agent.status),
  );
  for (let leftIndex = 0; leftIndex < activeWriters.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < activeWriters.length; rightIndex += 1) {
      const left = activeWriters[leftIndex];
      const right = activeWriters[rightIndex];
      if (!left.workspace_ref || !right.workspace_ref || left.workspace_ref === right.workspace_ref) {
        errors.push(`agents.json: concurrent writers ${left.agent_id} and ${right.agent_id} require distinct workspace_ref values`);
      }
      if (filescopesOverlap(left.filescope, right.filescope)) {
        errors.push(`agents.json: concurrent writers ${left.agent_id} and ${right.agent_id} have overlapping filescope`);
      }
    }
  }

  for (const agent of agents) {
    if ((agent.retry_count ?? 0) > (policy.max_stall_retries ?? 0)) {
      errors.push(`agents.json: agent ${agent.agent_id} exceeded max_stall_retries`);
    }
    if (agent.status === "stalled") {
      errors.push(`agents.json: agent ${agent.agent_id} is stalled and must be retried, marked stale, or closed before routing`);
    }
    const budgets = { ...policy, ...(agent.budgets ?? {}) };
    const startedAt = Date.parse(agent.started_at);
    const lastProgressAt = Date.parse(agent.last_progress_at);
    const validOutputs = [];
    for (const outputRef of Array.isArray(agent.materialized_outputs) ? agent.materialized_outputs : []) {
      const outputPath = path.resolve(outputRef);
      if (!isPathInside(runDir, outputPath)) {
        errors.push(`agents.json: agent ${agent.agent_id} materialized output escapes the workflow run: ${outputRef}`);
      } else if (!(await exists(outputPath))) {
        errors.push(`agents.json: agent ${agent.agent_id} materialized output does not exist: ${outputRef}`);
      } else {
        const outputStat = await lstat(outputPath);
        if (!outputStat.isFile() || outputStat.size === 0) {
          errors.push(`agents.json: agent ${agent.agent_id} materialized output is not a non-empty regular file: ${outputRef}`);
        } else {
          try {
            const realOutputPath = await realpath(outputPath);
            if (!isPathInside(realRunDir, realOutputPath)) {
              errors.push(`agents.json: agent ${agent.agent_id} materialized output resolves outside the workflow run: ${outputRef}`);
            } else {
              const relativeOutput = path.relative(realRunDir, realOutputPath);
              const workflowControlFiles = new Set(["agents.json", "boss.json", "events.ndjson", "run.json"]);
              if (workflowControlFiles.has(relativeOutput)) {
                errors.push(`agents.json: agent ${agent.agent_id} workflow control file cannot be used as materialized output: ${outputRef}`);
              } else if (Number.isFinite(startedAt) && outputStat.mtimeMs < startedAt) {
                errors.push(`agents.json: agent ${agent.agent_id} materialized output predates its current attempt: ${outputRef}`);
              } else if (outputStat.mtimeMs > nowMs + workflowClockSkewMs) {
                errors.push(`agents.json: agent ${agent.agent_id} materialized output is in the future: ${outputRef}`);
              } else {
                validOutputs.push(outputRef);
              }
            }
          } catch (error) {
            errors.push(`agents.json: agent ${agent.agent_id} materialized output cannot be resolved: ${outputRef}: ${error.message}`);
          }
        }
      }
    }
    if (!["starting", "running"].includes(agent.status)) continue;

    if (Number.isFinite(startedAt) && Number.isFinite(lastProgressAt) && startedAt > lastProgressAt) {
      errors.push(`agents.json: agent ${agent.agent_id} started_at is after last_progress_at`);
    }
    if (Number.isFinite(startedAt) && startedAt > nowMs + workflowClockSkewMs) {
      errors.push(`agents.json: agent ${agent.agent_id} started_at is in the future`);
    }
    if (Number.isFinite(lastProgressAt) && lastProgressAt > nowMs + workflowClockSkewMs) {
      errors.push(`agents.json: agent ${agent.agent_id} last_progress_at is in the future`);
    }
    if (Number.isFinite(startedAt) && nowMs - startedAt > budgets.role_timeout_ms) {
      errors.push(`agents.json: agent ${agent.agent_id} exceeded role_timeout_ms`);
    }
    if (Number.isFinite(lastProgressAt) && nowMs - lastProgressAt > budgets.no_progress_timeout_ms) {
      errors.push(`agents.json: agent ${agent.agent_id} exceeded no_progress_timeout_ms`);
    }
    if (validOutputs.length === 0 && Number.isFinite(startedAt) && nowMs - startedAt > budgets.time_to_first_output_ms) {
      errors.push(`agents.json: agent ${agent.agent_id} exceeded time_to_first_output_ms without materialized output`);
    }
  }

  return errors;
}

function filescopesOverlap(leftFiles, rightFiles) {
  const normalize = (value) => {
    let normalized = value.replaceAll("\\", "/");
    const wildcardIndex = normalized.search(/[?*[\]]/);
    if (wildcardIndex >= 0) normalized = normalized.slice(0, wildcardIndex);
    return normalized.replace(/\/+$/, "") || ".";
  };
  for (const leftValue of leftFiles ?? []) {
    const left = normalize(leftValue);
    for (const rightValue of rightFiles ?? []) {
      const right = normalize(rightValue);
      if (left === "." || right === "." || left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)) return true;
    }
  }
  return false;
}

async function workflowPatch(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === "begin") {
    await workflowPatchBegin(rest);
    return;
  }
  if (subcommand === "end") {
    await workflowPatchEnd(rest);
    return;
  }
  if (subcommand === "verify") {
    await workflowPatchVerify(rest);
    return;
  }
  fail("workflow patch requires begin, end, or verify");
}

async function workflowPatchBegin(args) {
  const context = workflowPatchContext(args);
  const filescope = argValues(args, "--file");
  if (filescope.length === 0) fail("workflow patch begin requires at least one --file");
  for (const file of filescope) {
    if (!isSafeRelativePath(file)) fail(`unsafe --file: ${file}`);
  }

  await mkdir(context.patchDir, { recursive: true });
  const preTreeHash = await buildWorktreeTree(filescope);
  const manifest = {
    schema_version: "workflow.patch.v1",
    run_id: context.runId,
    round_id: context.roundId,
    task_id: context.taskId,
    filescope: uniqueStrings(filescope),
    pre_tree_hash: preTreeHash,
    pre_head: gitValue(["rev-parse", "HEAD"]) ?? null,
    started_at: new Date().toISOString(),
    status: "begun",
  };

  await writeWorkflowFile(context.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`patch begin: ${path.relative(process.cwd(), context.manifestPath)}`);
  console.log(`pre_tree_hash: ${preTreeHash}`);
}

async function workflowPatchEnd(args) {
  const context = workflowPatchContext(args);
  const manifest = await readPatchManifest(context.manifestPath);
  const postTreeHash = await buildWorktreeTree(manifest.filescope);
  const patch = gitOutput(["diff", "--binary", "--full-index", manifest.pre_tree_hash, postTreeHash, "--", ...manifest.filescope]);
  const nameStatus = gitOutput(["diff", "--name-status", manifest.pre_tree_hash, postTreeHash, "--", ...manifest.filescope]);
  const changedFiles = parseNameStatusFiles(
    gitNulFields(["diff", "--name-status", "-z", manifest.pre_tree_hash, postTreeHash, "--", ...manifest.filescope]),
  );
  const patchHash = `sha256:${sha256(patch)}`;
  const updated = {
    ...manifest,
    post_tree_hash: postTreeHash,
    patch_ref: path.relative(process.cwd(), context.patchPath),
    patch_hash: patchHash,
    name_status_ref: path.relative(process.cwd(), context.nameStatusPath),
    changed_files: changedFiles,
    completed_at: new Date().toISOString(),
    status: "ended",
  };

  await writeWorkflowFile(context.patchPath, patch);
  await writeWorkflowFile(context.nameStatusPath, nameStatus);
  await writeWorkflowFile(context.manifestPath, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`patch end: ${path.relative(process.cwd(), context.patchPath)}`);
  console.log(`patch_hash: ${patchHash}`);
  console.log(`changed_files: ${changedFiles.length}`);
}

// Checks the patch file hash, that the --file paths still build post_tree_hash,
// `git diff --check`, and `git apply --check` on pre_tree_hash. It does not prove the
// patch reproduces post_tree_hash or that files outside the --file paths are unchanged.
async function workflowPatchVerify(args) {
  const context = workflowPatchContext(args);
  const manifest = await readPatchManifest(context.manifestPath);
  if (manifest.status !== "ended") fail("patch manifest is not ended");
  const currentPatch = await readFile(context.patchPath, "utf8");
  const currentHash = `sha256:${sha256(currentPatch)}`;
  if (currentHash !== manifest.patch_hash) fail("patch hash mismatch");
  const postTreeHash = await buildWorktreeTree(manifest.filescope);
  if (postTreeHash !== manifest.post_tree_hash) fail("current worktree no longer matches patch post_tree_hash");

  const whitespace = spawnSync("git", ["diff", "--check", manifest.pre_tree_hash, manifest.post_tree_hash, "--", ...manifest.filescope], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (whitespace.status !== 0) fail(`patch has whitespace errors:\n${whitespace.stdout}${whitespace.stderr}`);

  const applyCheck = await verifyPatchApplies(manifest.pre_tree_hash, context.patchPath);
  const verified = {
    ...manifest,
    applies_cleanly: applyCheck,
    verified_at: new Date().toISOString(),
    status: "verified",
  };

  await writeWorkflowFile(context.manifestPath, `${JSON.stringify(verified, null, 2)}\n`);
  console.log(`patch verify: ok (${path.relative(process.cwd(), context.patchPath)})`);
}

async function workflowSchemaValidators(errors) {
  const schemas = new Map();
  const ajv = createAjv();

  for (const name of workflowSchemaFiles) {
    const schemaPath = path.join(root, "schemas", name);
    let schema;
    try {
      schema = JSON.parse(await readFile(schemaPath, "utf8"));
      ajv.addSchema(schema, name);
      schemas.set(name, ajv.getSchema(name));
    } catch (error) {
      errors.push(`workflow schema failed to load: schemas/${name}: ${error.message}`);
    }
  }

  return schemas;
}

function workflowPatchContext(args) {
  const runId = requiredSafeId(args, "--run");
  const roundId = Number(requiredArgValue(args, "--round"));
  const taskId = requiredSafeId(args, "--task");
  if (!Number.isInteger(roundId) || roundId < 0) fail("--round must be a non-negative integer");
  const roundName = `round-${String(roundId).padStart(3, "0")}`;
  const patchDir = path.join(workflowRunDir(runId), "rounds", roundName, "patches");
  const basename = safeFilename(taskId);
  return {
    runId,
    roundId,
    taskId,
    patchDir,
    manifestPath: path.join(patchDir, `${basename}.patch.json`),
    patchPath: path.join(patchDir, `${basename}.patch`),
    nameStatusPath: path.join(patchDir, `${basename}.name-status.txt`),
  };
}

async function readPatchManifest(file) {
  if (!(await exists(file))) fail(`patch manifest missing: ${path.relative(process.cwd(), file)}`);
  const manifest = JSON.parse(await readFile(file, "utf8"));
  if (manifest.schema_version !== "workflow.patch.v1") fail("unsupported patch manifest schema");
  if (!Array.isArray(manifest.filescope) || manifest.filescope.length === 0) fail("patch manifest missing filescope");
  return manifest;
}

async function buildWorktreeTree(filescope) {
  const files = gitNulFields(["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...filescope]);
  const indexPath = path.join(await mkdtemp(path.join(os.tmpdir(), "agent-surface-index-")), "index");
  const env = { ...process.env, GIT_INDEX_FILE: indexPath };

  // A path under a linked directory is not in the worktree as git sees it: git records the link
  // itself, and reading through it would hash a file outside the checkout.
  const linkedDirs = new Map();
  const underLinkedDir = async (file) => {
    const parts = file.split("/");
    for (let depth = 1; depth < parts.length; depth += 1) {
      const dir = parts.slice(0, depth).join("/");
      if (!linkedDirs.has(dir)) linkedDirs.set(dir, Boolean((await lstat(path.join(process.cwd(), dir)).catch(() => null))?.isSymbolicLink()));
      if (linkedDirs.get(dir)) return true;
    }
    return false;
  };

  try {
    gitOutput(["read-tree", "--empty"], env);
    for (const file of files) {
      if (!isSafeRelativePath(file)) fail(`unsafe git path: ${file}`);
      if (await underLinkedDir(file)) continue;
      const absolute = path.join(process.cwd(), file);
      const fileStat = await lstat(absolute).catch(() => null);
      // A link is stored as git stores one: its target path, mode 120000. Hashing the
      // path itself would read the target's bytes, possibly from outside the repository.
      if (fileStat?.isSymbolicLink()) {
        const link = gitOutput(["hash-object", "-w", "--stdin"], env, await readlink(absolute, { encoding: "buffer" })).trim();
        gitOutput(["update-index", "--add", "--cacheinfo", `120000,${link},${file}`], env);
        continue;
      }
      if (!fileStat?.isFile()) continue;
      const blob = gitOutput(["hash-object", "-w", "--", file], env).trim();
      const mode = fileStat.mode & 0o111 ? "100755" : "100644";
      gitOutput(["update-index", "--add", "--cacheinfo", `${mode},${blob},${file}`], env);
    }
    return gitOutput(["write-tree"], env).trim();
  } finally {
    await rm(path.dirname(indexPath), { recursive: true, force: true });
  }
}

async function verifyPatchApplies(preTreeHash, patchPath) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agent-surface-apply-"));
  const indexDir = await mkdtemp(path.join(os.tmpdir(), "agent-surface-apply-index-"));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(indexDir, "index") };
  try {
    gitOutput(["read-tree", preTreeHash], env);
    gitOutput(["--work-tree", tempDir, "checkout-index", "-a", "-f"], env);
    const init = spawnSync("git", ["init"], {
      cwd: tempDir,
      encoding: "utf8",
    });
    if (init.status !== 0) fail(`git init failed for patch check:\n${init.stdout}${init.stderr}`);
    const result = spawnSync("git", ["apply", "--check", patchPath], {
      cwd: tempDir,
      encoding: "utf8",
    });
    if (result.status !== 0) fail(`patch does not apply cleanly:\n${result.stdout}${result.stderr}`);
    return true;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await rm(indexDir, { recursive: true, force: true });
  }
}

// `--name-status -z` fields: a status, then two paths for a rename or copy, else one.
function parseNameStatusFiles(fields) {
  const files = [];
  for (let index = 0; index < fields.length;) {
    const pathCount = /^[RC]/.test(fields[index]) ? 2 : 1;
    files.push(...fields.slice(index + 1, index + 1 + pathCount));
    index += 1 + pathCount;
  }
  return uniqueStrings(files);
}

function workflowRunDir(runId) {
  if (runId === "current.json") fail("current.json is reserved for the active-run pointer");
  return path.join(process.cwd(), ".agent-surface", "workflows", runId);
}

// The run current.json names, or null when it names none or cannot be read.
async function workflowCurrentRunId(workflowsDir) {
  try {
    const runId = JSON.parse(await readFile(path.join(workflowsDir, "current.json"), "utf8"))?.run_id;
    return typeof runId === "string" && safeIdPattern.test(runId) && runId !== "current.json" ? runId : null;
  } catch {
    return null;
  }
}

async function workflowRunStatus(runId) {
  try {
    return JSON.parse(await readFile(path.join(workflowRunDir(runId), "run.json"), "utf8"))?.status ?? null;
  } catch {
    return null;
  }
}

const safeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

function requiredSafeId(args, name) {
  const value = requiredArgValue(args, name);
  if (!safeIdPattern.test(value)) fail(`unsafe ${name}: ${value}`);
  return value;
}

async function appendWorkflowEvent(runDir, event) {
  const eventsPath = path.join(runDir, "events.ndjson");
  const previousHash = await lastWorkflowEventHash(eventsPath);
  const withPrevious = {
    ...event,
    prev_event_hash: previousHash,
  };
  const eventHash = `sha256:${sha256(canonicalJson(withPrevious))}`;
  const fullEvent = {
    ...withPrevious,
    event_hash: eventHash,
  };
  await writeWorkflowFile(eventsPath, `${await readFileIfExists(eventsPath) ?? ""}${JSON.stringify(fullEvent)}\n`);
  return eventHash;
}

// current.json names the run only while it is active. A run that stops being active
// clears the pointer only when the pointer names it.
async function writeWorkflowCurrent(runDir, runId, runData) {
  if (runData.status !== "active") {
    const pointed = await workflowCurrentRunId(path.dirname(runDir));
    if (pointed && pointed !== runId) return;
  }
  await writeWorkflowFile(path.join(path.dirname(runDir), "current.json"), `${JSON.stringify({
    schema_version: "workflow.current.v1",
    run_id: runData.status === "active" ? runId : null,
    workflow_dir: runData.status === "active" ? path.relative(process.cwd(), runDir) : null,
    updated_at: new Date().toISOString(),
  }, null, 2)}\n`);
}

async function writeWorkflowFile(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(temporary, contents, { mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function lastWorkflowEventHash(eventsPath) {
  const current = await readFileIfExists(eventsPath);
  if (current === null) return null;
  const lines = current.toString("utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return null;
  try {
    const event = JSON.parse(lines.at(-1));
    return typeof event.event_hash === "string" ? event.event_hash : null;
  } catch {
    return null;
  }
}
