// The `doctor` command: environment + host-integration health report (node, git,
// per-agent CLIs, first-party MCP launchers, Grimoire index presence, Synapse hook registration, and
// stored target notices).
// Read-only probes.
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { files } from "./fs-tree.mjs";
import { readJsonIfExists, readJsoncIfExists } from "./io.mjs";
import { allStoredNotices, localDate, noticeHeading } from "./notices.mjs";
import { commandVersion } from "./proc.mjs";
import { root } from "./registry.mjs";
import { SYNAPSE_HOOK_TARGETS, synapseHookStatus } from "./synapse-hook.mjs";
import { kiloRuleInstructionRoot } from "./targets.mjs";
import { exists } from "./util.mjs";

export async function doctor() {
  const checks = [];
  checks.push(["node", process.version]);
  checks.push(["source", root]);
  checks.push(["cwd", process.cwd()]);
  checks.push(["commands", String((await files("commands", [".md"])).length)]);
  checks.push(["rules", String((await files("rules", [".md", ".mdc"])).length)]);
  checks.push(["git", commandVersion("git", ["--version"])]);
  checks.push(["cline-dir", (await exists(path.join(os.homedir(), ".cline"))) ? "present" : "missing"]);
  checks.push([
    "antigravity-workflows",
    (await exists(path.join(os.homedir(), ".gemini", "antigravity", "global_workflows"))) ? "present" : "missing",
  ]);
  checks.push(["claude", commandVersion("claude", ["--version"])]);
  checks.push(["codex", commandVersion("codex", ["--version"])]);
  checks.push(["kilo", commandVersion("kilo", ["--version"])]);
  checks.push(["kilo-config", await kiloConfigStatus()]);
  checks.push(["opencode", commandVersion("opencode", ["--version"])]);
  checks.push(["gh", commandVersion("gh", ["--version"])]);

  // First-party MCP health: launchers linked, the Grimoire index present, the Synapse hook registered per host.
  const bin = path.join(os.homedir(), ".local", "bin");
  checks.push(["grimoire-server", (await exists(path.join(bin, "grimoire-server"))) ? "linked" : "missing (npm run install:grimoire)"]);
  checks.push(["grimoire-index", await grimoireIndexStatus()]);
  checks.push(["synapse-bridge", (await exists(path.join(bin, "synapse-bridge"))) ? "linked" : "missing (npm run install:synapse)"]);
  checks.push(["synapse-hook", (await exists(path.join(bin, "synapse-hook"))) ? "linked" : "missing (npm run install:synapse)"]);
  for (const target of SYNAPSE_HOOK_TARGETS) checks.push([`synapse-hook ${target}`, await synapseHookStatus(target)]);

  const today = localDate();
  for (const { target, notice } of await allStoredNotices()) {
    checks.push([`notice ${target}`, `${noticeHeading(notice, today)}; source ${notice.source_url}`]);
  }

  for (const [name, result] of checks) {
    console.log(`${name}: ${result}`);
  }
}

async function grimoireIndexStatus() {
  const indexPath = path.join(os.homedir(), ".grimoire", "index.sqlite");
  return (await exists(indexPath)) ? "present" : "missing (npm run install:grimoire)";
}

async function kiloConfigStatus() {
  const configDir = path.join(os.homedir(), ".config", "kilo");
  if (!(await exists(configDir))) return "missing";

  const metadata = await readJsonIfExists(path.join(configDir, "package.json"));
  const pluginVersion = metadata?.dependencies?.["@kilocode/plugin"] ?? metadata?.devDependencies?.["@kilocode/plugin"];
  const config = await readJsoncIfExists(path.join(configDir, "kilo.jsonc"));
  const instructions = Array.isArray(config?.instructions) ? config.instructions : [];
  const markers = [];
  if (pluginVersion) markers.push(`plugin ${pluginVersion}`);
  if (await exists(path.join(configDir, "AGENTS.md"))) markers.push("AGENTS.md");
  if (await exists(path.join(configDir, "commands"))) markers.push("commands");
  if (instructions.includes(`${kiloRuleInstructionRoot("user")}/00-precedence-and-safety.md`)) markers.push("rules configured");
  // Earlier installs wrote this form, which Kilo resolves against the project directory.
  else if (instructions.includes("./rules/00-precedence-and-safety.md")) markers.push("rule entries never load; rerun a general user install");
  return markers.length > 0 ? `present (${markers.join(", ")})` : "present";
}
