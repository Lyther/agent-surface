// Rule sources: load rules/*.mdc and parse their frontmatter (description, alwaysApply,
// globs). Parsing only — reference validation + rendering live in the check/render layers.
import { readFile } from "node:fs/promises";
import { files } from "./fs-tree.mjs";
import { relative } from "./registry.mjs";

export async function readRules() {
  const ruleFiles = await files("rules", [".mdc"]);
  const rules = [];

  for (const file of ruleFiles) {
    const text = await readFile(file, "utf8");
    rules.push(parseRule(file, text));
  }

  return rules;
}

export function parseRule(file, text) {
  const out = {
    file: relative(file),
    text,
    description: null,
    alwaysApply: null,
    globs: [],
    frontmatterErrors: [],
  };

  if (!text.startsWith("---\n")) {
    out.frontmatterErrors.push("frontmatter missing");
    return out;
  }

  const end = text.indexOf("\n---\n", 4);
  if (end === -1) {
    out.frontmatterErrors.push("frontmatter not closed");
    return out;
  }

  const lines = text.slice(4, end).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const description = line.match(/^description:\s*"?(.*?)"?\s*$/);
    if (description) {
      out.description = description[1];
      continue;
    }

    const alwaysApply = line.match(/^alwaysApply:\s*(true|false)\s*$/);
    if (alwaysApply) {
      out.alwaysApply = alwaysApply[1] === "true";
      continue;
    }

    if (line.match(/^globs:\s*$/)) {
      for (let globIndex = index + 1; globIndex < lines.length; globIndex += 1) {
        const glob = lines[globIndex].match(/^\s+-\s*"?(.*?)"?\s*$/);
        if (!glob) break;
        out.globs.push(glob[1]);
        index = globIndex;
      }
    }
  }

  if (!out.description) out.frontmatterErrors.push("frontmatter description missing");
  if (out.alwaysApply === null) out.frontmatterErrors.push("frontmatter alwaysApply missing");
  return out;
}
