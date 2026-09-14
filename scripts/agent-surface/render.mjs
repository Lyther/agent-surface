// Per-target render functions: source (command/rule/subagent) + context -> native string.
// Pure text transforms (+ small format/access helpers); no fs, no producers.
import path from "node:path";
import { tomlMultilineString, tomlString, yamlString } from "./format.mjs";
import { readRulesForContext } from "./rules.mjs";
import { fail } from "./util.mjs";

export async function renderClineWorkflow(source) {
  return source.body;
}

export async function renderKiloWorkflow(source) {
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
    `permissionMode: ${mapped.permissionMode}`,
    `maxTurns: ${mapped.maxTurns}`,
    "---",
    "",
    source.body.trim(),
    "",
  ].join("\n");
}

export function renderClineSubagent(source) {
  const tools = clineSubagentAccess(source.metadata.access);
  return [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
    "tools:",
    ...tools.map((tool) => `  - ${tool}`),
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
    ...Object.entries(mapped.permissions).map(([permission, action]) => `  ${JSON.stringify(permission)}: ${action}`),
    `steps: ${mapped.steps}`,
    "---",
    "",
    source.body.trim(),
    "",
  );
  return lines.join("\n");
}

export function renderKimiCodeSubagent(source) {
  if (source.metadata.model !== "inherit") {
    fail(`kimi-code subagent model ${source.metadata.model} is not representable; use inherit`);
  }
  const tools = kimiCodeSubagentTools(source.metadata.access);
  return [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
    "tools:",
    ...tools.map((tool) => `  - "${yamlString(tool)}"`),
    "---",
    "",
    source.body.trim(),
    "",
  ].join("\n");
}

export function renderQwenCodeSubagent(source) {
  const mapped = qwenCodeSubagentAccess(source.metadata.access);
  const lines = [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
    `approvalMode: ${mapped.approvalMode}`,
  ];
  if (source.metadata.model !== "inherit") lines.push(`model: ${source.metadata.model}`);
  lines.push(
    "tools:",
    ...mapped.tools.map((tool) => `  - ${tool}`),
    "---",
    "",
    source.body.trim(),
    "",
  );
  return lines.join("\n");
}

export function renderKiroSubagent(source) {
  const mapped = kiroSubagentAccess(source.metadata.access);
  const lines = [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
    `tools: ${JSON.stringify(mapped.tools)}`,
  ];
  if (source.metadata.model !== "inherit") lines.push(`model: ${source.metadata.model}`);
  lines.push(
    "permissions:",
    "  rules:",
    ...mapped.capabilities.flatMap((capability) => [
      `    - capability: ${capability}`,
      "      effect: allow",
    ]),
    "resources:",
    '  - "file://.kiro/steering/**/*.md"',
    '  - "file://~/.kiro/steering/**/*.md"',
    '  - "skill://.kiro/skills/**/SKILL.md"',
    '  - "skill://~/.kiro/skills/**/SKILL.md"',
    "---",
    "",
    source.body.trim(),
    "",
  );
  return lines.join("\n");
}

export function renderCopilotSubagent(source) {
  const tools = copilotSubagentTools(source.metadata.access);
  return [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
    `tools: [${tools.map((tool) => JSON.stringify(tool)).join(", ")}]`,
    "---",
    "",
    source.body.trim(),
    "",
  ].join("\n");
}

export function renderTraeSubagent(source) {
  const tools = traeSubagentTools(source.metadata.access);
  return [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${yamlString(source.metadata.description)}"`,
    `tools: ${tools.join(", ")}`,
    "---",
    "",
    source.body.trim(),
    "",
  ].join("\n");
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

export function renderAntigravityCliSubagent(source) {
  const tools = antigravityCliSubagentTools(source.metadata.access);
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
    ...Object.entries(mapped).map(([permission, action]) => `  ${JSON.stringify(permission)}: ${action}`),
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

export async function renderNativeMarkdownCommand(source) {
  const description = yamlString(source.metadata.description ?? firstHeading(source.body) ?? `Run ${source.name.replaceAll("-", " ")}.`);
  return [
    "---",
    `name: ${source.name}`,
    `description: "${description}"`,
    "---",
    "",
    source.body,
  ].join("\n");
}

export async function renderQwenCodeCommand(source) {
  const description = yamlString(source.metadata.description ?? firstHeading(source.body) ?? `Run ${source.name.replaceAll("-", " ")}.`);
  return [
    "---",
    `description: "${description}"`,
    "---",
    "",
    source.body,
  ].join("\n");
}

export async function renderKiroManualSteering(source) {
  return [
    "---",
    "inclusion: manual",
    "---",
    "",
    source.body,
  ].join("\n");
}

export async function renderWindsurfWorkflow(source) {
  return source.body;
}

export async function renderVanillaSkill(source) {
  return source.text;
}

export async function renderManualClaudeSkill(source) {
  return renderSkillMarkdown(source, {
    invocationPrefix: "/",
    generatedFor: "Claude Code",
    frontmatter: ["disable-model-invocation: true"],
    hostInstruction: "This manual workflow must be selected explicitly.",
  });
}

export async function renderManualKimiCodeSkill(source) {
  const description = yamlString(source.metadata.description ?? firstHeading(source.body) ?? `Run ${source.name.replaceAll("-", " ")}.`);
  return [
    "---",
    `name: ${source.name}`,
    `description: "${description}"`,
    "type: flow",
    "disableModelInvocation: true",
    "---",
    "",
    source.body,
  ].join("\n");
}

// Deliberately names no invocation syntax. Several hosts read the very same generated file out of the
// shared Agent Skills root and spell explicit invocation differently, so the body describes WHAT the
// reader must do — choose it deliberately — and leaves HOW to the runtime. The explicit-only
// guarantee is carried by `disable-model-invocation`, which is metadata the hosts read, not prose.
export async function renderManualPortableSkill(source) {
  return renderSkillMarkdown(source, {
    invocationPrefix: null,
    generatedFor: "compatible Agent Skills hosts",
    frontmatter: ["disable-model-invocation: true"],
    hostInstruction: "This manual workflow must be selected explicitly.",
  });
}

// The same manual-skill contract for hosts that own their skill root outright, so the file is read by
// one runtime and can name that runtime's syntax. Both of these document slash invocation and were
// previously handed a different host's `$name` idiom.
export async function renderManualSlashSkill(source) {
  return renderSkillMarkdown(source, {
    invocationPrefix: "/",
    generatedFor: "compatible Agent Skills hosts",
    frontmatter: ["disable-model-invocation: true"],
    hostInstruction: "This manual workflow must be selected explicitly.",
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

// `invocationPrefix: null` asks for guidance that names no syntax. That is the right choice whenever
// one rendered file is read by more than one host: `.agents/skills/<name>/SKILL.md` is shared, and
// hosts reading it do not agree on a prefix, so any concrete syntax printed there is wrong for
// someone. A renderer that owns its host's own root passes that host's prefix instead.
export function renderSkillMarkdown(source, options = {}) {
  const invocationPrefix = Object.hasOwn(options, "invocationPrefix") ? options.invocationPrefix : "$";
  const generatedFor = options.generatedFor ?? "agent-surface skill";
  const description = yamlString(source.metadata.description ?? firstHeading(source.body) ?? `Run ${source.name.replaceAll("-", " ")}.`);
  const hostInstruction = options.hostInstruction ?? (invocationPrefix === null
    ? "Select this skill explicitly when it is needed."
    : `Invoke \`${invocationPrefix}${source.name}\` when this skill is needed.`);
  const frontmatter = options.frontmatter ?? [];
  const invocationInstruction = invocationPrefix === null
    ? "Select this workflow explicitly through your runtime's skill interface."
    : `Use explicit invocation: \`${invocationPrefix}${source.name}\`.`;
  return [
    "---",
    `name: ${source.name}`,
    `description: "${description}"`,
    ...frontmatter,
    "---",
    "",
    `# ${source.name}`,
    "",
    invocationInstruction,
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

export async function renderInstructionDocument(title, subtitle, context = {}) {
  const rules = (await readRulesForContext(context, { includeBaseline: true }))
    .filter((rule) => rule.alwaysApply !== false);
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

// A scoped rule applies only to matching files, and this host has no native surface that scopes a
// document that way — so it is delivered as a REFERENCE the reader decides to apply. That only
// works if the reader can see what it applies to: the previous text told them to match the rule's
// frontmatter globs while stripFrontmatter removed the very globs it named. The description and
// globs are therefore restored into the body as inert metadata. They are not a host mechanism and
// this document does not claim to be attached automatically; nothing here re-emits frontmatter,
// which a host might read as its own directives.
export function renderScopedRuleReferenceDocument(rule) {
  const applicability = rule.globs.length > 0
    ? ["Applies to files matching:", "", ...rule.globs.map((glob) => `- \`${glob}\``)]
    : ["No file globs are declared, so apply it by judgment."];
  return [
    `# ${path.basename(rule.file, ".mdc")}`,
    "",
    `> Scoped agent-surface reference. Generated from \`${rule.file}\`. This host does not attach scoped rules automatically — read it when the work matches the scope below.`,
    "",
    ...(rule.description ? [`**Scope.** ${rule.description}`, ""] : []),
    ...applicability,
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

export function renderKiroRuleDocument(rule) {
  const frontmatter = rule.alwaysApply === false
    ? ["inclusion: fileMatch", `fileMatchPattern: ${JSON.stringify(rule.globs ?? [])}`]
    : ["inclusion: always"];
  return [
    "---",
    ...frontmatter,
    "---",
    "",
    stripFrontmatter(rule.text).trim(),
    "",
  ].join("\n");
}

export async function renderVsCodeInstructionDocument(title, target, context = {}) {
  return [
    "---",
    `description: "${yamlString(title)}"`,
    'applyTo: "**"',
    "---",
    "",
    await renderInstructionDocument(title, `${target} global instruction file`, context),
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
  if (access === "read-only") return { tools: "Read, Glob, Grep", permissionMode: "plan", maxTurns: 20 };
  if (access === "read-write") return { tools: "Read, Glob, Grep, Edit, Write", permissionMode: "acceptEdits", maxTurns: 30 };
  if (access === "read-write-shell") return { tools: "Read, Glob, Grep, Edit, Write, Bash", permissionMode: "bypassPermissions", maxTurns: 40 };
  fail(`unsupported subagent access: ${access}`);
}

export function clineSubagentAccess(access) {
  const readOnly = ["read_file", "search_files", "use_skill"];
  if (access === "read-only") return readOnly;
  const readWrite = [...readOnly, "replace_in_file", "write_to_file"];
  if (access === "read-write") return readWrite;
  if (access === "read-write-shell") return [...readWrite, "execute_command"];
  fail(`unsupported subagent access: ${access}`);
}

export function codexSubagentSandboxMode(access) {
  if (access === "read-only") return "read-only";
  if (access === "read-write-shell") return "danger-full-access";
  // Codex sandbox modes do not separate file writes from shell execution.
  // Refuse the intermediate tier instead of silently granting command access.
  if (access === "read-write") fail("codex subagent access read-write is not representable; use read-only or read-write-shell");
  fail(`unsupported subagent access: ${access}`);
}

export function kiloSubagentAccess(access) {
  const inspect = { "*": "deny", read: "allow", glob: "allow", grep: "allow", skill: "allow" };
  if (access === "read-only") return { permissions: inspect, steps: 20 };
  if (access === "read-write") return { permissions: { ...inspect, edit: "allow" }, steps: 30 };
  if (access === "read-write-shell") return { permissions: { "*": "allow" }, steps: 40 };
  fail(`unsupported subagent access: ${access}`);
}

export function kimiCodeSubagentTools(access) {
  const readOnly = [
    "Read",
    "ReadMediaFile",
    "Grep",
    "Glob",
    "WebSearch",
    "FetchURL",
    "TodoList",
    "AskUserQuestion",
    "Skill",
  ];
  if (access === "read-only") return readOnly;
  if (access === "read-write") return [...readOnly, "Write", "Edit"];
  if (access === "read-write-shell") return ["*"];
  fail(`unsupported subagent access: ${access}`);
}

export function qwenCodeSubagentAccess(access) {
  const readOnly = ["read_file", "grep_search", "glob", "web_fetch"];
  if (access === "read-only") return { approvalMode: "plan", tools: readOnly };
  const readWrite = [...readOnly, "write_file", "edit"];
  if (access === "read-write") return { approvalMode: "auto-edit", tools: readWrite };
  if (access === "read-write-shell") {
    return { approvalMode: "yolo", tools: [...readWrite, "run_shell_command"] };
  }
  fail(`unsupported subagent access: ${access}`);
}

export function kiroSubagentAccess(access) {
  if (access === "read-only") return { tools: ["read"], capabilities: ["fs_read"] };
  if (access === "read-write") return { tools: ["read", "write"], capabilities: ["fs_read", "fs_write"] };
  if (access === "read-write-shell") return { tools: ["*"], capabilities: ["all"] };
  fail(`unsupported subagent access: ${access}`);
}

export function copilotSubagentTools(access) {
  if (access === "read-only") return ["read", "search"];
  if (access === "read-write") return ["read", "search", "edit"];
  if (access === "read-write-shell") return ["*"];
  fail(`unsupported subagent access: ${access}`);
}

export function traeSubagentTools(access) {
  const readOnly = ["Read", "Glob", "Grep", "Skill"];
  if (access === "read-only") return readOnly;
  const readWrite = [...readOnly, "Edit", "Write"];
  if (access === "read-write") return readWrite;
  if (access === "read-write-shell") return [...readWrite, "Bash"];
  fail(`unsupported subagent access: ${access}`);
}

export function antigravityCliSubagentTools(access) {
  const readOnly = ["view_file", "list_dir", "grep_search"];
  if (access === "read-only") return readOnly;
  const readWrite = [...readOnly, "replace_file_content", "write_to_file"];
  if (access === "read-write") return readWrite;
  if (access === "read-write-shell") return [...readWrite, "run_command"];
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
  const inspect = {
    "*": "deny",
    read: "allow",
    glob: "allow",
    grep: "allow",
    list: "allow",
    lsp: "allow",
    skill: "allow",
  };
  if (access === "read-only") return inspect;
  if (access === "read-write") return { ...inspect, edit: "allow" };
  if (access === "read-write-shell") return { "*": "allow" };
  fail(`unsupported subagent access: ${access}`);
}
