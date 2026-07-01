// The `doctor` command: environment + host-integration health report (node, git,
// per-agent CLIs, and first-party MCP binaries/index freshness). Read-only probes.
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { files } from "./fs-tree.mjs";
import { readJsonIfExists, readJsoncIfExists } from "./io.mjs";
import { commandVersion } from "./proc.mjs";
import { readOptionalServices, root } from "./registry.mjs";
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

  // First-party MCP health (binaries linked, index/sidecar present, grimoire index fresh vs pin).
  const bin = path.join(os.homedir(), ".local", "bin");
  checks.push(["grimoire-server", (await exists(path.join(bin, "grimoire-server"))) ? "linked" : "missing (npm run install:grimoire)"]);
  checks.push(["grimoire-index", await grimoireIndexStatus()]);
  checks.push(["synapse-bridge", (await exists(path.join(bin, "synapse-bridge"))) ? "linked" : "missing (npm run install:synapse)"]);
  checks.push(["synapse-sidecar", (await exists(path.join(os.homedir(), ".synapse", "sidecar.json"))) ? "present" : "missing (autostarts on first use)"]);

  for (const [name, result] of checks) {
    console.log(`${name}: ${result}`);
  }
}

// grimoire index freshness: the runtime compares against the installed manifest (it can't see
// the repo), so doctor closes the loop by comparing the installed manifest's pinned commit
// against the repo registry pin and flagging drift before runtime use.
async function grimoireIndexStatus() {
  const dir = path.join(os.homedir(), ".grimoire");
  if (!(await exists(path.join(dir, "index.sqlite"))) || !(await exists(path.join(dir, "manifest.json")))) {
    return "missing (npm run install:grimoire)";
  }
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")); }
  catch { return "stale: unreadable manifest (npm run install:grimoire)"; }
  const registry = await readOptionalServices();
  for (const pack of manifest.packs ?? []) {
    const pin = registry.services?.[pack.serviceId]?.commit;
    if (pin && pack.commit !== pin) {
      return `stale: ${pack.serviceId} installed ${String(pack.commit).slice(0, 8)} but repo pins ${String(pin).slice(0, 8)} (npm run install:grimoire)`;
    }
  }
  return `ok (${String(manifest.packs?.[0]?.commit ?? "").slice(0, 8) || "no packs"})`;
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
  if (instructions.includes("./rules/00-precedence-and-safety.md")) markers.push("rules configured");
  return markers.length > 0 ? `present (${markers.join(", ")})` : "present";
}
