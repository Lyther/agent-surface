#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "scripts", "agent-surface.mjs");
const stripAiAttributionHook = path.join(root, "hooks", "strip-ai-attribution.sh");

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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertTomlParses(dir) {
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
  execFileSync("python3", ["-c", script, dir], {
    cwd: root,
    encoding: "utf8",
  });
}

function assertGeminiTomlParses() {
  assertTomlParses(path.join(root, "dist", "gemini-cli", ".gemini", "commands"));
}

function assertStripAiAttributionHook() {
  const tmpDir = mkdtempSync("/tmp/agent-surface-strip-ai-");
  try {
    const messagePath = path.join(tmpDir, "COMMIT_EDITMSG");
    const original = [
      "feat(cursor): keep technical scope",
      "",
      "Real body mentioning Cursor as a first-class target.",
      "",
      "Co-authored-by: Human Cursor <human.cursor@example.com>",
      "Co-authored-by: Cursor <cursoragent@cursor.com>",
      "🤖 Generated with [Claude Code](https://claude.ai/code)",
      "Generated-by: Cursor Agent",
      "",
    ].join("\n");
    writeFileSync(messagePath, original);

    const strip = spawnSync(stripAiAttributionHook, [messagePath], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(strip.status, 0, strip.stderr);
    assert.match(strip.stderr, /removed AI attribution/);
    const cleaned = readFileSync(messagePath, "utf8");
    assert.match(cleaned, /^feat\(cursor\): keep technical scope/);
    assert.match(cleaned, /Real body mentioning Cursor as a first-class target/);
    assert.match(cleaned, /Co-authored-by: Human Cursor <human.cursor@example.com>/);
    assert.doesNotMatch(cleaned, /cursoragent@cursor\.com/);
    assert.doesNotMatch(cleaned, /Generated with/);
    assert.doesNotMatch(cleaned, /Generated-by/);

    const unrelatedPath = path.join(tmpDir, "UNRELATED_EDITMSG");
    const unrelated = [
      "docs: preserve unrelated vendor notes",
      "",
      "Generated with Codex during a benchmark note.",
      "Generated-by: Gemini CLI",
      "Co-authored-by: OpenAI User <human.openai@example.com>",
      "",
    ].join("\n");
    writeFileSync(unrelatedPath, unrelated);
    const unrelatedCheck = spawnSync(stripAiAttributionHook, ["--check", unrelatedPath], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(unrelatedCheck.status, 0, unrelatedCheck.stderr);
    assert.equal(readFileSync(unrelatedPath, "utf8"), unrelated);

    writeFileSync(messagePath, original);
    const check = spawnSync(stripAiAttributionHook, ["--check", messagePath], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(check.status, 1);
    assert.match(check.stderr, /AI attribution or vendor advertising found/);
    assert.equal(readFileSync(messagePath, "utf8"), original);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Self-clean so prior build artifacts cannot make tests observe stale state.
rmSync(path.join(root, "dist"), { recursive: true, force: true });

assertStripAiAttributionHook();
assert.equal(run(["check"]).trim(), "check: ok");
assert.match(run(["check", "commands"]), /commands check: ok/);

// renders validation: registry must not claim a surface token that no producer emits
const targetsRegistryPath = path.join(root, "registry", "targets.json");
const targetsRegistryOriginal = readFileSync(targetsRegistryPath, "utf8");
try {
  const mutatedTargets = JSON.parse(targetsRegistryOriginal);
  mutatedTargets.in_scope.codex.renders.push("bogus-token");
  writeFileSync(targetsRegistryPath, `${JSON.stringify(mutatedTargets, null, 2)}\n`);
  const bogusRenders = status(["check"]);
  assert.equal(bogusRenders.status, 1);
  assert.match(bogusRenders.stderr, /renders token not emitted by producer: bogus-token/);
} finally {
  writeFileSync(targetsRegistryPath, targetsRegistryOriginal);
}
assert.equal(run(["check"]).trim(), "check: ok");

const inventory = run(["inventory"]);
assert.match(inventory, /^rules: 11$/m);
assert.match(inventory, /^commands: 64$/m);
assert.match(inventory, /^external: 5$/m);
assert.match(inventory, /^schemas: 13$/m);

const registry = JSON.parse(run(["commands", "--json"]));
assert.equal(registry.count, 64);
const opsFlowCommand = registry.commands.find((command) => command.name === "ops-flow");
assert.ok(opsFlowCommand);
assert.equal(opsFlowCommand.phase, "decide");
assert.equal(opsFlowCommand.metadata_source, "frontmatter");
assert.deepEqual(opsFlowCommand.lazy_body, {
  type: "file",
  path: "commands/ops-flow.md",
  frontmatter_stripped: true,
});
assert.equal(Object.hasOwn(opsFlowCommand, "body"), false);
assert.equal(opsFlowCommand.targets["claude-code"], path.join(".claude", "commands", "ops", "flow.md"));
assert.equal(opsFlowCommand.targets.codex, path.join(".agents", "skills", "ops-flow", "SKILL.md"));
assert.equal(opsFlowCommand.targets.cline, path.join("Documents", "Cline", "Workflows", "ops-flow.md"));
assert.equal(opsFlowCommand.targets.kilo, path.join(".config", "kilo", "commands", "ops-flow.md"));
assert.equal(opsFlowCommand.targets["antigravity-cli"], path.join("plugins", "agent-surface", "skills", "ops-flow.md"));
assert.equal(opsFlowCommand.targets["gemini-cli"], path.join(".gemini", "commands", "ops", "flow.toml"));
assert.equal(opsFlowCommand.targets.cursor, path.join(".cursor", "commands", "ops-flow.md"));

const shipCommands = JSON.parse(run(["commands", "--phase", "ship", "--json"]));
assert.equal(shipCommands.commands.every((command) => command.phase === "ship"), true);

const escapeVictim = "/tmp/agent-surface-build-escape-victim";
rmSync(escapeVictim, { recursive: true, force: true });
mkdirSync(escapeVictim, { recursive: true });
writeFileSync(path.join(escapeVictim, "keep.txt"), "keep\n");
const unsafeBuild = status(["build", "--target", "../../agent-surface-build-escape-victim"]);
assert.notEqual(unsafeBuild.status, 0);
assert.match(`${unsafeBuild.stdout}${unsafeBuild.stderr}`, /unsafe build target/);
assert.equal(existsSync(path.join(escapeVictim, "keep.txt")), true);
rmSync(escapeVictim, { recursive: true, force: true });

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
assert.ok(generated.length >= 610);
assertGeminiTomlParses();
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "claude-code", ".claude", "commands", "ops", "flow.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "claude-code", ".claude", "commands", "ops", "swarm.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "claude-code", ".claude", "commands", "workflow", "orchestrator.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "claude-code", ".claude", "commands", "boot", "facade.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "codex", ".agents", "skills", "ops-flow", "SKILL.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "codex", ".agents", "skills", "ops-swarm", "SKILL.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "codex", ".agents", "skills", "workflow-orchestrator", "SKILL.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "codex", ".agents", "skills", "ops-flow", "agents", "openai.yaml"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "codex", ".codex", "AGENTS.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "gemini-cli", ".gemini", "commands", "workflow", "boss.toml"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "gemini-cli", ".gemini", "commands", "boot", "facade.toml"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "gemini-cli", ".gemini", "commands", "ops", "swarm.toml"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "gemini-cli", ".gemini", "commands", "ops", "nuke.toml"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "gemini-cli", ".gemini", "GEMINI.md"))), true);
assert.equal(generated.some((file) => file.includes(`${path.sep}.gemini${path.sep}extensions${path.sep}agent-surface${path.sep}`)), false);
assert.equal(generated.some((file) => file.includes(`${path.sep}.agent-surface${path.sep}claude-plugin${path.sep}`)), false);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "cline", "Documents", "Cline", "Rules", "agent-surface.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "kilo", ".config", "kilo", "commands", "ops-flow.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "kilo", ".config", "kilo", "AGENTS.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "kilo", ".config", "kilo", "rules", "00-precedence-and-safety.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "kilo", ".config", "kilo", "rules", "14-lang-shell.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "antigravity", "global_workflows", "ops-flow.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "antigravity-cli", "plugins", "agent-surface", "plugin.json"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "antigravity-cli", "plugins", "agent-surface", "skills", "ops-flow.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "antigravity-cli", "plugins", "agent-surface", "rules", "00-precedence-and-safety.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "cursor", ".cursor", "rules", "00-precedence-and-safety.mdc"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "copilot", "instructions", "agent-surface-copilot.instructions.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "vscode", "instructions", "agent-surface.instructions.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "opencode", ".config", "opencode", "AGENTS.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "trae", ".trae", "user_rules.md"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "cursor", ".cursorignore"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "kilo", ".kilocodeignore"))), true);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "cline", ".clineignore"))), true);
const cursorIgnore = readFileSync(path.join(root, "dist", "cursor", ".cursorignore"), "utf8");
assert.match(cursorIgnore, /agent-surface canonical AI-tool ignore baseline/);
const ignoresCheck = run(["check", "ignores"]);
assert.match(ignoresCheck, /ignores check: ok/);
assert.match(ignoresCheck, /emitters 3 \(cline, cursor, kilo\)/);
assert.equal(generated.some((file) => file.includes(`${path.sep}.claude${path.sep}agents${path.sep}`)), false);
assert.equal(generated.some((file) => file.includes(`${path.sep}.codex${path.sep}agents${path.sep}`)), false);
assert.equal(generated.some((file) => file.includes(`${path.sep}.config${path.sep}kilo${path.sep}agents${path.sep}`)), false);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "cursor", ".cursor", "mcp.json"))), false);
assert.equal(generated.some((file) => file.endsWith(path.join("dist", "claude-code", ".mcp.json"))), false);
const sourceKinds = JSON.parse(readFileSync(path.join(root, "registry", "source-kinds.json"), "utf8"));
assert.equal(Object.hasOwn(sourceKinds.source_kinds, "mcps"), false);
assert.equal(Object.hasOwn(sourceKinds.source_kinds, "subagents"), false);
const generatedCheck = run(["check", "generated"]);
assert.match(generatedCheck, /claude-code: generated outputs 64 ok/);
assert.match(generatedCheck, /codex: generated outputs 129 ok/);
assert.match(generatedCheck, /cline: generated outputs 66 ok/);
assert.match(generatedCheck, /kilo: generated outputs 77 ok/);
assert.match(generatedCheck, /antigravity: generated outputs 64 ok/);
assert.match(generatedCheck, /antigravity-cli: generated outputs 77 ok/);
assert.match(generatedCheck, /gemini-cli: generated outputs 65 ok/);
assert.match(generatedCheck, /cursor: generated outputs 76 ok/);
assert.match(generatedCheck, /copilot: generated outputs 1 ok/);
assert.match(generatedCheck, /generated check: ok/);
const copilotGeneratedCheck = run(["check", "generated", "--target", "copilot"]);
assert.match(copilotGeneratedCheck, /copilot: generated outputs 1 ok/);

const clinePlan = run(["install", "--target", "cline", "--dest", "/tmp/agent-surface-cline", "--dry-run"]);
assert.match(clinePlan, /^target: cline$/m);
assert.match(clinePlan, /^root source: explicit --dest$/m);
assert.match(clinePlan, /\.clinerules\/workflows\/workflow-boss\.md <- commands\/workflow-boss\.md/);
assert.match(clinePlan, /\.clinerules\/workflows\/workflow-orchestrator\.md <- commands\/workflow-orchestrator\.md/);
assert.match(clinePlan, /\.clinerules\/agent-surface\.md <- rules\/\*\.mdc/);
assert.match(clinePlan, /\.agent-surface\/cline-manifest\.json/);

const kiloPlan = run(["install", "--target", "kilo", "--dest", "/tmp/agent-surface-kilo", "--dry-run"]);
assert.match(kiloPlan, /^target: kilo$/m);
assert.match(kiloPlan, /\.kilo\/commands\/workflow-boss\.md <- commands\/workflow-boss\.md/);
assert.match(kiloPlan, /AGENTS\.md <- rules\/\*\.mdc/);
assert.match(kiloPlan, /\.kilo\/rules\/00-precedence-and-safety\.md <- rules\/00-precedence-and-safety\.mdc/);
assert.match(kiloPlan, /\.kilo\/rules\/14-lang-shell\.md <- rules\/14-lang-shell\.mdc/);
assert.match(kiloPlan, /kilo\.jsonc instructions \+= \.kilo\/rules\/00-precedence-and-safety\.md, .*\.kilo\/rules\/14-lang-shell\.md/);
assert.match(kiloPlan, /\.agent-surface\/kilo-manifest\.json/);

const geminiPlan = run(["install", "--target", "gemini-cli", "--dest", "/tmp/agent-surface-gemini", "--dry-run"]);
assert.match(geminiPlan, /^target: gemini-cli$/m);
assert.match(geminiPlan, /\.gemini\/commands\/workflow\/boss\.toml <- commands\/workflow-boss\.md/);
assert.match(geminiPlan, /\.gemini\/GEMINI\.md <- rules\/\*\.mdc/);

const antigravityCliPlan = run(["install", "--target", "antigravity-cli", "--dest", "/tmp/agent-surface-antigravity-cli", "--dry-run"]);
assert.match(antigravityCliPlan, /^target: antigravity-cli$/m);
assert.match(antigravityCliPlan, /plugins\/agent-surface\/skills\/workflow-boss\.md <- commands\/workflow-boss\.md/);
assert.match(antigravityCliPlan, /plugins\/agent-surface\/rules\/00-precedence-and-safety\.md <- rules\/00-precedence-and-safety\.mdc/);

const claudePlan = run(["install", "--target", "claude-code", "--dest", "/tmp/agent-surface-claude", "--dry-run"]);
assert.match(claudePlan, /^target: claude-code$/m);
assert.match(claudePlan, /\.claude\/commands\/workflow\/boss\.md <- commands\/workflow-boss\.md/);
assert.doesNotMatch(claudePlan, /\.agent-surface\/claude-plugin/);

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
assert.match(liveInstall, /wrote: 66/);
assert.match(readFileSync(path.join(liveDest, ".clinerules", "workflows", "workflow-boss.md"), "utf8"), /^## OBJECTIVE/);
assert.match(readFileSync(path.join(liveDest, ".clineignore"), "utf8"), /agent-surface canonical AI-tool ignore baseline/);
const liveManifest = JSON.parse(readFileSync(path.join(liveDest, ".agent-surface", "cline-manifest.json"), "utf8"));
assert.equal(liveManifest.target, "cline");
assert.equal(liveManifest.managed.length, 66);
assert.equal(liveManifest.managed[0].managed_by, "agent-surface");
rmSync(liveDest, { recursive: true, force: true });

// Install now overwrites existing files by default.
const unmanagedDest = "/tmp/agent-surface-unmanaged";
rmSync(unmanagedDest, { recursive: true, force: true });
mkdirSync(path.join(unmanagedDest, ".clinerules", "workflows"), { recursive: true });
writeFileSync(path.join(unmanagedDest, ".clinerules", "workflows", "workflow-boss.md"), "local workflow\n");
const overwriteInstall = run(["install", "--target", "cline", "--dest", unmanagedDest]);
assert.match(overwriteInstall, /^installed:$/m);
assert.match(readFileSync(path.join(unmanagedDest, ".clinerules", "workflows", "workflow-boss.md"), "utf8"), /^## OBJECTIVE/);
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
rmSync(path.join(workflowRunDir, "boss.json"), { force: true });
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

const userScopeHome = "/tmp/agent-surface-user-scope-home";
rmSync(userScopeHome, { recursive: true, force: true });
mkdirSync(userScopeHome, { recursive: true });
const userScopeEnv = { ...process.env, HOME: userScopeHome };
const clineUserScope = status(["install", "--target", "cline", "--scope", "user", "--dry-run"], { env: userScopeEnv });
assert.equal(clineUserScope.status, 0, `${clineUserScope.stdout}${clineUserScope.stderr}`);
assert.match(clineUserScope.stdout, /Documents\/Cline\/Workflows\/workflow-boss\.md <- commands\/workflow-boss\.md/);

const kiloUserScope = status(["install", "--target", "kilo", "--scope", "user", "--dry-run"], { env: userScopeEnv });
assert.equal(kiloUserScope.status, 0, `${kiloUserScope.stdout}${kiloUserScope.stderr}`);
assert.match(kiloUserScope.stdout, /\.config\/kilo\/commands\/workflow-boss\.md <- commands\/workflow-boss\.md/);
assert.match(kiloUserScope.stdout, /\.config\/kilo\/AGENTS\.md <- rules\/\*\.mdc/);
assert.match(kiloUserScope.stdout, /\.config\/kilo\/rules\/00-precedence-and-safety\.md <- rules\/00-precedence-and-safety\.mdc/);
assert.match(kiloUserScope.stdout, /\.config\/kilo\/rules\/14-lang-shell\.md <- rules\/14-lang-shell\.mdc/);
assert.match(kiloUserScope.stdout, /\.config\/kilo\/kilo\.jsonc instructions \+= \.\/rules\/00-precedence-and-safety\.md, .*\.\/rules\/14-lang-shell\.md/);
assert.match(kiloUserScope.stdout, /\.kilocodeignore \(project-scope only\)/);
assert.doesNotMatch(kiloUserScope.stdout, /\.kilocodeignore <- ignores/);

const claudeUserScope = status(["install", "--target", "claude-code", "--scope", "user", "--dry-run"], { env: userScopeEnv });
assert.equal(claudeUserScope.status, 0, `${claudeUserScope.stdout}${claudeUserScope.stderr}`);
assert.doesNotMatch(claudeUserScope.stdout, /\.mcp\.json/);
rmSync(userScopeHome, { recursive: true, force: true });

const kiloIgnoreDest = "/tmp/agent-surface-kilo-ignore-proj";
rmSync(kiloIgnoreDest, { recursive: true, force: true });
mkdirSync(kiloIgnoreDest, { recursive: true });
const kiloProjectScope = status(["install", "--target", "kilo", "--dest", kiloIgnoreDest, "--scope", "project", "--dry-run"]);
assert.equal(kiloProjectScope.status, 0, `${kiloProjectScope.stdout}${kiloProjectScope.stderr}`);
assert.match(kiloProjectScope.stdout, /\.kilocodeignore <- ignores\/default\.ignore/);
rmSync(kiloIgnoreDest, { recursive: true, force: true });

const invalidKiloDest = "/tmp/agent-surface-kilo-invalid";
rmSync(invalidKiloDest, { recursive: true, force: true });
mkdirSync(invalidKiloDest, { recursive: true });
writeFileSync(path.join(invalidKiloDest, "kilo.jsonc"), "{\"instructions\":\"bad\"}\n");
const invalidKiloInstall = status(["install", "--target", "kilo", "--dest", invalidKiloDest]);
assert.notEqual(invalidKiloInstall.status, 0);
assert.match(`${invalidKiloInstall.stdout}${invalidKiloInstall.stderr}`, /kilo\.jsonc: instructions must be an array/);
assert.equal(existsSync(path.join(invalidKiloDest, ".kilo")), false);
assert.equal(existsSync(path.join(invalidKiloDest, "AGENTS.md")), false);
assert.equal(existsSync(path.join(invalidKiloDest, ".agent-surface", "kilo-manifest.json")), false);
rmSync(invalidKiloDest, { recursive: true, force: true });

const existingKiloDest = "/tmp/agent-surface-kilo-existing";
rmSync(existingKiloDest, { recursive: true, force: true });
mkdirSync(existingKiloDest, { recursive: true });
writeFileSync(
  path.join(existingKiloDest, "kilo.jsonc"),
  [
    "{",
    "  // keep this comment",
    "  \"instructions\": [",
    "    \"./existing-rule.md\",",
    "    \".kilo/rules/agent-surface.md\",",
    "  ],",
    "  \"marker\": \",]\"",
    "}",
    "",
  ].join("\n"),
);
run(["install", "--target", "kilo", "--dest", existingKiloDest]);
const mergedKiloConfig = readFileSync(path.join(existingKiloDest, "kilo.jsonc"), "utf8");
assert.match(mergedKiloConfig, /\/\/ keep this comment/);
assert.match(mergedKiloConfig, /"marker": ",\]"/);
assert.match(mergedKiloConfig, /"\.\/existing-rule\.md"/);
assert.doesNotMatch(mergedKiloConfig, /"\.kilo\/rules\/agent-surface\.md"/);
assert.match(mergedKiloConfig, /"\.kilo\/rules\/00-precedence-and-safety\.md"/);
assert.match(mergedKiloConfig, /"\.kilo\/rules\/14-lang-shell\.md"/);
rmSync(existingKiloDest, { recursive: true, force: true });

const inlineKiloDest = "/tmp/agent-surface-kilo-inline";
rmSync(inlineKiloDest, { recursive: true, force: true });
mkdirSync(inlineKiloDest, { recursive: true });
writeFileSync(path.join(inlineKiloDest, "kilo.jsonc"), "{\"instructions\":[\"./existing-rule.md\"]}\n");
run(["install", "--target", "kilo", "--dest", inlineKiloDest]);
const inlineKiloConfig = JSON.parse(readFileSync(path.join(inlineKiloDest, "kilo.jsonc"), "utf8"));
assert.deepEqual(inlineKiloConfig.instructions, [
  "./existing-rule.md",
  ".kilo/rules/00-precedence-and-safety.md",
  ".kilo/rules/01-response-style.md",
  ".kilo/rules/02-agent-workflow.md",
  ".kilo/rules/03-project-defaults.md",
  ".kilo/rules/05-tooling.md",
  ".kilo/rules/06-test-policy.md",
  ".kilo/rules/10-lang-python.md",
  ".kilo/rules/11-lang-rust.md",
  ".kilo/rules/12-lang-go.md",
  ".kilo/rules/13-lang-typescript.md",
  ".kilo/rules/14-lang-shell.md",
]);
rmSync(inlineKiloDest, { recursive: true, force: true });

for (const target of ["cursor", "copilot", "vscode", "opencode", "trae", "kilo"]) {
  const targetDest = `/tmp/agent-surface-${target}-live`;
  rmSync(targetDest, { recursive: true, force: true });
  const install = run(["install", "--target", target, "--dest", targetDest]);
  assert.match(install, /^installed:$/m);
  const manifest = JSON.parse(readFileSync(path.join(targetDest, ".agent-surface", `${target}-manifest.json`), "utf8"));
  assert.equal(manifest.target, target);
  assert.equal(manifest.managed.length > 0, true);
  if (target === "kilo") {
    const kiloConfig = JSON.parse(readFileSync(path.join(targetDest, "kilo.jsonc"), "utf8"));
    assert.deepEqual(kiloConfig.instructions, [
      ".kilo/rules/00-precedence-and-safety.md",
      ".kilo/rules/01-response-style.md",
      ".kilo/rules/02-agent-workflow.md",
      ".kilo/rules/03-project-defaults.md",
      ".kilo/rules/05-tooling.md",
      ".kilo/rules/06-test-policy.md",
      ".kilo/rules/10-lang-python.md",
      ".kilo/rules/11-lang-rust.md",
      ".kilo/rules/12-lang-go.md",
      ".kilo/rules/13-lang-typescript.md",
      ".kilo/rules/14-lang-shell.md",
    ]);
  }
  rmSync(targetDest, { recursive: true, force: true });
}

assert.equal(existsSync(path.join(root, "commands", "ops-server.md")), false);

rmSync(path.join(root, "dist"), { recursive: true, force: true });

console.log("test: ok");
