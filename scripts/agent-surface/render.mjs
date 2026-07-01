// Per-target render functions: source (command/rule/subagent) + context -> native string.
// Pure text transforms (+ small format/access helpers); no fs, no producers.
import path from "node:path";
import { readCommands } from "./commands.mjs";
import { approximateTokens, tomlMultilineString, tomlString, yamlString } from "./format.mjs";
import { relative } from "./registry.mjs";
import { readRules } from "./rules.mjs";
import { fail } from "./util.mjs";

export async function renderClineWorkflow(source) {
  return source.body;
}

export async function renderKiloWorkflow(source) {
  return source.body;
}

export async function renderClaudeCommand(source) {
  return source.body;
}

export function renderClaudeSubagent(source) {
  const mapped = claudeSubagentAccess(source.metadata.access);
  return [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
    `tools: ${mapped.tools}`,
    `model: ${source.metadata.model}`,
    `maxTurns: ${mapped.maxTurns}`,
    "---",
    "",
    source.body.trim(),
    "",
  ].join("\n");
}

export function renderKiloSubagent(source) {
  const mapped = kiloSubagentAccess(source.metadata.access);
  const lines = [
    "---",
    `description: "${yamlString(source.metadata.description)}"`,
    "mode: subagent",
  ];
  if (source.metadata.model !== "inherit") lines.push(`model: ${source.metadata.model}`);
  lines.push(
    "permission:",
    `  edit: ${mapped.edit}`,
    `  bash: ${mapped.bash}`,
    `steps: ${mapped.steps}`,
    "---",
    "",
    source.body.trim(),
    "",
  );
  return lines.join("\n");
}

export function renderCursorSubagent(source) {
  return [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
    `model: ${source.metadata.model}`,
    `readonly: ${cursorSubagentReadonly(source.metadata.access)}`,
    "is_background: false",
    "---",
    "",
    source.body.trim(),
    "",
  ].join("\n");
}

export function renderGeminiSubagent(source) {
  const tools = geminiSubagentAccess(source.metadata.access);
  return [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
    `model: ${source.metadata.model}`,
    "tools:",
    ...tools.map((tool) => `  - ${tool}`),
    "---",
    "",
    source.body.trim(),
    "",
  ].join("\n");
}

export function renderDroidSubagent(source) {
  const tools = droidSubagentAccess(source.metadata.access);
  return [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
    `model: ${source.metadata.model}`,
    "tools:",
    ...tools.map((tool) => `  - ${tool}`),
    "---",
    "",
    source.body.trim(),
    "",
  ].join("\n");
}

export function renderCodexSubagent(source) {
  const lines = [
    `name = "${tomlString(source.metadata.name)}"`,
    `description = "${tomlString(source.metadata.description)}"`,
    `sandbox_mode = "${codexSubagentSandboxMode(source.metadata.access)}"`,
  ];
  if (source.metadata.model !== "inherit") lines.push(`model = "${tomlString(source.metadata.model)}"`);
  lines.push(
    "",
    `developer_instructions = ${tomlMultilineString(source.body.trim())}`,
    "",
  );
  return lines.join("\n");
}

export function renderDeepAgentsSubagent(source) {
  const lines = [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
  ];
  if (source.metadata.model !== "inherit") lines.push(`model: ${source.metadata.model}`);
  lines.push(
    "---",
    "",
    source.body.trim(),
    "",
  );
  return lines.join("\n");
}

export function renderOpenCodeSubagent(source) {
  const mapped = opencodeSubagentAccess(source.metadata.access);
  const lines = [
    "---",
    `description: "${yamlString(source.metadata.description)}"`,
    "mode: subagent",
  ];
  if (source.metadata.model !== "inherit") lines.push(`model: ${source.metadata.model}`);
  lines.push(
    "permission:",
    `  edit: ${mapped.edit}`,
    `  bash: ${mapped.bash}`,
    "---",
    "",
    source.body.trim(),
    "",
  );
  return lines.join("\n");
}

export async function renderCursorCommand(source) {
  return source.body;
}

export async function renderDroidCommand(source) {
  return source.body;
}

export async function renderOpenCodeCommand(source) {
  return source.body;
}

export async function renderWindsurfWorkflow(source) {
  return source.body;
}

export async function renderSharedAgentSkill(source) {
  return renderSkillMarkdown(source, {
    invocationPrefix: null,
    generatedFor: "Codex and Zed",
    hostInstruction: `For explicit invocation, use the current host's Agent Skill syntax, such as \`$${source.name}\` in Codex or \`/${source.name}\` in Zed. Treat slash-command syntax below as portable command documentation unless the host supports it directly.`,
  });
}

export async function renderGrokBuildSkill(source) {
  return renderSkillMarkdown(source, {
    invocationPrefix: "/",
    generatedFor: "Grok Build",
    hostInstruction: "Grok exposes user-invocable skills as slash commands; use this skill when the task matches its description.",
  });
}

export async function renderPiSkill(source) {
  return renderSkillMarkdown(source, {
    invocationPrefix: "/skill:",
    generatedFor: "Pi",
    hostInstruction: "Pi loads Agent Skills from .pi and .agents skill roots; select this skill when the task matches its description.",
  });
}

export async function renderPoolSkill(source) {
  return renderSkillMarkdown(source, {
    invocationPrefix: "/skills",
    generatedFor: "Poolside",
    hostInstruction: "Poolside can auto-apply local skills when the SKILL.md description matches the task; use the skills menu for explicit selection.",
  });
}

export async function renderGooseRecipe(source) {
  const description = yamlString(source.metadata.description ?? firstHeading(source.body) ?? `Run ${source.name.replaceAll("-", " ")}.`);
  return [
    'version: "1.0.0"',
    `title: "agent-surface ${yamlString(source.name)}"`,
    `description: "${description}"`,
    "instructions: |",
    yamlLiteralBlock(source.body.trim(), "  "),
    "prompt: |",
    yamlLiteralBlock(`Run the ${source.name} agent-surface recipe.`, "  "),
    "",
  ].join("\n");
}

export async function renderDeepAgentsSkill(source) {
  return renderSkillMarkdown(source, {
    invocationPrefix: null,
    generatedFor: "Deep Agents Code",
    hostInstruction: "Deep Agents discovers this skill from its frontmatter and reads it when the task matches the description.",
  });
}

export function renderSkillMarkdown(source, options = {}) {
  const invocationPrefix = Object.hasOwn(options, "invocationPrefix") ? options.invocationPrefix : "$";
  const generatedFor = options.generatedFor ?? "agent-surface skill";
  const description = yamlString(source.metadata.description ?? firstHeading(source.body) ?? `Run ${source.name.replaceAll("-", " ")}.`);
  const hostInstruction = options.hostInstruction ?? `Invoke \`${invocationPrefix}${source.name}\` when this skill is needed.`;
  return [
    "---",
    `name: ${source.name}`,
    `description: "${description}"`,
    "---",
    "",
    `# ${source.name}`,
    "",
    invocationPrefix === null ? "Use this skill when its description matches the task." : `Use explicit invocation: \`${invocationPrefix}${source.name}\`.`,
    `This skill is generated by agent-surface from \`${source.relativePath}\` for ${generatedFor}.`,
    hostInstruction,
    "",
    source.body,
  ].join("\n");
}

export async function renderAntigravityWorkflow(source) {
  const body = source.body;
  const description = yamlString(source.metadata.description ?? firstHeading(body) ?? `Run ${source.name.replaceAll("-", " ")}.`);

  if (body.startsWith("---\n")) {
    const frontmatterEnd = body.indexOf("\n---\n", 4);
    if (frontmatterEnd !== -1) {
      const frontmatter = body.slice(4, frontmatterEnd);
      if (/^description:/m.test(frontmatter)) return body;
      return body.replace(/^---\n/, `---\ndescription: "${description}"\n`);
    }
  }

  return `---\ndescription: "${description}"\n---\n\n${body}`;
}

export async function renderAntigravityCliSkill(source) {
  return renderSkillMarkdown(source, {
    invocationPrefix: "/",
    generatedFor: "Antigravity CLI plugin skill",
    hostInstruction: "Invoke this skill from Antigravity CLI after the agent-surface plugin is installed and enabled.",
  });
}

export function renderAntigravityCliRuleDocument(rule) {
  return [
    `# ${path.basename(rule.file, ".mdc")}`,
    "",
    `> Antigravity CLI plugin rule. Generated by agent-surface from \`${rule.file}\`.`,
    "",
    stripFrontmatter(rule.text).trim(),
    "",
  ].join("\n");
}

export async function renderInstructionDocument(title, subtitle) {
  const rules = (await readRules()).filter((rule) => rule.alwaysApply !== false);
  return [
    `# ${title}`,
    "",
    `> ${subtitle}. Generated by agent-surface from always-on \`rules/*.mdc\`. Scoped language rules are emitted as separate reference files.`,
    "",
    ...rules.flatMap((rule) => [
      `## ${path.basename(rule.file)}`,
      "",
      stripFrontmatter(rule.text).trim(),
      "",
    ]),
  ].join("\n");
}

export function renderScopedRuleReferenceDocument(rule) {
  return [
    `# ${path.basename(rule.file, ".mdc")}`,
    "",
    `> Scoped agent-surface reference. Generated from \`${rule.file}\`. Attach this rule only when the current project files match its frontmatter globs.`,
    "",
    stripFrontmatter(rule.text).trim(),
    "",
  ].join("\n");
}

export function renderKiloRuleDocument(rule) {
  return [
    `# ${path.basename(rule.file, ".mdc")}`,
    "",
    `> Kilo custom rule. Generated by agent-surface from \`${rule.file}\`.`,
    "",
    stripFrontmatter(rule.text).trim(),
    "",
  ].join("\n");
}

export async function renderVsCodeInstructionDocument(title, target) {
  return [
    "---",
    `description: "${yamlString(title)}"`,
    'applyTo: "**"',
    "---",
    "",
    await renderInstructionDocument(title, `${target} global instruction file`),
  ].join("\n");
}

export async function renderVsCodePromptDocument() {
  const flow = (await readCommands()).find((command) => command.name === "ops-flow");
  return [
    "---",
    'description: "Route a task to the lightest safe agent-surface path"',
    'name: "agent-surface-flow"',
    'agent: "agent"',
    "---",
    "",
    flow?.body ?? "Route this task to the lightest safe agent-surface path.",
    "",
  ].join("\n");
}

export function firstHeading(text) {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^#\s+(.+?)\s*$/);
    if (match) return match[1];
  }
  return null;
}

export function stripFrontmatter(text) {
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---\n", 4);
  return end === -1 ? text : text.slice(end + 5);
}

export function yamlLiteralBlock(value, indent) {
  const lines = String(value).replace(/\s+$/u, "").split(/\r?\n/);
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) return `${indent}`;
  return lines.map((line) => `${indent}${line}`).join("\n");
}

export function cursorSubagentReadonly(access) {
  if (access === "read-only") return true;
  if (access === "read-write-shell") return false;
  // Cursor `readonly` is binary: it blocks edits and state-changing shell together,
  // so it cannot express read-write without shell. Refuse rather than silently grant shell.
  fail(`cursor subagent access ${access} is not representable; use read-only or read-write-shell`);
}

export function claudeSubagentAccess(access) {
  if (access === "read-only") return { tools: "Read, Glob, Grep", maxTurns: 20 };
  if (access === "read-write") return { tools: "Read, Glob, Grep, Edit, Write", maxTurns: 30 };
  if (access === "read-write-shell") return { tools: "Read, Glob, Grep, Edit, Write, Bash", maxTurns: 40 };
  fail(`unsupported subagent access: ${access}`);
}

export function codexSubagentSandboxMode(access) {
  if (access === "read-only") return "read-only";
  if (access === "read-write-shell") return "workspace-write";
  // Codex sandbox modes do not separate file writes from shell execution.
  // Refuse the intermediate tier instead of silently granting command access.
  if (access === "read-write") fail("codex subagent access read-write is not representable; use read-only or read-write-shell");
  fail(`unsupported subagent access: ${access}`);
}

export function kiloSubagentAccess(access) {
  if (access === "read-only") return { edit: "deny", bash: "deny", steps: 20 };
  if (access === "read-write") return { edit: "ask", bash: "deny", steps: 30 };
  if (access === "read-write-shell") return { edit: "ask", bash: "ask", steps: 40 };
  fail(`unsupported subagent access: ${access}`);
}

export function geminiSubagentAccess(access) {
  const readOnly = ["glob", "grep_search", "list_directory", "read_file", "read_many_files"];
  if (access === "read-only") return readOnly;
  const readWrite = [...readOnly, "replace", "write_file"];
  if (access === "read-write") return readWrite;
  if (access === "read-write-shell") return [...readWrite, "run_shell_command"];
  fail(`unsupported subagent access: ${access}`);
}

export function droidSubagentAccess(access) {
  const readOnly = ["Read", "LS", "Grep", "Glob"];
  if (access === "read-only") return readOnly;
  const readWrite = [...readOnly, "Create", "Edit", "ApplyPatch"];
  if (access === "read-write") return readWrite;
  if (access === "read-write-shell") return [...readWrite, "Execute"];
  fail(`unsupported subagent access: ${access}`);
}

export function opencodeSubagentAccess(access) {
  if (access === "read-only") return { edit: "deny", bash: "deny" };
  if (access === "read-write") return { edit: "ask", bash: "deny" };
  if (access === "read-write-shell") return { edit: "ask", bash: "ask" };
  fail(`unsupported subagent access: ${access}`);
}
