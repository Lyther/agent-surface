// grimoire — row entities + mappers + the id codec + the canonical runtime schema
// (mirrors schema.sql). Pure: no node:sqlite, no fs, no Date.
import { LIMITS, SLUG_RE, type FileManifestEntry, type Provenance, type SkillFull, type SkillHit, type SkillRef } from "./contract.js";

export const SCHEMA_VERSION = 1;

// External id codec. id = "<pack>:<skillName>"; both segments are slugs (no ":"),
// so decId splits on the FIRST ":". Ids are content-independent → stable across rebuilds.
export const extId = (pack: string, name: string): string => `${pack}:${name}`;
export function decId(id: string): { pack: string; name: string } | null {
  const i = id.indexOf(":");
  if (i <= 0 || i === id.length - 1) return null;
  const pack = id.slice(0, i);
  const name = id.slice(i + 1);
  if (!SLUG_RE.test(pack) || !SLUG_RE.test(name)) return null;
  return { pack, name };
}

// Derived category = the leading token of the skill name (before the first "-"),
// mapped to a small fixed set; everything else → "other". Never authoritative.
export const CATEGORIES = new Set([
  "analyzing", "detecting", "conducting", "building", "configuring", "auditing",
  "collecting", "deploying", "implementing", "performing", "hunting", "exploiting",
  "reverse", "hardening", "investigating", "monitoring", "responding", "scanning",
  "testing", "writing", "creating", "designing", "managing", "reviewing",
]);
export function deriveCategory(name: string): { category: string; categorySource: "derived" } {
  const head = name.split("-", 1)[0] ?? "";
  return { category: CATEGORIES.has(head) ? head : "other", categorySource: "derived" };
}

// Inlined so the compiled server needs no file lookup. Keep in sync with schema.sql.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS skills (
  id              TEXT PRIMARY KEY,
  pack            TEXT NOT NULL,
  name            TEXT NOT NULL,
  source_path     TEXT NOT NULL,
  source_commit   TEXT NOT NULL,
  sha256          TEXT NOT NULL,
  indexed_at      TEXT NOT NULL,
  description     TEXT NOT NULL,
  body            TEXT NOT NULL,
  category        TEXT NOT NULL,
  category_source TEXT NOT NULL DEFAULT 'derived' CHECK (category_source IN ('derived')),
  UNIQUE (pack, name)
);
CREATE INDEX IF NOT EXISTS idx_skills_pack_category ON skills(pack, category);
CREATE TABLE IF NOT EXISTS skill_files (
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  content  TEXT NOT NULL,
  sha256   TEXT NOT NULL,
  size     INTEGER NOT NULL,
  PRIMARY KEY (skill_id, rel_path)
);
CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
  name, description, body,
  content='skills', content_rowid='rowid',
  tokenize='porter unicode61'
);
CREATE TABLE IF NOT EXISTS index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export interface SkillRow {
  id: string; pack: string; name: string; source_path: string; source_commit: string;
  sha256: string; indexed_at: string; description: string; body: string;
  category: string; category_source: string;
}
export interface SkillFileRow { skill_id: string; rel_path: string; content: string; sha256: string; size: number }

const summarize = (description: string): string =>
  description.length > LIMITS.SUMMARY_CHARS ? description.slice(0, LIMITS.SUMMARY_CHARS - 1) + "…" : description;

export type RefRow = Pick<SkillRow, "id" | "pack" | "name" | "description">;

export function rowToRef(r: RefRow): SkillRef {
  return { id: r.id, pack: r.pack, name: r.name, summary: summarize(r.description) };
}
export function rowToHit(r: RefRow, score: number): SkillHit {
  return { ...rowToRef(r), score };
}
export function rowToFull(r: SkillRow, files: FileManifestEntry[]): SkillFull {
  const provenance: Provenance = {
    sourcePath: r.source_path, sourceCommit: r.source_commit, sha256: r.sha256, indexedAt: r.indexed_at,
  };
  return {
    id: r.id, pack: r.pack, name: r.name, description: r.description, body: r.body,
    category: r.category, categorySource: "derived", files, provenance,
  };
}
