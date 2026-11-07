// Subprocess helpers: version probes + git queries. Thin wrappers over spawnSync so callers
// don't repeat encoding/cwd/error handling.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { root } from "./registry.mjs";

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

export function gitIgnoredPaths(paths) {
  if (paths.length === 0) return new Set();
  const topLevel = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8",
  });
  if (topLevel.status !== 0 || path.resolve(topLevel.stdout.trim()) !== path.resolve(root)) {
    return new Set();
  }
  const result = spawnSync("git", ["check-ignore", "--stdin", "-z"], {
    cwd: root,
    encoding: "utf8",
    input: `${paths.join("\0")}\0`,
  });
  if (![0, 1].includes(result.status)) return new Set();
  return new Set(result.stdout.split("\0").filter(Boolean));
}
