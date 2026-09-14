#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readCommands } from "../../scripts/agent-surface/commands.mjs";
import { readSkills } from "../../scripts/agent-surface/skills.mjs";
import { CODEX_PLUGIN_SKILLS, targetOutputs, targetProducers, targets } from "../../scripts/agent-surface/targets.mjs";
import { hasLocalOpsServerCommand, root } from "../lib/helpers.mjs";

const publishableCommandPaths = new Set(
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "commands/*.md"], {
    cwd: root,
    encoding: "utf8",
  }).split(/\r?\n/).filter(Boolean),
);
const publishableCommands = (await readCommands()).filter((command) => publishableCommandPaths.has(command.relativePath));
const publishableSkillPaths = new Set(
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "skills/*/SKILL.md"], {
    cwd: root,
    encoding: "utf8",
  }).split(/\r?\n/).filter(Boolean),
);
const publishableSkills = (await readSkills()).filter((skill) => publishableSkillPaths.has(skill.relativePath));
const allCommands = await readCommands();
const catalog = { commands: publishableCommands, skills: publishableSkills };
const localCatalog = { commands: allCommands, skills: publishableSkills };
const canonicalOpsFlow = publishableSkills.find((skill) => skill.name === "ops-flow").text;
for (const [target, adapter] of Object.entries(targets)) {
  // Export formats package a declared subset on purpose and install nowhere, so the whole-catalog
  // contract below does not apply to them. They are not simply exempt: their own narrower contract
  // is asserted after this loop.
  if (adapter.buildOnly) continue;
  if (adapter.renderSkill) {
    assert.ok(
      targetProducers(adapter).some((producer) => producer.id === "external-skills"),
      `${target}: native skill root also receives configured external skill packs`,
    );
  }
  const outputs = await targetOutputs(adapter, catalog, {
    target,
    scope: "user",
    mode: "build",
    agentName: "agent",
    categoryFilter: null,
    optionalServices: null,
  });
  const safeOutput = outputs.find((output) =>
    output.source === "skills/ops-flow/SKILL.md" && output.relativeOutput.endsWith("SKILL.md"));
  assert.ok(safeOutput, `${target}: canonical ops-flow skill emitted`);
  assert.equal(safeOutput.content, canonicalOpsFlow, `${target}: canonical skill remains unchanged`);
  assert.equal(
    outputs.some((output) => output.source === "commands/ops-nuke.md"),
    target !== "dsh",
    `${target}: manual command distribution matches the native surface`,
  );
  if (hasLocalOpsServerCommand && target !== "dsh") {
    const localOutputs = await targetOutputs(adapter, localCatalog, {
      target,
      scope: "user",
      mode: "build",
      agentName: "agent",
      categoryFilter: null,
      optionalServices: null,
    });
    assert.equal(
      localOutputs.some((output) => output.source === "commands/ops-server.md"),
      true,
      `${target}: private local ops-server command is distributed`,
    );
  }
  for (const optionalPack of ["external/archify/", "external/sanyuan-skills/"]) {
    assert.equal(
      outputs.some((output) => output.source.startsWith(optionalPack)),
      true,
      `${target}: optional pack ${optionalPack} is distributed`,
    );
  }
}
// ---- what an export format IS held to ------------------------------------------------------
// Exempting it above would be a silent hole without this: the package must carry exactly the skills
// it declares, rendered from the canonical source rather than a packaging-only copy, and must not
// quietly grow into a second distribution channel for the whole catalog.
for (const [target, adapter] of Object.entries(targets)) {
  if (!adapter.buildOnly) continue;
  const outputs = await targetOutputs(adapter, catalog, {
    target, scope: "user", mode: "build", agentName: "agent", categoryFilter: null, optionalServices: null,
  });
  const packagedSkills = outputs.filter((output) => output.relativeOutput.endsWith("SKILL.md"));
  assert.deepEqual(
    packagedSkills.map((output) => output.source).sort(),
    CODEX_PLUGIN_SKILLS.map((name) => `skills/${name}/SKILL.md`).sort(),
    `${target}: packages exactly the skills it declares`,
  );
  for (const output of packagedSkills) {
    const skill = publishableSkills.find((item) => item.relativePath === output.source);
    assert.equal(output.content, skill.text, `${target}: ${skill.name} is the canonical source, not a packaging-only copy`);
  }
  // Its companions travel with it — the reason the package is worth building at all.
  const packagedSkill = publishableSkills.find((item) => item.relativePath === packagedSkills[0].source);
  for (const resource of packagedSkill.resources) {
    assert.ok(
      outputs.some((output) => output.source === resource.relativePath && output.content === resource.text),
      `${target}: ${resource.resourcePath} is packaged with its skill`,
    );
  }
  assert.equal(outputs.some((output) => output.source.startsWith("external/")), false, `${target}: an export pilot does not quietly redistribute external packs`);
}

console.log("matrix: ok");
