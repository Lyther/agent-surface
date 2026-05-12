#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "scripts", "agent-surface.mjs");

function run(args, options = {}) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
}

function status(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
}

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...files(full));
    if (name.isFile()) out.push(full);
  }
  return out;
}

function assertGeminiTomlParses() {
  const script = `
import pathlib
import sys
import tomllib
bad = []
for p in pathlib.Path(sys.argv[1]).rglob("*.toml"):
    try:
        tomllib.loads(p.read_text())
    except Exception as exc:
        bad.append(f"{p}: {exc}")
if bad:
    raise SystemExit("\\n".join(bad))
`;
  execFileSync("python3", ["-c", script, path.join(root, "dist", "gemini-cli", ".gemini", "commands")], {
    cwd: root,
    encoding: "utf8",
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

rmSync(path.join(root, "dist"), { recursive: true, force: true });

assert.equal(run(["check"]).trim(), "check: ok");
assert.match(run(["check", "commands"]), /commands check: ok/);

const inventory = run(["inventory"]);
assert.match(inventory, /^rules: 11$/m);
assert.match(inventory, /^commands: 61$/m);
assert.match(inventory, /^schemas: 11$/m);

const defaultRegistry = JSON.parse(run(["commands", "--json"]));
assert.equal(defaultRegistry.pack, "default");
assert.equal(defaultRegistry.count, 59);
assert.equal(defaultRegistry.commands.some((command) => command.name === "boot-facade"), false);
const flowCommand = defaultRegistry.commands.find((command) => command.name === "flow");
assert.ok(flowCommand);
assert.equal(flowCommand.phase, "decide");
assert.equal(flowCommand.risk, "safe");
assert.equal(flowCommand.metadata_source, "frontmatter");
assert.equal(flowCommand.targets["claude-code"], path.join(".claude", "commands", "flow", "flow.md"));
assert.equal(flowCommand.targets.codex, path.join(".agents", "skills", "flow", "SKILL.md"));
assert.equal(flowCommand.targets.cline, path.join("Documents", "Cline", "Workflows", "flow.md"));
assert.equal(flowCommand.targets["gemini-cli"], path.join(".gemini", "commands", "flow", "flow.toml"));
assert.equal(flowCommand.targets.cursor, path.join(".cursor", "commands", "flow.md"));
const devFeatureCommand = defaultRegistry.commands.find((command) => command.name === "dev-feature");
assert.ok(devFeatureCommand);
assert.equal(devFeatureCommand.risk, "writes");
assert.equal(devFeatureCommand.metadata_source, "inferred");
const qaTraceCommand = defaultRegistry.commands.find((command) => command.name === "qa-trace");
assert.ok(qaTraceCommand);
assert.equal(qaTraceCommand.risk, "security-sensitive");
const workflowDoctorCommand = defaultRegistry.commands.find((command) => command.name === "workflow-doctor");
assert.ok(workflowDoctorCommand);
assert.equal(workflowDoctorCommand.risk, "safe");
const shipCommands = JSON.parse(run(["commands", "--phase", "ship", "--json"]));
assert.equal(shipCommands.filters.phase, "ship");
assert.equal(shipCommands.commands.every((command) => command.phase === "ship"), true);
const writeCommands = JSON.parse(run(["commands", "--risk", "writes", "--json"]));
assert.equal(writeCommands.filters.risk, "writes");
assert.equal(writeCommands.commands.some((command) => command.name === "dev-feature"), true);
const allRegistry = JSON.parse(run(["commands", "--pack", "all", "--json"]));
assert.equal(allRegistry.count, 61);
assert.equal(allRegistry.commands.some((command) => command.name === "boot-facade"), true);
const destructiveRegistry = JSON.parse(run(["commands", "--pack", "destructive", "--json"]));
assert.equal(destructiveRegistry.count, 60);
assert.equal(destructiveRegistry.commands.some((command) => command.name === "ops-nuke"), true);
assert.equal(destructiveRegistry.commands.some((command) => command.name === "boot-facade"), false);

const escapeVictim = "/tmp/agent-surface-build-escape-victim";
rmSync(escapeVictim, { recursive: true, force: true });
mkdirSync(escapeVictim, { recursive: true });
writeFileSync(path.join(escapeVictim, "keep.txt"), "keep\n");
const unsafeBuild = status(["build", "--target", "../../agent-surface-build-escape-victim"]);
assert.notEqual(unsafeBuild.status, 0);
assert.match(`${unsafeBuild.stdout}${unsafeBuild.stderr}`, /unsafe build target/);
assert.equal(existsSync(path.join(escapeVictim, "keep.txt")), true);
rmSync(escapeVictim, { recursive: true, force: true });

const unsafePack = status(["build", "--target", "cline", "--pack", "../bad"]);
assert.notEqual(unsafePack.status, 0);
assert.match(`${unsafePack.stdout}${unsafePack.stderr}`, /unsafe command pack/);

const unknownPack = status(["build", "--target", "cline", "--pack", "unknown-pack"]);
assert.notEqual(unknownPack.status, 0);
assert.match(`${unknownPack.stdout}${unknownPack.stderr}`, /unknown command pack/);

const genericRules = run(["check", "rules", "--scenario", "generic-chat"]);
assert.match(genericRules, /^generic-chat:$/m);
assert.match(genericRules, /rules\/00-precedence-and-safety\.mdc/);
assert.doesNotMatch(genericRules, /^errors:$/m);

for (const scenario of ["python-source", "python-tooling", "rust-source", "go-ci", "typescript-eslint", "shell-script"]) {
  const output = run(["check", "rules", "--scenario", scenario]);
  assert.match(output, new RegExp(`^${scenario}:$`, "m"));
  assert.doesNotMatch(output, /^errors:$/m);
}

run(["build", "--target", "all"]);
const generated = files(path.join(root, "dist"));
assert.equal(generated.length, 554);
assertGeminiTomlParses();
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "claude-code", ".claude", "commands", "flow", "flow.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "claude-code", ".claude", "commands", "boot", "facade.md"))), false);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "codex", ".agents", "skills", "flow", "SKILL.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "codex", ".agents", "skills", "flow", "agents", "openai.yaml"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "codex", ".codex", "AGENTS.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "codex", ".agents", "skills", "boot-facade", "SKILL.md"))), false);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "gemini-cli", ".gemini", "commands", "boot", "facade.toml"))), false);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "gemini-cli", ".gemini", "commands", "ops", "nuke.toml"))), false);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "gemini-cli", ".gemini", "GEMINI.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "gemini-cli", ".gemini", "extensions", "agent-surface", "gemini-extension.json"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "claude-code", ".agent-surface", "claude-plugin", "agent-surface", ".claude-plugin", "plugin.json"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "cline", "Documents", "Cline", "Rules", "agent-surface.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "cursor", ".cursor", "rules", "00-precedence-and-safety.mdc"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "copilot", "instructions", "agent-surface-copilot.instructions.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "vscode", "instructions", "agent-surface.instructions.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "opencode", ".config", "opencode", "AGENTS.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "trae", ".trae", "user_rules.md"))), true);
const generatedCheck = run(["check", "generated"]);
assert.match(generatedCheck, /claude-code: generated outputs 120 ok/);
assert.match(generatedCheck, /copilot: generated outputs 1 ok/);
assert.match(generatedCheck, /generated check: ok/);
const copilotGeneratedCheck = run(["check", "generated", "--target", "copilot"]);
assert.match(copilotGeneratedCheck, /copilot: generated outputs 1 ok/);

const allPackBuild = run(["build", "--target", "gemini-cli", "--pack", "all"]);
assert.match(allPackBuild, /gemini-cli: 125 outputs rendered \(pack: all\)/);
assertGeminiTomlParses();
const facadeToml = readFileSync(path.join(root, "dist", "gemini-cli", ".gemini", "commands", "boot", "facade.toml"), "utf8");
const nukeToml = readFileSync(path.join(root, "dist", "gemini-cli", ".gemini", "commands", "ops", "nuke.toml"), "utf8");
assert.match(facadeToml, /prompt = '''## OBJECTIVE/);
assert.match(nukeToml, /prompt = '''## OBJECTIVE/);
assert.doesNotMatch(facadeToml, /prompt = '''---/);

const antigravity = readFileSync(
  path.join(root, "dist", "antigravity", "global_workflows", "workflow-boss.md"),
  "utf8",
);
assert.match(antigravity, /^---\ndescription: "/);

const gemini = readFileSync(path.join(root, "dist", "gemini-cli", ".gemini", "commands", "workflow", "boss.toml"), "utf8");
assert.match(gemini, /^description = "Run workflow boss\."/);
assert.equal(generated.some((file) => file.endsWith("dist/gemini-cli/.gemini/commands/workflow-boss.md")), false);
assert.equal(generated.some((file) => file.endsWith("dist/gemini-cli/.gemini/commands/flow/flow.toml")), true);
const codexFlow = readFileSync(path.join(root, "dist", "codex", ".agents", "skills", "flow", "SKILL.md"), "utf8");
assert.match(codexFlow, /^---\nname: flow\n/);
assert.match(codexFlow, /Use explicit invocation: `\$flow`\./);
const claudeFlow = readFileSync(path.join(root, "dist", "claude-code", ".claude", "commands", "flow", "flow.md"), "utf8");
assert.match(claudeFlow, /^## OBJECTIVE/);

const clinePlan = run(["install", "--target", "cline", "--dest", "/tmp/agent-surface-cline", "--dry-run"]);
assert.match(clinePlan, /^target: cline$/m);
assert.match(clinePlan, /^pack: default$/m);
assert.match(clinePlan, /^root source: explicit --dest$/m);
assert.match(clinePlan, /\.clinerules\/workflows\/workflow-boss\.md <- commands\/workflow-boss\.md/);
assert.match(clinePlan, /\.clinerules\/agent-surface\.md <- rules\/\*\.mdc/);
assert.match(clinePlan, /\.agent-surface\/cline-manifest\.json/);

const destructivePlan = run(["install", "--target", "cline", "--pack", "destructive", "--dest", "/tmp/agent-surface-cline", "--dry-run"]);
assert.match(destructivePlan, /^pack: destructive$/m);
assert.match(destructivePlan, /\.clinerules\/workflows\/ops-nuke\.md <- commands\/ops-nuke\.md/);
assert.doesNotMatch(destructivePlan, /\.clinerules\/workflows\/boot-facade\.md <- commands\/boot-facade\.md/);

const geminiPlan = run(["install", "--target", "gemini-cli", "--dest", "/tmp/agent-surface-gemini", "--dry-run"]);
assert.match(geminiPlan, /^target: gemini-cli$/m);
assert.match(geminiPlan, /\.gemini\/commands\/workflow\/boss\.toml <- commands\/workflow-boss\.md/);
assert.match(geminiPlan, /\.gemini\/GEMINI\.md <- rules\/\*\.mdc/);

const claudePlan = run(["install", "--target", "claude-code", "--dest", "/tmp/agent-surface-claude", "--dry-run"]);
assert.match(claudePlan, /^target: claude-code$/m);
assert.match(claudePlan, /\.claude\/commands\/workflow\/boss\.md <- commands\/workflow-boss\.md/);
assert.match(claudePlan, /\.agent-surface\/claude-plugin\/agent-surface\/\.claude-plugin\/plugin\.json <- package\.json/);

const codexPlan = run(["install", "--target", "codex", "--dest", "/tmp/agent-surface-codex", "--dry-run"]);
assert.match(codexPlan, /^target: codex$/m);
assert.match(codexPlan, /\.agents\/skills\/workflow-boss\/SKILL\.md <- commands\/workflow-boss\.md/);
assert.match(codexPlan, /\.codex\/AGENTS\.md <- rules\/\*\.mdc/);

const staleDest = "/tmp/agent-surface-stale";
rmSync(staleDest, { recursive: true, force: true });
mkdirSync(path.join(staleDest, ".agent-surface"), { recursive: true });
writeFileSync(
  path.join(staleDest, ".agent-surface", "cline-manifest.json"),
  JSON.stringify({
    target: "cline",
    scope: "project",
    managed: [
      {
        target: "cline",
        output: ".clinerules/workflows/removed.md",
        managed_by: "agent-surface",
      },
    ],
  }),
);
const stalePlan = run(["install", "--target", "cline", "--dest", staleDest, "--dry-run"]);
assert.match(stalePlan, /planned stale managed removals:\n  \.clinerules\/workflows\/removed\.md/);
rmSync(staleDest, { recursive: true, force: true });

const liveDest = "/tmp/agent-surface-live";
rmSync(liveDest, { recursive: true, force: true });
const liveInstall = run(["install", "--target", "cline", "--dest", liveDest]);
assert.match(liveInstall, /^installed:$/m);
assert.match(liveInstall, /wrote: 60/);
assert.match(readFileSync(path.join(liveDest, ".clinerules", "workflows", "workflow-boss.md"), "utf8"), /^## OBJECTIVE/);
const liveManifest = JSON.parse(readFileSync(path.join(liveDest, ".agent-surface", "cline-manifest.json"), "utf8"));
assert.equal(liveManifest.pack, "default");
assert.equal(liveManifest.managed.length, 60);
assert.equal(liveManifest.managed[0].managed_by, "agent-surface");
rmSync(liveDest, { recursive: true, force: true });

const claudeLiveDest = "/tmp/agent-surface-claude-live";
rmSync(claudeLiveDest, { recursive: true, force: true });
const claudeLiveInstall = run(["install", "--target", "claude-code", "--dest", claudeLiveDest]);
assert.match(claudeLiveInstall, /wrote: 120/);
assert.match(readFileSync(path.join(claudeLiveDest, ".claude", "commands", "workflow", "boss.md"), "utf8"), /^## OBJECTIVE/);
const claudeLiveManifest = JSON.parse(readFileSync(path.join(claudeLiveDest, ".agent-surface", "claude-code-manifest.json"), "utf8"));
assert.equal(claudeLiveManifest.managed.length, 120);
rmSync(claudeLiveDest, { recursive: true, force: true });

const codexLiveDest = "/tmp/agent-surface-codex-live";
rmSync(codexLiveDest, { recursive: true, force: true });
const codexLiveInstall = run(["install", "--target", "codex", "--dest", codexLiveDest]);
assert.match(codexLiveInstall, /wrote: 119/);
assert.match(readFileSync(path.join(codexLiveDest, ".agents", "skills", "workflow-boss", "SKILL.md"), "utf8"), /^---\nname: workflow-boss\n/);
const codexLiveManifest = JSON.parse(readFileSync(path.join(codexLiveDest, ".agent-surface", "codex-manifest.json"), "utf8"));
assert.equal(codexLiveManifest.managed.length, 119);
rmSync(codexLiveDest, { recursive: true, force: true });

const unmanagedDest = "/tmp/agent-surface-unmanaged";
rmSync(unmanagedDest, { recursive: true, force: true });
mkdirSync(path.join(unmanagedDest, ".clinerules", "workflows"), { recursive: true });
writeFileSync(path.join(unmanagedDest, ".clinerules", "workflows", "workflow-boss.md"), "local workflow\n");
const unmanagedInstall = status(["install", "--target", "cline", "--dest", unmanagedDest]);
assert.notEqual(unmanagedInstall.status, 0);
assert.match(`${unmanagedInstall.stdout}${unmanagedInstall.stderr}`, /unmanaged existing file: \.clinerules\/workflows\/workflow-boss\.md/);
rmSync(unmanagedDest, { recursive: true, force: true });

const liveStaleDest = "/tmp/agent-surface-live-stale";
rmSync(liveStaleDest, { recursive: true, force: true });
run(["install", "--target", "cline", "--dest", liveStaleDest]);
const liveStaleFile = path.join(liveStaleDest, ".clinerules", "workflows", "removed.md");
const liveStaleContent = "old managed workflow\n";
writeFileSync(liveStaleFile, liveStaleContent);
const liveStaleManifestPath = path.join(liveStaleDest, ".agent-surface", "cline-manifest.json");
const liveStaleManifest = JSON.parse(readFileSync(liveStaleManifestPath, "utf8"));
liveStaleManifest.managed.push({
  target: "cline",
  scope: "project",
  source: "commands/removed.md",
  output: ".clinerules/workflows/removed.md",
  sha256: sha256(liveStaleContent),
  managed_by: "agent-surface",
  version: "0.1.0",
});
writeFileSync(liveStaleManifestPath, `${JSON.stringify(liveStaleManifest, null, 2)}\n`);
const liveStaleInstall = run(["install", "--target", "cline", "--dest", liveStaleDest]);
assert.match(liveStaleInstall, /removed stale: 1/);
assert.equal(existsSync(liveStaleFile), false);
assert.equal(files(path.join(liveStaleDest, ".agent-surface", "backups")).some((file) => file.endsWith("removed.md")), true);
rmSync(liveStaleDest, { recursive: true, force: true });

const scopeRootDest = "/tmp/agent-surface-scope-root";
rmSync(scopeRootDest, { recursive: true, force: true });
mkdirSync(scopeRootDest, { recursive: true });
const scopeRootInstall = run(["install", "--target", "cline", "--scope", "project", "--allow-scope-root"], { cwd: scopeRootDest });
assert.match(scopeRootInstall, /^root source: scope-derived root$/m);
assert.match(scopeRootInstall, /^installed:$/m);
assert.equal(existsSync(path.join(scopeRootDest, ".clinerules", "workflows", "workflow-boss.md")), true);
rmSync(scopeRootDest, { recursive: true, force: true });

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

const argSecretDest = "/tmp/agent-surface-arg-secret";
rmSync(argSecretDest, { recursive: true, force: true });
const argSecretRun = run([
  "run",
  "--task",
  "T1",
  "--class",
  "read_only",
  "--timeout",
  "5000",
  "--out",
  argSecretDest,
  "--",
  process.execPath,
  "-e",
  "process.exit(0)",
  "Authorization: Bearer secret-token",
]);
assert.match(argSecretRun, /exit_code: 0/);
const argSecretEvidenceJson = files(argSecretDest).find((file) => file.endsWith(".evidence.json"));
const argSecretEvidence = JSON.parse(readFileSync(argSecretEvidenceJson, "utf8"));
assert.equal(JSON.stringify(argSecretEvidence.cmd).includes("secret-token"), false);
assert.match(argSecretEvidence.cmd_hash_raw, /^sha256:/);
rmSync(argSecretDest, { recursive: true, force: true });

const unsafeClassDest = "/tmp/agent-surface-unsafe-class";
rmSync(unsafeClassDest, { recursive: true, force: true });
const unsafeClass = status([
  "run",
  "--task",
  "T1",
  "--class",
  "deployment",
  "--timeout",
  "5000",
  "--out",
  unsafeClassDest,
  "--",
  process.execPath,
  "-e",
  "process.exit(0)",
]);
assert.notEqual(unsafeClass.status, 0);
assert.match(`${unsafeClass.stdout}${unsafeClass.stderr}`, /requires explicit approval/);
rmSync(unsafeClassDest, { recursive: true, force: true });

const workflowDest = "/tmp/agent-surface-workflow";
rmSync(workflowDest, { recursive: true, force: true });
const workflowRunDir = path.join(workflowDest, ".agent-surface", "workflows", "run-fixture-001");
mkdirSync(workflowRunDir, { recursive: true });
const workflowRun = JSON.parse(readFileSync(path.join(root, "tests", "fixtures", "workflow", "run.json"), "utf8"));
workflowRun.active_task_ids = ["T2"];
workflowRun.workflow_next_command = "workflow-reviewer";
writeFileSync(path.join(workflowRunDir, "run.json"), `${JSON.stringify(workflowRun, null, 2)}\n`);
writeFileSync(path.join(workflowRunDir, "events.ndjson"), "");
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
writeFileSync(path.join(patchRunDir, "events.ndjson"), "");
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

const unsafeInstall = status(["install", "--target", "cline"]);
assert.notEqual(unsafeInstall.status, 0);
assert.match(unsafeInstall.stderr, /live install requires explicit --dest or --allow-scope-root/);

const invalidScope = status(["install", "--target", "cline", "--scope", "workspace", "--dry-run"]);
assert.notEqual(invalidScope.status, 0);
assert.match(invalidScope.stderr, /unsupported install scope/);

const globalProjectScope = status(["install", "--target", "cursor", "--scope", "project", "--dry-run"]);
assert.notEqual(globalProjectScope.status, 0);
assert.match(globalProjectScope.stderr, /supports --scope user only/);

const clineUserScope = status(["install", "--target", "cline", "--scope", "user", "--dry-run"]);
assert.equal(clineUserScope.status, 0, `${clineUserScope.stdout}${clineUserScope.stderr}`);
assert.match(clineUserScope.stdout, /Documents\/Cline\/Workflows\/workflow-boss\.md <- commands\/workflow-boss\.md/);

for (const target of ["cursor", "copilot", "vscode", "opencode", "trae"]) {
  const targetDest = `/tmp/agent-surface-${target}-live`;
  rmSync(targetDest, { recursive: true, force: true });
  const install = run(["install", "--target", target, "--dest", targetDest]);
  assert.match(install, /^installed:$/m);
  const manifest = JSON.parse(readFileSync(path.join(targetDest, ".agent-surface", `${target}-manifest.json`), "utf8"));
  assert.equal(manifest.target, target);
  assert.equal(manifest.managed.length > 0, true);
  rmSync(targetDest, { recursive: true, force: true });
}

const allSource = files(root)
  .filter((file) => !file.includes(`${path.sep}.git${path.sep}`))
  .filter((file) => !file.includes(`${path.sep}dist${path.sep}`));
assert.equal(allSource.some((file) => file.endsWith("commands/ops-server.md")), false);

rmSync(path.join(root, "dist"), { recursive: true, force: true });

console.log("test: ok");
