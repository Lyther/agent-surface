#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkSkillMetadata, validateScopedRuleInstructions } from "../../scripts/agent-surface/check.mjs";
import { renderVsCodeScopedInstructionDocument } from "../../scripts/agent-surface/render.mjs";
import { readRules } from "../../scripts/agent-surface/rules.mjs";
import { parseSkill } from "../../scripts/agent-surface/skills.mjs";
import { targets } from "../../scripts/agent-surface/targets.mjs";
import {
  disposableCheckout,
  expectedCommandCount,
  expectedSkillCount,
  files,
  hasLocalOpsServerSkill,
  MAX_CAPTURE_BYTES,
  root,
  run, status,
} from "../lib/helpers.mjs";

function countExt(dir, exts) {
  return files(path.join(root, dir)).filter((file) => exts.some((ext) => file.endsWith(ext))).length;
}

rmSync(path.join(root, "dist"), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });

assert.equal(run(["check"]).trim(), "check: ok");
assert.match(run(["check", "commands"]), /commands check: ok/);
assert.match(run(["check", "skills"]), /skills check: ok/);

// Antigravity CLI loads only the first 24,000 bytes of a skill body, so a canonical skill past it fails
// the check. The limit counts UTF-8 bytes: 12,001 two-byte characters are over it.
// SUBSTITUTE_JUSTIFICATION
// - substitute: an in-memory skill text parsed by the real skill parser
// - replaces: an oversized SKILL.md in the checkout, which the check itself forbids
// - necessity: boundary sizes need exact bodies that no canonical skill can hold
// - real-option: the real parseSkill and checkSkillMetadata run unchanged; only the input is constructed
// - proof-limit: proves the check's arithmetic, not how much Antigravity CLI loads
// - real-proof: Antigravity CLI 1.4.2 `plugin validate --json`, recorded in adapters/antigravity-cli/README.md
{
  const bodyErrors = (body) => {
    const errors = [];
    const skill = parseSkill(path.join(root, "skills", "big", "SKILL.md"), `---\nname: big\ndescription: "Big."\n---\n${body}`);
    checkSkillMetadata([skill], errors);
    return errors;
  };
  assert.deepEqual(bodyErrors("a".repeat(24000)), [], "a body exactly at the limit passes");
  assert.deepEqual(bodyErrors("a".repeat(24001)), [
    `${path.join("skills", "big", "SKILL.md")}: body is 24001 bytes; Antigravity CLI loads only the first 24000, so move detail into references/`,
  ]);
  assert.match(bodyErrors("\u00e9".repeat(12001)).join("\n"), /body is 24002 bytes/);
}
const targetCapabilities = JSON.parse(readFileSync(path.join(root, "registry", "target-capabilities.json"), "utf8"));
const clineCapabilities = targetCapabilities.targets.cline;
assert.ok(clineCapabilities.generated_render_tokens.includes("subagents"));
assert.equal(clineCapabilities.surfaces.subagents.generation, "generated");
assert.match(clineCapabilities.surfaces.subagents.notes, /subagents\/\*\.md source primitive compiles to Cline Configured Agents/);
assert.equal(clineCapabilities.surfaces["runtime-subagents"].generation, "not-applicable");
assert.match(clineCapabilities.surfaces["runtime-subagents"].notes, /separate from Configured Agents/);
assert.deepEqual(targetCapabilities.targets["grok-build"].surfaces.rules.paths, [
  "~/.grok/AGENTS.md",
  "AGENTS.md",
  ".grok/references/rules/<rule>.md",
]);
assert.deepEqual(targetCapabilities.targets["grok-build"].surfaces.rules.scope, ["user", "project"]);
assert.deepEqual(targetCapabilities.targets["trae-cli"].surfaces.rules.paths, ["~/.trae/rules/<name>.md", ".trae/rules/<name>.md"]);
assert.deepEqual(targetCapabilities.targets["trae-cli"].surfaces.rules.scope, ["user", "project"]);
assert.deepEqual(targetCapabilities.targets.vscode.surfaces.instructions.paths, [
  "prompts/agent-surface.instructions.md",
  "prompts/agent-surface-<scoped-rule>.instructions.md",
]);

// A scoped rule reaches the VS Code profile as an instruction file the host attaches by glob, so its
// globs are a consumed interface and not prose: one that goes missing stops applying the rule where
// it should, and a catch-all attaches it to every request instead.
{
  const scopedRules = (await readRules()).filter((rule) => rule.alwaysApply === false);
  const pythonRule = scopedRules.find((rule) => rule.file.endsWith("10-python.mdc"));
  const rendered = {
    source: pythonRule.file,
    relativeOutput: path.join("prompts", "agent-surface-10-python.instructions.md"),
    content: renderVsCodeScopedInstructionDocument(pythonRule),
  };
  assert.deepEqual(validateScopedRuleInstructions([rendered], scopedRules), []);
  const dropped = { ...rendered, content: rendered.content.replace(", pyproject.toml", "") };
  assert.match(
    validateScopedRuleInstructions([dropped], scopedRules).join("\n"),
    /drops the applicability glob pyproject\.toml/,
  );
  const widened = { ...rendered, content: rendered.content.replace(/^applyTo: ".*"$/m, 'applyTo: "**"') };
  assert.match(validateScopedRuleInstructions([widened], scopedRules).join("\n"), /catch-all glob \*\*/);
}

// Every case below rewrites a tracked registry file, so it runs in a disposable checkout: neither
// the rewrite nor an interrupted run can reach the shared one.
const sandbox = disposableCheckout();

// renders validation: registry must not claim a surface token that no producer emits
const targetsRegistryPath = path.join(sandbox.root, "registry", "targets.json");
const targetsRegistryOriginal = readFileSync(targetsRegistryPath, "utf8");
try {
  const mutatedTargets = JSON.parse(targetsRegistryOriginal);
  mutatedTargets.in_scope.codex.renders.push("bogus-token");
  writeFileSync(targetsRegistryPath, `${JSON.stringify(mutatedTargets, null, 2)}\n`);
  const bogusRenders = sandbox.status(["check"]);
  assert.equal(bogusRenders.status, 1);
  assert.match(bogusRenders.stderr, /renders token not emitted by producer: bogus-token/);
} finally {
  writeFileSync(targetsRegistryPath, targetsRegistryOriginal);
}
assert.equal(sandbox.run(["check"]).trim(), "check: ok");

// SUBSTITUTE_JUSTIFICATION
// - substitute: one malformed legacy-owned registry value in the disposable checkout
// - replaces: a historical ownership typo that would otherwise require corrupting a real release registry
// - necessity: schema rejection requires a deterministic invalid value, which the disposable checkout keeps out of the shared one
// - real-option: the production check command and real registry loader are used; only the invalid input is controlled
// - proof-limit: proves structural validation, not the later filesystem cleanup operation
// - real-proof: tests/suites/install.test.mjs exercises real retired-target cleanup on a disposable filesystem
const legacyOwnedPath = path.join(sandbox.root, "registry", "legacy-owned.json");
const legacyOwnedOriginal = readFileSync(legacyOwnedPath, "utf8");
try {
  const malformedLegacyOwned = JSON.parse(legacyOwnedOriginal);
  malformedLegacyOwned.files[0].output = 17;
  writeFileSync(legacyOwnedPath, `${JSON.stringify(malformedLegacyOwned, null, 2)}\n`);
  const malformedLegacy = sandbox.status(["check"]);
  assert.equal(malformedLegacy.status, 1);
  assert.match(`${malformedLegacy.stdout}${malformedLegacy.stderr}`, /registry\/legacy-owned\.json/);
} finally {
  writeFileSync(legacyOwnedPath, legacyOwnedOriginal);
}
assert.equal(sandbox.run(["check"]).trim(), "check: ok");

const optionalServicesPath = path.join(sandbox.root, "registry", "optional-services.json");
const optionalServicesOriginal = readFileSync(optionalServicesPath, "utf8");
try {
  const mutatedServices = JSON.parse(optionalServicesOriginal);
  mutatedServices.services["ctf-skills"].optional = true;
  writeFileSync(optionalServicesPath, `${JSON.stringify(mutatedServices, null, 2)}\n`);
  const inconsistentService = sandbox.status(["check"]);
  assert.equal(inconsistentService.status, 1);
  assert.match(`${inconsistentService.stdout}${inconsistentService.stderr}`, /registry\/optional-services\.json/);
  assert.match(`${inconsistentService.stdout}${inconsistentService.stderr}`, /optional/);
} finally {
  writeFileSync(optionalServicesPath, optionalServicesOriginal);
}
assert.equal(sandbox.run(["check"]).trim(), "check: ok");

// Required external pack without a committed submodule gitlink must fail check.
try {
  const mutatedServices = JSON.parse(optionalServicesOriginal);
  mutatedServices.services["ctf-skills"].path = "external/unregistered-required-pin";
  writeFileSync(optionalServicesPath, `${JSON.stringify(mutatedServices, null, 2)}\n`);
  const unpinnedRequired = sandbox.status(["check"]);
  assert.equal(unpinnedRequired.status, 1);
  assert.match(
    `${unpinnedRequired.stdout}${unpinnedRequired.stderr}`,
    /required external service ctf-skills \(external\/unregistered-required-pin\) is not a registered submodule/,
  );
} finally {
  writeFileSync(optionalServicesPath, optionalServicesOriginal);
}
assert.equal(sandbox.run(["check"]).trim(), "check: ok");

// Demoting first-party synapse must re-impose external pin requirements.
try {
  const mutatedServices = JSON.parse(optionalServicesOriginal);
  delete mutatedServices.services.synapse.first_party;
  writeFileSync(optionalServicesPath, `${JSON.stringify(mutatedServices, null, 2)}\n`);
  const demotedFirstParty = sandbox.status(["check"]);
  assert.equal(demotedFirstParty.status, 1);
  assert.match(`${demotedFirstParty.stdout}${demotedFirstParty.stderr}`, /registry\/optional-services\.json/);
} finally {
  writeFileSync(optionalServicesPath, optionalServicesOriginal);
}
assert.equal(sandbox.run(["check"]).trim(), "check: ok");

// served_by: served packs must not declare skill_roots; served_by must name a first-party MCP.
try {
  const mutated = JSON.parse(optionalServicesOriginal);
  mutated.services["anthropic-cybersecurity-skills"].skill_roots = ["external/anthropic-cybersecurity-skills/skills/*"];
  writeFileSync(optionalServicesPath, `${JSON.stringify(mutated, null, 2)}\n`);
  const r = sandbox.status(["check"]);
  assert.equal(r.status, 1, "served pack regaining skill_roots must fail check");
  assert.match(`${r.stdout}${r.stderr}`, /served pack anthropic-cybersecurity-skills must not declare skill_roots/);
} finally {
  writeFileSync(optionalServicesPath, optionalServicesOriginal);
}
try {
  const mutated = JSON.parse(optionalServicesOriginal);
  mutated.services["anthropic-cybersecurity-skills"].served_by = ["codex-redteam-mode"];
  writeFileSync(optionalServicesPath, `${JSON.stringify(mutated, null, 2)}\n`);
  const r = sandbox.status(["check"]);
  assert.equal(r.status, 1, "served_by must reference a first-party mcp service");
  assert.match(`${r.stdout}${r.stderr}`, /server "codex-redteam-mode" must be a first-party mcp service/);
} finally {
  writeFileSync(optionalServicesPath, optionalServicesOriginal);
}
try {
  const mutated = JSON.parse(optionalServicesOriginal);
  mutated.services["anthropic-cybersecurity-skills"].attribution = "   ";
  writeFileSync(optionalServicesPath, `${JSON.stringify(mutated, null, 2)}\n`);
  const r = sandbox.status(["check"]);
  assert.equal(r.status, 1, "served Grimoire pack attribution must contain non-whitespace text");
  assert.match(`${r.stdout}${r.stderr}`, /registry\/optional-services\.json/);
} finally {
  writeFileSync(optionalServicesPath, optionalServicesOriginal);
}
assert.equal(sandbox.run(["check"]).trim(), "check: ok");
sandbox.remove();

const inventory = run(["inventory"]);
const expectedInventory = {
  rules: countExt("rules", [".md", ".mdc"]),
  commands: countExt("commands", [".md"]),
  subagents: countExt("subagents", [".md"]),
  external: readdirSync(path.join(root, "external"), { withFileTypes: true }).filter((e) => e.isDirectory()).length,
  schemas: countExt("schemas", [".json"]),
};
for (const [key, count] of Object.entries(expectedInventory)) {
  assert.match(inventory, new RegExp(`^${key}: ${count}$`, "m"));
}
assert.equal(expectedInventory.commands, expectedCommandCount);
assert.match(inventory, new RegExp(`^skills: ${expectedSkillCount}$`, "m"));

const skillRegistry = JSON.parse(run(["skills", "--json"]));
assert.equal(skillRegistry.count, expectedSkillCount);
if (hasLocalOpsServerSkill) {
  const opsServer = skillRegistry.skills.find((skill) => skill.name === "ops-server");
  assert.equal(
    opsServer?.model_invocation,
    true,
    "private ops-server must be available for automatic skill selection",
  );
  assert.equal(opsServer.lazy_body.path, "skills/ops-server/SKILL.md");
  const skillSurfaceTargets = Object.entries(targets).filter(([, adapter]) => Boolean(adapter.renderSkill)).map(([id]) => id);
  assert.deepEqual(Object.keys(opsServer.targets).sort(), skillSurfaceTargets.sort());
}
const readinessSkill = skillRegistry.skills.find((skill) => skill.name === "verify-readiness");
assert.equal(readinessSkill.phase, "verify");
const archDiagramSkill = skillRegistry.skills.find((skill) => skill.name === "arch-diagram");
assert.equal(archDiagramSkill.phase, "decide");
assert.match(archDiagramSkill.description, /evidence-backed architecture atlas/);
const archContractSkill = skillRegistry.skills.find((skill) => skill.name === "arch-contract");
assert.equal(archContractSkill.phase, "decide");
assert.equal(archContractSkill.model_invocation, true);
assert.equal(skillRegistry.skills.find((skill) => skill.name === "arch-api"), undefined);
assert.equal(skillRegistry.skills.find((skill) => skill.name === "arch-model"), undefined);
const opsFlowSkill = skillRegistry.skills.find((skill) => skill.name === "ops-flow");
assert.equal(opsFlowSkill.phase, "decide");
assert.equal(opsFlowSkill.model_invocation, true);
assert.equal(opsFlowSkill.metadata_source, "frontmatter");
assert.deepEqual(opsFlowSkill.lazy_body, {
  type: "file",
  path: "skills/ops-flow/SKILL.md",
  frontmatter_stripped: true,
});
assert.equal(Object.hasOwn(opsFlowSkill, "body"), false);
assert.equal(opsFlowSkill.targets["claude-code"], path.join(".claude", "skills", "ops-flow", "SKILL.md"));
assert.equal(opsFlowSkill.targets.cline, path.join(".cline", "skills", "ops-flow", "SKILL.md"));
const bootConceptSkill = skillRegistry.skills.find((skill) => skill.name === "boot-concept");
assert.equal(bootConceptSkill.phase, "bootstrap");

for (const name of ["arch-diagram", "qa-self-critique", "verify-test"]) {
  assert.equal(skillRegistry.skills.find((skill) => skill.name === name)?.model_invocation, true);
}
assert.equal(skillRegistry.skills.find((skill) => skill.name === "qa-sec"), undefined);
assert.equal(skillRegistry.skills.find((skill) => skill.name === "verify-spec"), undefined);
assert.equal(skillRegistry.skills.find((skill) => skill.name === "dev-spec")?.phase, "build");
const devCoreSkill = skillRegistry.skills.find((skill) => skill.name === "dev-core");
assert.equal(devCoreSkill?.phase, "build");
assert.equal(devCoreSkill?.model_invocation, true);

const registry = JSON.parse(run(["commands", "--json"]));
assert.equal(registry.count, expectedCommandCount);
const expectedCommands = ["boot-facade", "ops-nuke", "ship-commit", "ship-deploy", "ship-release"];
assert.deepEqual(registry.commands.map((command) => command.name).sort(), expectedCommands.sort());
assert.equal(registry.commands.every((command) => command.model_invocation === false), true);
assert.equal(registry.commands.some((command) => command.name === "ops-server"), false);

const shipCommands = JSON.parse(run(["commands", "--phase", "ship", "--json"]));
assert.equal(shipCommands.commands.every((command) => command.phase === "ship"), true);
assert.equal(shipCommands.commands.every((command) => command.model_invocation === false), true);

// A packaged copy can live under a consumer Git checkout whose node_modules/ is
// ignored. The enclosing repository must not make agent-surface drop its own
// committed manual commands.
const consumerRoot = mkdtempSync(path.join(tmpdir(), "agent-surface-consumer-"));
try {
  execFileSync("git", ["init", "-q"], { cwd: consumerRoot });
  writeFileSync(path.join(consumerRoot, ".gitignore"), "node_modules/\n");
  const packed = JSON.parse(execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", consumerRoot],
    { cwd: root, encoding: "utf8", maxBuffer: MAX_CAPTURE_BYTES },
  ));
  const modulesRoot = path.join(consumerRoot, "node_modules");
  mkdirSync(modulesRoot);
  execFileSync("tar", ["-xzf", path.join(consumerRoot, packed[0].filename), "-C", modulesRoot]);
  const packagedRoot = path.join(modulesRoot, "agent-surface");
  renameSync(path.join(modulesRoot, "package"), packagedRoot);
  symlinkSync(path.join(root, "node_modules"), path.join(packagedRoot, "node_modules"), "dir");
  const packagedCheck = await import(pathToFileURL(
    path.join(packagedRoot, "scripts", "agent-surface", "check.mjs"),
  ));
  const packagedCommands = await packagedCheck.exportableCommands();
  assert.deepEqual(
    packagedCommands.map((command) => command.name).sort(),
    ["boot-facade", "ops-nuke", "ship-commit", "ship-deploy", "ship-release"],
  );
} finally {
  rmSync(consumerRoot, { recursive: true, force: true });
}

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
// 04-cybersecurity is scoped (alwaysApply:false): it must NOT attach to a generic session.
assert.doesNotMatch(genericRules, /rules\/04-cybersecurity\.mdc/);

for (const scenario of ["python-source", "python-tooling", "rust-source", "go-ci", "typescript-eslint", "shell-script", "security-exploit", "ordinary-patch"]) {
  const output = run(["check", "rules", "--scenario", scenario]);
  assert.match(output, new RegExp(`^${scenario}:$`, "m"));
  assert.doesNotMatch(output, /^errors:$/m);
  // 04-cybersecurity attaches only where a security-related path matches its globs.
  if (scenario === "security-exploit") {
    assert.match(output, /rules\/04-cybersecurity\.mdc/);
  } else {
    assert.doesNotMatch(output, /rules\/04-cybersecurity\.mdc/);
  }
}

console.log("check: ok");
