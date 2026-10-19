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

// Goose resolves its config home from XDG_CONFIG_HOME when that is set (goose 1.34.1 reports the
// resolved config.yaml in `goose info`), while an install writes the default config home: the
// client's environment is not known at install time, as for the other XDG-aware targets.
const GOOSE_XDG_CONFIG_NOTICE = {
  code: "GOOSE_XDG_CONFIG_HOME_SET",
  kind: "compatibility",
  surface: "mcp",
  message: "XDG_CONFIG_HOME names a directory other than the config home this plan writes, and Goose resolves config.yaml under XDG_CONFIG_HOME when it is set. A Goose launched with this environment will not read the merged MCP entries.",
  action: "Copy the merged `extensions` entries into $XDG_CONFIG_HOME/goose/config.yaml; a later install writes the default config home again. For an install into the profile home, launching Goose without XDG_CONFIG_HOME also reads the written file.",
  source_url: "https://goose-docs.ai/docs/guides/config-files",
  checked_at: "2026-10-19",
};

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

// Every stored notice is shown for its target; an install also gets the notices its writes derive.
export async function planNotices(target, writes = [], installRoot = null, configMerges = []) {
  const derived = installRoot === null ? [] : [
    sharedSkillRootNotice(writes, installRoot),
    gooseXdgConfigNotice(target, configMerges, installRoot),
  ].filter(Boolean);
  return [...await storedNotices(target), ...derived];
}

// The written route is the config home under the install root, so a XDG_CONFIG_HOME that resolves
// there is the same file and needs no notice. Only a merge that carries extensions counts: a
// Windows user reinstall prunes this same legacy path while its own config lives under AppData,
// which XDG_CONFIG_HOME has no part in.
export function gooseXdgConfigNotice(target, configMerges, installRoot, env = process.env) {
  if (target !== "goose") return null;
  const route = path.join(".config", "goose", "config.yaml");
  const mergesExtensions = configMerges.some(
    (item) => item.relativeOutput === route && (item.entries?.length ?? 0) > 0,
  );
  if (!mergesExtensions) return null;
  const configured = (env.XDG_CONFIG_HOME ?? "").trim();
  if (!configured) return null;
  return path.resolve(configured) === path.resolve(installRoot, ".config") ? null : GOOSE_XDG_CONFIG_NOTICE;
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
