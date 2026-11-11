#!/usr/bin/env node
import * as TOML from "@decimalturn/toml-patch";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { parseJsonc, removeJsoncValue } from "../../scripts/agent-surface/jsonc.mjs";
import { mergeCodexMcpToml, mergeJsonMcpConfig, mergeYamlMcpConfig } from "../../scripts/agent-surface/merge.mjs";
import { writeShims } from "../../scripts/agent-surface/mcp-shims.mjs";
import { mergeSynapseHook, planSynapseHook, synapseHookCommand, synapseHookLauncher, synapseHookStatus } from "../../scripts/agent-surface/synapse-hook.mjs";
import { kimiCodeCursorSettingsPath, kimiCodeVsCodeSettingsPath, vsCodeUserRoot } from "../../scripts/agent-surface/roots.mjs";
import { targets } from "../../scripts/agent-surface/targets.mjs";
import {
  clineIdeUserDataRoot,
  clineUserMcpRoutes,
  hasLocalOpsServerSkill,
  installClineExtension,
  MAX_CAPTURE_BYTES,
  ownTempRoot,
  root,
  run, status,
  useDisposableHome,
} from "../lib/helpers.mjs";

const ownTmp = ownTempRoot("install");

// Removing a managed server deletes only that entry and its comma; the user's comments around it stay.
{
  const config = "{\n  \"mcpServers\": { // servers-note\n    \"keep\": { \"command\": \"k\", \"args\": [] }, // keep-note\n    \"synapse\": { \"type\": \"stdio\", \"command\": \"s\", \"args\": [] }\n  }\n}\n";
  const removed = mergeJsonMcpConfig(config, "mcpServers", [], ["synapse"]);
  assert.match(removed, /servers-note/);
  assert.match(removed, /"keep": \{ "command": "k", "args": \[\] \} \/\/ keep-note/, "the neighbour keeps its bytes and its comment");
  assert.deepEqual(Object.keys(parseJsonc(removed, "removed").mcpServers), ["keep"]);
  assert.equal(removeJsoncValue("{\"m\":{\"a\":1,\"s\":2,\"b\":3}}", ["m", "s"]), "{\"m\":{\"a\":1,\"b\":3}}");
  // An id both released and rendered in one merge is written whole, as the TOML and YAML merges do.
  const service = { path: "registry#a", mcp: { server: { type: "stdio", command: "c", args: [] } } };
  const rewritten = mergeJsonMcpConfig("{\"mcpServers\":{\"a\":{\"type\":\"stdio\",\"command\":\"c\",\"args\":[]}}}", "mcpServers", [["a", service]], ["a"]);
  assert.equal(parseJsonc(rewritten, "rewritten").mcpServers.a?.command, "c");
}

// A rendered stdio entry drops the keys that point it at a remote endpoint, in every config family:
// Codex 0.166 refuses a server holding both `url` and `command` ("url is not supported for stdio").
// The entry's other settings stay.
{
  const service = { path: "registry#synapse", mcp: { server: { type: "stdio", command: "synapse-bridge", args: [] } } };
  const codex = TOML.parse(mergeCodexMcpToml(
    "[mcp_servers.synapse]\nurl = \"http://127.0.0.1:4319/mcp\"\nbearer_token_env_var = \"SYNAPSE_TOKEN\"\nstartup_timeout_sec = 20\n",
    [["synapse", service]],
  )).mcp_servers.synapse;
  assert.deepEqual({ ...codex }, { command: "synapse-bridge", args: [], startup_timeout_sec: 20 });
  const json = parseJsonc(mergeJsonMcpConfig(
    "{\"mcpServers\":{\"synapse\":{\"type\":\"http\",\"url\":\"http://127.0.0.1:4319/mcp\",\"headers\":{\"X-Trace\":\"1\"},\"disabled\":false}}}",
    "mcpServers",
    [["synapse", service]],
  ), "json").mcpServers.synapse;
  assert.deepEqual(json, { type: "stdio", command: "synapse-bridge", args: [], disabled: false });
  const goose = parseYaml(mergeYamlMcpConfig(
    "extensions:\n  synapse:\n    type: sse\n    uri: http://127.0.0.1:4319/mcp\n    description: keep\n",
    "goose-extensions",
    [["synapse", service]],
  )).extensions.synapse;
  assert.deepEqual(goose, { type: "stdio", description: "keep", name: "synapse", cmd: "synapse-bridge", args: [], enabled: true, timeout: 300 });
}

// Live installs here wire credentialed MCP servers, which write the shared env launcher into HOME.
const disposableHome = useDisposableHome();

function dryRun(target, extra = []) {
  return run(["install", "--target", target, "--dest", ownTmp(target), ...extra, "--dry-run"]);
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

// An option the command does not read stops it before anything happens. Without the check, a typo
// such as --categroy, or a shell passing "--category development" as one word, ran a general install.
{
  const dest = mkdtempSync(path.join(os.tmpdir(), "agent-surface-flags-"));
  const project = ["install", "--target", "codex", "--scope", "project", "--dest", dest];
  const typo = status([...project, "--categroy", "development"]);
  assert.equal(typo.status, 1, typo.stderr);
  assert.match(typo.stderr, /^ERROR: unknown option for install: --categroy; it accepts --target, --runtime, --category, /m);
  const joined = status([...project, "--category development"]);
  assert.equal(joined.status, 1, joined.stderr);
  assert.match(joined.stderr, /unknown option for install: --category development;/);
  // `--` is not an end-of-options marker, so it cannot hide a typo from this check.
  const hidden = status([...project, "--", "--categroy", "development"]);
  assert.equal(hidden.status, 1, hidden.stderr);
  assert.match(hidden.stderr, /unknown option for install: --;/);
  // An option takes one value, so a space-separated list installed its first target alone, and a
  // repeated one-value option read its first value alone. Only a list option's hint names commas.
  const spaced = status(["install", "--target", "codex", "cursor", "--scope", "project", "--dest", dest]);
  assert.equal(spaced.status, 1, spaced.stderr);
  assert.match(spaced.stderr, /^ERROR: unexpected argument for install: cursor; --target takes a comma-separated list$/m);
  assert.deepEqual(readdirSync(dest), [], "a rejected install writes nothing");
  assert.match(status(["build", "--target", "codex", "cursor"]).stderr, /^ERROR: unexpected argument for build: cursor$/m);
  assert.match(status(["build", "--target", "codex", "--target", "cursor"]).stderr, /^ERROR: --target is given twice; build reads one value$/m);
  assert.match(status(["build", "--target", "codex", "--bogus"]).stderr, /unknown option for build: --bogus; it accepts --target, --dry-run/);
  assert.match(status(["check", "skills", "--json"]).stderr, /unknown option for check skills: --json; it takes no options/);
  assert.match(status(["check", "bogus"]).stderr, /^ERROR: unexpected argument for check: bogus$/m);
  // The first argument not read is the one reported, so a mistyped subcommand is named before the
  // options that belong to the real one.
  assert.match(status(["check", "generted", "--target", "codex"]).stderr, /^ERROR: unexpected argument for check: generted$/m);
  assert.match(status(["workflow", "doctor", "stray", "--run", "r1"]).stderr, /unexpected argument for workflow doctor: stray$/m);
  assert.match(status(["workflow", "doctr", "--run", "r1"]).stderr, /workflow requires init, doctor, apply, or close/);
  assert.match(status(["bogus", "--flag"]).stderr, /unknown command: bogus/);
  assert.match(run(["install", "--help"]), /^Usage:$/m);
  // A value that looks like an option, `--help` included, is still a value.
  assert.match(run(["install", "--target", "codex", "--scope", "project", "--dest", "-odd", "--dry-run"]), /^root: .*[\\/]-odd$/m);
  assert.match(run(["install", "--target", "codex", "--scope", "project", "--dest", "--help", "--dry-run"]), /^root: .*[\\/]--help$/m);
  assert.match(status(["commands", "--phase", "--help"]).stderr, /unsupported command phase: --help/);
  rmSync(dest, { recursive: true, force: true });
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

const clineUserMcpDest = ownTmp("cline-user-mcp");
rmSync(clineUserMcpDest, { recursive: true, force: true });
installClineExtension(clineUserMcpDest, ["Code"]);
const clineUserMcpPlan = run([
  "install", "--target", "cline", "--scope", "user", "--dest", clineUserMcpDest,
  "--category", "mcps", "--dry-run",
]);
planHas(clineUserMcpPlan, [
  /\.cline\/data\/settings\/cline_mcp_settings\.json MCP \+= grimoire, synapse/,
  /Code\/User\/globalStorage\/saoudrizwan\.claude-dev\/settings\/cline_mcp_settings\.json MCP \+= grimoire, synapse/,
], "cline user mcps");
planLacks(clineUserMcpPlan, [
  /\.cline\/mcp\.json/,
  /(Cursor|Windsurf)\/User\/globalStorage\/saoudrizwan\.claude-dev\/settings\/cline_mcp_settings\.json MCP/,
], "cline user mcps without Cline in Cursor or Windsurf");
rmSync(clineUserMcpDest, { recursive: true, force: true });

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
planHas(kimiCodePlan, [/\.kimi-code\/mcp\.json MCP \+= grimoire, synapse/], "kimi-code");
// Kimi reads config.toml only from KIMI_CODE_HOME, so only a user install merges the policy.
planLacks(kimiCodePlan, [/\.kimi-code\/config\.toml/], "kimi-code project");
planHas(dryRun("kimi-code", ["--scope", "user"]), [/config\.toml default_permission_mode := "auto"/], "kimi-code user");
{
  // An earlier project install left a .kimi-code/config.toml; a new one neither rewrites nor removes it.
  const dest = mkdtempSync(ownTmp("kimi-project-config-"));
  try {
    const legacy = path.join(dest, ".kimi-code", "config.toml");
    mkdirSync(path.dirname(legacy), { recursive: true });
    const bytes = 'default_permission_mode = "auto"\nmerge_all_available_skills = true\n\n[user]\nkept = true\n';
    writeFileSync(legacy, bytes);
    run(["install", "--target", "kimi-code", "--scope", "project", "--dest", dest]);
    assert.equal(readFileSync(legacy, "utf8"), bytes, "an earlier project config.toml is left byte-identical");
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

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
planLacks(qwenCodeExternalPlan, [/skills\/archify\//, /skill-forge/, /skills\/ctf-ai-ml\//], "qwen-code general external packs");

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
planHas(qwenCodeDevelopmentPlan, [
  /\.qwen\/skills\/no-ai-slop\/LICENSE <- external\/no-ai-slop\/LICENSE$/m,
  /\.qwen\/skills\/skill-forge\/LICENSE <- external\/sanyuan-skills\/LICENSE$/m,
  /\.qwen\/skills\/archify\/LICENSE <- external\/archify\/archify\/LICENSE$/m,
  /\.qwen\/skills\/archify\/NOTICE <- external\/archify\/archify\/NOTICE$/m,
  /\.qwen\/skills\/diagram-design\/THIRD_PARTY_LICENSES\.md <- external\/diagram-design\/THIRD_PARTY_LICENSES\.md$/m,
], "qwen-code development skills carry their upstream license and notices");
planHas(qwenCodeDevelopmentPlan, [
  /\.qwen\/skills\/archify\/explainer\/reader\.css <- external\/archify\/archify\/explainer\/reader\.css$/m,
], "an external skill keeps the stylesheet its pages load");
planLacks(qwenCodeDevelopmentPlan, [/archify\/LICENSE <- external\/archify\/LICENSE$/m], "a skill's own LICENSE wins over the pack license_file");
planLacks(qwenCodeDevelopmentPlan, [
  /skills\/ops-ask\//,
  /skills\/book-study\//,
  /skills\/ctf-ai-ml\//,
  /code-review-expert/,
], "qwen-code development isolation");

const qwenCodeCybersecurityPlan = dryRun("qwen-code", ["--category", "cybersecurity"]);
planHas(qwenCodeCybersecurityPlan, [
  /\.qwen\/skills\/ctf-ai-ml\/SKILL\.md/,
  /\.qwen\/skills\/redteam-boundary-policy\/SKILL\.md/,
  /\.qwen\/settings\.json MCP \+= fenjing, ida-pro-mcp, openosint/,
], "qwen-code cybersecurity assets");
planLacks(qwenCodeCybersecurityPlan, [/skills\/stellaris-design\//, /pentest-ai/], "qwen-code cybersecurity isolation");

const qwenCodePentestAiPlan = dryRun("qwen-code", ["--category", "mcps", "--service", "pentest-ai"]);
planHas(qwenCodePentestAiPlan, [/\.qwen\/settings\.json MCP \+= pentest-ai/], "qwen-code explicit pentest-ai MCP");

const qwenCodeChromePlan = dryRun("qwen-code", ["--category", "mcps", "--service", "chrome-devtools"]);
planHas(qwenCodeChromePlan, [/\.qwen\/settings\.json MCP \+= chrome-devtools/], "qwen-code explicit Chrome DevTools MCP");

const qwenCodeModdingPlan = dryRun("qwen-code", ["--category", "modding"]);
planHas(qwenCodeModdingPlan, [/\.qwen\/skills\/stellaris-design\/SKILL\.md/], "qwen-code modding assets");
planLacks(qwenCodeModdingPlan, [/skills\/ctf-ai-ml\//], "qwen-code modding isolation");

const qwenCodeAllPlan = dryRun("qwen-code", ["--category", "all"]);
planHas(qwenCodeAllPlan, [/\.qwen\/skills\/ops-ask\/SKILL\.md/], "qwen-code all general outputs");
planLacks(qwenCodeAllPlan, [/skills\/archify\//, /skills\/ctf-ai-ml\//, /skills\/stellaris-design\//], "qwen-code all keeps opt-in assets explicit");

const antigravityCliModdingPlan = dryRun("antigravity-cli", ["--category", "modding"]);
planHas(antigravityCliModdingPlan, [
  /antigravity-cli\/plugins\/agent-surface\/plugin\.json <- package\.json/,
  /antigravity-cli\/plugins\/agent-surface\/skills\/stellaris-design\/SKILL\.md/,
], "antigravity-cli category scaffold");

if (hasLocalOpsServerSkill) {
  const codexPrivatePlan = dryRun("codex", ["--category", "private"]);
  planHas(codexPrivatePlan, [/\.agents\/skills\/ops-server\/SKILL\.md <- skills\/ops-server\/SKILL\.md/], "codex private assets");
  const dest = mkdtempSync(path.join(os.tmpdir(), "agent-surface-private-skill-"));
  try {
    run(["install", "--target", "codex,cursor,dsh", "--dest", dest, "--category", "private"]);
    for (const directory of [".agents", ".cursor", ".dsh"]) {
      const skill = readFileSync(path.join(dest, directory, "skills", "ops-server", "SKILL.md"), "utf8");
      assert.equal(skill, readFileSync(path.join(root, "skills", "ops-server", "SKILL.md"), "utf8"));
      assert.doesNotMatch(skill, /^disable-model-invocation:/m);
    }
    assert.match(
      readFileSync(path.join(dest, ".agents", "skills", "ops-server", "agents", "openai.yaml"), "utf8"),
      /^  allow_implicit_invocation: true$/m,
    );
    assert.equal(existsSync(path.join(dest, ".cursor", "commands", "ops-server.md")), false);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

const mixedCategory = status([
  "install", "--target", "codex", "--dest", ownTmp("mixed-category"),
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
  const result = status(["install", "--target", flag === "--target" ? value : "codex", "--dest", ownTmp("all-combo"), ...(flag === "--category" ? ["--category", value] : []), "--dry-run"]);
  assert.notEqual(result.status, 0, `${flag} ${value} is rejected rather than silently broadened: ${result.stdout}`);
  assert.match(result.stderr, new RegExp(`${flag} all cannot be combined with ${sibling}`), `${flag} ${value} names the conflicting sibling: ${result.stderr}`);
};
rejects("--category", "all,development", "development");
rejects("--category", "all,skills", "skills");
rejects("--target", "all,codex", "codex");
// A typo next to `all` must surface as an error, not vanish behind it.
rejects("--category", "all,developmnet", "developmnet");
rejects("--target", "all,codx", "codx");
// A list option given only empty values names nothing. Read as the option left out, `--category ""`
// was the general install, which removes the opt-in categories installed earlier.
for (const [flag, value, extra = []] of [
  ["--category", ""], ["--category", ","], ["--categories", " , "], ["--target", ""], ["--runtime", ","], ["--service", "", ["--category", "mcps"]],
]) {
  const result = status(["install", ...(flag === "--target" ? [] : ["--target", "codex"]), "--dest", ownTmp("empty-selector"), flag, value, ...extra, "--dry-run"]);
  assert.equal(result.status, 1, `${flag} ${JSON.stringify(value)} is rejected: ${result.stdout}`);
  assert.ok(result.stderr.includes(`ERROR: ${flag} ${JSON.stringify(value)} names no value; pass one or more comma-separated values`), result.stderr);
  assert.doesNotMatch(result.stdout, /^target: /m, "nothing is planned");
}
// Standalone `all` keeps its documented meaning on both selectors: the general full sync.
const standaloneCategory = status(["install", "--target", "codex", "--dest", ownTmp("all-standalone"), "--category", "all", "--dry-run"]);
assert.equal(standaloneCategory.status, 0, `--category all alone still performs the general sync: ${standaloneCategory.stderr}`);
const noCategory = status(["install", "--target", "codex", "--dest", ownTmp("all-standalone"), "--dry-run"]);
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

const geminiPlan = status(["install", "--target", "gemini-cli", "--dest", ownTmp("gemini"), "--dry-run"]);
assert.notEqual(geminiPlan.status, 0);
assert.match(`${geminiPlan.stdout}${geminiPlan.stderr}`, /unsupported install target: gemini-cli/);

for (const [target, patterns] of [
  ["claude-code", [/\.claude\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/, /\.claude\/agents\/boss\.md <- subagents\/boss\.md/]],
  ["cursor", [/\.cursor\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/, /\.cursor\/commands\/ops-nuke\.md <- commands\/ops-nuke\.md/, /\.cursor\/agents\/boss\.md <- subagents\/boss\.md/]],
  ["droid", [/\.agents\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/, /\.factory\/commands\/ops-nuke\.md <- commands\/ops-nuke\.md/]],
  ["codex", [/\.agents\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/]],
  ["openhands", [/\.agents\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/]],
  ["antigravity-cli", [/antigravity-cli\/plugins\/agent-surface\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/]],
  ["copilot", [/\.github\/skills\/workflow-boss\/SKILL\.md <- skills\/workflow-boss\/SKILL\.md/, /\.github\/agents\/boss\.agent\.md <- subagents\/boss\.md/]],
  ["goose", [/\.goose\/recipes\/ship-commit\.yaml <- commands\/ship-commit\.md/]],
]) {
  planHas(dryRun(target, ["--category", "development"]), patterns, `${target} development`);
}
planHas(dryRun("grok-build"), [/\.grok\/config\.toml MCP \+= grimoire, synapse/], "grok-build default");
planHas(dryRun("grok-build", ["--category", "development"]), [/\.grok\/agents\/boss\.md <- subagents\/boss\.md/, /\.grok\/agents\/worker\.md <- subagents\/worker\.md/], "grok-build development");

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
    env: { ...process.env, HOME: ownTmp("mcps-all-home") },
  });
  assert.match(mcpsAllPlan, /MCP \+= grimoire, synapse/);
}
// A category no selected target can apply fails: DSH wires no MCP. Pi does.
const dshStatus = status(["install", "--target", "dsh", "--scope", "user", "--allow-scope-root", "--category", "mcps", "--dry-run"]);
assert.notEqual(dshStatus.status, 0);
const piMcpPlan = run(["install", "--target", "pi", "--scope", "user", "--allow-scope-root", "--category", "mcps", "--dry-run"], {
  env: { ...process.env, HOME: ownTmp("mcps-all-home") },
});
assert.match(piMcpPlan, /\.pi\/agent\/mcp\.json MCP \+= grimoire, synapse/);

// Codex keeps manual workflows non-implicit in the shared Agent Skills root.
// Other targets may own the same compatibility file, but Codex must not create
// a second discoverable copy under its private skill root.
const sharedRootHome = ownTmp("shared-root-home");
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
const syncDest = ownTmp("strict-sync");
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
assert.doesNotMatch(syncPlan, /\.agents\/skills\/ctf-ai-ml\/SKILL\.md/);
const externalSyncPlan = run(["install", "--target", "droid", "--dest", syncDest, "--category", "external", "--dry-run"]);
assert.match(externalSyncPlan, /\.factory\/skills\/ghost-descoped-skill\/SKILL\.md/);
assert.doesNotMatch(externalSyncPlan, /\.factory\/skills\/retained-canonical-skill\/SKILL\.md/);
run(["install", "--target", "droid", "--dest", syncDest, "--category", "external"]);
assert.equal(existsSync(ghostPath), false);
assert.equal(existsSync(path.join(syncDest, retainedCanonicalRel)), true);
assert.equal(existsSync(path.join(syncDest, ".agents", "skills", "book-study", "SKILL.md")), true);
assert.doesNotMatch(
  run(["install", "--target", "droid", "--dest", syncDest, "--category", "external", "--dry-run"]),
  /\.factory\/skills\/ghost-descoped-skill\/SKILL\.md/,
);
rmSync(syncDest, { recursive: true, force: true });

// SUBSTITUTE_JUSTIFICATION
// - substitute: a manifest and files left by an install made before Droid's skills moved roots
// - replaces: a real earlier agent-surface release writing Droid skills under .factory/skills
// - necessity: the current source can no longer produce the old layout, so its owned state is seeded
// - real-option: the real installer, manifest and filesystem run unchanged
// - proof-limit: does not show Droid itself loading one copy; `droid doctor` reporting no duplicates does
// - real-proof: install for droid and a .agents/skills host into one HOME, then run `droid doctor`
// Droid reads .agents/skills beside .factory/skills, so a skill an earlier install wrote under
// .factory/skills must move to the shared root and leave no second copy, while a skill the user put
// there is not agent-surface's to touch. The old entries carry no category, as manifests did before
// categories existed, and the install is category-filtered: ordinary stale pruning would keep them,
// so only the relocation retires the copy Droid would otherwise load twice.
const relocateDest = mkdtempSync(path.join(os.tmpdir(), "agent-surface-droid-relocate-"));
const oldSkillRel = path.join(".factory", "skills", "workflow-boss", "SKILL.md");
const oldReferenceRel = path.join(".factory", "skills", "workflow-boss", "references", "stale-companion.md");
const userSkillRel = path.join(".factory", "skills", "my-own-skill", "SKILL.md");
for (const [rel, body] of [[oldSkillRel, "old copy\n"], [oldReferenceRel, "old companion\n"], [userSkillRel, "---\nname: my-own-skill\ndescription: mine\n---\nbody\n"]]) {
  mkdirSync(path.dirname(path.join(relocateDest, rel)), { recursive: true });
  writeFileSync(path.join(relocateDest, rel), body);
}
mkdirSync(path.join(relocateDest, ".agent-surface"), { recursive: true });
writeFileSync(path.join(relocateDest, ".agent-surface", "droid-manifest.json"), `${JSON.stringify({
  target: "droid",
  managed: [
    { target: "droid", source: "skills/workflow-boss/SKILL.md", output: oldSkillRel, version: "test" },
    { target: "droid", source: "skills/workflow-boss/references/stale-companion.md", output: oldReferenceRel, version: "test" },
  ],
}, null, 2)}\n`);
run(["install", "--target", "droid", "--dest", relocateDest, "--category", "development"]);
assert.equal(existsSync(path.join(relocateDest, ".agents", "skills", "workflow-boss", "SKILL.md")), true, "the skill is written under the shared root");
assert.equal(existsSync(path.join(relocateDest, oldSkillRel)), false, "the owned .factory/skills copy is retired, so Droid loads one");
assert.equal(existsSync(path.join(relocateDest, oldReferenceRel)), true, "an uncategorized companion with no successor is outside a category-filtered sync, as before");
assert.equal(readFileSync(path.join(relocateDest, userSkillRel), "utf8").includes("name: my-own-skill"), true, "a skill the user placed is left alone");
const relocatedManifest = JSON.parse(readFileSync(path.join(relocateDest, ".agent-surface", "droid-manifest.json"), "utf8"));
assert.equal(relocatedManifest.managed.some((item) => item.output === oldSkillRel), false, "the manifest no longer claims the relocated copy");
rmSync(relocateDest, { recursive: true, force: true });

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
const retiredVscodiumDest = ownTmp("retired-vscodium");
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
assert.match(retiredVscodiumPlan, /planned stale managed paths retained for other owners:/);
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

const liveDest = ownTmp("live");
rmSync(liveDest, { recursive: true, force: true });
const liveInstall = run(["install", "--target", "cline", "--dest", liveDest]);
assert.match(liveInstall, /^installed:$/m);
assert.match(readFileSync(path.join(liveDest, ".cline", "skills", "ops-ask", "SKILL.md"), "utf8"), /^---\nname: ops-ask\n/);
assert.equal(existsSync(path.join(liveDest, ".cline", "skills", "workflow-boss", "SKILL.md")), false);
assert.equal(existsSync(path.join(liveDest, ".cline", "agents", "boss.yaml")), false);
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
rmSync(liveDest, { recursive: true, force: true });

const kimiCodeDest = ownTmp("kimi-code-live");
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

// An existing file no manifest in the install root claims is an operator's file: the install
// refuses before writing anything instead of overwriting it (contract Migration step 2).
const unmanagedDest = ownTmp("unmanaged");
rmSync(unmanagedDest, { recursive: true, force: true });
mkdirSync(path.join(unmanagedDest, ".clinerules", "workflows"), { recursive: true });
writeFileSync(path.join(unmanagedDest, ".clinerules", "workflows", "ops-nuke.md"), "local workflow\n");
const unownedInstall = status(["install", "--target", "cline", "--dest", unmanagedDest, "--category", "development"]);
assert.equal(unownedInstall.status, 1, unownedInstall.stdout);
assert.match(unownedInstall.stdout, /UNOWNED_DESTINATION: \.clinerules[\\/]workflows[\\/]ops-nuke\.md /);
assert.equal(readFileSync(path.join(unmanagedDest, ".clinerules", "workflows", "ops-nuke.md"), "utf8"), "local workflow\n");
assert.equal(existsSync(path.join(unmanagedDest, ".agent-surface", "cline-manifest.json")), false);
rmSync(unmanagedDest, { recursive: true, force: true });

const liveStaleDest = ownTmp("live-stale");
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

const missingStaleDest = ownTmp("missing-stale");
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

const scopeRootDest = ownTmp("scope-root");
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

const userScopeHome = ownTmp("user-scope-home");
rmSync(userScopeHome, { recursive: true, force: true });
mkdirSync(userScopeHome, { recursive: true });
installClineExtension(userScopeHome);
// A desktop profile's Documents entry, which xdg-user-dir reads on Linux, so Cline's user paths below
// stay under ~/Documents on any host; os-routes covers a redirected folder.
mkdirSync(path.join(userScopeHome, ".config"), { recursive: true });
writeFileSync(path.join(userScopeHome, ".config", "user-dirs.dirs"), "XDG_DOCUMENTS_DIR=\"$HOME/Documents\"\n");
const userScopeEnv = { ...process.env, HOME: userScopeHome, XDG_CONFIG_HOME: path.join(userScopeHome, ".config") };
const clineUserScope = status(["install", "--target", "cline", "--scope", "user", "--dry-run"], { env: userScopeEnv });
assert.equal(clineUserScope.status, 0, `${clineUserScope.stdout}${clineUserScope.stderr}`);
assert.match(clineUserScope.stdout, /\.cline\/skills\/ops-ask\/SKILL\.md <- skills\/ops-ask\/SKILL\.md/);
assert.match(clineUserScope.stdout, /Documents\/Cline\/Rules\/agent-surface\.md <- rules\/\*\.mdc/);
assert.doesNotMatch(clineUserScope.stdout, /workflow-boss|ops-nuke|agents\/boss\.yaml/);
assert.match(clineUserScope.stdout, /\.cline\/data\/settings\/cline_mcp_settings\.json MCP \+= grimoire, synapse/);
assert.match(clineUserScope.stdout, /Code\/User\/globalStorage\/saoudrizwan\.claude-dev\/settings\/cline_mcp_settings\.json MCP \+= grimoire, synapse/);
assert.match(clineUserScope.stdout, /Cursor\/User\/globalStorage\/saoudrizwan\.claude-dev\/settings\/cline_mcp_settings\.json MCP \+= grimoire, synapse/);
assert.match(clineUserScope.stdout, /Windsurf\/User\/globalStorage\/saoudrizwan\.claude-dev\/settings\/cline_mcp_settings\.json MCP \+= grimoire, synapse/);
assert.match(clineUserScope.stdout, /Devin\/User\/globalStorage\/saoudrizwan\.claude-dev\/settings\/cline_mcp_settings\.json MCP \+= grimoire, synapse/);
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
assert.match(kiloUserScope.stdout, /\.config\/kilo\/kilo\.jsonc instructions \+= ~\/\.config\/kilo\/rules\/00-precedence-and-safety\.md, ~\/\.config\/kilo\/rules\/01-response-style\.md/);
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
assert.match(kiloDevelopmentUserScope.stdout, /kilo\.jsonc instructions \+= ~\/\.config\/kilo\/rules\/02-agent-workflow\.md, .*~\/\.config\/kilo\/rules\/06-test-policy\.md/);

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

const kiloIgnoreDest = ownTmp("kilo-ignore-proj");
rmSync(kiloIgnoreDest, { recursive: true, force: true });
mkdirSync(kiloIgnoreDest, { recursive: true });
const kiloProjectScope = status(["install", "--target", "kilo", "--dest", kiloIgnoreDest, "--scope", "project", "--dry-run"]);
assert.equal(kiloProjectScope.status, 0, `${kiloProjectScope.stdout}${kiloProjectScope.stderr}`);
assert.match(kiloProjectScope.stdout, /\.kilocodeignore <- ignores\/default\.ignore/);
rmSync(kiloIgnoreDest, { recursive: true, force: true });

const invalidKiloDest = ownTmp("kilo-invalid");
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

const existingKiloDest = ownTmp("kilo-existing");
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

const inlineKiloDest = ownTmp("kilo-inline");
rmSync(inlineKiloDest, { recursive: true, force: true });
mkdirSync(inlineKiloDest, { recursive: true });
// A project-scope `./rules/<name>.md` entry names the project's own file, so it stays.
writeFileSync(path.join(inlineKiloDest, "kilo.jsonc"), "{\"instructions\":[\"./existing-rule.md\",\"./rules/00-precedence-and-safety.md\"]}\n");
run(["install", "--target", "kilo", "--dest", inlineKiloDest]);
const inlineKiloConfig = JSON.parse(readFileSync(path.join(inlineKiloDest, "kilo.jsonc"), "utf8"));
assert.deepEqual(inlineKiloConfig.instructions, [
  "./existing-rule.md",
  "./rules/00-precedence-and-safety.md",
  ".kilo/rules/00-precedence-and-safety.md",
  ".kilo/rules/01-response-style.md",
]);
assert.equal(Object.hasOwn(inlineKiloConfig, "skills"), false);
assert.deepEqual(inlineKiloConfig.permission, { "*": "allow" });
assert.equal(inlineKiloConfig.share, "disabled");
assert.deepEqual(inlineKiloConfig.mcp.synapse.command, [path.join(os.homedir(), ".local", "bin", "synapse-bridge")]);
rmSync(inlineKiloDest, { recursive: true, force: true });

// Kilo resolves a relative user-config instruction against the project directory, so the
// `./rules/<rule>.md` entries earlier user installs wrote never loaded ~/.config/kilo/rules
// (Kilo CLI 7.8.8). A user install swaps them for home paths and keeps the operator's own entries, a home-path one included.
const kiloUserMigrationRoot = ownTmp("kilo-user-migration");
rmSync(kiloUserMigrationRoot, { recursive: true, force: true });
mkdirSync(path.join(kiloUserMigrationRoot, ".config", "kilo"), { recursive: true });
writeFileSync(path.join(kiloUserMigrationRoot, ".config", "kilo", "kilo.jsonc"), `${JSON.stringify({
  instructions: ["./my-rule.md", "~/.config/kilo/rules/10-python.md", "./rules/00-precedence-and-safety.md", "./rules/01-response-style.md", "./rules/14-lang-shell.md"],
}, null, 2)}\n`);
const kiloUserMigrationConfig = () => JSON.parse(readFileSync(path.join(kiloUserMigrationRoot, ".config", "kilo", "kilo.jsonc"), "utf8")).instructions;
const kiloDoctor = () => run(["doctor"], { env: { ...process.env, HOME: kiloUserMigrationRoot } });
assert.match(kiloDoctor(), /^kilo-config: present \(rule entries never load; rerun a general user install\)$/m);
const kiloUserMigration = run(["install", "--target", "kilo", "--scope", "user", "--category", "rules", "--dest", kiloUserMigrationRoot]);
assert.match(kiloUserMigration, /kilo\.jsonc instructions -= .*\.\/rules\/00-precedence-and-safety\.md/);
assert.deepEqual(kiloUserMigrationConfig(), [
  "./my-rule.md",
  "~/.config/kilo/rules/10-python.md",
  "~/.config/kilo/rules/00-precedence-and-safety.md",
  "~/.config/kilo/rules/01-response-style.md",
]);
assert.match(kiloDoctor(), /^kilo-config: present \(rules configured\)$/m);
// A general user install after a development one prunes the development entries by home path.
run(["install", "--target", "kilo", "--scope", "user", "--category", "development", "--dest", kiloUserMigrationRoot]);
assert.ok(kiloUserMigrationConfig().includes("~/.config/kilo/rules/06-test-policy.md"), "development rules are registered by home path");
run(["install", "--target", "kilo", "--scope", "user", "--dest", kiloUserMigrationRoot]);
assert.deepEqual(kiloUserMigrationConfig(), [
  "./my-rule.md",
  "~/.config/kilo/rules/10-python.md",
  "~/.config/kilo/rules/00-precedence-and-safety.md",
  "~/.config/kilo/rules/01-response-style.md",
]);
rmSync(kiloUserMigrationRoot, { recursive: true, force: true });

// Regression: MCP commands must be ABSOLUTE at install time. Hosts posix_spawn the stdio
// command directly (no shell), so a literal "~" is never expanded → ENOENT on launch.
// dist/build keeps "~" (portable, reproducible); install resolves it against $HOME.
const mcpAbsBin = (name) => path.join(os.homedir(), ".local", "bin", name);
const mcpAbsDest = ownTmp("mcp-abs");
rmSync(mcpAbsDest, { recursive: true, force: true });
run(["install", "--target", "droid", "--scope", "user", "--category", "mcps", "--dest", mcpAbsDest]);
const droidMcpAbs = JSON.parse(readFileSync(path.join(mcpAbsDest, ".factory", "mcp.json"), "utf8"));
assert.equal(droidMcpAbs.mcpServers.grimoire.command, mcpAbsBin("grimoire-server"));
assert.equal(droidMcpAbs.mcpServers.synapse.command, mcpAbsBin("synapse-bridge"));
assert.doesNotMatch(droidMcpAbs.mcpServers.grimoire.command, /^~/, "install MCP command must not contain a literal ~");
rmSync(mcpAbsDest, { recursive: true, force: true });

const existingCursorMcpDest = ownTmp("cursor-existing-mcp");
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

const ownedCursorMcpDest = ownTmp("cursor-owned-mcp");
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
  const dest = mkdtempSync(ownTmp("antigravity-route-handoff-"));
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

// Antigravity runs its own imported copy of the plugin, not the staged files, so an install that
// changes them names the import command, and one that changes nothing stays quiet.
{
  const dest = mkdtempSync(ownTmp("antigravity-import-note-"));
  try {
    const plugin = path.join(dest, "antigravity-cli", "plugins", "agent-surface");
    const install = () => run(["install", "--target", "antigravity-cli", "--scope", "user", "--dest", dest]);
    const first = install();
    assert.ok(existsSync(path.join(plugin, "plugin.json")), "the note names the staged plugin");
    assert.ok(
      first.split("\n").some((line) => line.startsWith("NOTE: ") && line.endsWith(`agy plugin install "${plugin}"`)),
      `an install that writes the plugin prints its import step:\n${first.slice(-600)}`,
    );
    assert.doesNotMatch(install(), /agy plugin install/, "an install that changes nothing prints no import step");
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
  const obsoleteClineMcpDest = ownTmp(`cline-obsolete-mcp-route-${scope}`);
  rmSync(obsoleteClineMcpDest, { recursive: true, force: true });
  mkdirSync(path.join(obsoleteClineMcpDest, ".cline"), { recursive: true });
  mkdirSync(path.join(obsoleteClineMcpDest, ".agent-surface"), { recursive: true });
  installClineExtension(obsoleteClineMcpDest);
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

// A per-editor Cline MCP file is read only by that editor's Cline, so its route is live only where the
// editor's extensions folder holds Cline; extension storage is not a signal. A skipped route is listed
// with its reason, and a full install prunes what agent-surface merged into a route whose editor has no
// Cline, as the stray Windsurf file on the operator's profile needed.
// SUBSTITUTE_JUSTIFICATION
// - substitute: empty Cline extension folders, Cline storage without an extension, and a stray
//   per-editor settings file with the historical manifest entry that claimed it
// - replaces: editors with and without Cline, and the pre-guard install that created the stray file
// - necessity: installing editors and Cline in a test would launch editor clients and download the
//   extension
// - real-option: the real CLI plans and applies against disposable roots
// - proof-limit: proves which routes the planner makes live, skips or prunes, not that an editor loads
//   the file
// - real-proof: a read-only `install --target cline --scope user --dry-run` against the operator's
//   profile kept the VS Code and Cursor routes and pruned only the stray Windsurf one
{
  const perEditor = (product) => path.join(clineIdeUserDataRoot(product), "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json");
  const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const added = (product) => new RegExp(`${escaped(perEditor(product))} MCP \\+= grimoire, synapse`);
  const guardRoot = mkdtempSync(path.join(os.tmpdir(), "agent-surface-cline-editors-"));
  const plan = (dest, extra = ["--category", "mcps"]) => run(["install", "--target", "cline", "--scope", "user", "--dest", dest, ...extra, "--dry-run"]);
  try {
    const fresh = plan(path.join(guardRoot, "fresh"));
    assert.match(fresh, /\.cline\/data\/settings\/cline_mcp_settings\.json MCP \+= grimoire, synapse/);
    assert.doesNotMatch(fresh, /User\/globalStorage\/saoudrizwan\.claude-dev\/settings\/cline_mcp_settings\.json MCP/, "no editor has Cline, so no per-editor route");
    assert.match(fresh, new RegExp(`^ {2}${escaped(perEditor("Code"))}: no saoudrizwan\\.claude-dev extension folder under \\.vscode[\\\\/]extensions$`, "m"));

    // Devin Desktop, the renamed Windsurf, has its own extensions folder and route.
    const present = path.join(guardRoot, "present");
    installClineExtension(present, ["Code", "Devin"]);
    const cursorStorage = path.join(present, perEditor("Cursor"));
    mkdirSync(path.dirname(cursorStorage), { recursive: true });
    writeFileSync(cursorStorage, `${JSON.stringify({ mcpServers: {} })}\n`);
    const presentPlan = plan(present);
    assert.match(presentPlan, added("Code"));
    assert.match(presentPlan, added("Devin"));
    assert.doesNotMatch(presentPlan, added("Windsurf"), "the legacy Windsurf route stays separate");
    assert.doesNotMatch(presentPlan, added("Cursor"), "extension storage outlives an uninstall, so it is not a signal");

    const strayDest = path.join(guardRoot, "stray");
    const stray = path.join(strayDest, perEditor("Windsurf"));
    mkdirSync(path.dirname(stray), { recursive: true });
    mkdirSync(path.join(strayDest, ".agent-surface"), { recursive: true });
    writeFileSync(stray, `${JSON.stringify({ mcpServers: { existing: { command: "keep" }, grimoire: { command: "old" }, synapse: { command: "old" } } }, null, 2)}\n`);
    writeFileSync(path.join(strayDest, ".agent-surface", "cline-manifest.json"), `${JSON.stringify({
      target: "cline",
      scope: "user",
      managed: [],
      config_entries: [{ path: perEditor("Windsurf"), format: "mcpServers", ids: ["grimoire", "synapse"] }],
    }, null, 2)}\n`);
    assert.match(plan(strayDest, []), new RegExp(`${escaped(perEditor("Windsurf"))} MCP -= grimoire, synapse`));
    run(["install", "--target", "cline", "--scope", "user", "--dest", strayDest]);
    assert.deepEqual(JSON.parse(readFileSync(stray, "utf8")).mcpServers, { existing: { command: "keep" } }, "only the owned servers leave the stray file");
    assert.equal(existsSync(path.join(strayDest, clineIdeUserDataRoot("Devin"))), false, "without Cline in Devin, an install creates no Devin user data");
    const strayManifest = JSON.parse(readFileSync(path.join(strayDest, ".agent-surface", "cline-manifest.json"), "utf8"));
    assert.ok(!strayManifest.config_entries.some((entry) => entry.path === perEditor("Windsurf")), "the pruned route is no longer claimed");
  } finally {
    rmSync(guardRoot, { recursive: true, force: true });
  }
}

const existingOpenHandsMcpDest = ownTmp("openhands-existing-mcp");
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
assert.deepEqual(mergedOpenHandsMcp.mcpServers.synapse.env, { SYNAPSE_ROOTS: "ignore" });
assert.equal(Object.hasOwn(mergedOpenHandsMcp.mcpServers.existing, "env"), false);
assert.equal(Object.hasOwn(mergedOpenHandsMcp.mcpServers, "agentmemory"), false);
rmSync(existingOpenHandsMcpDest, { recursive: true, force: true });

{
  // Deep Agents Code starts trusted project servers in the session directory and user-level ones in
  // its server's work directory, so only the project config opts Synapse out of roots routing.
  const projectDest = mkdtempSync(ownTmp("deepagents-project-mcp-"));
  const userDest = mkdtempSync(ownTmp("deepagents-user-mcp-"));
  try {
    run(["install", "--target", "deepagents", "--scope", "project", "--dest", projectDest]);
    run(["install", "--target", "deepagents", "--scope", "user", "--dest", userDest]);
    const project = JSON.parse(readFileSync(path.join(projectDest, ".deepagents", ".mcp.json"), "utf8")).mcpServers;
    const user = JSON.parse(readFileSync(path.join(userDest, ".deepagents", ".mcp.json"), "utf8")).mcpServers;
    assert.deepEqual(project.synapse.env, { SYNAPSE_ROOTS: "ignore" });
    assert.equal(Object.hasOwn(project.grimoire, "env"), false);
    assert.equal(Object.hasOwn(user.synapse, "env"), false, "a user install keeps Synapse's fail-closed roots routing");
    // A project install rooted at the home directory lands on the user-level file.
    const { serverEnv } = targets.deepagents.mcpConfig;
    assert.equal(serverEnv({ scope: "project", installRoot: os.homedir() }), null, "a home-rooted project install keeps the fail-closed default");
    assert.deepEqual(serverEnv({ scope: "project", installRoot: projectDest }), { synapse: { SYNAPSE_ROOTS: "ignore" } });
    const homeLink = path.join(projectDest, "home-link");
    symlinkSync(os.homedir(), homeLink);
    assert.equal(serverEnv({ scope: "project", installRoot: homeLink }), null, "a symlink to the home directory is still home");
  } finally {
    rmSync(projectDest, { recursive: true, force: true });
    rmSync(userDest, { recursive: true, force: true });
  }
}

const existingCodexMcpDest = ownTmp("codex-existing-mcp");
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
// Under approval_policy "never" Codex refuses an MCP tool call that needs approval; Synapse's writes run.
assert.equal(parsedCodexMcp.mcp_servers.synapse.default_tools_approval_mode, "approve");
assert.equal(Object.hasOwn(parsedCodexMcp.mcp_servers.existing, "default_tools_approval_mode"), false);
assert.equal(Object.hasOwn(parsedCodexMcp.mcp_servers, "agentmemory"), false);
// Codex gives an MCP server only an allowlisted environment but a hook the shell's, so the entry passes
// the routing variables through, and names the user listed there stay.
assert.deepEqual(parsedCodexMcp.mcp_servers.synapse.env_vars, ["SYNAPSE_DB_DIR", "SYNAPSE_PROJECT", "SYNAPSE_NAMESPACE"]);
assert.equal(Object.hasOwn(parsedCodexMcp.mcp_servers.existing, "env_vars"), false);
const existingCodexConfig = path.join(existingCodexMcpDest, ".codex", "config.toml");
parsedCodexMcp.mcp_servers.synapse.env_vars = ["SYNAPSE_AGENT_ID", "SYNAPSE_NAMESPACE"];
writeFileSync(existingCodexConfig, TOML.patch(mergedCodexMcp, parsedCodexMcp));
run(["install", "--target", "codex", "--dest", existingCodexMcpDest, "--category", "mcps", "--service", "synapse"]);
const userListedCodexMcp = readFileSync(existingCodexConfig, "utf8");
assert.deepEqual(TOML.parse(userListedCodexMcp).mcp_servers.synapse.env_vars, ["SYNAPSE_AGENT_ID", "SYNAPSE_NAMESPACE", "SYNAPSE_DB_DIR", "SYNAPSE_PROJECT"]);
run(["install", "--target", "codex", "--dest", existingCodexMcpDest, "--category", "mcps", "--service", "synapse"]);
assert.equal(readFileSync(existingCodexConfig, "utf8"), userListedCodexMcp, "a rerun changes nothing");
rmSync(existingCodexMcpDest, { recursive: true, force: true });

// The Synapse PostToolUse hook follows the synapse server on the three hosts whose hooks can add
// context (synapse-hook.mjs): merged beside the user's own hooks, unchanged by a rerun, and removed
// alone when the server is pruned.
{
  const hookCommand = synapseHookCommand();
  const hook = { launcher: synapseHookLauncher(), command: hookCommand };
  const synapseEntry = { matcher: "*", hooks: [{ type: "command", command: hookCommand }] };
  const userPostToolUse = { matcher: "Edit", hooks: [{ type: "command", command: "format-on-edit" }] };
  const userPreToolUse = { matcher: "*", hooks: [{ type: "command", command: "guard" }] };
  const userSettings = [
    "{",
    "  // keep this comment",
    '  "permissions": { "allow": ["Bash(ls)"] },',
    '  "hooks": {',
    '    "PostToolUse": [',
    "      // the user's formatter",
    '      { "matcher": "Edit", "hooks": [{ "type": "command", "command": "format-on-edit" }] }',
    "    ],",
    '    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "guard" }] }]',
    "  }",
    "}",
    "",
  ].join("\n");
  const installSynapse = (target, dest, extra = []) =>
    run(["install", "--target", target, "--dest", dest, "--category", "mcps", "--service", "synapse", ...extra]);

  const claudeDest = ownTmp("synapse-hook-claude");
  rmSync(claudeDest, { recursive: true, force: true });
  mkdirSync(path.join(claudeDest, ".claude"), { recursive: true });
  const claudeSettingsPath = path.join(claudeDest, ".claude", "settings.json");
  writeFileSync(claudeSettingsPath, userSettings);
  assert.match(installSynapse("claude-code", claudeDest, ["--dry-run"]), /\.claude\/settings\.json PostToolUse \+= synapse-hook/, "dry-run lists the hook change");
  assert.equal(readFileSync(claudeSettingsPath, "utf8"), userSettings, "dry-run writes nothing");
  installSynapse("claude-code", claudeDest);
  const claudeText = readFileSync(claudeSettingsPath, "utf8");
  assert.match(claudeText, /\/\/ keep this comment/);
  assert.match(claudeText, /\/\/ the user's formatter/);
  const claudeSettings = parseJsonc(claudeText, "claude settings");
  assert.deepEqual(claudeSettings.permissions, { allow: ["Bash(ls)"] });
  assert.deepEqual(claudeSettings.hooks, { PostToolUse: [userPostToolUse, synapseEntry], PreToolUse: [userPreToolUse] });
  installSynapse("claude-code", claudeDest);
  assert.equal(readFileSync(claudeSettingsPath, "utf8"), claudeText, "a rerun changes nothing");

  // Pruning the server removes only its hook entry; a file the entry alone needed loses its hooks key.
  const prune = [{ entries: [], removeMcpServers: ["synapse"] }];
  const pruned = await planSynapseHook({ target: "claude-code", installRoot: claudeDest, configMerges: prune });
  assert.equal(pruned.change, "remove");
  assert.match(pruned.content, /\/\/ the user's formatter/);
  assert.deepEqual(parseJsonc(pruned.content, "pruned").hooks, { PostToolUse: [userPostToolUse], PreToolUse: [userPreToolUse] });
  writeFileSync(claudeSettingsPath, '{\n  "model": "keep"\n}\n');
  installSynapse("claude-code", claudeDest);
  const alone = await planSynapseHook({ target: "claude-code", installRoot: claudeDest, configMerges: prune });
  assert.deepEqual(parseJsonc(alone.content, "alone"), { model: "keep" });
  rmSync(claudeDest, { recursive: true, force: true });

  const codexDest = ownTmp("synapse-hook-codex");
  rmSync(codexDest, { recursive: true, force: true });
  assert.match(installSynapse("codex", codexDest), /NOTE: Codex runs the Synapse hook in \.codex\/hooks\.json only after you trust it/, "the install names the one-time trust step");
  assert.deepEqual(JSON.parse(readFileSync(path.join(codexDest, ".codex", "hooks.json"), "utf8")), { hooks: { PostToolUse: [synapseEntry] } });
  assert.doesNotMatch(installSynapse("codex", codexDest), /NOTE: Codex runs the Synapse hook/, "an unchanged entry asks for nothing new");
  rmSync(codexDest, { recursive: true, force: true });

  // Droid reads settings.json's hooks only while hooks.json is absent, so the entry joins them there.
  const droidDest = ownTmp("synapse-hook-droid");
  rmSync(droidDest, { recursive: true, force: true });
  mkdirSync(path.join(droidDest, ".factory"), { recursive: true });
  writeFileSync(path.join(droidDest, ".factory", "settings.json"), `${JSON.stringify({ model: "keep", hooks: { PreToolUse: [userPreToolUse] } }, null, 2)}\n`);
  installSynapse("droid", droidDest);
  assert.equal(existsSync(path.join(droidDest, ".factory", "hooks.json")), false, "a new hooks.json would hide the settings.json hooks");
  assert.deepEqual(JSON.parse(readFileSync(path.join(droidDest, ".factory", "settings.json"), "utf8")), {
    model: "keep",
    hooks: { PreToolUse: [userPreToolUse], PostToolUse: [synapseEntry] },
  });
  rmSync(droidDest, { recursive: true, force: true });
  const freshDroidDest = ownTmp("synapse-hook-droid-fresh");
  rmSync(freshDroidDest, { recursive: true, force: true });
  installSynapse("droid", freshDroidDest);
  assert.deepEqual(JSON.parse(readFileSync(path.join(freshDroidDest, ".factory", "hooks.json"), "utf8")), { PostToolUse: [synapseEntry] });
  rmSync(freshDroidDest, { recursive: true, force: true });

  // Removal from a hook file written on one line leaves valid JSON with the user's hooks intact; deleting
  // array items through jsonc-parser's own edit rewrote these into invalid JSON.
  const userGroup = { matcher: "Bash", hooks: [{ type: "command", command: "a" }] };
  const userHook = JSON.stringify(userGroup.hooks[0]);
  const ourHook = JSON.stringify(synapseEntry.hooks[0]);
  for (const oneLine of [
    `{"hooks":{"PostToolUse":[${JSON.stringify(userGroup)},${JSON.stringify(synapseEntry)}]}}`,
    `{"hooks":{"PostToolUse":[{"matcher":"Bash","hooks":[${userHook},${ourHook}]}]}}`,
    `{"hooks":{"PostToolUse":[{"matcher":"Bash","hooks":[${ourHook},${userHook},${ourHook}]}]}}`,
  ]) {
    const removed = mergeSynapseHook(oneLine, ["hooks", "PostToolUse"], hook, false, "settings.json");
    assert.deepEqual(parseJsonc(removed, "one-line removal"), { hooks: { PostToolUse: [userGroup] } }, oneLine);
  }

  // doctor reports a Droid settings.json it cannot parse instead of failing the whole report.
  const brokenDroidHome = ownTmp("synapse-hook-doctor");
  rmSync(brokenDroidHome, { recursive: true, force: true });
  mkdirSync(path.join(brokenDroidHome, ".factory"), { recursive: true });
  writeFileSync(path.join(brokenDroidHome, ".factory", "settings.json"), "{ not json");
  assert.match(await synapseHookStatus("droid", brokenDroidHome), /^unreadable: /);
  rmSync(brokenDroidHome, { recursive: true, force: true });

  // Hook keys of the wrong type stop the install instead of being overwritten.
  assert.throws(() => mergeSynapseHook('{"hooks": []}', ["hooks", "PostToolUse"], hook, true, "settings.json"), /hooks must be an object/);
  assert.throws(() => mergeSynapseHook('{"hooks": {"PostToolUse": {}}}', ["hooks", "PostToolUse"], hook, true, "settings.json"), /hooks\.PostToolUse must be an array/);

  // The command quotes what the shell would split and carries only the entry's routing variables.
  assert.equal(synapseHookCommand("/home/a"), "/home/a/.local/bin/synapse-hook");
  assert.equal(synapseHookCommand("/home/a b"), "'/home/a b/.local/bin/synapse-hook'");
  assert.equal(
    synapseHookCommand("/home/a", { SYNAPSE_NAMESPACE: "team", SYNAPSE_DB_DIR: "/data/it's here", SYNAPSE_AGENT_ID: "x" }),
    "SYNAPSE_DB_DIR='/data/it'\\''s here' SYNAPSE_NAMESPACE=team /home/a/.local/bin/synapse-hook",
  );
  // An entry whose routing changed takes the new command in place, keeping the user's matcher; a prune
  // removes it whatever routing it carries.
  const routed = { launcher: "/home/a/.local/bin/synapse-hook", command: "SYNAPSE_NAMESPACE=team /home/a/.local/bin/synapse-hook" };
  const stale = '{"hooks":{"PostToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"SYNAPSE_NAMESPACE=old /home/a/.local/bin/synapse-hook"}]}]}}';
  const updated = mergeSynapseHook(stale, ["hooks", "PostToolUse"], routed, true, "settings.json");
  assert.deepEqual(parseJsonc(updated, "updated").hooks.PostToolUse, [{ matcher: "Bash", hooks: [{ type: "command", command: routed.command }] }]);
  assert.equal(mergeSynapseHook(updated, ["hooks", "PostToolUse"], routed, true, "settings.json"), updated, "a rerun changes nothing");
  assert.deepEqual(parseJsonc(mergeSynapseHook(stale, ["hooks", "PostToolUse"], routed, false, "settings.json"), "pruned"), {});
  // Only a command this module could have written is Synapse's: a user's own wrapper around the
  // launcher is neither rewritten nor pruned, and a value the renderer had to quote still matches.
  const wrapped = '{"hooks":{"PostToolUse":[{"matcher":"*","hooks":[{"type":"command","command":"nice /home/a/.local/bin/synapse-hook"}]}]}}';
  assert.equal(mergeSynapseHook(wrapped, ["hooks", "PostToolUse"], routed, false, "settings.json"), wrapped);
  assert.equal(parseJsonc(mergeSynapseHook(wrapped, ["hooks", "PostToolUse"], routed, true, "settings.json"), "added").hooks.PostToolUse.length, 2);
  const quoted = { launcher: routed.launcher, command: synapseHookCommand("/home/a", { SYNAPSE_DB_DIR: "/data/it's here" }) };
  const quotedFile = mergeSynapseHook(null, ["hooks", "PostToolUse"], quoted, true, "settings.json");
  assert.deepEqual(parseJsonc(mergeSynapseHook(quotedFile, ["hooks", "PostToolUse"], routed, false, "settings.json"), "pruned"), {});
  // An entry that clears a routing variable carries the empty value, which a rerun and a prune still find.
  const cleared = { launcher: routed.launcher, command: synapseHookCommand("/home/a", { SYNAPSE_NAMESPACE: "" }) };
  assert.equal(cleared.command, "SYNAPSE_NAMESPACE='' /home/a/.local/bin/synapse-hook");
  const clearedFile = mergeSynapseHook(null, ["hooks", "PostToolUse"], cleared, true, "settings.json");
  assert.equal(mergeSynapseHook(clearedFile, ["hooks", "PostToolUse"], cleared, true, "settings.json"), clearedFile, "a rerun changes nothing");
  assert.deepEqual(parseJsonc(mergeSynapseHook(clearedFile, ["hooks", "PostToolUse"], routed, false, "settings.json"), "pruned"), {});
  // Codex keeps the entry's env in TOML; the plan reads it there too.
  const codexRoot = ownTmp("synapse-hook-codex-toml");
  rmSync(codexRoot, { recursive: true, force: true });
  mkdirSync(codexRoot, { recursive: true });
  const codexToml = '[mcp_servers.synapse]\ncommand = "x"\nargs = []\n\n[mcp_servers.synapse.env]\nSYNAPSE_DB_DIR = "/data/syn"\nSYNAPSE_AGENT_ID = "me"\n';
  const codexPlan = await planSynapseHook({ target: "codex", installRoot: codexRoot, home: "/home/a", configMerges: [{ entries: [["synapse", {}]], format: "codex-toml", relativeOutput: ".codex/config.toml", content: codexToml }] });
  assert.equal(JSON.parse(codexPlan.content).hooks.PostToolUse[0].hooks[0].command, "SYNAPSE_DB_DIR=/data/syn /home/a/.local/bin/synapse-hook");
  rmSync(codexRoot, { recursive: true, force: true });
}

// The installed hook command runs in the host's shell and routes like the user's synapse entry, so the
// hook reads the store the server writes, even where the entry overrides the host's environment: one
// entry pins a project, the other clears the namespace the host sets. Every path holds a space. The
// launchers, hook and store are the real ones from mcps/synapse; the suite runs after
// `npm run install:mcps` has built them.
{
  const synapseDist = path.join(root, "mcps", "synapse", "dist", "src");
  assert.ok(existsSync(path.join(synapseDist, "hook.js")), "build mcps/synapse first: npm run install:synapse");
  const { Store } = await import(pathToFileURL(path.join(synapseDist, "store.js")).href);
  const { SystemClock } = await import(pathToFileURL(path.join(synapseDist, "clock.js")).href);
  const { canonicalRoot, hashKey } = await import(pathToFileURL(path.join(synapseDist, "namespace.js")).href);
  const base = mkdtempSync(path.join(os.tmpdir(), "synapse hook "));
  const home = path.join(base, "user home");
  const dbDir = path.join(base, "pinned store");
  const pinned = path.join(base, "pinned project");
  mkdirSync(pinned, { recursive: true });
  writeShims({
    binDir: path.join(home, ".local", "bin"),
    nodeBin: process.execPath,
    override: "SYNAPSE_NODE",
    entries: { "synapse-bridge": path.join(synapseDist, "server.js"), "synapse-hook": path.join(synapseDist, "hook.js") },
  });
  const installEnv = { ...process.env, HOME: home, USERPROFILE: home };
  const store = new Store({ clock: new SystemClock(), dbDir, globalDbPath: path.join(dbDir, "global.sqlite") });
  const routes = [
    { name: "pinned", entryEnv: { SYNAPSE_DB_DIR: dbDir, SYNAPSE_PROJECT: pinned }, key: canonicalRoot(pinned) },
    { name: "cleared", entryEnv: { SYNAPSE_DB_DIR: dbDir, SYNAPSE_NAMESPACE: "" }, key: canonicalRoot(base) },
  ];
  try {
    for (const { name, entryEnv, key } of routes) {
      const dest = path.join(base, `${name} dest`);
      mkdirSync(dest, { recursive: true });
      const mcpConfig = path.join(dest, ".mcp.json");
      writeFileSync(mcpConfig, `${JSON.stringify({ mcpServers: { synapse: { type: "stdio", command: "synapse-bridge", args: [], env: entryEnv } } }, null, 2)}\n`);
      run(["install", "--target", "claude-code", "--dest", dest, "--category", "mcps", "--service", "synapse"], { env: installEnv });
      assert.deepEqual(parseJsonc(readFileSync(mcpConfig, "utf8"), ".mcp.json").mcpServers.synapse.env, entryEnv, "the install keeps the entry's routing");
      const settings = parseJsonc(readFileSync(path.join(dest, ".claude", "settings.json"), "utf8"), "settings.json");
      assert.equal(settings.hooks.PostToolUse.length, 1);
      const command = settings.hooks.PostToolUse[0].hooks[0].command;
      const projectDbPath = path.join(dbDir, `${hashKey(key)}.sqlite`);
      store.remember({ projectDbPath, agentId: "peer", content: "seed" });
      // The host runs the command through its shell, from wherever the session works, in an
      // environment that names another namespace.
      const hook = () => spawnSync("/bin/sh", ["-c", command], {
        cwd: base,
        encoding: "utf8",
        env: { PATH: process.env.PATH ?? "", HOME: home, SYNAPSE_NAMESPACE: "ambient-team" },
        input: JSON.stringify({ session_id: name, cwd: base, hook_event_name: "PostToolUse", tool_name: "Bash" }),
      });
      const baseline = hook();
      assert.deepEqual([baseline.status, baseline.stdout], [0, ""], `${command} -> ${baseline.stderr}`);
      store.remember({ projectDbPath, agentId: "peer", content: `${name} marker` });
      const delivered = hook();
      assert.equal(delivered.status, 0, delivered.stderr);
      assert.match(delivered.stdout, new RegExp(`${name} marker`), `${command} read the store the synapse entry routes to`);
    }
  } finally {
    store.close();
    rmSync(base, { recursive: true, force: true });
  }
}

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
  { target: "trae-cn", rel: ".trae/mcp.json", root: "mcpServers", pre: { mcpServers: { existing: { command: "local-existing", args: ["--keep"] } } } },
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
  const dest = mkdtempSync(ownTmp(`${fx.target}-merge-`));
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
  const dest = mkdtempSync(ownTmp(`${fx.target}-policy-`));
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
  const dest = mkdtempSync(ownTmp("opencode-policy-"));
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
  const dest = mkdtempSync(ownTmp("kiro-policy-"));
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
  const dest = mkdtempSync(ownTmp("grok-policy-"));
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
  const dest = mkdtempSync(ownTmp("trae-project-agents-"));
  try {
    run(["install", "--target", "trae", "--scope", "project", "--dest", dest]);
    assert.equal(existsSync(path.join(dest, ".trae", "agents", "boss.md")), false);
    const nativeRule = readFileSync(path.join(dest, ".trae", "rules", "00-precedence-and-safety.md"), "utf8");
    assert.match(nativeRule, /^alwaysApply: true$/m);
    assert.equal(existsSync(path.join(dest, ".trae", "user_rules.md")), false, "no Trae edition reads a project user_rules.md");
    run(["install", "--target", "trae", "--scope", "project", "--dest", dest, "--category", "development"]);
    assert.equal(existsSync(path.join(dest, ".trae", "agents", "boss.md")), true);
    assert.equal(existsSync(path.join(dest, ".trae", "skills", "workflow-runtime", "SKILL.md")), true);
    assert.equal(existsSync(path.join(dest, ".traecli")), false, "Trae CLI 1.0 routes are not written");
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

{
  const dest = mkdtempSync(ownTmp("trae-user-config-"));
  try {
    mkdirSync(path.join(dest, ".trae"), { recursive: true });
    const configPath = path.join(dest, ".trae", "traecli.toml");
    writeFileSync(configPath, '[profile.default] # keep\nmodel = "keep-me"\n');
    const args = ["install", "--target", "trae-cli", "--scope", "user", "--dest", dest];
    run(args);
    const config = readFileSync(configPath, "utf8");
    const parsed = TOML.parse(config);
    assert.equal(parsed.approval_policy, "never");
    assert.equal(parsed.default_permissions, ":danger-full-access");
    assert.equal(parsed.profile.default.model, "keep-me");
    assert.equal(parsed.mcp_servers.synapse.command, path.join(os.homedir(), ".local", "bin", "synapse-bridge"));
    assert.match(readFileSync(path.join(dest, ".trae", "rules", "00-precedence-and-safety.md"), "utf8"), /^alwaysApply: true$/m,
      "Trae CLI user rules go to the ~/.trae/rules folder it loads");
    assert.equal(existsSync(path.join(dest, ".trae", "user_rules.md")), false, "the CLI does not read the IDE's user_rules.md");
    run(args);
    assert.equal(readFileSync(configPath, "utf8"), config, "Trae user config re-merge is idempotent");
    run([...args, "--category", "development"]);
    assert.match(readFileSync(path.join(dest, ".trae", "rules", "10-python.md"), "utf8"), /^globs:/m, "scoped rules keep their globs");
    assert.equal(existsSync(path.join(dest, ".trae", "references", "rules", "10-python.md")), true, "scoped references are written");
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
  const dest = mkdtempSync(ownTmp("claude-copilot-project-"));
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
  // The parser quotes the failing line, so its message must not reach the output: that line can hold a credential.
  { target: "codex", rel: ".codex/config.toml", seed: "[mcp_servers.custom.env]\nTOKEN = not-a-real-credential\n", error: /invalid TOML: Error parsing TOML \(2, 9\)/, hidden: "not-a-real-credential" },
  { target: "goose", scope: "user", rel: ".config/goose/config.yaml", seed: "extensions:\n  synapse: [\n", error: /invalid YAML/ },
  { target: "kiro", scope: "user", rel: ".kiro/settings/permissions.yaml", seed: "rules: {}\n", error: /rules must be a sequence/ },
]) {
  const dest = mkdtempSync(ownTmp("invalid-config-"));
  try {
    const file = path.join(dest, fx.rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, fx.seed);
    const args = ["install", "--target", fx.target, "--dest", dest];
    if (fx.scope) args.push("--scope", fx.scope);
    const result = status(args);
    assert.notEqual(result.status, 0, fx.target);
    assert.match(result.stdout + result.stderr, fx.error, fx.target);
    if (fx.hidden) assert.ok(!(result.stdout + result.stderr).includes(fx.hidden), `${fx.target}: the error output repeats the config's text`);
    assert.equal(readFileSync(file, "utf8"), fx.seed, fx.target + ": invalid config stays untouched");
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

// Inserting into a compact JSONC root preserves comments rather than normalizing
// the whole object through JSON.stringify.
{
  const dest = mkdtempSync(ownTmp("qoder-compact-comment-"));
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
  const dest = mkdtempSync(ownTmp("goose-yaml-"));
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

// A managed server keeps the keys a user added to it, and env merges by variable, while the keys
// agent-surface renders are refreshed; comments keep their place, an owned server no longer rendered
// is deleted whole, and a repeat install changes no byte. OpenHands is the JSONC host whose Synapse
// README has users add env.SYNAPSE_PROJECT; Codex covers TOML and Goose YAML.
/*
SUBSTITUTE_JUSTIFICATION
- substitute: seeded host configs carrying user keys inside managed entries, and manifests recording those entries
- replaces: a profile where the user edited agent-surface's servers after an earlier install
- necessity: an install never writes user keys, so the edited state must be seeded; real profiles must not be rewritten
- real-option: the real CLI, planner, merge code and filesystem run unchanged against disposable roots
- proof-limit: proves what the installer keeps, not that a host honors the kept keys
- real-proof: BLOCKED: needs an operator profile with such edits, installed through a disposable copy
*/
{
  const synapseBin = path.join(os.homedir(), ".local", "bin", "synapse-bridge");
  const fixtures = [
    {
      target: "openhands", rel: path.join(".openhands", "mcp.json"), format: "mcpServers",
      seed: '{\n  // my servers\n  "mcpServers": {\n    // my own server\n    "existing": { "command": "local-existing", "args": ["--keep"] },\n    "synapse": {\n      "command": "old",\n      "disabled": false, // my toggle\n      "alwaysAllow": ["memory_recall"],\n      "env": { "SYNAPSE_PROJECT": "mine" }\n    },\n    "old-owned": { "command": "old" }\n  }\n}\n',
      check: (text) => {
        for (const comment of ["// my servers", "// my own server", "// my toggle"]) assert.ok(text.includes(comment), `openhands keeps ${comment}`);
        const servers = parseJsonc(text, "openhands").mcpServers;
        assert.deepEqual(servers.existing, { command: "local-existing", args: ["--keep"] });
        assert.equal(servers.synapse.command, synapseBin, "a rendered key is refreshed");
        assert.equal(servers.synapse.disabled, false);
        assert.deepEqual(servers.synapse.alwaysAllow, ["memory_recall"]);
        assert.deepEqual(servers.synapse.env, { SYNAPSE_PROJECT: "mine", SYNAPSE_ROOTS: "ignore" }, "env keeps the user's variable beside the rendered one");
        return servers;
      },
    },
    {
      target: "codex", rel: path.join(".codex", "config.toml"), format: "codex-toml",
      // toml-patch re-renders a table set that loses one table and gains another, comments included,
      // so only the keys are asserted here.
      seed: '[mcp_servers.synapse]\ncommand = "old"\nargs = []\nstartup_timeout_sec = 30\n\n[mcp_servers.synapse.env]\nSYNAPSE_PROJECT = "mine"\n\n[mcp_servers.old-owned]\ncommand = "old"\n',
      check: (text) => {
        const servers = TOML.parse(text).mcp_servers;
        assert.equal(servers.synapse.command, synapseBin);
        assert.equal(servers.synapse.startup_timeout_sec, 30);
        assert.deepEqual({ ...servers.synapse.env }, { SYNAPSE_PROJECT: "mine" });
        return servers;
      },
    },
    {
      target: "goose", rel: path.join(".config", "goose", "config.yaml"), format: "goose-extensions",
      seed: "extensions:\n  synapse:\n    name: synapse\n    type: stdio\n    cmd: old\n    args: []\n    enabled: true\n    timeout: 300\n    description: keep me # my key\n    envs:\n      SYNAPSE_PROJECT: mine\n  old-owned:\n    name: old-owned\n",
      check: (text) => {
        assert.ok(text.includes("# my key"));
        const servers = parseYaml(text).extensions;
        assert.equal(servers.synapse.cmd, synapseBin);
        assert.equal(servers.synapse.description, "keep me");
        assert.deepEqual(servers.synapse.envs, { SYNAPSE_PROJECT: "mine" });
        return servers;
      },
    },
  ];
  for (const fx of fixtures) {
    const dest = mkdtempSync(ownTmp(`${fx.target}-owned-keys-`));
    try {
      mkdirSync(path.dirname(path.join(dest, fx.rel)), { recursive: true });
      mkdirSync(path.join(dest, ".agent-surface"), { recursive: true });
      writeFileSync(path.join(dest, fx.rel), fx.seed);
      writeFileSync(path.join(dest, ".agent-surface", `${fx.target}-manifest.json`), `${JSON.stringify({
        target: fx.target, scope: "user", managed: [], config_entries: [{ path: fx.rel, format: fx.format, ids: ["old-owned", "synapse"] }],
      }, null, 2)}\n`);
      const args = ["install", "--target", fx.target, "--scope", "user", "--dest", dest, "--category", "mcps"];
      run(args);
      const merged = readFileSync(path.join(dest, fx.rel), "utf8");
      const servers = fx.check(merged);
      assert.equal(Object.hasOwn(servers, "old-owned"), false, `${fx.target}: an owned server no longer rendered is deleted`);
      assert.ok(servers.grimoire, `${fx.target}: grimoire is added`);
      run(args);
      assert.equal(readFileSync(path.join(dest, fx.rel), "utf8"), merged, `${fx.target}: a repeat install is byte-identical`);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  }
}

// A host config is replaced through a temporary file and keeps its mode, so a private one stays private.
if (process.platform !== "win32") {
  const dest = mkdtempSync(ownTmp("config-mode-"));
  try {
    const file = path.join(dest, ".mcp.json");
    writeFileSync(file, `${JSON.stringify({ mcpServers: { existing: { command: "local-existing" } } }, null, 2)}\n`, { mode: 0o600 });
    run(["install", "--target", "claude-code", "--dest", dest, "--category", "mcps"]);
    assert.equal(statSync(file).mode & 0o777, 0o600, "a 0600 config keeps its mode");
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, "utf8")).mcpServers).sort(), ["existing", "grimoire", "synapse"]);
    assert.deepEqual(readdirSync(dest).filter((name) => name.endsWith(".tmp")), [], "no temporary file is left beside it");
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

{
  const dest = mkdtempSync(ownTmp("codex-full-"));
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
assert.match(readFileSync(path.join(root, ".gitignore"), "utf8"), /^skills\/ops-server\/$/m);
assert.match(readFileSync(path.join(root, ".gitignore"), "utf8"), /^\.agent-surface\/$/m);
assert.equal(
  execFileSync("git", ["check-ignore", "commands/ops-server.md"], { cwd: root, encoding: "utf8" }).trim(),
  "commands/ops-server.md",
);
assert.equal(
  execFileSync("git", ["check-ignore", "skills/ops-server/SKILL.md"], { cwd: root, encoding: "utf8" }).trim(),
  "skills/ops-server/SKILL.md",
);
assert.equal(
  execFileSync("git", ["check-ignore", ".agent-surface/readiness/example/readiness.json"], { cwd: root, encoding: "utf8" }).trim(),
  ".agent-surface/readiness/example/readiness.json",
);
assert.doesNotMatch(readFileSync(path.join(root, ".npmignore"), "utf8"), /^external\/\*$/m);
assert.match(readFileSync(path.join(root, ".npmignore"), "utf8"), /^commands\/ops-server\.md$/m);
assert.match(readFileSync(path.join(root, ".npmignore"), "utf8"), /^skills\/ops-server\/$/m);
const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--loglevel=silent"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: MAX_CAPTURE_BYTES,
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
// A category install fails when a registered skill pack or its license is absent, so every one ships.
for (const [id, service] of Object.entries(JSON.parse(readFileSync(path.join(root, "registry", "optional-services.json"), "utf8")).services)) {
  if (!["skill-pack", "behavior-pack"].includes(service.kind)) continue;
  for (const skillRoot of service.skill_roots) {
    const shipped = skillRoot.endsWith("/*")
      ? [...packedPaths].some((file) => file.startsWith(skillRoot.slice(0, -1)) && file.endsWith("/SKILL.md"))
      : packedPaths.has(`${skillRoot}/SKILL.md`);
    assert.equal(shipped, true, `npm package missing ${id} skill root ${skillRoot}`);
  }
  for (const file of [service.license_file, ...(service.notice_files ?? [])].filter(Boolean)) {
    assert.equal(packedPaths.has(file), true, `npm package missing ${id} license or notice ${file}`);
  }
}
assert.equal(
  [...packedPaths].some((file) => file.includes("/code-review-expert/")),
  false,
  "npm package includes rejected code-review-expert skill",
);
assert.equal(packedPaths.has("external/archify/docs/index.html"), false, "npm package includes Archify site output");
assert.equal(packedPaths.has("commands/ops-server.md"), false, "npm package leaked private ops-server command");
assert.equal([...packedPaths].some((file) => file.startsWith("skills/ops-server/")), false, "npm package leaked private ops-server skill");
assert.equal([...packedPaths].some((file) => file.startsWith(".agent-surface/")), false, "npm package leaked local agent state");

// A default install explicitly excludes private assets, even when the public
// package cannot carry their source. Re-enable them with `--category private`.
{
  const dest = mkdtempSync(path.join(os.tmpdir(), "agent-surface-private-overlay-dest-"));
  const packageDir = mkdtempSync(path.join(os.tmpdir(), "agent-surface-public-package-"));
  try {
    // SUBSTITUTE_JUSTIFICATION
    // - substitute: representative private skill and policy bytes in this temporary install root
    // - replaces: the ignored private ops-server source, which is intentionally unavailable in public CI
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
      { cwd: root, encoding: "utf8", maxBuffer: MAX_CAPTURE_BYTES },
    ));
    const packagedRoot = path.join(packageDir, "source");
    mkdirSync(packagedRoot);
    execFileSync(
      "tar",
      ["-xzf", path.join(packageDir, packageInfo[0].filename), "-C", packagedRoot, "--strip-components=1"],
    );
    symlinkSync(path.join(root, "node_modules"), path.join(packagedRoot, "node_modules"), "dir");
    assert.equal(existsSync(path.join(packagedRoot, "commands", "ops-server.md")), false);
    assert.equal(existsSync(path.join(packagedRoot, "skills", "ops-server")), false);
    const packagedSkills = JSON.parse(execFileSync(
      process.execPath,
      [path.join(packagedRoot, "scripts", "agent-surface.mjs"), "skills", "--json"],
      { cwd: packagedRoot, encoding: "utf8" },
    ));
    assert.equal(packagedSkills.skills.some((skill) => skill.name === "ops-server"), false);

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
  const allTargetsInstall = run(["install", "--target", "all", "--scope", "user", "--dest", allTargetsDest]);
  const manifestRoot = path.join(allTargetsDest, ".agent-surface");
  // `--target all` covers every INSTALLABLE target. An export format has no install destination of
  // its own — its package is handed to the host's own plugin manager — so it is skipped rather than
  // written somewhere invented. Asserted explicitly so the skip stays deliberate. A deprecated
  // target stays out of `all` too, and the plan says so.
  const deprecated = Object.entries(JSON.parse(readFileSync(path.join(root, "registry", "targets.json"), "utf8")).in_scope)
    .filter(([, entry]) => entry.status === "deprecated")
    .map(([target]) => target);
  assert.ok(deprecated.length > 0, "the registry still holds a deprecated target to exercise");
  const runtimeAllPlan = run(["install", "--runtime", "all", "--scope", "user", "--dest", allTargetsDest, "--dry-run"]);
  for (const target of deprecated) {
    assert.match(allTargetsInstall, new RegExp(`^${target}: excluded from --target all \\(deprecated\\)`, "m"));
    assert.match(runtimeAllPlan, new RegExp(`^${target}: excluded from --target all \\(deprecated\\)`, "m"), "the --runtime alias selects the same set");
  }
  for (const [target, adapter] of Object.entries(targets)) {
    if (adapter.buildOnly || deprecated.includes(target)) {
      assert.ok(!existsSync(path.join(manifestRoot, `${target}-manifest.json`)), `${target}: not installed by --target all`);
      continue;
    }
    const manifest = JSON.parse(
      readFileSync(path.join(manifestRoot, `${target}-manifest.json`), "utf8"),
    );
    const sources = manifest.managed.map((item) => item.source);
    assert.equal(
      sources.some((source) => source === "commands/ops-server.md" || source.startsWith("skills/ops-server/")),
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

disposableHome.restore();
console.log("install: ok");
