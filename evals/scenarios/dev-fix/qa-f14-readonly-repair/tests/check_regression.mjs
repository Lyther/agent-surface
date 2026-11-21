// Hidden check: a kept read-only file that lost its execute bit is repaired without rewriting it.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const tree = path.resolve(process.argv[2] ?? ".");
if (process.getuid?.() === 0) {
  console.error("the check must run unprivileged: root writes through read-only files");
  process.exit(2);
}
chmodSync(path.join(tree, "skills/ops-docs/references/sop-template.md"), 0o755); // a companion that declares itself executable

const dest = mkdtempSync(path.join(os.tmpdir(), "f14-"));
const installed = path.join(dest, ".cline/skills/ops-docs/references/sop-template.md");
const install = (extra = []) => spawnSync("node", ["scripts/agent-surface.mjs", "install", "--target", "cline", "--dest", dest, ...extra], { cwd: tree, encoding: "utf8" });

try {
  const first = install();
  assert.equal(first.status, 0, `first install: ${first.stdout}${first.stderr}`);
  const bytes = readFileSync(installed, "utf8");

  for (const drifted of [0o444, 0o400, 0o644, 0o655]) {
    chmodSync(installed, drifted);
    const preview = install(["--dry-run"]);
    assert.equal(preview.status, 0, `${drifted.toString(8)} dry run: ${preview.stdout}${preview.stderr}`);
    const repair = install();
    assert.equal(repair.status, 0, `${drifted.toString(8)} repair failed: ${repair.stdout}${repair.stderr}`);
    assert.ok((statSync(installed).mode & 0o100) !== 0, `${drifted.toString(8)} owner can run the companion again`);
    assert.equal(readFileSync(installed, "utf8"), bytes, `${drifted.toString(8)} bytes unchanged`);
  }
  console.log("f14 regression check: ok");
} finally {
  rmSync(dest, { recursive: true, force: true });
}
