#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "scripts", "agent-surface.mjs");

function run(args, options = {}) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
}

function status(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...files(full));
    if (name.isFile()) out.push(full);
  }
  return out;
}

rmSync(path.join(root, "dist"), { recursive: true, force: true });

assert.equal(run(["check"]).trim(), "check: ok");

const inventory = run(["inventory"]);
assert.match(inventory, /^rules: 11$/m);
assert.match(inventory, /^commands: 58$/m);

const genericRules = run(["check", "rules", "--scenario", "generic-chat"]);
assert.match(genericRules, /^generic-chat:$/m);
assert.match(genericRules, /rules\/00-precedence-and-safety\.mdc/);
assert.doesNotMatch(genericRules, /^errors:$/m);

for (const scenario of ["python-source", "python-tooling", "rust-source", "go-ci", "typescript-eslint", "shell-script"]) {
  const output = run(["check", "rules", "--scenario", scenario]);
  assert.match(output, new RegExp(`^${scenario}:$`, "m"));
  assert.doesNotMatch(output, /^errors:$/m);
}

run(["build", "--target", "all"]);
const generated = files(path.join(root, "dist"));
assert.equal(generated.length, 174);

const antigravity = readFileSync(
  path.join(root, "dist", "antigravity", "global_workflows", "workflow-boss.md"),
  "utf8",
);
assert.match(antigravity, /^---\ndescription: "/);

const gemini = readFileSync(path.join(root, "dist", "gemini-cli", ".gemini", "commands", "workflow", "boss.toml"), "utf8");
assert.match(gemini, /^description = "Run workflow boss\."/);
assert.equal(generated.some((file) => file.endsWith("dist/gemini-cli/.gemini/commands/workflow-boss.md")), false);

const clinePlan = run(["install", "--target", "cline", "--dest", "/tmp/agent-surface-cline", "--dry-run"]);
assert.match(clinePlan, /^target: cline$/m);
assert.match(clinePlan, /\.clinerules\/workflows\/workflow-boss\.md <- commands\/workflow-boss\.md/);
assert.match(clinePlan, /\.agent-surface\/cline-manifest\.json/);

const geminiPlan = run(["install", "--target", "gemini-cli", "--dest", "/tmp/agent-surface-gemini", "--dry-run"]);
assert.match(geminiPlan, /^target: gemini-cli$/m);
assert.match(geminiPlan, /\.gemini\/commands\/workflow\/boss\.toml <- commands\/workflow-boss\.md/);

const staleDest = "/tmp/agent-surface-stale";
rmSync(staleDest, { recursive: true, force: true });
mkdirSync(path.join(staleDest, ".agent-surface"), { recursive: true });
writeFileSync(
  path.join(staleDest, ".agent-surface", "cline-manifest.json"),
  JSON.stringify({
    target: "cline",
    scope: "project",
    managed: [
      {
        target: "cline",
        output: ".clinerules/workflows/removed.md",
        managed_by: "agent-surface",
      },
    ],
  }),
);
const stalePlan = run(["install", "--target", "cline", "--dest", staleDest, "--dry-run"]);
assert.match(stalePlan, /would remove stale managed files:\n  \.clinerules\/workflows\/removed\.md/);
rmSync(staleDest, { recursive: true, force: true });

const unsafeInstall = status(["install", "--target", "cline"]);
assert.notEqual(unsafeInstall.status, 0);
assert.match(unsafeInstall.stderr, /requires --dry-run/);

const invalidScope = status(["install", "--target", "cline", "--scope", "workspace", "--dry-run"]);
assert.notEqual(invalidScope.status, 0);
assert.match(invalidScope.stderr, /unsupported install scope/);

const clineUserScope = status(["install", "--target", "cline", "--scope", "user", "--dry-run"]);
assert.notEqual(clineUserScope.status, 0);
assert.match(clineUserScope.stderr, /supports --scope project only/);

const allSource = files(root)
  .filter((file) => !file.includes(`${path.sep}.git${path.sep}`))
  .filter((file) => !file.includes(`${path.sep}dist${path.sep}`));
assert.equal(allSource.some((file) => file.endsWith("commands/ops-server.md")), false);

rmSync(path.join(root, "dist"), { recursive: true, force: true });

console.log("test: ok");
