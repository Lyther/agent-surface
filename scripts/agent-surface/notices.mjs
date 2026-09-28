// Operator notices: lifecycle, security and compatibility facts stored per target in the capability
// registry, plus notices the install planner derives from the operation itself. A notice is plan
// and report text only: it never blocks, and no notice is written into a generated native file.
import os from "node:os";
import path from "node:path";

import { parseSimpleFrontmatter } from "./commands.mjs";
import { readTargetCapabilities } from "./registry.mjs";

const SHARED_SKILL_ROOT_NOTICE = {
  code: "SHARED_SKILL_ROOT_MANUAL_UNQUALIFIED",
  kind: "compatibility",
  surface: "skills",
  message: "This plan writes manual-only skills under .agents/skills in a workspace root. Antigravity also discovers that directory and documents no manual-only skill metadata, so it may invoke these skills automatically.",
  action: "Keep manual-only skills out of workspaces Antigravity opens, or accept automatic invocation there. A home-directory install is outside this notice unless the home directory itself is opened as a workspace.",
  source_url: "https://antigravity.google/docs/skills",
  checked_at: "2026-09-28",
};

// Codes the planner derives per operation. A stored notice reusing one would print twice per plan.
export const derivedNoticeCodes = new Set([SHARED_SKILL_ROOT_NOTICE.code]);

export async function storedNotices(target) {
  const capabilities = await readTargetCapabilities();
  return capabilities.targets?.[target]?.notices ?? [];
}

export async function allStoredNotices() {
  const capabilities = await readTargetCapabilities();
  return Object.entries(capabilities.targets ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([target, record]) => (record.notices ?? []).map((notice) => ({ target, notice })));
}

// `outputs` carry `renderKind`; a notice surface counts as selected when an output renders it.
// Every stored notice is shown for its target, including one whose surface is filtered out.
export async function planNotices(target, outputs, installRoot = null) {
  const renderedSurfaces = new Set(outputs.map((item) => item.renderKind));
  const derived = installRoot === null ? null : sharedSkillRootNotice(outputs, installRoot);
  return [...await storedNotices(target), ...(derived ? [derived] : [])].map((notice) => ({
    ...notice,
    selected: notice.surface === "target" || renderedSurfaces.has(notice.surface),
  }));
}

// The home root is excluded: its .agents/skills is a workspace root only when the home directory
// itself is opened as a workspace, which this notice does not cover.
export function sharedSkillRootNotice(writes, installRoot) {
  if (path.resolve(installRoot) === path.resolve(os.homedir())) return null;
  const writesManualSharedSkill = writes.some(
    (item) => isSharedSkillFile(item.relativeOutput) && disablesModelInvocation(item.content),
  );
  return writesManualSharedSkill ? SHARED_SKILL_ROOT_NOTICE : null;
}

function isSharedSkillFile(relativeOutput) {
  const parts = relativeOutput.split(path.sep);
  return parts.length === 4 && parts[0] === ".agents" && parts[1] === "skills" && parts[3] === "SKILL.md";
}

function disablesModelInvocation(content) {
  if (typeof content !== "string") return false;
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!frontmatter) return false;
  const ignoredLineErrors = [];
  return parseSimpleFrontmatter(frontmatter[1], ignoredLineErrors)["disable-model-invocation"] === true;
}

// Local calendar date, so the before/after wording flips on the operator's own date.
export function localDate(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function noticeTiming(notice, today) {
  if (!notice.effective_on) return null;
  return today < notice.effective_on ? `takes effect ${notice.effective_on}` : `in effect since ${notice.effective_on}`;
}

export function noticeHeading(notice, today) {
  const details = [notice.kind, notice.surface];
  const timing = noticeTiming(notice, today);
  if (timing) details.push(timing);
  if (notice.selected === false) details.push(`${notice.surface} is not part of this selection`);
  return `${notice.code} (${details.join("; ")})`;
}

export function formatNotice(notice, today) {
  return [
    noticeHeading(notice, today),
    `  ${notice.message}`,
    `  action: ${notice.action}`,
    `  source: ${notice.source_url} (checked ${notice.checked_at})`,
  ];
}
