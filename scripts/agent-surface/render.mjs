// Per-target render functions: source (command/rule/subagent) + context -> native string.
// Pure text transforms (+ small format helpers); no fs, no producers.
import path from "node:path";
import { quotedScalar, tomlMultilineString } from "./format.mjs";
import { readRulesForContext } from "./rules.mjs";

export async function renderClineWorkflow(source) {
  return source.body;
}

export async function renderKiloWorkflow(source) {
  return source.body;
}

// No subagent renderer sets a model or permission mode or narrows the session's tools and permissions, so
// every role runs with what the session grants. Claude Code ranks a definition's `model`, `inherit`
// included, above CLAUDE_CODE_SUBAGENT_MODEL; every host but Kiro gives an agent that lists no tools the
// session's tools, and Codex agent files cannot set the sandbox or approval policy at all.
export function renderMarkdownSubagent(source) {
  return [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${quotedScalar(source.metadata.description)}"`,
    "---",
    "",
    source.body.trim(),
    "",
  ].join("\n");
}

// OpenCode and its fork Kilo name an agent after its file; `mode: subagent` keeps it out of the primary list.
export function renderOpenCodeSubagent(source) {
  return [
    "---",
    `description: "${quotedScalar(source.metadata.description)}"`,
    "mode: subagent",
    "---",
    "",
    source.body.trim(),
    "",
  ].join("\n");
}

// Kiro's custom-agent reference does not say what an omitted `tools` grants, so each role lists the
// wildcard and an allow rule; a delegated agent's calls also meet the parent session's policy, and the
// stricter result wins. No file:// steering resource: Kiro CLI's V3 engine adds steering by inclusion
// before each model call for every agent, custom ones included, while a file:// resource adds every file
// it matches whatever its inclusion, manual workflows included.
export function renderKiroSubagent(source) {
  return [
    "---",
    `name: ${source.metadata.name}`,
    `description: "${quotedScalar(source.metadata.description)}"`,
    'tools: ["*"]',
    "permissions:",
    "  rules:",
    "    - capability: all",
    "      effect: allow",
    "resources:",
    '  - "skill://.kiro/skills/**/SKILL.md"',
    '  - "skill://~/.kiro/skills/**/SKILL.md"',
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
    `description: "${quotedScalar(source.metadata.description)}"`,
    "is_background: false",
    "---",
    "",
    source.body.trim(),
    "",
  ].join("\n");
}

export function renderCodexSubagent(source) {
  return [
    `name = "${quotedScalar(source.metadata.name)}"`,
    `description = "${quotedScalar(source.metadata.description)}"`,
    "",
    `developer_instructions = ${tomlMultilineString(source.body.trim())}`,
    "",
  ].join("\n");
}

export async function renderCursorCommand(source) {
  return source.body;
}

// The description a host lists beside a command: the source's own, else its first heading.
function commandDescription(source) {
  return quotedScalar(source.metadata.description ?? firstHeading(source.body) ?? `Run ${source.name.replaceAll("-", " ")}.`);
}

// Droid and OpenCode list a command with its frontmatter description. Without one, OpenCode lists none
// and Droid shows the body's first line, which is "## OBJECTIVE" for every command source.
export async function renderDroidCommand(source) {
  return ["---", `description: "${commandDescription(source)}"`, "---", "", source.body].join("\n");
}

export async function renderOpenCodeCommand(source) {
  return ["---", `description: "${commandDescription(source)}"`, "---", "", source.body].join("\n");
}

// Qoder and Qwen Code let the model start a custom command, as they do a skill, unless its frontmatter
// sets disable-model-invocation. Every command source is a manual workflow, so both renderers set it.
export async function renderNativeMarkdownCommand(source) {
  const description = commandDescription(source);
  return [
    "---",
    `name: ${source.name}`,
    `description: "${description}"`,
    "disable-model-invocation: true",
    "---",
    "",
    source.body,
  ].join("\n");
}

export async function renderQwenCodeCommand(source) {
  const description = commandDescription(source);
  return [
    "---",
    `description: "${description}"`,
    "disable-model-invocation: true",
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
  const description = quotedScalar(source.metadata.description ?? firstHeading(source.body) ?? `Run ${source.name.replaceAll("-", " ")}.`);
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
  const description = quotedScalar(source.metadata.description ?? firstHeading(source.body) ?? `Run ${source.name.replaceAll("-", " ")}.`);
  return [
    'version: "1.0.0"',
    `title: "agent-surface ${quotedScalar(source.name)}"`,
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
  const description = quotedScalar(source.metadata.description ?? firstHeading(source.body) ?? `Run ${source.name.replaceAll("-", " ")}.`);
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
  const description = quotedScalar(source.metadata.description ?? firstHeading(body) ?? `Run ${source.name.replaceAll("-", " ")}.`);

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

// Antigravity silently discards a rules/*.md file whose frontmatter declares no valid trigger, so
// every generated rule states the always-on trigger its source rule already has.
export function renderAntigravityCliRuleDocument(rule) {
  return [
    "---",
    "trigger: always_on",
    "---",
    "",
    `# ${path.basename(rule.file, ".mdc")}`,
    "",
    `> Antigravity CLI plugin rule. Generated by agent-surface from \`${rule.file}\`.`,
    "",
    stripFrontmatter(rule.text).trim(),
    "",
  ].join("\n");
}

const SCOPED_REFERENCE_NOTE = "Scoped language rules are emitted as separate reference files.";

export async function renderInstructionDocument(title, subtitle, context = {}, scopedNote = SCOPED_REFERENCE_NOTE) {
  const rules = (await readRulesForContext(context, { includeBaseline: true }))
    .filter((rule) => rule.alwaysApply !== false);
  return [
    `# ${title}`,
    "",
    `> ${subtitle}. Generated by agent-surface from always-on \`rules/*.mdc\`. ${scopedNote}`,
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

// This host attaches an instruction file to a request when one of its `applyTo` globs matches a file
// in that request's context, and reads `**` as "attach to every request", so the always-on document
// declares it and the scoped rules carry their own globs instead of being references.
export async function renderVsCodeInstructionDocument(title, context = {}) {
  return [
    "---",
    `description: "${quotedScalar(title)}"`,
    'applyTo: "**"',
    "---",
    "",
    await renderInstructionDocument(
      title,
      "VS Code profile instruction file",
      context,
      "Scoped language rules are instruction files of their own, which VS Code attaches by their `applyTo` globs.",
    ),
  ].join("\n");
}

// One scalar of comma-separated globs is the form the host documents and its matcher splits on; a
// pattern that starts with neither `/` nor `**/` is anchored under `**/` there, so a rule's globs
// carry over as written.
export function renderVsCodeScopedInstructionDocument(rule) {
  return [
    "---",
    ...(rule.description ? [`description: "${quotedScalar(rule.description)}"`] : []),
    `applyTo: "${quotedScalar(rule.globs.join(", "))}"`,
    "---",
    "",
    stripFrontmatter(rule.text).trim(),
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
