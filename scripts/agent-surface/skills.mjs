// Canonical Agent Skills: load direct skills/<name>/SKILL.md entries and parse
// their standard frontmatter. Validation lives in the check layer.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { directDirectories, filesUnder } from "./fs-tree.mjs";
import { parseSimpleFrontmatter } from "./commands.mjs";
import { relative, root } from "./registry.mjs";

// A skill is a directory, so it may carry the material its SKILL.md references. Companion files are
// admitted by the same extension allowlist the external packs use and read as UTF-8 text: what ships
// is reviewable source, and binary assets are simply not carried rather than carried unverified.
export const SKILL_RESOURCE_EXTENSIONS = [".md", ".mdx", ".json", ".yaml", ".yml", ".toml", ".txt", ".html", ".sh", ".py", ".js", ".mjs", ".ts", ".ps1", "LICENSE"];

export async function readSkills() {
  const skillRoot = path.join(root, "skills");
  const skills = [];

  for (const directory of await directDirectories(skillRoot)) {
    const file = path.join(directory, "SKILL.md");
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    skills.push({ ...parseSkill(file, text), resources: await readSkillResources(directory, file) });
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

async function readSkillResources(directory, skillFile) {
  const resources = [];
  for (const file of await filesUnder(directory, SKILL_RESOURCE_EXTENSIONS)) {
    if (file === skillFile) continue;
    // POSIX separators: this is the path the skill body references and the suffix of the installed
    // output, so it must read the same way on every platform.
    const resourcePath = path.relative(directory, file).split(path.sep).join("/");
    resources.push({
      file,
      relativePath: relative(file),
      resourcePath,
      text: await readFile(file, "utf8"),
      // Carried so a referenced script stays runnable where the filesystem expresses that bit.
      executable: ((await stat(file)).mode & 0o111) !== 0,
    });
  }
  return resources;
}

export function parseSkill(file, text) {
  const name = path.basename(path.dirname(file));
  const metadata = {};
  const frontmatterErrors = [];
  let body = text;
  let hasFrontmatter = false;

  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---\n", 4);
    if (end === -1) {
      frontmatterErrors.push("frontmatter not closed");
    } else {
      hasFrontmatter = true;
      Object.assign(metadata, parseSimpleFrontmatter(text.slice(4, end), frontmatterErrors));
      body = text.slice(end + 5).replace(/^\s+/, "");
    }
  }

  return {
    file,
    relativePath: relative(file),
    name,
    text,
    body,
    metadata,
    hasFrontmatter,
    frontmatterErrors,
    sourceKind: "skills",
  };
}
