#!/usr/bin/env node
import * as TOML from "@decimalturn/toml-patch";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { kimiCodeCursorSettingsPath, kimiCodeVsCodeSettingsPath, vsCodeUserRoot } from "../../scripts/agent-surface/roots.mjs";
import { targets } from "../../scripts/agent-surface/targets.mjs";
import {
  clineIdeUserDataRoot,
  clineUserMcpRoutes,
  hasLocalOpsServerCommand,
  root,
  run, status,
} from "../lib/helpers.mjs";

function dryRun(target, extra = []) {
  return run(["install", "--target", target, "--dest", `/tmp/agent-surface-${target}`, ...extra, "--dry-run"]);
}

function planHas(plan, patterns, label) {
  for (const pattern of patterns) {
    assert.match(plan, pattern, `${label}: ${pattern}`);
  }
}

function planLacks(plan, patterns, label) {
  for (const pattern of patterns) {
    assert.doesNotMatch(plan, pattern, `${label}: !${pattern}`);
  }
}

// Representative dry-run contracts (not a per-path laundry list for every host).
const clinePlan = dryRun("cline", ["--category", "development"]);
planHas(clinePlan, [
  /^target: cline$/m,
  /\.cline\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/,
  /\.clinerules\/workflows\/ops-nuke\.md <- commands\/ops-nuke\.md/,
  /\.clinerules\/agent-surface\.md <- rules\/\*\.mdc/,
  /\.cline\/agents\/boss\.yaml <- subagents\/boss\.md/,
  /\.agent-surface\/cline-manifest\.json/,
], "cline");
planLacks(clinePlan, [/cline_mcp_settings\.json MCP/], "cline");

const clineUserMcpPlan = run([
  "install", "--target", "cline", "--scope", "user", "--dest", "/tmp/agent-surface-cline-user-mcp",
  "--category", "mcps", "--dry-run",
]);
planHas(clineUserMcpPlan, [
  /\.cline\/data\/settings\/cline_mcp_settings\.json MCP \+= grimoire, synapse/,
  /Code\/User\/globalStorage\/saoudrizwan\.claude-dev\/settings\/cline_mcp_settings\.json MCP \+= grimoire, synapse/,
], "cline user mcps");
planLacks(clineUserMcpPlan, [/\.cline\/mcp\.json/], "cline user mcps");

const kiloPlan = dryRun("kilo", ["--category", "development"]);
planHas(kiloPlan, [
  /\.kilo\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/,
  /\.kilo\/commands\/ops-nuke\.md <- commands\/ops-nuke\.md/,
  /\.kilo\/rules\/03-project-defaults\.md <- rules\/03-project-defaults\.mdc/,
  /\.kilo\/agents\/boss\.md <- subagents\/boss\.md/,
  /kilo\.jsonc instructions \+= \.kilo\/rules\/02-agent-workflow\.md/,
], "kilo");
planLacks(kiloPlan, [/^  AGENTS\.md <- rules\/\*\.mdc$/m, /kilo\.jsonc instructions \+= .*14-shell/], "kilo");

const kimiCodeDevelopmentPlan = dryRun("kimi-code", ["--category", "development"]);
planHas(kimiCodeDevelopmentPlan, [
  /\.kimi-code\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/,
  /\.kimi-code\/agents\/boss\.md <- subagents\/boss\.md/,
], "kimi-code development");
const kimiCodePlan = dryRun("kimi-code");
planHas(kimiCodePlan, [
  /\.kimi-code\/config\.toml default_permission_mode := "auto"/,
  /\.kimi-code\/mcp\.json MCP \+= grimoire, synapse/,
], "kimi-code");

const qoderDevelopmentPlan = dryRun("qoder", ["--category", "development"]);
planHas(qoderDevelopmentPlan, [
  /\.qoder\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/,
  /\.qoder\/commands\/ops-nuke\.md <- commands\/ops-nuke\.md/,
  /\.qoder\/agents\/boss\.md <- subagents\/boss\.md/,
], "qoder development");
const qoderPlan = dryRun("qoder");
planHas(qoderPlan, [
  /\.qoder\/settings\.json MCP \+= grimoire, synapse/,
], "qoder");

const qwenCodePlan = dryRun("qwen-code");
planHas(qwenCodePlan, [
  /\.qwen\/skills\/ops-ask\/SKILL\.md <- skills\/ops-ask\/SKILL\.md/,
  /\.qwen\/settings\.json MCP \+= grimoire, synapse/,
], "qwen-code");
planLacks(qwenCodePlan, [
  /skills\/workflow-boss\//,
  /commands\/ops-nuke/,
  /subagents\/boss/,
  /skills\/archify\//,
  /skills\/book-study\//,
  /skills\/ctf-ai-ml\//,
  /skills\/stellaris-design\//,
], "qwen-code default excludes optional and categorized packs");

const qwenCodeExternalPlan = dryRun("qwen-code", ["--category", "external"]);
planHas(qwenCodeExternalPlan, [
  /\.qwen\/skills\/book-study\/SKILL\.md/,
  /\.qwen\/skills\/sigma\/SKILL\.md/,
], "qwen-code explicit external packs");
planLacks(qwenCodeExternalPlan, [/skills\/archify\//, /karpathy-guidelines/, /skill-forge/, /skills\/ctf-ai-ml\//], "qwen-code general external packs");

const qwenCodeDevelopmentPlan = dryRun("qwen-code", ["--category", "development"]);
planHas(qwenCodeDevelopmentPlan, [
  /\.qwen\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/,
  /\.qwen\/commands\/ops-nuke\.md <- commands\/ops-nuke\.md/,
  /\.qwen\/agents\/boss\.md <- subagents\/boss\.md/,
  /\.qwen\/skills\/archify\/SKILL\.md/,
  /\.qwen\/skills\/skill-forge\/SKILL\.md/,
  /\.qwen\/skills\/skill-review\/SKILL\.md/,
  /\.qwen\/settings\.json MCP \+= chrome-devtools/,
], "qwen-code development assets");
planLacks(qwenCodeDevelopmentPlan, [
  /skills\/ops-ask\//,
  /skills\/book-study\//,
  /skills\/ctf-ai-ml\//,
  /karpathy-guidelines/,
  /code-review-expert/,
], "qwen-code development isolation");

const qwenCodeCybersecurityPlan = dryRun("qwen-code", ["--category", "cybersecurity"]);
planHas(qwenCodeCybersecurityPlan, [
  /\.qwen\/skills\/ctf-ai-ml\/SKILL\.md/,
  /\.qwen\/skills\/redteam-boundary-policy\/SKILL\.md/,
  /\.qwen\/settings\.json MCP \+= fenjing, ida-pro-mcp, openosint/,
], "qwen-code cybersecurity assets");
planLacks(qwenCodeCybersecurityPlan, [/karpathy-guidelines/, /skills\/stellaris-design\//, /pentest-ai/], "qwen-code cybersecurity isolation");

const qwenCodePentestAiPlan = dryRun("qwen-code", ["--category", "mcps", "--service", "pentest-ai"]);
planHas(qwenCodePentestAiPlan, [/\.qwen\/settings\.json MCP \+= pentest-ai/], "qwen-code explicit pentest-ai MCP");

const qwenCodeChromePlan = dryRun("qwen-code", ["--category", "mcps", "--service", "chrome-devtools"]);
planHas(qwenCodeChromePlan, [/\.qwen\/settings\.json MCP \+= chrome-devtools/], "qwen-code explicit Chrome DevTools MCP");

const qwenCodeModdingPlan = dryRun("qwen-code", ["--category", "modding"]);
planHas(qwenCodeModdingPlan, [/\.qwen\/skills\/stellaris-design\/SKILL\.md/], "qwen-code modding assets");
planLacks(qwenCodeModdingPlan, [/skills\/ctf-ai-ml\//, /karpathy-guidelines/], "qwen-code modding isolation");

const qwenCodeAllPlan = dryRun("qwen-code", ["--category", "all"]);
planHas(qwenCodeAllPlan, [/\.qwen\/skills\/ops-ask\/SKILL\.md/], "qwen-code all general outputs");
planLacks(qwenCodeAllPlan, [/skills\/archify\//, /skills\/ctf-ai-ml\//, /skills\/stellaris-design\//, /karpathy-guidelines/], "qwen-code all keeps opt-in assets explicit");

const antigravityCliModdingPlan = dryRun("antigravity-cli", ["--category", "modding"]);
planHas(antigravityCliModdingPlan, [
  /antigravity-cli\/plugins\/agent-surface\/plugin\.json <- package\.json/,
  /antigravity-cli\/plugins\/agent-surface\/skills\/stellaris-design\/SKILL\.md/,
], "antigravity-cli category scaffold");

if (hasLocalOpsServerCommand) {
  const codexPrivatePlan = dryRun("codex", ["--category", "private"]);
  planHas(codexPrivatePlan, [/\.agents\/skills\/ops-server\/SKILL\.md <- commands\/ops-server\.md/], "codex private assets");
}

const mixedCategory = status([
  "install", "--target", "codex", "--dest", "/tmp/agent-surface-mixed-category",
  "--category", "external,cybersecurity", "--dry-run",
]);
assert.notEqual(mixedCategory.status, 0);
assert.match(mixedCategory.stderr, /asset categories cannot be mixed with output categories/);

// ---- `all` selects the whole set, so it may not be combined ----------------------------
// Both selectors used to answer `all` before validating anything else, which made two different
// requests disappear: the sibling category was dropped (a general reset is not "also install
// development"), and a misspelled sibling was accepted rather than reported. Each case below
// therefore asserts a NON-ZERO exit — a silently broadened install is the failure mode.
const rejects = (flag, value, sibling) => {
  const result = status(["install", "--target", flag === "--target" ? value : "codex", "--dest", "/tmp/agent-surface-all-combo", ...(flag === "--category" ? ["--category", value] : []), "--dry-run"]);
  assert.notEqual(result.status, 0, `${flag} ${value} is rejected rather than silently broadened: ${result.stdout}`);
  assert.match(result.stderr, new RegExp(`${flag} all cannot be combined with ${sibling}`), `${flag} ${value} names the conflicting sibling: ${result.stderr}`);
};
rejects("--category", "all,development", "development");
rejects("--category", "all,skills", "skills");
rejects("--target", "all,codex", "codex");
// A typo next to `all` must surface as an error, not vanish behind it.
rejects("--category", "all,developmnet", "developmnet");
rejects("--target", "all,codx", "codx");
// Standalone `all` keeps its documented meaning on both selectors: the general full sync.
const standaloneCategory = status(["install", "--target", "codex", "--dest", "/tmp/agent-surface-all-standalone", "--category", "all", "--dry-run"]);
assert.equal(standaloneCategory.status, 0, `--category all alone still performs the general sync: ${standaloneCategory.stderr}`);
const noCategory = status(["install", "--target", "codex", "--dest", "/tmp/agent-surface-all-standalone", "--dry-run"]);
assert.equal(standaloneCategory.stdout, noCategory.stdout, "--category all alone plans exactly what omitting --category plans");

const kiroDevelopmentPlan = dryRun("kiro", ["--category", "development"]);
planHas(kiroDevelopmentPlan, [
  /\.kiro\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/,
  /\.kiro\/steering\/command-ops-nuke\.md <- commands\/ops-nuke\.md/,
  /\.kiro\/agents\/boss\.md <- subagents\/boss\.md/,
], "kiro development");
const kiroPlan = dryRun("kiro");
planHas(kiroPlan, [
  /\.kiro\/settings\/mcp\.json MCP \+= grimoire, synapse/,
], "kiro");

const geminiPlan = status(["install", "--target", "gemini-cli", "--dest", "/tmp/agent-surface-gemini", "--dry-run"]);
assert.notEqual(geminiPlan.status, 0);
assert.match(`${geminiPlan.stdout}${geminiPlan.stderr}`, /unsupported install target: gemini-cli/);

for (const [target, patterns] of [
  ["claude-code", [/\.claude\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/, /\.claude\/agents\/boss\.md <- subagents\/boss\.md/]],
  ["cursor", [/\.cursor\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/, /\.cursor\/commands\/ops-nuke\.md <- commands\/ops-nuke\.md/, /\.cursor\/agents\/boss\.md <- subagents\/boss\.md/]],
  ["droid", [/\.factory\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/, /\.factory\/commands\/ops-nuke\.md <- commands\/ops-nuke\.md/]],
  ["codex", [/\.agents\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/]],
  ["openhands", [/\.agents\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/]],
  ["antigravity-cli", [/antigravity-cli\/plugins\/agent-surface\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/]],
  ["copilot", [/\.github\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/, /\.github\/agents\/boss\.agent\.md <- subagents\/boss\.md/]],
]) {
  planHas(dryRun(target, ["--category", "development"]), patterns, `${target} development`);
}
planHas(dryRun("grok-build"), [/\.grok\/config\.toml MCP \+= grimoire, synapse/], "grok-build default");

// OpenHands MCP is user-scope only on project dry-run.
planLacks(dryRun("openhands"), [/\.openhands\/mcp\.json MCP/], "openhands project");

// Goose user-scope: commands use Agent Skills; project recipes never land in $HOME.
// SUBSTITUTE_JUSTIFICATION
// - substitute: gooseHome temporary HOME
// - replaces: the operator's real user-scope Goose and Agent Skills directories
// - necessity: the assertion requires a user-scope install and must not write hundreds of files into the operator profile
// - real-option: the production installer and filesystem are exercised against a disposable real directory; using the operator HOME is destructive
// - proof-limit: proves path selection and install behavior, not Goose runtime discovery
// - real-proof: tests/suites/install-live.test.mjs plus a credentialed Goose task-shaped run
const gooseHome = mkdtempSync(path.join(os.tmpdir(), "agent-surface-goose-home-"));
try {
  const gooseUserPlan = run(
    ["install", "--target", "goose", "--scope", "user", "--allow-scope-root", "--dry-run"],
    { env: { ...process.env, HOME: gooseHome } },
  );
  assert.match(gooseUserPlan, /\.config\/goose\/config\.yaml MCP/);
  assert.doesNotMatch(gooseUserPlan, /recipes\//);
  assert.doesNotMatch(gooseUserPlan, /\.agents\/skills\/ops-server\/SKILL\.md/);
} finally {
  rmSync(gooseHome, { recursive: true, force: true });
}

// --category mcps across all targets must succeed; non-MCP hosts report non-applicable.
{
  const mcpsAllPlan = run(["install", "--target", "all", "--scope", "user", "--allow-scope-root", "--category", "mcps", "--dry-run"], {
    env: { ...process.env, HOME: "/tmp/agent-surface-mcps-all-home" },
  });
  assert.match(mcpsAllPlan, /MCP \+= grimoire, synapse/);
}
const piDshStatus = status(["install", "--target", "pi,dsh", "--scope", "user", "--allow-scope-root", "--category", "mcps", "--dry-run"]);
assert.notEqual(piDshStatus.status, 0);

// Codex keeps manual workflows non-implicit in the shared Agent Skills root.
// Other targets may own the same compatibility file, but Codex must not create
// a second discoverable copy under its private skill root.
const sharedRootHome = "/tmp/agent-surface-shared-root-home";
rmSync(sharedRootHome, { recursive: true, force: true });
const sharedManualRel = path.join(".agents", "skills", "ops-nuke", "SKILL.md");
const sharedManualPath = path.join(sharedRootHome, sharedManualRel);
mkdirSync(path.dirname(sharedManualPath), { recursive: true });
writeFileSync(sharedManualPath, "old shared command\n");
mkdirSync(path.join(sharedRootHome, ".agent-surface"), { recursive: true });
writeFileSync(
  path.join(sharedRootHome, ".agent-surface", "openhands-manifest.json"),
  `${JSON.stringify({
    target: "openhands",
    scope: "user",
    managed: [{ target: "openhands", output: sharedManualRel, version: "test" }],
  }, null, 2)}\n`,
);
run(["install", "--target", "codex,openhands", "--scope", "user", "--allow-scope-root", "--category", "development"], {
  env: { ...process.env, HOME: sharedRootHome },
});
assert.match(readFileSync(sharedManualPath, "utf8"), /^disable-model-invocation: true$/m);
assert.match(
  readFileSync(path.join(sharedRootHome, ".agents", "skills", "ops-nuke", "agents", "openai.yaml"), "utf8"),
  /^  allow_implicit_invocation: false$/m,
);
assert.equal(existsSync(path.join(sharedRootHome, ".codex", "skills", "ops-nuke", "SKILL.md")), false);
assert.equal(existsSync(path.join(sharedRootHome, ".agents", "skills", "ops-flow", "SKILL.md")), true);
rmSync(sharedRootHome, { recursive: true, force: true });

// SUBSTITUTE_JUSTIFICATION
// - substitute: historical managed files and manifest in a disposable install root
// - replaces: an installation made before a canonical or external skill was removed
// - necessity: removed source files no longer exist, so their prior owned state must be seeded
// - real-option: the real installer and filesystem are exercised; mutating shared source/submodule state would disturb user work
// - proof-limit: does not prove a particular host discovers the installed skill
// - real-proof: BLOCKED until an optional pack publishes a revision that removes a skill; rerun against that revision pair
// Strict-sync: prune managed skills that are no longer generated.
const syncDest = "/tmp/agent-surface-strict-sync";
rmSync(syncDest, { recursive: true, force: true });
const ghostRel = path.join(".factory", "skills", "ghost-descoped-skill", "SKILL.md");
const ghostPath = path.join(syncDest, ghostRel);
const retainedCanonicalRel = path.join(".factory", "skills", "retained-canonical-skill", "SKILL.md");
mkdirSync(path.dirname(ghostPath), { recursive: true });
writeFileSync(ghostPath, "---\nname: ghost-descoped-skill\ndescription: removed upstream\n---\nbody\n");
mkdirSync(path.dirname(path.join(syncDest, retainedCanonicalRel)), { recursive: true });
writeFileSync(path.join(syncDest, retainedCanonicalRel), "previously installed\n");
mkdirSync(path.join(syncDest, ".agent-surface"), { recursive: true });
writeFileSync(
  path.join(syncDest, ".agent-surface", "droid-manifest.json"),
  `${JSON.stringify({
    target: "droid",
    managed: [
      {
        target: "droid",
        source: "external/sanyuan-skills/skills/ghost-descoped-skill/SKILL.md",
        output: ghostRel,
        version: "test",
      },
      {
        target: "droid",
        source: "skills/retained-canonical-skill/SKILL.md",
        output: retainedCanonicalRel,
        version: "test",
      },
    ],
  }, null, 2)}\n`,
);
const syncPlan = run(["install", "--target", "droid", "--dest", syncDest, "--dry-run"]);
assert.match(syncPlan, /planned stale managed removals:/);
assert.match(syncPlan, /\.factory\/skills\/ghost-descoped-skill\/SKILL\.md/);
assert.doesNotMatch(syncPlan, /\.factory\/skills\/karpathy-guidelines\/SKILL\.md/);
assert.doesNotMatch(syncPlan, /\.factory\/skills\/ctf-ai-ml\/SKILL\.md/);
const externalSyncPlan = run(["install", "--target", "droid", "--dest", syncDest, "--category", "external", "--dry-run"]);
assert.match(externalSyncPlan, /\.factory\/skills\/ghost-descoped-skill\/SKILL\.md/);
assert.doesNotMatch(externalSyncPlan, /\.factory\/skills\/retained-canonical-skill\/SKILL\.md/);
run(["install", "--target", "droid", "--dest", syncDest, "--category", "external"]);
assert.equal(existsSync(ghostPath), false);
assert.equal(existsSync(path.join(syncDest, retainedCanonicalRel)), true);
assert.equal(existsSync(path.join(syncDest, ".factory", "skills", "book-study", "SKILL.md")), true);
assert.doesNotMatch(
  run(["install", "--target", "droid", "--dest", syncDest, "--category", "external", "--dry-run"]),
  /\.factory\/skills\/ghost-descoped-skill\/SKILL\.md/,
);
rmSync(syncDest, { recursive: true, force: true });

/*
SUBSTITUTE_JUSTIFICATION
- substitute: a disposable Qwen user root with one previously owned categorized MCP id
- replaces: the operator's live Qwen skills, MCP config, and install manifest
- necessity: category resync must exercise removal and preservation without changing the operator profile or source registry
- real-option: the production installer, source packs, config merger, and filesystem are used; only prior owned state is controlled
- proof-limit: proves sequential install state, not Qwen runtime MCP invocation
- real-proof: the completed user-scope distribution plus native runtime MCP inventory
*/
{
  const dest = mkdtempSync(path.join(os.tmpdir(), "agent-surface-category-sequence-"));
  try {
    const generalSkill = path.join(dest, ".qwen", "skills", "ops-ask", "SKILL.md");
    const externalSkill = path.join(dest, ".qwen", "skills", "book-study", "SKILL.md");
    const cyberSkill = path.join(dest, ".qwen", "skills", "ctf-ai-ml", "SKILL.md");
    const developmentSkill = path.join(dest, ".qwen", "skills", "dev-feature", "SKILL.md");
    const settingsPath = path.join(dest, ".qwen", "settings.json");
    const manifestPath = path.join(dest, ".agent-surface", "qwen-code-manifest.json");
    run(["install", "--target", "qwen-code", "--scope", "user", "--dest", dest]);
    run(["install", "--target", "qwen-code", "--scope", "user", "--dest", dest, "--category", "external"]);
    run(["install", "--target", "qwen-code", "--scope", "user", "--dest", dest, "--category", "cybersecurity"]);
    assert.equal(existsSync(generalSkill), true);
    assert.equal(existsSync(externalSkill), true);
    assert.equal(existsSync(cyberSkill), true);
    assert.equal(existsSync(developmentSkill), false);

    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    settings.mcpServers["old-cyber"] = { command: "remove-me", args: [] };
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const configEntry = manifest.config_entries.find((entry) => entry.path === ".qwen/settings.json");
    assert.deepEqual(configEntry.asset_categories, {
      fenjing: "cybersecurity",
      "ida-pro-mcp": "cybersecurity",
      openosint: "cybersecurity",
    });
    configEntry.ids.push("old-cyber");
    configEntry.asset_categories["old-cyber"] = "cybersecurity";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    run(["install", "--target", "qwen-code", "--scope", "user", "--dest", dest, "--category", "cybersecurity"]);
    assert.equal(Object.hasOwn(JSON.parse(readFileSync(settingsPath, "utf8")).mcpServers, "old-cyber"), false);
    run(["install", "--target", "qwen-code", "--scope", "user", "--dest", dest, "--category", "mcps"]);
    const mcpServers = JSON.parse(readFileSync(settingsPath, "utf8")).mcpServers;
    assert.equal(Object.hasOwn(mcpServers, "fenjing"), true);
    assert.equal(Object.hasOwn(mcpServers, "ida-pro-mcp"), true);
    assert.equal(Object.hasOwn(mcpServers, "openosint"), true);
    run(["install", "--target", "qwen-code", "--scope", "user", "--dest", dest, "--category", "external"]);
    assert.equal(existsSync(cyberSkill), true);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

// SUBSTITUTE_JUSTIFICATION
// - substitute: retired Gemini/VSCodium manifests and config in a disposable user root
// - replaces: real profiles previously managed by the removed Gemini and VSCodium targets, including a stale path now owned by Kilo
// - necessity: retirement cleanup needs exact historical ownership without deleting the operator's editor profile
// - real-option: the production all-target installer and filesystem are used; only the old profile state is seeded
// - proof-limit: proves owned file/config cleanup, not VSCodium runtime behavior
// - real-proof: a full user-scope distribution on a machine carrying the prior manifest
const retiredVscodiumDest = "/tmp/agent-surface-retired-vscodium";
rmSync(retiredVscodiumDest, { recursive: true, force: true });
run(["install", "--target", "vscode", "--scope", "user", "--dest", retiredVscodiumDest]);
run(["install", "--target", "kilo", "--scope", "user", "--dest", retiredVscodiumDest]);
const sharedLiveSkillRel = path.join(".agents", "skills", "ops-ask", "SKILL.md");
const sharedLiveSkillPath = path.join(retiredVscodiumDest, sharedLiveSkillRel);
const sharedLiveSkill = readFileSync(sharedLiveSkillPath, "utf8");
const liveKiloConfigRel = path.join(".config", "kilo", "kilo.jsonc");
const liveKiloConfigPath = path.join(retiredVscodiumDest, liveKiloConfigRel);
const liveKiloConfig = JSON.parse(readFileSync(liveKiloConfigPath, "utf8"));
liveKiloConfig.userKey = "keep";
writeFileSync(liveKiloConfigPath, `${JSON.stringify(liveKiloConfig, null, 2)}\n`);
const retiredVscodiumRoot = vsCodeUserRoot("VSCodium", { scope: "user" });
const retiredOwnedRel = path.join(retiredVscodiumRoot, "prompts", "old-owned.md");
const retiredUnownedRel = path.join(retiredVscodiumRoot, "prompts", "keep-user.md");
const retiredMcpRel = path.join(retiredVscodiumRoot, "mcp.json");
mkdirSync(path.join(retiredVscodiumDest, path.dirname(retiredOwnedRel)), { recursive: true });
writeFileSync(path.join(retiredVscodiumDest, retiredOwnedRel), "remove\n");
writeFileSync(path.join(retiredVscodiumDest, retiredUnownedRel), "keep\n");
writeFileSync(path.join(retiredVscodiumDest, retiredMcpRel), `${JSON.stringify({
  servers: {
    existing: { command: "keep" },
    "old-owned": { command: "remove" },
  },
}, null, 2)}\n`);
mkdirSync(path.join(retiredVscodiumDest, ".agent-surface"), { recursive: true });
writeFileSync(path.join(retiredVscodiumDest, ".agent-surface", "vscodium-manifest.json"), `${JSON.stringify({
  target: "vscodium",
  scope: "user",
  managed: [
    { target: "vscodium", output: retiredOwnedRel, source: "retired" },
    { target: "vscodium", output: sharedLiveSkillRel, source: "retired-shared-skill" },
  ],
  config_entries: [{ path: retiredMcpRel, format: "vscode-servers", ids: ["old-owned"] }],
}, null, 2)}\n`);
const retiredGeminiRel = path.join(".gemini", "commands", "removed.toml");
const retiredGeminiMcpRel = path.join(".gemini", "settings.json");
mkdirSync(path.join(retiredVscodiumDest, path.dirname(retiredGeminiRel)), { recursive: true });
writeFileSync(path.join(retiredVscodiumDest, retiredGeminiRel), "remove\n");
writeFileSync(path.join(retiredVscodiumDest, retiredGeminiMcpRel), `${JSON.stringify({
  mcpServers: { existing: { command: "keep" }, "old-owned": { command: "remove" } },
}, null, 2)}\n`);
writeFileSync(path.join(retiredVscodiumDest, ".agent-surface", "gemini-cli-manifest.json"), `${JSON.stringify({
  target: "gemini-cli",
  scope: "user",
  managed: [
    { target: "gemini-cli", output: retiredGeminiRel, source: "retired" },
    { target: "gemini-cli", output: liveKiloConfigRel, source: "retired-config-collision" },
  ],
  config_entries: [{ path: retiredGeminiMcpRel, format: "mcpServers", ids: ["old-owned"] }],
}, null, 2)}\n`);
const retiredGrokMcpRel = path.join(".grok", "settings.json");
mkdirSync(path.join(retiredVscodiumDest, ".grok"), { recursive: true });
writeFileSync(path.join(retiredVscodiumDest, retiredGrokMcpRel), `${JSON.stringify({
  mcpServers: { existing: { command: "keep" }, "old-owned": { command: "remove" } },
}, null, 2)}\n`);
writeFileSync(path.join(retiredVscodiumDest, ".agent-surface", "grok-build-manifest.json"), `${JSON.stringify({
  target: "grok-build",
  scope: "user",
  managed: [],
  config_entries: [{ path: retiredGrokMcpRel, format: "mcpServers", ids: ["old-owned"] }],
}, null, 2)}\n`);
const retiredVscodiumPlan = run(["install", "--target", "all", "--scope", "user", "--dest", retiredVscodiumDest, "--dry-run"]);
assert.match(retiredVscodiumPlan, /planned stale managed paths retained by active targets:/);
assert.match(retiredVscodiumPlan, new RegExp(liveKiloConfigRel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
run(["install", "--target", "all", "--scope", "user", "--dest", retiredVscodiumDest]);
assert.equal(existsSync(path.join(retiredVscodiumDest, retiredOwnedRel)), false);
assert.equal(existsSync(path.join(retiredVscodiumDest, retiredGeminiRel)), false);
assert.equal(readFileSync(path.join(retiredVscodiumDest, retiredUnownedRel), "utf8"), "keep\n");
assert.equal(
  readFileSync(sharedLiveSkillPath, "utf8"),
  sharedLiveSkill,
  "retired-target cleanup cannot remove a path still emitted by an active target",
);
assert.equal(
  JSON.parse(readFileSync(liveKiloConfigPath, "utf8")).userKey,
  "keep",
  "retired-target cleanup cannot remove a live config merge output",
);
const retiredMcp = JSON.parse(readFileSync(path.join(retiredVscodiumDest, retiredMcpRel), "utf8"));
assert.equal(retiredMcp.servers.existing.command, "keep");
assert.equal(Object.hasOwn(retiredMcp.servers, "old-owned"), false);
for (const route of [retiredGeminiMcpRel, retiredGrokMcpRel]) {
  const config = JSON.parse(readFileSync(path.join(retiredVscodiumDest, route), "utf8"));
  assert.equal(config.mcpServers.existing.command, "keep");
  assert.equal(Object.hasOwn(config.mcpServers, "old-owned"), false);
}
rmSync(retiredVscodiumDest, { recursive: true, force: true });

const liveDest = "/tmp/agent-surface-live";
rmSync(liveDest, { recursive: true, force: true });
const liveInstall = run(["install", "--target", "cline", "--dest", liveDest]);
assert.match(liveInstall, /^installed:$/m);
assert.match(readFileSync(path.join(liveDest, ".cline", "skills", "ops-ask", "SKILL.md"), "utf8"), /^---\nname: ops-ask\n/);
assert.equal(existsSync(path.join(liveDest, ".cline", "skills", "workflow-boss", "SKILL.md")), false);
assert.equal(existsSync(path.join(liveDest, ".cline", "agents", "boss.yaml")), false);
assert.equal(existsSync(path.join(liveDest, ".cline", "skills", "karpathy-guidelines", "SKILL.md")), false);
assert.match(readFileSync(path.join(liveDest, ".clineignore"), "utf8"), /agent-surface canonical AI-tool ignore baseline/);
const liveManifest = JSON.parse(readFileSync(path.join(liveDest, ".agent-surface", "cline-manifest.json"), "utf8"));
assert.equal(liveManifest.target, "cline");
const clineWrote = liveInstall.match(/^  wrote: (\d+)$/m);
assert.ok(clineWrote);
assert.equal(Number(clineWrote[1]), liveManifest.managed.length);
assert.equal(Object.hasOwn(liveManifest.managed[0], "managed_by"), false);
assert.equal(Object.hasOwn(liveManifest.managed[0], "sha256"), false);
run(["install", "--target", "cline", "--dest", liveDest, "--category", "development"]);
assert.match(readFileSync(path.join(liveDest, ".cline", "skills", "workflow-boss", "SKILL.md"), "utf8"), /^---\nname: workflow-boss\n/);
assert.match(readFileSync(path.join(liveDest, ".cline", "skills", "verify-readiness", "SKILL.md"), "utf8"), /^---\nname: verify-readiness\n/);
assert.match(readFileSync(path.join(liveDest, ".cline", "agents", "boss.yaml"), "utf8"), /^---\nname: boss\n/);
assert.equal(existsSync(path.join(liveDest, ".cline", "skills", "karpathy-guidelines", "SKILL.md")), false);
rmSync(liveDest, { recursive: true, force: true });

const kimiCodeDest = "/tmp/agent-surface-kimi-code-live";
rmSync(kimiCodeDest, { recursive: true, force: true });
const kimiCodeVsCodeSettings = path.join(
  kimiCodeDest,
  kimiCodeVsCodeSettingsPath({ scope: "user", relocateExternalRoutes: true }),
);
const kimiCodeCursorSettings = path.join(
  kimiCodeDest,
  kimiCodeCursorSettingsPath({ scope: "user", relocateExternalRoutes: true }),
);
mkdirSync(path.dirname(kimiCodeVsCodeSettings), { recursive: true });
mkdirSync(path.dirname(kimiCodeCursorSettings), { recursive: true });
writeFileSync(
  path.join(kimiCodeDest, "config.toml"),
  'default_permission_mode = "manual"\ntelemetry = false\n\n[providers.local]\nmodel = "keep-me"\n',
);
writeFileSync(
  path.join(kimiCodeDest, "mcp.json"),
  `${JSON.stringify({ mcpServers: { existing: { command: "keep-existing", args: ["--ok"] } } }, null, 2)}\n`,
);
writeFileSync(kimiCodeVsCodeSettings, `${JSON.stringify({ "workbench.colorTheme": "Keep Me" }, null, 2)}\n`);
writeFileSync(kimiCodeCursorSettings, `${JSON.stringify({ "editor.fontSize": 15 }, null, 2)}\n`);
run(["install", "--target", "kimi-code", "--scope", "user", "--dest", kimiCodeDest]);
const kimiCodeConfig = readFileSync(path.join(kimiCodeDest, "config.toml"), "utf8");
assert.match(kimiCodeConfig, /^default_permission_mode = "auto"$/m);
assert.match(kimiCodeConfig, /^merge_all_available_skills = true$/m);
assert.match(kimiCodeConfig, /^telemetry = false$/m);
assert.match(kimiCodeConfig, /^\[providers\.local\]$/m);
assert.match(kimiCodeConfig, /^model = "keep-me"$/m);
const kimiCodeMcp = JSON.parse(readFileSync(path.join(kimiCodeDest, "mcp.json"), "utf8"));
assert.equal(kimiCodeMcp.mcpServers.existing.command, "keep-existing");
assert.equal(kimiCodeMcp.mcpServers.synapse.command, path.join(os.homedir(), ".local", "bin", "synapse-bridge"));
assert.equal(Object.hasOwn(kimiCodeMcp.mcpServers.synapse, "type"), false);
assert.deepEqual(JSON.parse(readFileSync(kimiCodeVsCodeSettings, "utf8")), {
  "workbench.colorTheme": "Keep Me",
  "kimi.yoloMode": true,
});
assert.deepEqual(JSON.parse(readFileSync(kimiCodeCursorSettings, "utf8")), {
  "editor.fontSize": 15,
  "kimi.yoloMode": true,
});
assert.equal(existsSync(path.join(kimiCodeDest, "skills", "workflow-boss", "SKILL.md")), false);
run(["install", "--target", "kimi-code", "--scope", "user", "--dest", kimiCodeDest, "--category", "development"]);
assert.match(
  readFileSync(path.join(kimiCodeDest, "skills", "workflow-boss", "SKILL.md"), "utf8"),
  /^---\nname: workflow-boss\n/,
);
assert.doesNotMatch(readFileSync(path.join(kimiCodeDest, "skills", "workflow-boss", "SKILL.md"), "utf8"), /disableModelInvocation/);
assert.match(readFileSync(path.join(kimiCodeDest, "skills", "ops-nuke", "SKILL.md"), "utf8"), /^disableModelInvocation: true$/m);
const kimiCodeMcpOnlyPlan = run([
  "install", "--target", "kimi-code", "--scope", "user", "--dest", kimiCodeDest, "--category", "mcps", "--dry-run",
]);
assert.doesNotMatch(kimiCodeMcpOnlyPlan, /default_permission_mode :=/);
assert.doesNotMatch(kimiCodeMcpOnlyPlan, /kimi\.yoloMode :=/);
rmSync(kimiCodeDest, { recursive: true, force: true });

// Install now overwrites existing files by default.
const unmanagedDest = "/tmp/agent-surface-unmanaged";
rmSync(unmanagedDest, { recursive: true, force: true });
mkdirSync(path.join(unmanagedDest, ".clinerules", "workflows"), { recursive: true });
writeFileSync(path.join(unmanagedDest, ".clinerules", "workflows", "ops-nuke.md"), "local workflow\n");
const overwriteInstall = run(["install", "--target", "cline", "--dest", unmanagedDest, "--category", "development"]);
assert.match(overwriteInstall, /^installed:$/m);
assert.match(readFileSync(path.join(unmanagedDest, ".clinerules", "workflows", "ops-nuke.md"), "utf8"), /^## OBJECTIVE/);
rmSync(unmanagedDest, { recursive: true, force: true });

const liveStaleDest = "/tmp/agent-surface-live-stale";
rmSync(liveStaleDest, { recursive: true, force: true });
run(["install", "--target", "cline", "--dest", liveStaleDest]);
const liveStaleFile = path.join(liveStaleDest, ".clinerules", "workflows", "removed.md");
mkdirSync(path.dirname(liveStaleFile), { recursive: true });
writeFileSync(liveStaleFile, "user edited stale workflow\n");
const liveStaleManifestPath = path.join(liveStaleDest, ".agent-surface", "cline-manifest.json");
const liveStaleManifest = JSON.parse(readFileSync(liveStaleManifestPath, "utf8"));
liveStaleManifest.managed.push({
  target: "cline",
  scope: "project",
  source: "commands/removed.md",
  output: ".clinerules/workflows/removed.md",
  version: "0.1.0",
});
writeFileSync(liveStaleManifestPath, `${JSON.stringify(liveStaleManifest, null, 2)}\n`);
const liveStaleInstall = run(["install", "--target", "cline", "--dest", liveStaleDest]);
assert.match(liveStaleInstall, /removed stale: 1/);
assert.equal(existsSync(liveStaleFile), false);
assert.equal(existsSync(path.join(liveStaleDest, ".agent-surface", "backups")), false);
rmSync(liveStaleDest, { recursive: true, force: true });

const missingStaleDest = "/tmp/agent-surface-missing-stale";
rmSync(missingStaleDest, { recursive: true, force: true });
run(["install", "--target", "cline", "--dest", missingStaleDest]);
const missingStaleManifestPath = path.join(missingStaleDest, ".agent-surface", "cline-manifest.json");
const missingStaleManifest = JSON.parse(readFileSync(missingStaleManifestPath, "utf8"));
missingStaleManifest.managed.push({
  target: "cline",
  scope: "project",
  source: "commands/removed.md",
  output: ".clinerules/workflows/already-gone.md",
  version: "0.1.0",
});
writeFileSync(missingStaleManifestPath, `${JSON.stringify(missingStaleManifest, null, 2)}\n`);
const missingStaleInstall = run(["install", "--target", "cline", "--dest", missingStaleDest]);
assert.match(missingStaleInstall, /^installed:$/m);
assert.match(missingStaleInstall, /removed stale: 0/);
rmSync(missingStaleDest, { recursive: true, force: true });

const scopeRootDest = "/tmp/agent-surface-scope-root";
rmSync(scopeRootDest, { recursive: true, force: true });
mkdirSync(scopeRootDest, { recursive: true });
const scopeRootInstall = run(["install", "--target", "cline", "--scope", "project", "--allow-scope-root"], { cwd: scopeRootDest });
assert.match(scopeRootInstall, /^root source: scope-derived root$/m);
assert.match(scopeRootInstall, /^installed:$/m);
assert.equal(existsSync(path.join(scopeRootDest, ".cline", "skills", "ops-ask", "SKILL.md")), true);
rmSync(scopeRootDest, { recursive: true, force: true });

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
assert.match(clineUserScope.stdout, /\.cline\/skills\/ops-ask\/SKILL\.md <- skills\/ops-ask\/SKILL\.md/);
assert.match(clineUserScope.stdout, /Documents\/Cline\/Rules\/agent-surface\.md <- rules\/\*\.mdc/);
assert.doesNotMatch(clineUserScope.stdout, /workflow-boss|ops-nuke|agents\/boss\.yaml/);
assert.doesNotMatch(clineUserScope.stdout, /\.cline\/skills\/karpathy-guidelines\/SKILL\.md/);
assert.match(clineUserScope.stdout, /\.cline\/data\/settings\/cline_mcp_settings\.json MCP \+= grimoire, synapse/);
assert.match(clineUserScope.stdout, /Code\/User\/globalStorage\/saoudrizwan\.claude-dev\/settings\/cline_mcp_settings\.json MCP \+= grimoire, synapse/);
assert.match(clineUserScope.stdout, /Cursor\/User\/globalStorage\/saoudrizwan\.claude-dev\/settings\/cline_mcp_settings\.json MCP \+= grimoire, synapse/);
assert.match(clineUserScope.stdout, /Windsurf\/User\/globalStorage\/saoudrizwan\.claude-dev\/settings\/cline_mcp_settings\.json MCP \+= grimoire, synapse/);
const clineDevelopmentUserScope = status(
  ["install", "--target", "cline", "--scope", "user", "--category", "development", "--dry-run"],
  { env: userScopeEnv },
);
assert.equal(clineDevelopmentUserScope.status, 0, `${clineDevelopmentUserScope.stdout}${clineDevelopmentUserScope.stderr}`);
assert.match(clineDevelopmentUserScope.stdout, /\.cline\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/);
assert.match(clineDevelopmentUserScope.stdout, /Documents\/Cline\/Workflows\/ops-nuke\.md <- commands\/ops-nuke\.md/);
assert.match(clineDevelopmentUserScope.stdout, /Documents\/Cline\/Rules\/references\/rules\/14-shell\.md <- rules\/14-shell\.mdc/);
assert.match(clineDevelopmentUserScope.stdout, /\.cline\/agents\/boss\.yaml <- subagents\/boss\.md/);

const kiloUserScope = status(["install", "--target", "kilo", "--scope", "user", "--dry-run"], { env: userScopeEnv });
assert.equal(kiloUserScope.status, 0, `${kiloUserScope.stdout}${kiloUserScope.stderr}`);
assert.match(kiloUserScope.stdout, /\.kilo\/skills\/ops-ask\/SKILL\.md <- skills\/ops-ask\/SKILL\.md/);
assert.doesNotMatch(kiloUserScope.stdout, /\.config\/kilo\/AGENTS\.md <- rules\/\*\.mdc/);
assert.match(kiloUserScope.stdout, /\.config\/kilo\/rules\/00-precedence-and-safety\.md <- rules\/00-precedence-and-safety\.mdc/);
assert.match(kiloUserScope.stdout, /\.config\/kilo\/rules\/01-response-style\.md <- rules\/01-response-style\.mdc/);
assert.doesNotMatch(kiloUserScope.stdout, /workflow-boss|ops-nuke|references\/rules\/14-shell|agents\/boss\.md/);
assert.match(kiloUserScope.stdout, /\.config\/kilo\/kilo\.jsonc instructions \+= \.\/rules\/00-precedence-and-safety\.md, \.\/rules\/01-response-style\.md/);
assert.doesNotMatch(kiloUserScope.stdout, /skills\.paths/);
assert.doesNotMatch(kiloUserScope.stdout, /permission\.skill/);
assert.doesNotMatch(kiloUserScope.stdout, /kilo\.jsonc instructions \+= .*14-shell/);
assert.match(kiloUserScope.stdout, /kilo\.jsonc permission := \{"\*":"allow"\}/);
assert.match(kiloUserScope.stdout, /kilo\.jsonc share := "disabled"/);
assert.match(kiloUserScope.stdout, /\.kilocodeignore \(project-scope only\)/);
assert.doesNotMatch(kiloUserScope.stdout, /\.kilocodeignore <- ignores/);
const kiloDevelopmentUserScope = status(
  ["install", "--target", "kilo", "--scope", "user", "--category", "development", "--dry-run"],
  { env: userScopeEnv },
);
assert.equal(kiloDevelopmentUserScope.status, 0, `${kiloDevelopmentUserScope.stdout}${kiloDevelopmentUserScope.stderr}`);
assert.match(kiloDevelopmentUserScope.stdout, /\.kilo\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/);
assert.match(kiloDevelopmentUserScope.stdout, /\.config\/kilo\/commands\/ops-nuke\.md <- commands\/ops-nuke\.md/);
assert.match(kiloDevelopmentUserScope.stdout, /\.config\/kilo\/references\/rules\/14-shell\.md <- rules\/14-shell\.mdc/);
assert.match(kiloDevelopmentUserScope.stdout, /\.config\/kilo\/agents\/boss\.md <- subagents\/boss\.md/);
assert.match(kiloDevelopmentUserScope.stdout, /kilo\.jsonc instructions \+= \.\/rules\/02-agent-workflow\.md, .*\.\/rules\/06-test-policy\.md/);

const kimiCodeHome = path.join(userScopeHome, "custom-kimi-home");
const kimiCodeUserScope = status(["install", "--target", "kimi-code", "--scope", "user", "--dry-run"], {
  env: { ...userScopeEnv, KIMI_CODE_HOME: kimiCodeHome },
});
assert.equal(kimiCodeUserScope.status, 0, `${kimiCodeUserScope.stdout}${kimiCodeUserScope.stderr}`);
assert.match(kimiCodeUserScope.stdout, new RegExp(`^root: ${kimiCodeHome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
assert.match(kimiCodeUserScope.stdout, /skills\/ops-ask\/SKILL\.md <- skills\/ops-ask\/SKILL\.md/);
assert.doesNotMatch(kimiCodeUserScope.stdout, /workflow-boss|agents\/boss\.md/);
assert.match(kimiCodeUserScope.stdout, /^  config\.toml default_permission_mode := "auto"$/m);
assert.match(kimiCodeUserScope.stdout, /^  config\.toml merge_all_available_skills := true$/m);
assert.match(kimiCodeUserScope.stdout, /^  mcp\.json MCP \+= grimoire, synapse$/m);
assert.match(kimiCodeUserScope.stdout, /Code\/User\/settings\.json kimi\.yoloMode := true/);
assert.match(kimiCodeUserScope.stdout, /Cursor\/User\/settings\.json kimi\.yoloMode := true/);

const claudeUserScope = status(["install", "--target", "claude-code", "--scope", "user", "--dry-run"], { env: userScopeEnv });
assert.equal(claudeUserScope.status, 0, `${claudeUserScope.stdout}${claudeUserScope.stderr}`);
assert.doesNotMatch(claudeUserScope.stdout, /\.mcp\.json/);
assert.match(claudeUserScope.stdout, /\.claude\/skills\/ops-ask\/SKILL\.md <- skills\/ops-ask\/SKILL\.md/);
assert.doesNotMatch(claudeUserScope.stdout, /\.claude\/agents\/boss\.md/);

const openhandsUserScope = status(["install", "--target", "openhands", "--scope", "user", "--dry-run"], { env: userScopeEnv });
assert.equal(openhandsUserScope.status, 0, `${openhandsUserScope.stdout}${openhandsUserScope.stderr}`);
assert.match(openhandsUserScope.stdout, /\.agents\/skills\/ops-ask\/SKILL\.md <- skills\/ops-ask\/SKILL\.md/);
assert.match(openhandsUserScope.stdout, /\.openhands\/skills\/agent-surface-rules\.md <- rules\/\*\.mdc/);
assert.doesNotMatch(openhandsUserScope.stdout, /workflow-boss|references\/rules\/10-python/);
assert.match(openhandsUserScope.stdout, /\.openhands\/mcp\.json MCP \+= grimoire, synapse/);
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
    "    \".kilo/rules/00-core.md\",",
    "    \".kilo/rules/10-python.md\",",
    "    \".kilo/rules/10-lang-python.md\",",
    "    \".kilo/rules/14-shell.md\",",
    "    \".kilo/rules/14-lang-shell.md\",",
    "  ],",
    "  \"marker\": \",]\",",
    "  \"share\": \"manual\",",
    "  \"permission\": { \"shell\": \"ask\" }",
    "}",
    "",
  ].join("\n"),
);
run(["install", "--target", "kilo", "--dest", existingKiloDest]);
const mergedKiloConfig = readFileSync(path.join(existingKiloDest, "kilo.jsonc"), "utf8");
assert.equal(existsSync(path.join(existingKiloDest, ".kilo", "skills", "ops-ask", "SKILL.md")), true);
assert.match(mergedKiloConfig, /\/\/ keep this comment/);
assert.match(mergedKiloConfig, /"marker": ",\]"/);
assert.match(mergedKiloConfig, /"\.\/existing-rule\.md"/);
assert.doesNotMatch(mergedKiloConfig, /"skills"/);
assert.match(mergedKiloConfig, /"permission": \{\s*"\*": "allow"\s*\}/);
assert.match(mergedKiloConfig, /"share": "disabled"/);
assert.doesNotMatch(mergedKiloConfig, /"shell": "ask"/);
assert.doesNotMatch(mergedKiloConfig, /"\.kilo\/rules\/agent-surface\.md"/);
assert.doesNotMatch(mergedKiloConfig, /"\.kilo\/rules\/00-core\.md"/);
assert.doesNotMatch(mergedKiloConfig, /"\.kilo\/rules\/10-python\.md"/);
assert.doesNotMatch(mergedKiloConfig, /"\.kilo\/rules\/10-lang-python\.md"/);
assert.match(mergedKiloConfig, /"\.kilo\/rules\/00-precedence-and-safety\.md"/);
assert.match(mergedKiloConfig, /"\.kilo\/rules\/01-response-style\.md"/);
assert.doesNotMatch(mergedKiloConfig, /"\.kilo\/rules\/06-test-policy\.md"/);
assert.doesNotMatch(mergedKiloConfig, /"\.kilo\/rules\/14-shell\.md"/);
assert.doesNotMatch(mergedKiloConfig, /"\.kilo\/rules\/14-lang-shell\.md"/);
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
]);
assert.equal(Object.hasOwn(inlineKiloConfig, "skills"), false);
assert.deepEqual(inlineKiloConfig.permission, { "*": "allow" });
assert.equal(inlineKiloConfig.share, "disabled");
assert.deepEqual(inlineKiloConfig.mcp.synapse.command, [path.join(os.homedir(), ".local", "bin", "synapse-bridge")]);
rmSync(inlineKiloDest, { recursive: true, force: true });

// Regression: MCP commands must be ABSOLUTE at install time. Hosts posix_spawn the stdio
// command directly (no shell), so a literal "~" is never expanded → ENOENT on launch.
// dist/build keeps "~" (portable, reproducible); install resolves it against $HOME.
const mcpAbsBin = (name) => path.join(os.homedir(), ".local", "bin", name);
const mcpAbsDest = "/tmp/agent-surface-mcp-abs";
rmSync(mcpAbsDest, { recursive: true, force: true });
run(["install", "--target", "droid", "--scope", "user", "--category", "mcps", "--dest", mcpAbsDest]);
const droidMcpAbs = JSON.parse(readFileSync(path.join(mcpAbsDest, ".factory", "mcp.json"), "utf8"));
assert.equal(droidMcpAbs.mcpServers.grimoire.command, mcpAbsBin("grimoire-server"));
assert.equal(droidMcpAbs.mcpServers.synapse.command, mcpAbsBin("synapse-bridge"));
assert.doesNotMatch(droidMcpAbs.mcpServers.grimoire.command, /^~/, "install MCP command must not contain a literal ~");
rmSync(mcpAbsDest, { recursive: true, force: true });

const existingCursorMcpDest = "/tmp/agent-surface-cursor-existing-mcp";
rmSync(existingCursorMcpDest, { recursive: true, force: true });
mkdirSync(path.join(existingCursorMcpDest, ".cursor"), { recursive: true });
writeFileSync(
  path.join(existingCursorMcpDest, ".cursor", "mcp.json"),
  `${JSON.stringify({ mcpServers: { existing: { command: "local-existing", args: ["--ok"] } } }, null, 2)}\n`,
);
run(["install", "--target", "cursor", "--dest", existingCursorMcpDest, "--category", "mcps", "--service", "synapse"]);
const mergedCursorMcp = JSON.parse(readFileSync(path.join(existingCursorMcpDest, ".cursor", "mcp.json"), "utf8"));
assert.equal(mergedCursorMcp.mcpServers.existing.command, "local-existing");
assert.equal(mergedCursorMcp.mcpServers.synapse.command, path.join(os.homedir(), ".local", "bin", "synapse-bridge"));
assert.equal(Object.hasOwn(mergedCursorMcp.mcpServers, "agentmemory"), false);
rmSync(existingCursorMcpDest, { recursive: true, force: true });

const ownedCursorMcpDest = "/tmp/agent-surface-cursor-owned-mcp";
rmSync(ownedCursorMcpDest, { recursive: true, force: true });
mkdirSync(path.join(ownedCursorMcpDest, ".cursor"), { recursive: true });
mkdirSync(path.join(ownedCursorMcpDest, ".agent-surface"), { recursive: true });
writeFileSync(
  path.join(ownedCursorMcpDest, ".cursor", "mcp.json"),
  `${JSON.stringify({
    mcpServers: {
      existing: { command: "local-existing", args: ["--ok"] },
      synapse: { command: "user-edited-owned-entry", args: ["--wrong"] },
      "old-owned": { command: "old-generated-entry", args: [] },
    },
  }, null, 2)}\n`,
);
writeFileSync(
  path.join(ownedCursorMcpDest, ".agent-surface", "cursor-manifest.json"),
  `${JSON.stringify({
    target: "cursor",
    scope: "project",
    managed: [],
    config_entries: [{ path: ".cursor/mcp.json", format: "mcpServers", ids: ["old-owned", "synapse"] }],
  }, null, 2)}\n`,
);
const ownedCursorPlan = run(["install", "--target", "cursor", "--dest", ownedCursorMcpDest, "--category", "mcps", "--dry-run"]);
assert.match(ownedCursorPlan, /\.cursor\/mcp\.json MCP \+= grimoire, synapse/);
assert.match(ownedCursorPlan, /\.cursor\/mcp\.json MCP -= old-owned/);
run(["install", "--target", "cursor", "--dest", ownedCursorMcpDest, "--category", "mcps"]);
const ownedCursorMcp = JSON.parse(readFileSync(path.join(ownedCursorMcpDest, ".cursor", "mcp.json"), "utf8"));
assert.equal(ownedCursorMcp.mcpServers.existing.command, "local-existing");
assert.equal(ownedCursorMcp.mcpServers.synapse.command, path.join(os.homedir(), ".local", "bin", "synapse-bridge"));
assert.equal(ownedCursorMcp.mcpServers.grimoire.command, path.join(os.homedir(), ".local", "bin", "grimoire-server"));
assert.equal(Object.hasOwn(ownedCursorMcp.mcpServers, "old-owned"), false);
const ownedCursorManifest = JSON.parse(readFileSync(path.join(ownedCursorMcpDest, ".agent-surface", "cursor-manifest.json"), "utf8"));
assert.deepEqual(ownedCursorManifest.config_entries, [
  { path: ".cursor/mcp.json", format: "mcpServers", ids: ["grimoire", "synapse"] },
]);
rmSync(ownedCursorMcpDest, { recursive: true, force: true });

/*
SUBSTITUTE_JUSTIFICATION
- substitute: a disposable Antigravity profile containing the former direct-import manifest route
- replaces: a real pre-migration plugin profile plus the runtime-owned import recreated by `agy plugin install`
- necessity: exercising one-time cleanup against the real plugin root would temporarily disconnect its MCP servers
- real-option: the production installer and config merger are used; only the disposable profile state is controlled
- proof-limit: proves ownership handoff and repeat-install behavior, not native plugin activation
- real-proof: `agy plugin validate`, `agy plugin install`, and `agy plugin list` against the real staged plugin
*/
{
  const dest = mkdtempSync("/tmp/agent-surface-antigravity-route-handoff-");
  const oldRoute = path.join("config", "plugins", "agent-surface", "mcp_config.json");
  const currentRoute = path.join("antigravity-cli", "plugins", "agent-surface", "mcp_config.json");
  const oldConfigPath = path.join(dest, oldRoute);
  try {
    mkdirSync(path.dirname(oldConfigPath), { recursive: true });
    mkdirSync(path.join(dest, ".agent-surface"), { recursive: true });
    writeFileSync(oldConfigPath, `${JSON.stringify({
      mcpServers: {
        existing: { command: "keep", args: [] },
        grimoire: { command: "old-grimoire", args: [] },
        synapse: { command: "old-synapse", args: [] },
      },
    }, null, 2)}\n`);
    writeFileSync(
      path.join(dest, ".agent-surface", "antigravity-cli-manifest.json"),
      `${JSON.stringify({
        target: "antigravity-cli",
        scope: "user",
        managed: [],
        config_entries: [{ path: oldRoute, format: "mcpServers", ids: ["grimoire", "synapse"] }],
      }, null, 2)}\n`,
    );

    run(["install", "--target", "antigravity-cli", "--scope", "user", "--dest", dest]);
    const cleanedImport = JSON.parse(readFileSync(oldConfigPath, "utf8"));
    assert.deepEqual(Object.keys(cleanedImport.mcpServers), ["existing"]);
    const staged = JSON.parse(readFileSync(path.join(dest, currentRoute), "utf8"));
    assert.deepEqual(Object.keys(staged.mcpServers).sort(), ["grimoire", "synapse"]);
    const currentManifest = JSON.parse(readFileSync(
      path.join(dest, ".agent-surface", "antigravity-cli-manifest.json"),
      "utf8",
    ));
    assert.deepEqual(currentManifest.config_entries, [
      { path: currentRoute, format: "mcpServers", ids: ["grimoire", "synapse"] },
    ]);

    writeFileSync(oldConfigPath, `${JSON.stringify({
      mcpServers: {
        existing: { command: "keep", args: [] },
        grimoire: { command: "runtime-import", args: [] },
        synapse: { command: "runtime-import", args: [] },
      },
    }, null, 2)}\n`);
    run(["install", "--target", "antigravity-cli", "--scope", "user", "--dest", dest]);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(oldConfigPath, "utf8")).mcpServers).sort(), [
      "existing",
      "grimoire",
      "synapse",
    ]);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

/*
SUBSTITUTE_JUSTIFICATION
- substitute: seeded obsolete .cline/mcp.json and cline-manifest.json inputs for user- and project-scope migration cases
- replaces: a historical Cline profile containing both agent-surface-owned entries and an unrelated user-owned MCP server
- necessity: the current installer cannot create the retired route, and modifying an actual user profile to recreate stale ownership would risk destructive config changes
- real-option: a disposable install from the current tree was considered, but it cannot produce the historical route; a live profile is unsafe and nondeterministic migration input
- proof-limit: this diagnoses production migration logic on a real disposable filesystem but does not prove Cline task execution or either MCP server's health
- real-proof: BLOCKED: requires an actual pre-migration profile; unblock by snapshotting one and authorizing migration of the isolated copy
*/
for (const scope of ["user", "project"]) {
  const obsoleteClineMcpDest = `/tmp/agent-surface-cline-obsolete-mcp-route-${scope}`;
  rmSync(obsoleteClineMcpDest, { recursive: true, force: true });
  mkdirSync(path.join(obsoleteClineMcpDest, ".cline"), { recursive: true });
  mkdirSync(path.join(obsoleteClineMcpDest, ".agent-surface"), { recursive: true });
  writeFileSync(
    path.join(obsoleteClineMcpDest, ".cline", "mcp.json"),
    `${JSON.stringify({
      mcpServers: {
        existing: { command: "local-existing", args: ["--keep"] },
        grimoire: { command: "old-grimoire", args: [] },
        synapse: { command: "old-synapse", args: [] },
      },
    }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(obsoleteClineMcpDest, ".agent-surface", "cline-manifest.json"),
    `${JSON.stringify({
      target: "cline",
      scope,
      managed: [],
      config_entries: [{ path: ".cline/mcp.json", format: "mcpServers", ids: ["grimoire", "synapse"] }],
    }, null, 2)}\n`,
  );
  const installArgs = ["install", "--target", "cline", "--scope", scope, "--dest", obsoleteClineMcpDest];
  const obsoleteClinePlan = run([...installArgs, "--dry-run"]);
  assert.match(obsoleteClinePlan, /\.cline\/mcp\.json MCP -= grimoire, synapse/);
  if (scope === "user") {
    assert.match(obsoleteClinePlan, /\.cline\/data\/settings\/cline_mcp_settings\.json MCP \+= grimoire, synapse/);
  } else {
    assert.doesNotMatch(obsoleteClinePlan, /cline_mcp_settings\.json MCP \+=/);
  }
  run(installArgs);
  const obsoleteClineMcp = JSON.parse(readFileSync(path.join(obsoleteClineMcpDest, ".cline", "mcp.json"), "utf8"));
  assert.equal(obsoleteClineMcp.mcpServers.existing.command, "local-existing");
  assert.equal(Object.hasOwn(obsoleteClineMcp.mcpServers, "grimoire"), false);
  assert.equal(Object.hasOwn(obsoleteClineMcp.mcpServers, "synapse"), false);
  const migratedClineManifest = JSON.parse(readFileSync(path.join(obsoleteClineMcpDest, ".agent-surface", "cline-manifest.json"), "utf8"));
  if (scope === "user") {
    const currentClineMcp = JSON.parse(readFileSync(path.join(obsoleteClineMcpDest, ".cline", "data", "settings", "cline_mcp_settings.json"), "utf8"));
    assert.equal(currentClineMcp.mcpServers.grimoire.command, path.join(os.homedir(), ".local", "bin", "grimoire-server"));
    assert.equal(currentClineMcp.mcpServers.synapse.command, path.join(os.homedir(), ".local", "bin", "synapse-bridge"));
    assert.deepEqual(
      migratedClineManifest.config_entries,
      clineUserMcpRoutes.map((route) => ({ path: route, format: "mcpServers", ids: ["grimoire", "synapse"] })),
    );
  } else {
    assert.equal(existsSync(path.join(obsoleteClineMcpDest, ".cline", "data", "settings", "cline_mcp_settings.json")), false);
    assert.deepEqual(migratedClineManifest.config_entries, []);
  }
  rmSync(obsoleteClineMcpDest, { recursive: true, force: true });
}

const existingOpenHandsMcpDest = "/tmp/agent-surface-openhands-existing-mcp";
rmSync(existingOpenHandsMcpDest, { recursive: true, force: true });
mkdirSync(path.join(existingOpenHandsMcpDest, ".openhands"), { recursive: true });
writeFileSync(
  path.join(existingOpenHandsMcpDest, ".openhands", "mcp.json"),
  `${JSON.stringify({ mcpServers: { existing: { command: "local-existing", args: ["--ok"] } } }, null, 2)}\n`,
);
run(["install", "--target", "openhands", "--scope", "user", "--dest", existingOpenHandsMcpDest, "--category", "mcps", "--service", "synapse"]);
const mergedOpenHandsMcp = JSON.parse(readFileSync(path.join(existingOpenHandsMcpDest, ".openhands", "mcp.json"), "utf8"));
assert.equal(mergedOpenHandsMcp.mcpServers.existing.command, "local-existing");
assert.equal(mergedOpenHandsMcp.mcpServers.synapse.command, path.join(os.homedir(), ".local", "bin", "synapse-bridge"));
assert.equal(Object.hasOwn(mergedOpenHandsMcp.mcpServers, "agentmemory"), false);
rmSync(existingOpenHandsMcpDest, { recursive: true, force: true });

const existingCodexMcpDest = "/tmp/agent-surface-codex-existing-mcp";
rmSync(existingCodexMcpDest, { recursive: true, force: true });

mkdirSync(path.join(existingCodexMcpDest, ".codex"), { recursive: true });
writeFileSync(
  path.join(existingCodexMcpDest, ".codex", "config.toml"),
  [
    'approval_policy = "on-request"',
    'sandbox_mode = "workspace-write"',
    "",
    "[profile.default]",
    'model = "keep-me"',
    "",
    "[mcp_servers.existing]",
    'command = "local-existing"',
    "args = []",
    "",
  ].join("\n"),
);
run(["install", "--target", "codex", "--dest", existingCodexMcpDest, "--category", "mcps", "--service", "synapse"]);
const mergedCodexMcp = readFileSync(path.join(existingCodexMcpDest, ".codex", "config.toml"), "utf8");
const parsedCodexMcp = TOML.parse(mergedCodexMcp);
assert.equal(parsedCodexMcp.approval_policy, "on-request");
assert.equal(parsedCodexMcp.sandbox_mode, "workspace-write");
assert.equal(parsedCodexMcp.profile.default.model, "keep-me");
assert.equal(parsedCodexMcp.mcp_servers.existing.command, "local-existing");
assert.equal(parsedCodexMcp.mcp_servers.synapse.command, path.join(os.homedir(), ".local", "bin", "synapse-bridge"));
assert.equal(Object.hasOwn(parsedCodexMcp.mcp_servers, "agentmemory"), false);
rmSync(existingCodexMcpDest, { recursive: true, force: true });

// P3.1/P3.2 acceptance: non-destructive MCP merge into every manual/secret-bearing
// host. Each fixture carries a pre-existing user server; the merge must keep it,
// add the first-party synapse entry, never add external/secret-bearing MCPs, and a
// second merge must be a no-op (idempotent). Cursor + Codex are covered explicitly
// above; this loop closes the remaining JSON/JSONC hosts.
/*
SUBSTITUTE_JUSTIFICATION
- substitute: mergeFixtures pre-existing config objects for the listed JSON/JSONC MCP hosts
- replaces: user-owned sibling settings needed to exercise non-destructive and idempotent MCP merges for each config format
- necessity: the exact preservation assertion requires controlled unknown sibling entries and repeated writes; modifying real host profiles could corrupt user configuration
- real-option: disposable current installs were considered, but they cannot create unknown user-owned entries; live profiles are unsafe and vary by machine
- proof-limit: only the seeded input state is synthetic; the production installer, parsers, merge code, and filesystem writes are real, but host discovery and MCP service health are not proved
- real-proof: BLOCKED: requires owner-approved snapshots and host-level discovery runs for every listed host
*/
const mergeFixtures = [
  { target: "claude-code", rel: ".mcp.json", root: "mcpServers", pre: { mcpServers: { existing: { command: "local-existing", args: ["--keep"] } } } },
  { target: "cline", scope: "user", rel: ".cline/data/settings/cline_mcp_settings.json", root: "mcpServers", pre: { mcpServers: { existing: { command: "local-existing", args: ["--keep"] } } } },
  {
    target: "kilo", rel: "kilo.jsonc", root: "mcp", pre: { $schema: "keep", permission: "ask", share: "auto", mcp: { existing: { type: "local", command: ["local-existing"], enabled: true } } },
    keep: (parsed) => {
      assert.equal(parsed.$schema, "keep", "kilo $schema preserved");
      assert.equal(parsed.permission, "ask", "kilo MCP-only install preserves host permission");
      assert.equal(parsed.share, "auto", "kilo MCP-only install preserves host sharing");
    }
  },
  {
    target: "opencode", rel: ".opencode/opencode.json", root: "mcp", pre: { $schema: "keep", permission: "ask", share: "auto", mcp: { existing: { type: "local", command: ["local-existing"], enabled: true } } },
    keep: (parsed) => {
      assert.equal(parsed.$schema, "keep", "opencode $schema preserved");
      assert.equal(parsed.permission, "ask", "opencode MCP-only install preserves host permission");
      assert.equal(parsed.share, "auto", "opencode MCP-only install preserves host sharing");
    }
  },
  { target: "trae", rel: ".trae/mcp.json", root: "mcpServers", pre: { mcpServers: { existing: { command: "local-existing", args: ["--keep"] } } } },
  {
    target: "qoder", rel: ".qoder/settings.json", root: "mcpServers", pre: { general: { theme: "keep" }, mcpServers: { existing: { command: "local-existing", args: ["--keep"] } } },
    keep: (parsed) => assert.equal(parsed.general.theme, "keep", "qoder settings sibling preserved"),
  },
  {
    target: "qwen-code", rel: ".qwen/settings.json", root: "mcpServers", pre: { tools: { sandbox: true }, mcpServers: { existing: { command: "local-existing", args: ["--keep"] } } },
    keep: (parsed) => assert.equal(parsed.tools.sandbox, true, "qwen settings sibling preserved"),
  },
  { target: "kiro", rel: ".kiro/settings/mcp.json", root: "mcpServers", pre: { mcpServers: { existing: { command: "local-existing", args: ["--keep"] } } } },
  { target: "copilot", scope: "user", rel: ".copilot/mcp-config.json", root: "mcpServers", pre: { mcpServers: { existing: { command: "local-existing", args: ["--keep"] } } } },
  { target: "vscode", rel: path.join(clineIdeUserDataRoot("Code"), "User", "mcp.json"), root: "servers", pre: { servers: { existing: { type: "stdio", command: "local-existing", args: ["--keep"] } } } },
  { target: "windsurf", rel: ".windsurf/mcp_config.json", root: "mcpServers", pre: { mcpServers: { existing: { command: "local-existing", args: ["--keep"] } } } },
  {
    target: "zed", rel: ".zed/settings.json", root: "context_servers", pre: { context_servers: { existing: { command: "local-existing", args: ["--keep"] } }, theme: "mono" },
    keep: (parsed) => assert.equal(parsed.theme, "mono", "zed non-mcp settings preserved")
  },
];
for (const fx of mergeFixtures) {
  const dest = mkdtempSync(`/tmp/agent-surface-${fx.target}-merge-`);
  try {
    mkdirSync(path.join(dest, path.dirname(fx.rel)), { recursive: true });
    writeFileSync(path.join(dest, fx.rel), `${JSON.stringify(fx.pre, null, 2)}\n`);
    const installArgs = ["install", "--target", fx.target, "--dest", dest, "--category", "mcps", "--service", "synapse"];
    if (fx.scope) installArgs.push("--scope", fx.scope);
    const firstPlan = run([...installArgs, "--dry-run"]);
    assert.match(firstPlan, new RegExp(`${fx.rel.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")} MCP \\+= synapse`), `${fx.target}: dry-run announces synapse merge`);
    if (["kilo", "opencode"].includes(fx.target)) {
      assert.doesNotMatch(firstPlan, /permission :=|share :=/, `${fx.target}: MCP-only dry-run must not mutate execution policy`);
    }
    run(installArgs);
    const merged = JSON.parse(readFileSync(path.join(dest, fx.rel), "utf8"));
    assert.ok(merged[fx.root]?.existing, `${fx.target}: pre-existing user server preserved`);
    const syn = merged[fx.root].synapse;
    const synCmd = Array.isArray(syn.command) ? syn.command[0] : syn.command;
    assert.equal(synCmd, path.join(os.homedir(), ".local", "bin", "synapse-bridge"), `${fx.target}: synapse merged (absolute at install)`);
    assert.equal(Object.hasOwn(merged[fx.root], "agentmemory"), false, `${fx.target}: external/secret-bearing MCP not auto-added`);
    if (fx.keep) fx.keep(merged);
    const beforeRe = readFileSync(path.join(dest, fx.rel), "utf8");
    run(installArgs);
    const afterRe = readFileSync(path.join(dest, fx.rel), "utf8");
    assert.equal(afterRe, beforeRe, `${fx.target}: re-merge is idempotent (no-op diff)`);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

/*
SUBSTITUTE_JUSTIFICATION
- substitute: policy config seeds for Qoder, Qwen Code, OpenCode, Kiro, and Grok Build
- replaces: pre-existing operator-owned settings needed to test sibling preservation during a real install
- necessity: deterministic preservation requires known unknown-to-agent-surface sibling values; modifying real host profiles is unsafe
- real-option: disposable installs exercise the real installer and filesystem but still need seeded pre-existing values
- proof-limit: proves merge behavior only, not host discovery or tool execution
- real-proof: target-shaped live CLI runs are tracked separately and remain BLOCKED when the runtime or login is unavailable
*/
for (const fx of [
  {
    target: "qoder",
    rel: ".qoder/settings.json",
    seed: { general: { theme: "keep" }, skills: { customSetting: "keep" } },
    assertPolicy: (parsed) => {
      assert.equal(parsed.general.theme, "keep");
      assert.equal(parsed.general.defaultPermissionMode, "bypass_permissions");
      assert.equal(parsed.skills.customSetting, "keep");
      assert.equal(parsed.skills.loadFromAgentsDirectory, false);
    },
  },
  {
    target: "qwen-code",
    rel: ".qwen/settings.json",
    seed: { tools: { sandbox: true } },
    assertPolicy: (parsed) => {
      assert.equal(parsed.tools.sandbox, true);
      assert.equal(parsed.tools.approvalMode, "yolo");
    },
  },
]) {
  const dest = mkdtempSync(`/tmp/agent-surface-${fx.target}-policy-`);
  try {
    mkdirSync(path.join(dest, path.dirname(fx.rel)), { recursive: true });
    writeFileSync(path.join(dest, fx.rel), `${JSON.stringify(fx.seed, null, 2)}\n`);
    run(["install", "--target", fx.target, "--dest", dest]);
    fx.assertPolicy(JSON.parse(readFileSync(path.join(dest, fx.rel), "utf8")));
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

{
  const dest = mkdtempSync("/tmp/agent-surface-opencode-policy-");
  try {
    const configPath = path.join(dest, ".opencode", "opencode.json");
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, `${JSON.stringify({
      permission: { shell: "ask", edit: "ask" },
      share: "manual",
      userKey: "keep",
    }, null, 2)}\n`);
    run(["install", "--target", "opencode", "--dest", dest]);
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    assert.deepEqual(config.permission, { "*": "allow" });
    assert.equal(config.share, "disabled");
    assert.equal(config.userKey, "keep");
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

{
  const dest = mkdtempSync("/tmp/agent-surface-kiro-policy-");
  try {
    mkdirSync(path.join(dest, ".kiro", "settings"), { recursive: true });
    const permissionsPath = path.join(dest, ".kiro", "settings", "permissions.yaml");
    writeFileSync(permissionsPath, 'rules:\n    - capability: "all"\n      effect: deny\n    - capability: shell\n      match: ["git *"]\n      effect: ask\nother: keep\n');
    const args = ["install", "--target", "kiro", "--scope", "user", "--dest", dest];
    run(args);
    const merged = readFileSync(permissionsPath, "utf8");
    const permissions = parseYaml(merged);
    assert.equal(permissions.other, "keep");
    assert.deepEqual(permissions.rules.find((rule) => rule.capability === "shell"), {
      capability: "shell", match: ["git *"], effect: "ask",
    });
    assert.deepEqual(permissions.rules.filter((rule) => rule.capability === "all"), [
      { capability: "all", effect: "allow" },
    ]);
    run(args);
    assert.equal(readFileSync(permissionsPath, "utf8"), merged, "Kiro permission re-merge is idempotent");
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

{
  const dest = mkdtempSync("/tmp/agent-surface-grok-policy-");
  try {
    mkdirSync(path.join(dest, ".grok"), { recursive: true });
    writeFileSync(path.join(dest, ".grok", "config.toml"), '[ui]\ntheme = "keep"\npermission_mode = "ask"\n\n[profile.default]\nmodel = "keep"\n');
    run(["install", "--target", "grok-build", "--dest", dest]);
    const config = readFileSync(path.join(dest, ".grok", "config.toml"), "utf8");
    const parsed = TOML.parse(config);
    assert.equal(parsed.ui.theme, "keep");
    assert.equal(parsed.ui.permission_mode, "ask");
    assert.equal(parsed.profile.default.model, "keep");
    assert.equal(parsed.mcp_servers.synapse.command, path.join(os.homedir(), ".local", "bin", "synapse-bridge"));
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

{
  const dest = mkdtempSync("/tmp/agent-surface-trae-project-agents-");
  try {
    run(["install", "--target", "trae", "--scope", "project", "--dest", dest]);
    assert.equal(existsSync(path.join(dest, ".trae", "agents", "boss.md")), false);
    const nativeRule = readFileSync(path.join(dest, ".trae", "rules", "00-precedence-and-safety.md"), "utf8");
    assert.match(nativeRule, /^alwaysApply: true$/m);
    run(["install", "--target", "trae", "--scope", "project", "--dest", dest, "--category", "development"]);
    assert.equal(existsSync(path.join(dest, ".trae", "agents", "boss.md")), true);
    assert.equal(existsSync(path.join(dest, ".traecli", "agents", "boss.md")), true);
    assert.equal(existsSync(path.join(dest, ".trae", "skills", "workflow-runtime", "SKILL.md")), true);
    assert.equal(existsSync(path.join(dest, ".traecli", "skills", "workflow-runtime", "SKILL.md")), true);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

{
  const dest = mkdtempSync("/tmp/agent-surface-trae-user-config-");
  try {
    mkdirSync(path.join(dest, ".trae"), { recursive: true });
    const configPath = path.join(dest, ".trae", "traecli.toml");
    writeFileSync(configPath, '[profile.default] # keep\nmodel = "keep-me"\n');
    const args = ["install", "--target", "trae", "--scope", "user", "--dest", dest];
    run(args);
    const config = readFileSync(configPath, "utf8");
    const parsed = TOML.parse(config);
    assert.equal(parsed.approval_policy, "never");
    assert.equal(parsed.default_permissions, ":danger-full-access");
    assert.equal(parsed.profile.default.model, "keep-me");
    assert.equal(parsed.mcp_servers.synapse.command, path.join(os.homedir(), ".local", "bin", "synapse-bridge"));
    run(args);
    assert.equal(readFileSync(configPath, "utf8"), config, "Trae user config re-merge is idempotent");
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

/*
SUBSTITUTE_JUSTIFICATION
- substitute: disposable project root for a combined Claude Code and Copilot install
- replaces: an operator repository carrying a shared .mcp.json
- necessity: the collision assertion requires both real adapters to write one project config; using an active repository would overwrite its MCP setup
- real-option: the production installer and both adapters run unmodified against a disposable real filesystem
- proof-limit: proves shared-config installation and merge compatibility, not runtime MCP startup
- real-proof: credentialed Claude Code and Copilot project runs are separate acceptance scenarios
*/
{
  const dest = mkdtempSync("/tmp/agent-surface-claude-copilot-project-");
  try {
    run(["install", "--target", "claude-code,copilot", "--scope", "project", "--dest", dest]);
    const mcp = JSON.parse(readFileSync(path.join(dest, ".mcp.json"), "utf8"));
    assert.ok(mcp.mcpServers.synapse);
    assert.ok(mcp.mcpServers.grimoire);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

// Representative fail-closed checks at each supported syntax boundary.
for (const fx of [
  { target: "qoder", rel: ".qoder/settings.json", seed: '{"mcpServers":null}\n', error: /mcpServers must be an object/ },
  { target: "qoder", rel: ".qoder/settings.json", seed: '{"mcpServers":{},"mcpServers":{}}\n', error: /duplicate/ },
  { target: "codex", rel: ".codex/config.toml", seed: "[mcp_servers.synapse\n", error: /invalid TOML/ },
  { target: "goose", scope: "user", rel: ".config/goose/config.yaml", seed: "extensions:\n  synapse: [\n", error: /invalid YAML/ },
  { target: "kiro", scope: "user", rel: ".kiro/settings/permissions.yaml", seed: "rules: {}\n", error: /rules must be a sequence/ },
]) {
  const dest = mkdtempSync("/tmp/agent-surface-invalid-config-");
  try {
    const file = path.join(dest, fx.rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, fx.seed);
    const args = ["install", "--target", fx.target, "--dest", dest];
    if (fx.scope) args.push("--scope", fx.scope);
    const result = status(args);
    assert.notEqual(result.status, 0, fx.target);
    assert.match(result.stdout + result.stderr, fx.error, fx.target);
    assert.equal(readFileSync(file, "utf8"), fx.seed, fx.target + ": invalid config stays untouched");
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

// Inserting into a compact JSONC root preserves comments rather than normalizing
// the whole object through JSON.stringify.
{
  const dest = mkdtempSync("/tmp/agent-surface-qoder-compact-comment-");
  try {
    const configPath = path.join(dest, ".qoder", "settings.json");
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, '{"marker":"keep" /* compact user comment */}\n');
    const args = ["install", "--target", "qoder", "--dest", dest];
    run(args);
    const merged = readFileSync(configPath, "utf8");
    assert.match(merged, /compact user comment/);
    assert.equal(JSON.parse(merged.replace(/\/\*[\s\S]*?\*\//g, "")).marker, "keep");
    run(args);
    assert.equal(readFileSync(configPath, "utf8"), merged, "compact JSONC comment re-merge is idempotent");
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

// YAML MCP merge (Goose extensions) is non-destructive + idempotent: preserves the user's
// provider/model, sibling extensions, and comments; adds grimoire+synapse; re-merge is a no-op.
{
  const dest = mkdtempSync("/tmp/agent-surface-goose-yaml-");
  try {
    mkdirSync(path.join(dest, ".config", "goose"), { recursive: true });
    const seed = "# my goose config\nGOOSE_PROVIDER: openrouter\nother:\n  keep: true\nextensions:\n  developer:\n    name: developer\n    type: builtin\n    enabled: true\n";
    writeFileSync(path.join(dest, ".config", "goose", "config.yaml"), seed);
    run(["install", "--target", "goose", "--scope", "user", "--category", "mcps", "--dest", dest]);
    const merged = readFileSync(path.join(dest, ".config", "goose", "config.yaml"), "utf8");
    assert.match(merged, /# my goose config/, "comment preserved");
    const config = parseYaml(merged);
    assert.equal(config.GOOSE_PROVIDER, "openrouter");
    assert.deepEqual(config.other, { keep: true });
    assert.equal(config.extensions.developer.name, "developer");
    assert.equal(config.extensions.grimoire.name, "grimoire");
    assert.equal(config.extensions.synapse.name, "synapse");
    run(["install", "--target", "goose", "--scope", "user", "--category", "mcps", "--dest", dest]);
    assert.equal(readFileSync(path.join(dest, ".config", "goose", "config.yaml"), "utf8"), merged, "goose YAML re-merge is idempotent");
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

{
  const dest = mkdtempSync("/tmp/agent-surface-codex-full-");
  try {
    run(["install", "--target", "codex", "--dest", dest]);
    const config = readFileSync(path.join(dest, ".codex", "config.toml"), "utf8");
    assert.match(config, /^approval_policy = "never"$/m);
    assert.match(config, /^sandbox_mode = "danger-full-access"$/m);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

assert.match(readFileSync(path.join(root, ".gitignore"), "utf8"), /^commands\/ops-server\.md$/m);
assert.match(readFileSync(path.join(root, ".gitignore"), "utf8"), /^\.agent-surface\/$/m);
assert.equal(
  execFileSync("git", ["check-ignore", "commands/ops-server.md"], { cwd: root, encoding: "utf8" }).trim(),
  "commands/ops-server.md",
);
assert.equal(
  execFileSync("git", ["check-ignore", ".agent-surface/readiness/example/readiness.json"], { cwd: root, encoding: "utf8" }).trim(),
  ".agent-surface/readiness/example/readiness.json",
);
assert.doesNotMatch(readFileSync(path.join(root, ".npmignore"), "utf8"), /^external\/\*$/m);
assert.match(readFileSync(path.join(root, ".npmignore"), "utf8"), /^commands\/ops-server\.md$/m);
const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--loglevel=silent"], {
  cwd: root,
  encoding: "utf8",
}));
const packedPaths = new Set(packed[0].files.map((file) => file.path));
for (const required of [
  "external/archify/archify/SKILL.md",
  "external/archify/archify/bin/archify.mjs",
  "external/sanyuan-skills/skills/book-study/SKILL.md",
  "external/sanyuan-skills/skills/skill-forge/SKILL.md",
  "external/sanyuan-skills/skills/skill-review/SKILL.md",
]) {
  assert.equal(packedPaths.has(required), true, `npm package missing ${required}`);
}
assert.equal(
  [...packedPaths].some((file) => file.startsWith("external/andrej-karpathy-skills/")),
  false,
  "npm package includes source-only Karpathy checkout",
);
assert.equal(
  [...packedPaths].some((file) => file.includes("/code-review-expert/")),
  false,
  "npm package includes rejected code-review-expert skill",
);
assert.equal(packedPaths.has("external/archify/docs/index.html"), false, "npm package includes Archify site output");
assert.equal(packedPaths.has("commands/ops-server.md"), false, "npm package leaked private ops-server command");
assert.equal([...packedPaths].some((file) => file.startsWith(".agent-surface/")), false, "npm package leaked local agent state");

// A default install explicitly excludes private assets, even when the public
// package cannot carry their source. Re-enable them with `--category private`.
{
  const dest = mkdtempSync(path.join(os.tmpdir(), "agent-surface-private-overlay-dest-"));
  const packageDir = mkdtempSync(path.join(os.tmpdir(), "agent-surface-public-package-"));
  try {
    // SUBSTITUTE_JUSTIFICATION
    // - substitute: representative private skill and policy bytes in this temporary install root
    // - replaces: the ignored commands/ops-server.md source, which is intentionally unavailable in public CI
    // - necessity: the de-scoping regression requires prior manifest-owned private files without publishing the secret source
    // - real-option: the production public package and installer are exercised; only the unavailable private bytes are seeded
    // - proof-limit: this setup does not prove rendering from the private source; it proves default removal
    // - real-proof: node scripts/agent-surface.mjs install --target codex --scope user --allow-scope-root --category private
    const privateSkillRel = path.join(".codex", "skills", "ops-server", "SKILL.md");
    const privatePolicyRel = path.join(".codex", "skills", "ops-server", "agents", "openai.yaml");
    const privateSkill = path.join(dest, privateSkillRel);
    const privatePolicy = path.join(dest, privatePolicyRel);
    mkdirSync(path.dirname(privateSkill), { recursive: true });
    mkdirSync(path.dirname(privatePolicy), { recursive: true });
    writeFileSync(privateSkill, "private local skill\n");
    writeFileSync(privatePolicy, "private local policy\n");
    mkdirSync(path.join(dest, ".agent-surface"), { recursive: true });
    writeFileSync(
      path.join(dest, ".agent-surface", "codex-manifest.json"),
      `${JSON.stringify({
        target: "codex",
        scope: "user",
        managed: [
          { target: "codex", source: "commands/ops-server.md", output: privateSkillRel, version: "private-local" },
          { target: "codex", source: "commands/ops-server.md", output: privatePolicyRel, version: "private-local" },
        ],
        config_entries: [],
      }, null, 2)}\n`,
    );
    const packageInfo = JSON.parse(execFileSync(
      "npm",
      ["pack", "--json", "--pack-destination", packageDir, "--loglevel=silent"],
      { cwd: root, encoding: "utf8" },
    ));
    const packagedRoot = path.join(packageDir, "source");
    mkdirSync(packagedRoot);
    execFileSync(
      "tar",
      ["-xzf", path.join(packageDir, packageInfo[0].filename), "-C", packagedRoot, "--strip-components=1"],
    );
    symlinkSync(path.join(root, "node_modules"), path.join(packagedRoot, "node_modules"), "dir");
    assert.equal(existsSync(path.join(packagedRoot, "commands", "ops-server.md")), false);

    execFileSync(
      process.execPath,
      [path.join(packagedRoot, "scripts", "agent-surface.mjs"), "install", "--target", "codex", "--dest", dest],
      { cwd: packagedRoot, encoding: "utf8" },
    );

    assert.equal(existsSync(privateSkill), false);
    assert.equal(existsSync(privatePolicy), false);
    const manifest = JSON.parse(
      readFileSync(path.join(dest, ".agent-surface", "codex-manifest.json"), "utf8"),
    );
    assert.equal(
      manifest.managed.filter((item) => item.source === "commands/ops-server.md").length,
      0,
    );
  } finally {
    rmSync(dest, { recursive: true, force: true });
    rmSync(packageDir, { recursive: true, force: true });
  }
}

const allTargetsDest = mkdtempSync(path.join(os.tmpdir(), "agent-surface-all-targets-"));
try {
  run(["install", "--target", "all", "--scope", "user", "--dest", allTargetsDest]);
  const manifestRoot = path.join(allTargetsDest, ".agent-surface");
  for (const target of Object.keys(targets)) {
    const manifest = JSON.parse(
      readFileSync(path.join(manifestRoot, `${target}-manifest.json`), "utf8"),
    );
    const sources = manifest.managed.map((item) => item.source);
    assert.equal(
      sources.includes("commands/ops-server.md"),
      false,
      `${target}: default excludes private ops-server overlay`,
    );
    for (const optionalPack of [
      "external/archify/",
      "external/sanyuan-skills/",
    ]) {
      assert.equal(
        sources.some((source) => source.startsWith(optionalPack)),
        false,
        `${target}: ${optionalPack}`,
      );
    }
  }
} finally {
  rmSync(allTargetsDest, { recursive: true, force: true });
}

console.log("install: ok");
