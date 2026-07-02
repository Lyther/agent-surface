// Subprocess helpers: version probes + git queries. Thin wrappers over spawnSync so callers
// don't repeat encoding/cwd/error handling.
import { spawnSync } from "node:child_process";
import process from "node:process";
import { root } from "./registry.mjs";
import { fail } from "./util.mjs";

export function commandVersion(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) return "missing";
  const output = `${result.stdout}${result.stderr}`.trim().split(/\r?\n/)[0];
  return output || `exit ${result.status}`;
}

export function gitSubmoduleStatusMap() {
  const result = spawnSync("git", ["submodule", "status"], { encoding: "utf8", cwd: root });
  if (result.status !== 0 || !result.stdout) return new Map();
  const map = new Map();
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^[+\-U ]?([0-9a-f]{40})\s+(\S+)/);
    if (match) map.set(match[2], match[1]);
  }
  return map;
}

export function gitStagedGitlinkMap() {
  const result = spawnSync("git", ["ls-files", "--stage", "external"], { encoding: "utf8", cwd: root });
  if (result.status !== 0 || !result.stdout) return new Map();
  const map = new Map();
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^160000 ([0-9a-f]{40}) \d+\t(.+)$/);
    if (match) map.set(match[2], match[1]);
  }
  return map;
}

export function gitValue(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

export function gitOutput(args, env = process.env) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    fail(`git ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

export async function gitLines(args) {
  return gitOutput(args).split(/\r?\n/).filter(Boolean);
}
