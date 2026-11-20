// The `doctor` command: environment + host-integration health report (node, git,
// per-agent CLIs, first-party MCP launchers, Grimoire index presence, Synapse hook registration, and
// stored target notices).
// Read-only probes.
import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { files } from "./fs-tree.mjs";
import { readJsonIfExists, readJsoncIfExists } from "./io.mjs";
import { allStoredNotices, localDate, noticeHeading } from "./notices.mjs";
import { commandVersion } from "./proc.mjs";
import { root } from "./registry.mjs";
import { SYNAPSE_HOOK_TARGETS, synapseHookStatus } from "./synapse-hook.mjs";
import { antigravityCliImportedPlugin, antigravityCliStagedPlugin } from "./roots.mjs";
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
  const antigravityImport = await antigravityImportStatus();
  if (antigravityImport !== null) checks.push(["antigravity-cli-import", antigravityImport]);
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

// Antigravity runs the copy `agy plugin install` imported, and install updates only the staged one,
// so a stale import stayed invisible here (missed on 2026-11-07 and 2026-11-18). Silent unless both
// copies exist; never runs agy.
const IMPORT_DIFF_EXAMPLES = 5;

async function antigravityImportStatus() {
  const staged = path.join(os.homedir(), ".gemini", antigravityCliStagedPlugin);
  const imported = path.join(os.homedir(), antigravityCliImportedPlugin);
  if (!(await exists(staged)) || !(await exists(imported))) return null;

  try {
    const [stagedFiles, importedFiles] = [await pluginFiles(staged), await pluginFiles(imported)];
    const changed = [];
    const onlyImported = [];
    const onlyStaged = [];
    for (const [rel, file] of importedFiles) {
      if (!stagedFiles.has(rel)) onlyImported.push(rel);
      else if (stagedFiles.get(rel).size !== file.size || stagedFiles.get(rel).executable !== file.executable || !(await sameBytes(path.join(staged, rel), path.join(imported, rel)))) changed.push(rel);
    }
    for (const rel of stagedFiles.keys()) if (!importedFiles.has(rel)) onlyStaged.push(rel);
    if (changed.length + onlyImported.length + onlyStaged.length === 0) return "matches";
    const examples = [...changed, ...onlyImported, ...onlyStaged].slice(0, IMPORT_DIFF_EXAMPLES).join(", ");
    return `differs (${changed.length} changed, ${onlyImported.length} only imported, ${onlyStaged.length} only staged; e.g. ${examples}); run agy plugin install "${staged}"`;
  } catch (error) {
    return `cannot compare (${error.message})`;
  }
}

// Relative path -> size and executable state of every file; empty folders and Finder's .DS_Store are not plugin content.
async function pluginFiles(base, relative = "", out = new Map()) {
  for (const entry of await readdir(path.join(base, relative), { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const rel = path.join(relative, entry.name);
    if (entry.isDirectory()) await pluginFiles(base, rel, out);
    else if (entry.isFile()) {
      const info = await stat(path.join(base, rel));
      // Antigravity cannot run a helper that lost an execute bit (owner-only loss gives EACCES), so the exact bits are compared.
      out.set(rel, { size: info.size, executable: process.platform === "win32" ? 0 : info.mode & 0o111 });
    }
  }
  return out;
}

async function sameBytes(left, right) {
  return (await readFile(left)).equals(await readFile(right));
}
