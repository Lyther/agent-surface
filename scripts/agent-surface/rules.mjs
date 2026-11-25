// Rule sources: every rules/*.md file is plain Markdown that applies to every request, named by its
// file name. Parsing only — reference validation + rendering live in the check/render layers.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { files } from "./fs-tree.mjs";
import {
  assetCategoryAllowed,
  assetCategoryFor,
  readAssetCategories,
  relative,
  selectedAssetCategories,
} from "./registry.mjs";

export async function readRules() {
  const ruleFiles = await files("rules", [".md"]);
  const rules = [];

  for (const file of ruleFiles) {
    const text = await readFile(file, "utf8");
    rules.push({ file: relative(file), name: path.basename(file, ".md"), text });
  }

  return rules;
}

// The general rules come first and each category's rules follow in registry order. Kilo keeps
// instruction entries in the order installs add them, so a single `--category everything` install
// and the general-then-category sequence list the rules the same way only in this order.
export async function readRulesForContext(context = {}, { includeBaseline = false } = {}) {
  const categories = await readAssetCategories();
  const categoryOrder = Object.keys(categories);
  const rank = (category) => (category === null ? -1 : categoryOrder.indexOf(category));
  const selectedCategories = selectedAssetCategories(context.categoryFilter);
  return (await readRules()).map((rule) => ({
    ...rule,
    assetCategory: assetCategoryFor(categories, "rules", rule.name),
  })).filter((rule) => assetCategoryAllowed(context, rule.assetCategory)
    || (includeBaseline && selectedCategories.size > 0 && rule.assetCategory === null))
    .sort((left, right) => rank(left.assetCategory) - rank(right.assetCategory));
}
