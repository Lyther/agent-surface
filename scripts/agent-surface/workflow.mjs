// The workflow subsystem: the `workflow` command tree (doctor, apply, patch)
// that drives the validated run ledger under .agent-surface/workflows/<run_id>.
// Owns run.json ledger advancement, the tamper-evident events.ndjson chain, and
// git-tree-based patch capture/verify. Schema validation lives in check.mjs.
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { checkBossArtifactCoherence, createAjv, formatAjvErrors, readWorkflowJson, validateWorkflowJson, validateWorkflowPatchManifests, workflowSchemaFiles } from "./check.mjs";
import { readFileIfExists } from "./io.mjs";
import { gitLines, gitOutput, gitValue } from "./proc.mjs";
import { root } from "./registry.mjs";
import { argValues, canonicalJson, exists, fail, isPathInside, isSafeRelativePath, requiredArgValue, safeFilename, sha256, uniqueStrings } from "./util.mjs";

export async function workflow(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === "doctor") {
    await workflowDoctor(rest);
    return;
  }
  if (subcommand === "apply") {
    await workflowApply(rest);
    return;
  }
  if (subcommand === "patch") {
    await workflowPatch(rest);
    return;
  }
  fail("workflow requires doctor, apply, or patch");
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
  const bossArtifact = path.join(runDir, "boss.json");
  if (await exists(bossArtifact)) {
    const boss = await readWorkflowJson(bossArtifact, schemas.get("workflow.boss.schema.json"), errors);
    checkBossArtifactCoherence(boss, path.relative(process.cwd(), bossArtifact), errors);
  }
  for (const [file, schemaName] of [
    ["worker.json", "workflow.worker.schema.json"],
    ["reviewer.json", "workflow.reviewer.schema.json"],
    ["judger.json", "workflow.judger.schema.json"],
    ["rescue.json", "workflow.rescue.schema.json"],
  ]) {
    const artifact = path.join(runDir, file);
    if (await exists(artifact)) await validateWorkflowJson(artifact, schemas.get(schemaName), errors);
  }
  await validateWorkflowPatchManifests(runDir, schemas.get("workflow.patch.schema.json"), errors);

  const eventsPath = path.join(runDir, "events.ndjson");
  let lastTransition = null;
  if (await exists(eventsPath)) {
    const text = await readFile(eventsPath, "utf8");
    let previousHash = null;
    for (const [index, line] of text.split(/\r?\n/).filter(Boolean).entries()) {
      let event;
      try {
        event = JSON.parse(line);
      } catch (error) {
        errors.push(`events.ndjson:${index + 1}: invalid JSON: ${error.message}`);
        continue;
      }
      const validate = schemas.get("workflow.event.schema.json");
      if (validate && !validate(event)) errors.push(`events.ndjson:${index + 1}: ${formatAjvErrors(validate.errors)}`);
      if (event.prev_event_hash !== previousHash) {
        errors.push(`events.ndjson:${index + 1}: prev_event_hash does not match previous event`);
      }
      const { event_hash: eventHash, ...eventWithoutHash } = event;
      const computedHash = `sha256:${sha256(canonicalJson(eventWithoutHash))}`;
      if (eventHash !== computedHash) {
        errors.push(`events.ndjson:${index + 1}: event_hash does not match event content`);
      }
      previousHash = event.event_hash;
      if ("to" in event) lastTransition = event;
    }
  }

  // The run ledger is the source of truth for routing. If the most recent
  // recorded transition advanced the route, run.json.workflow_next_command must
  // match it; otherwise the next-command pointer is lagging the accepted ledger
  // (e.g. a role wrote its artifact but `workflow apply` never synced run.json).
  if (runData && lastTransition && runData.status === "active") {
    const ledgerNext = runData.workflow_next_command ?? null;
    const transitionTo = lastTransition.to ?? null;
    if (ledgerNext !== transitionTo) {
      errors.push(
        `run.json.workflow_next_command (${JSON.stringify(ledgerNext)}) lags the latest transition in events.ndjson (to=${JSON.stringify(transitionTo)}); run \`agent-surface workflow apply\` after the owning role to advance the ledger`,
      );
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`workflow doctor: ok (${path.relative(process.cwd(), runDir)})`);
}

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

  if (!isPathInside(runDir, artifactPath)) fail("artifact must be inside the workflow run directory");

  const runData = await readWorkflowJson(runPath, schemas.get("workflow.run.schema.json"), errors);
  const artifact = await readWorkflowJson(artifactPath, schemas.get(schemaName), errors);
  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  if (artifact.run_id !== runId || artifact.workflow?.run_id !== runId) fail("artifact run_id does not match --run");
  if (artifact.workflow?.owner !== role) fail("artifact owner does not match --role");

  const artifactHash = `sha256:${sha256(await readFile(artifactPath))}`;
  const fromCommand = runData.workflow_next_command ?? null;
  const nextCommand = artifact.workflow.next_command ?? null;
  const update = artifact.run_state_update ?? {};
  const moved = new Set([
    ...(update.accepted_task_ids ?? []),
    ...(update.rework_task_ids ?? []),
    ...(update.deferred_task_ids ?? []),
    ...(update.closed_task_ids ?? []),
  ]);

  runData.current_round = Math.max(runData.current_round, artifact.round_id);
  runData.workflow_next_command = nextCommand;
  runData.active_task_ids = uniqueStrings((runData.active_task_ids ?? []).filter((taskId) => !moved.has(taskId)));
  if (role === "workflow-boss" && artifact.run_state && Array.isArray(artifact.run_state.active_task_ids)) {
    runData.active_task_ids = uniqueStrings(artifact.run_state.active_task_ids);
  }
  runData.accepted_task_ids = uniqueStrings([...(runData.accepted_task_ids ?? []), ...(update.accepted_task_ids ?? [])]);
  runData.rework_task_ids = uniqueStrings([...(runData.rework_task_ids ?? []), ...(update.rework_task_ids ?? [])]);
  runData.deferred_task_ids = uniqueStrings([...(runData.deferred_task_ids ?? []), ...(update.deferred_task_ids ?? [])]);
  runData.closed_task_ids = uniqueStrings([...(runData.closed_task_ids ?? []), ...(update.closed_task_ids ?? [])]);
  runData.last_artifact_hashes = {
    ...(runData.last_artifact_hashes ?? {}),
    [role]: artifactHash,
  };
  if (role === "workflow-judger" && ["MERGE", "MERGE_PARTIAL"].includes(artifact.final_verdict) && nextCommand === "workflow-close") {
    runData.workflow_next_command = "workflow-close";
  }

  const runValidate = schemas.get("workflow.run.schema.json");
  if (runValidate && !runValidate(runData)) {
    fail(`updated run.json failed schema validation: ${formatAjvErrors(runValidate.errors)}`);
  }

  await writeFile(runPath, `${JSON.stringify(runData, null, 2)}\n`);
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
  await writeFile(path.join(path.dirname(runDir), "current.json"), `${JSON.stringify({
    schema_version: "workflow.current.v1",
    run_id: runData.status === "active" ? runId : null,
    workflow_dir: runData.status === "active" ? path.relative(process.cwd(), runDir) : null,
    updated_at: new Date().toISOString(),
  }, null, 2)}\n`);

  console.log(`workflow apply: ok (${role})`);
  console.log(`run: ${path.relative(process.cwd(), runPath)}`);
  console.log(`event_hash: ${eventHash}`);
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

  await writeFile(context.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`patch begin: ${path.relative(process.cwd(), context.manifestPath)}`);
  console.log(`pre_tree_hash: ${preTreeHash}`);
}

async function workflowPatchEnd(args) {
  const context = workflowPatchContext(args);
  const manifest = await readPatchManifest(context.manifestPath);
  const postTreeHash = await buildWorktreeTree(manifest.filescope);
  const patch = gitOutput(["diff", "--binary", "--full-index", manifest.pre_tree_hash, postTreeHash, "--", ...manifest.filescope]);
  const nameStatus = gitOutput(["diff", "--name-status", manifest.pre_tree_hash, postTreeHash, "--", ...manifest.filescope]);
  const changedFiles = parseNameStatusFiles(nameStatus);
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

  await writeFile(context.patchPath, patch);
  await writeFile(context.nameStatusPath, nameStatus);
  await writeFile(context.manifestPath, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`patch end: ${path.relative(process.cwd(), context.patchPath)}`);
  console.log(`patch_hash: ${patchHash}`);
  console.log(`changed_files: ${changedFiles.length}`);
}

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

  await writeFile(context.manifestPath, `${JSON.stringify(verified, null, 2)}\n`);
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
  const files = await gitLines(["ls-files", "--cached", "--others", "--exclude-standard", "--", ...filescope]);
  const indexPath = path.join(await mkdtemp(path.join(os.tmpdir(), "agent-surface-index-")), "index");
  const env = { ...process.env, GIT_INDEX_FILE: indexPath };

  try {
    gitOutput(["read-tree", "--empty"], env);
    for (const file of files) {
      if (!isSafeRelativePath(file)) fail(`unsafe git path: ${file}`);
      const absolute = path.join(process.cwd(), file);
      const fileStat = await stat(absolute).catch(() => null);
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

function parseNameStatusFiles(text) {
  const files = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split(/\t+/);
    files.push(...parts.slice(1));
  }
  return uniqueStrings(files.filter(Boolean));
}

function workflowRunDir(runId) {
  return path.join(process.cwd(), ".agent-surface", "workflows", runId);
}

function requiredSafeId(args, name) {
  const value = requiredArgValue(args, name);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(value)) fail(`unsafe ${name}: ${value}`);
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
  await writeFile(eventsPath, `${await readFileIfExists(eventsPath) ?? ""}${JSON.stringify(fullEvent)}\n`);
  return eventHash;
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
