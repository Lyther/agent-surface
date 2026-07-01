// Post-process: normalize emitted external-skill content so it loads in strict hosts,
// WITHOUT editing the pinned upstream submodule. Applied at emit time, so it re-runs on
// every build/install from current upstream — no fork, no cherry-pick. Separate from the
// emit itself (which decides *which* files go where); this only shapes their bytes.
import path from "node:path";

const BOM = "﻿";

// Strip a leading UTF-8 BOM and, for a SKILL.md that lost its frontmatter, synthesize a
// minimal valid one from the skill slug. Everything else passes through untouched.
export function normalizeExternalSkillFile(relativeFile, content, skillName) {
  let out = content.startsWith(BOM) ? content.slice(BOM.length) : content;
  if (path.basename(relativeFile) === "SKILL.md" && !out.startsWith("---")) {
    const description = skillName.replace(/-/g, " ");
    out = `---\nname: ${skillName}\ndescription: ${description}\n---\n\n${out}`;
  }
  return out;
}
