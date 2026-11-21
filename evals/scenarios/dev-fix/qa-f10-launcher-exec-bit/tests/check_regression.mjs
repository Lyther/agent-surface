// Hidden check: a launcher the current user cannot execute must not read as available.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const tree = path.resolve(process.argv[2] ?? ".");
if (process.getuid?.() === 0) {
  console.error("the check must run unprivileged: root passes any execute-access test");
  process.exit(2);
}
const { detectPrerequisite, isExecutableFile, whichSync } = await import(pathToFileURL(path.join(tree, "scripts/agent-surface/provision.mjs")).href);

const dir = mkdtempSync(path.join(os.tmpdir(), "f10-"));
try {
  const launcher = (name, mode) => {
    const file = path.join(dir, name);
    writeFileSync(file, "#!/bin/sh\nexit 0\n");
    chmodSync(file, mode);
    return file;
  };
  const owned = launcher("tool", 0o755);
  const groupOther = launcher("tool-go", 0o655);
  const otherOnly = launcher("tool-o", 0o601);
  const plain = launcher("tool-plain", 0o644);
  const folder = path.join(dir, "folder");
  mkdirSync(folder, { mode: 0o755 });

  assert.equal(isExecutableFile(owned, "linux"), true, "0755 owner launcher is usable");
  assert.equal(isExecutableFile(groupOther, "linux"), false, "0655 launcher is not runnable by its owner");
  assert.equal(isExecutableFile(otherOnly, "linux"), false, "0601 launcher is not runnable by its owner");
  assert.equal(isExecutableFile(plain, "linux"), false, "0644 file is not a launcher");
  assert.equal(isExecutableFile(folder, "linux"), false, "a directory is not a launcher");
  assert.equal(whichSync("tool-go", { platform: "linux", env: { PATH: dir } }), null, "PATH lookup skips the 0655 launcher");
  assert.equal(whichSync("tool", { platform: "linux", env: { PATH: dir } }), owned, "PATH lookup still finds the 0755 launcher");

  const prereq = (target) => ({ id: "svc", kind: "binary", detect: { paths: [target] }, recipes: {} });
  const status = (target) => detectPrerequisite(prereq(target), { platform: "linux", homedir: dir, env: { PATH: dir }, execPath: process.execPath });
  assert.equal(status(owned).satisfied, true, "an owner-runnable launcher satisfies the prerequisite");
  assert.equal(status(groupOther).satisfied, false, "the 0655 launcher does not satisfy the prerequisite");
  console.log("f10 regression check: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
