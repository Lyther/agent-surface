// Per-target install roots + output path/naming helpers. Pure: (scope|context) -> path string.
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fail } from "./util.mjs";

export function installRootGoose(scope) {
  // user → ~ (so MCP reaches ~/.config/goose/config.yaml); project → cwd (recipes in ./recipes).
  return scope === "user" ? os.homedir() : process.cwd();
}

export function installRootHomeOnly(scope) {
  if (scope !== "user") fail("this target supports --scope user only unless --dest is supplied");
  return os.homedir();
}

export function installRootClaude(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

export function installRootCodex(scope) {
  if (scope !== "user") fail("codex install supports --scope user only unless --dest is supplied");
  return os.homedir();
}

export function installRootDeepagents(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

export function installRootGrokBuild(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

export function installRootPi(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

export function installRootPool(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

export function installRootOpencode(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

export function installRootCline(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

export function installRootKilo(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

export function installRootDroid(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

export function installRootAntigravity(scope) {
  if (scope !== "user") fail("antigravity install supports --scope user only unless --dest is supplied");
  return path.join(os.homedir(), ".gemini", "antigravity");
}

export function installRootAntigravityCli(scope) {
  if (scope !== "user") fail("antigravity-cli install supports --scope user only unless --dest is supplied");
  return path.join(os.homedir(), ".gemini");
}

export function installRootVsCode(scope) {
  if (scope !== "user") fail("vscode install supports --scope user only unless --dest is supplied");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Code", "User");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Code", "User");
  return path.join(os.homedir(), ".config", "Code", "User");
}

export function installRootVscodium(scope) {
  if (scope !== "user") fail("vscodium install supports --scope user only unless --dest is supplied");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "VSCodium", "User");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "VSCodium", "User");
  return path.join(os.homedir(), ".config", "VSCodium", "User");
}

export function installRootWindsurf(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

export function installRootZed(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

export function antigravityCliSkillOutputName(source) {
  return `${source.name}.md`;
}

export function droidInstructionPath(context) {
  return context.scope === "user" ? path.join(".factory", "AGENTS.md") : "AGENTS.md";
}

export function droidConfigRoot(_context) {
  return ".factory";
}

export function groupedMarkdownCommandOutputName(source) {
  const [category, ...rest] = source.name.split("-");
  return path.join(category, `${rest.join("-") || category}.md`);
}

export function flatMarkdownCommandOutputName(source) {
  return `${source.name}.md`;
}

export function gooseRecipeOutputName(source) {
  return `${source.name}.yaml`;
}

export function codexSkillOutputName(source) {
  return path.join(source.name, "SKILL.md");
}

export function claudeMcpPath(context) {
  return context.scope === "user" ? ".claude.json" : ".mcp.json";
}

export function clineWorkflowRoot(context) {
  return context.scope === "user" ? path.join(".cline", "data", "workflows") : path.join(".clinerules", "workflows");
}

export function deepagentsSkillRoot(context) {
  return context.scope === "user"
    ? path.join(".deepagents", context.agentName ?? "agent", "skills")
    : path.join(".deepagents", "skills");
}

export function deepagentsInstructionPath(context) {
  return context.scope === "user"
    ? path.join(".deepagents", context.agentName ?? "agent", "AGENTS.md")
    : path.join(".deepagents", "AGENTS.md");
}

export function deepagentsAgentRoot(context) {
  return context.scope === "user"
    ? path.join(".deepagents", context.agentName ?? "agent", "agents")
    : path.join(".deepagents", "agents");
}

export function deepagentsConfigRoot(context) {
  return context.scope === "user" ? path.join(".deepagents", context.agentName ?? "agent") : ".deepagents";
}

export function deepagentsSubagentOutputName(source) {
  return path.join(source.metadata.name, "AGENTS.md");
}

export function deepagentsMcpPath() {
  return path.join(".deepagents", ".mcp.json");
}

export function grokBuildSkillRoot() {
  return path.join(".grok", "skills");
}

export function piSkillRoot(context) {
  return context.scope === "user" ? path.join(".pi", "agent", "skills") : path.join(".pi", "skills");
}

export function piInstructionPath(context) {
  return context.scope === "user" ? path.join(".pi", "agent", "AGENTS.md") : "AGENTS.md";
}

export function piConfigRoot(context) {
  return context.scope === "user" ? path.join(".pi", "agent") : ".pi";
}

export function poolSkillRoot(context) {
  return context.scope === "user" ? path.join(".config", "poolside", "skills") : path.join(".poolside", "skills");
}

export function poolInstructionPath(context) {
  return context.scope === "user" ? path.join(".config", "poolside", ".poolside") : "AGENTS.md";
}

export function poolConfigRoot(context) {
  return context.scope === "user" ? path.join(".config", "poolside") : ".poolside";
}

export function clineRuleRoot(context) {
  return context.scope === "user" ? path.join(".cline", "rules") : ".clinerules";
}

export function clineMcpPath(context) {
  return context.scope === "user" ? path.join(".cline", "mcp.json") : path.join(".cline", "mcp.json");
}

export function kiloWorkflowRoot(context) {
  return context.scope === "user" ? path.join(".config", "kilo", "commands") : path.join(".kilo", "commands");
}

export function kiloConfigPath(scope) {
  return scope === "user" ? path.join(".config", "kilo", "kilo.jsonc") : "kilo.jsonc";
}

export function kiloInstructionPath(context) {
  return context.scope === "user" ? path.join(".config", "kilo", "AGENTS.md") : "AGENTS.md";
}

export function kiloRuleRoot(context) {
  return context.scope === "user" ? path.join(".config", "kilo", "rules") : path.join(".kilo", "rules");
}

export function kiloRuleReferenceRoot(context) {
  return context.scope === "user"
    ? path.join(".config", "kilo", "references", "rules")
    : path.join(".kilo", "references", "rules");
}

export function kiloAgentRoot(context) {
  return context.scope === "user" ? path.join(".config", "kilo", "agents") : path.join(".kilo", "agents");
}

export function opencodeCommandRoot(context) {
  return context.scope === "user" ? path.join(".config", "opencode", "commands") : path.join(".opencode", "commands");
}

export function opencodeAgentRoot(context) {
  return context.scope === "user" ? path.join(".config", "opencode", "agents") : path.join(".opencode", "agents");
}

export function opencodeInstructionPath(context) {
  return context.scope === "user" ? path.join(".config", "opencode", "AGENTS.md") : "AGENTS.md";
}

export function opencodeConfigRoot(context) {
  return context.scope === "user" ? path.join(".config", "opencode") : ".opencode";
}

export function opencodeMcpPath(context) {
  return path.join(opencodeConfigRoot(context), "opencode.json");
}

export function windsurfWorkflowRoot(context) {
  return context.scope === "user" ? path.join(".codeium", "windsurf", "global_workflows") : path.join(".windsurf", "workflows");
}

export function windsurfConfigRoot(context) {
  return context.scope === "user" ? path.join(".codeium", "windsurf") : ".windsurf";
}

export function windsurfMcpPath(context) {
  return context.scope === "user"
    ? path.join(".codeium", "windsurf", "mcp_config.json")
    : path.join(".windsurf", "mcp_config.json");
}

export function windsurfRulePath(context) {
  return context.scope === "user"
    ? path.join(".codeium", "windsurf", "memories", "global_rules.md")
    : path.join(".devin", "rules", "agent-surface.md");
}

export function windsurfSkillRoot(context) {
  return context.scope === "user" ? path.join(".codeium", "windsurf", "skills") : path.join(".windsurf", "skills");
}

export function zedSkillRoot() {
  return path.join(".agents", "skills");
}

export function zedInstructionPath(context) {
  return context.scope === "user" ? path.join(".config", "zed", "AGENTS.md") : "AGENTS.md";
}

export function zedConfigRoot(context) {
  return context.scope === "user" ? path.join(".config", "zed") : ".zed";
}

export function zedMcpPath(context) {
  return path.join(zedConfigRoot(context), "settings.json");
}
