// Rule sources: every rules/*.md file is plain Markdown that applies to every request, named by its
// file name. Parsing only — reference validation + rendering live in the check/render layers.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { files } from "./fs-tree.mjs";
import { relative } from "./registry.mjs";

export async function readRules() {
  const ruleFiles = await files("rules", [".md"]);
  const rules = [];

  for (const file of ruleFiles) {
    const text = await readFile(file, "utf8");
    rules.push({ file: relative(file), name: path.basename(file, ".md"), text });
  }

  return rules;
}
