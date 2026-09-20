// Per-target install roots + output path/naming helpers. Pure: (scope|context) -> path string.
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fail } from "./util.mjs";

export function installRootUserOrProject(scope) {
  return scope === "user" ? os.homedir() : process.cwd();
}

export function installRootHomeOnly(scope) {
  if (scope !== "user") fail("this target supports --scope user only unless --dest is supplied");
  return os.homedir();
}

export function installRootCodex(scope) {
  if (scope !== "user") fail("codex install supports --scope user only unless --dest is supplied");
  return os.homedir();
}

export function installRootKimiCode(scope) {
  if (scope === "project") return process.cwd();
  return path.resolve(process.env.KIMI_CODE_HOME ?? path.join(os.homedir(), ".kimi-code"));
}

export function installRootAntigravity(scope) {
  if (scope !== "user") fail("antigravity install supports --scope user only unless --dest is supplied");
  return path.join(os.homedir(), ".gemini");
}

export function installRootAntigravityCli(scope) {
  if (scope !== "user") fail("antigravity-cli install supports --scope user only unless --dest is supplied");
  return path.join(os.homedir(), ".gemini");
}

export function installRootVsCode(scope) {
  if (scope !== "user") fail("vscode install supports --scope user only unless --dest is supplied");
  return os.homedir();
}

export function droidInstructionPath(context) {
  return context.scope === "user" ? path.join(".factory", "AGENTS.md") : "AGENTS.md";
}

export function droidConfigRoot(_context) {
  return ".factory";
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
  return context.scope === "user" ? path.join("Documents", "Cline", "Workflows") : path.join(".clinerules", "workflows");
}

export function clineSkillRoot(_context) {
  return path.join(".cline", "skills");
}

export function clineAgentRoot(_context) {
  return path.join(".cline", "agents");
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

export function dshSkillRoot() {
  return path.join(".dsh", "skills");
}

export function qoderConfigRoot() {
  return ".qoder";
}

export function qoderSkillRoot() {
  return path.join(qoderConfigRoot(), "skills");
}

export function qoderCommandRoot() {
  return path.join(qoderConfigRoot(), "commands");
}

export function qoderAgentRoot() {
  return path.join(qoderConfigRoot(), "agents");
}

export function qoderInstructionPath(context) {
  return context.scope === "user" ? path.join(qoderConfigRoot(), "AGENTS.md") : "AGENTS.md";
}

export function qoderSettingsPath() {
  return path.join(qoderConfigRoot(), "settings.json");
}

export function qwenCodeConfigRoot() {
  return ".qwen";
}

export function qwenCodeSkillRoot() {
  return path.join(qwenCodeConfigRoot(), "skills");
}

export function qwenCodeCommandRoot() {
  return path.join(qwenCodeConfigRoot(), "commands");
}

export function qwenCodeAgentRoot() {
  return path.join(qwenCodeConfigRoot(), "agents");
}

export function qwenCodeInstructionPath(context) {
  return context.scope === "user" ? path.join(qwenCodeConfigRoot(), "QWEN.md") : "QWEN.md";
}

export function qwenCodeSettingsPath() {
  return path.join(qwenCodeConfigRoot(), "settings.json");
}

export function kiroConfigRoot() {
  return ".kiro";
}

export function kiroSkillRoot() {
  return path.join(kiroConfigRoot(), "skills");
}

export function kiroSteeringRoot() {
  return path.join(kiroConfigRoot(), "steering");
}

export function kiroAgentRoot() {
  return path.join(kiroConfigRoot(), "agents");
}

export function kiroMcpPath() {
  return path.join(kiroConfigRoot(), "settings", "mcp.json");
}

export function kiroPermissionsPath() {
  return path.join(kiroConfigRoot(), "settings", "permissions.yaml");
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
  return context.scope === "user" ? path.join("Documents", "Cline", "Rules") : ".clinerules";
}

export function clineMcpPath(_context) {
  return path.join(".cline", "data", "settings", "cline_mcp_settings.json");
}

export function clineVsCodeExtensionMcpPath(_context) {
  return path.join(
    ideUserDataRoot("Code", _context),
    "User",
    "globalStorage",
    "saoudrizwan.claude-dev",
    "settings",
    "cline_mcp_settings.json",
  );
}

export function clineCursorExtensionMcpPath(_context) {
  return path.join(
    ideUserDataRoot("Cursor", _context),
    "User",
    "globalStorage",
    "saoudrizwan.claude-dev",
    "settings",
    "cline_mcp_settings.json",
  );
}

export function clineWindsurfExtensionMcpPath(_context) {
  return path.join(
    ideUserDataRoot("Windsurf", _context),
    "User",
    "globalStorage",
    "saoudrizwan.claude-dev",
    "settings",
    "cline_mcp_settings.json",
  );
}

export function ideUserDataRoot(product, context = {}) {
  const platform = context.platform ?? process.platform;
  if (platform === "darwin") return path.join("Library", "Application Support", product);
  if (platform === "win32") {
    const windowsPath = path.win32;
    const appData = context.appData ?? process.env.APPDATA;
    if (!context.relocateExternalRoutes && appData) return windowsPath.join(appData, product);
    return windowsPath.join("AppData", "Roaming", product);
  }
  return path.join(".config", product);
}

export function kiloWorkflowRoot(context) {
  return context.scope === "user" ? path.join(".config", "kilo", "commands") : path.join(".kilo", "commands");
}

export function kiloSkillRoot() {
  return path.join(".kilo", "skills");
}

export function kiloConfigPath(scope) {
  return scope === "user" ? path.join(".config", "kilo", "kilo.jsonc") : "kilo.jsonc";
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

export function kimiCodeConfigRoot(context) {
  return context.scope === "user" ? "" : ".kimi-code";
}

export function kimiCodeSkillRoot(context) {
  return path.join(kimiCodeConfigRoot(context), "skills");
}

export function kimiCodeAgentRoot(context) {
  return path.join(kimiCodeConfigRoot(context), "agents");
}

export function kimiCodeInstructionPath(context) {
  return path.join(kimiCodeConfigRoot(context), "AGENTS.md");
}

export function kimiCodeConfigPath(context) {
  return path.join(kimiCodeConfigRoot(context), "config.toml");
}

export function kimiCodeMcpPath(context) {
  return path.join(kimiCodeConfigRoot(context), "mcp.json");
}

export function kimiCodeVsCodeSettingsPath(context) {
  return kimiCodeIdeSettingsPath("Code", context);
}

export function kimiCodeCursorSettingsPath(context) {
  return kimiCodeIdeSettingsPath("Cursor", context);
}

function kimiCodeIdeSettingsPath(product, context = {}) {
  const route = path.join(ideUserDataRoot(product, context), "User", "settings.json");
  if (context.relocateExternalRoutes || path.isAbsolute(route)) return route;
  return path.join(os.homedir(), route);
}

export function opencodeCommandRoot(context) {
  return context.scope === "user" ? path.join(".config", "opencode", "commands") : path.join(".opencode", "commands");
}

export function opencodeSkillRoot(context) {
  return context.scope === "user" ? path.join(".config", "opencode", "skills") : path.join(".opencode", "skills");
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

export function openhandsSkillRoot(context) {
  return path.join(".agents", "skills");
}

export function openhandsInstructionPath(context) {
  return context.scope === "user" ? path.join(".openhands", "skills", "agent-surface-rules.md") : "AGENTS.md";
}

export function openhandsConfigRoot() {
  return ".openhands";
}

export function openhandsMcpPath() {
  return path.join(".openhands", "mcp.json");
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

export function gooseSkillRoot(context) {
  return path.join(".agents", "skills");
}

export function antigravitySkillRoot(context) {
  return context.scope === "user" ? path.join("config", "skills") : path.join(".agents", "skills");
}

export function antigravityWorkflowRoot() {
  return path.join("antigravity", "global_workflows");
}

export function cursorSkillRoot() {
  return path.join(".cursor", "skills");
}

export function droidSkillRoot() {
  return path.join(".factory", "skills");
}

export function traeSkillRoot() {
  return path.join(".trae", "skills");
}

export function traeCliSkillRoot() {
  return path.join(".traecli", "skills");
}

export function traeAgentRoot(context) {
  return context.scope === "user"
    ? [path.join(".trae-cn", "agents"), path.join(".traecli", "agents")]
    : [path.join(".trae", "agents"), path.join(".traecli", "agents")];
}

export function traeRuleRoot(context) {
  return context.scope === "user"
    ? path.join(".trae-cn", "user_rules")
    : path.join(".trae", "rules");
}

export function traeCliConfigPath() {
  return path.join(".trae", "traecli.toml");
}

export function copilotSkillRoot(context) {
  return context.scope === "user" ? path.join(".copilot", "skills") : path.join(".github", "skills");
}

export function copilotAgentRoot(context) {
  return context.scope === "user" ? path.join(".copilot", "agents") : path.join(".github", "agents");
}

export function copilotInstructionPath(context) {
  return context.scope === "user"
    ? path.join(".copilot", "copilot-instructions.md")
    : path.join(".github", "copilot-instructions.md");
}

export function copilotMcpPath(context) {
  return context.scope === "user" ? path.join(".copilot", "mcp-config.json") : ".mcp.json";
}

export function sharedAgentSkillRoot() {
  return path.join(".agents", "skills");
}

export function vsCodeUserRoot(product, context = {}) {
  const platform = context.platform ?? process.platform;
  const pathApi = platform === "win32" ? path.win32 : path;
  return pathApi.join(ideUserDataRoot(product, { ...context, relocateExternalRoutes: true }), "User");
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
