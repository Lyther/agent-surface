// Hidden check: reinstalling unchanged content never changes a kept file's read or write bits.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const tree = path.resolve(process.argv[2] ?? ".");
if (process.getuid?.() === 0) {
  console.error("the check must run unprivileged");
  process.exit(2);
}
const companionSource = path.join(tree, "skills/ops-docs/references/sop-template.md");
chmodSync(companionSource, 0o755); // a companion that declares itself executable

process.umask(0o077);
const dest = mkdtempSync(path.join(os.tmpdir(), "f13-"));
const installed = path.join(dest, ".cline/skills/ops-docs/references/sop-template.md");
const install = (extra = []) => spawnSync("node", ["scripts/agent-surface.mjs", "install", "--target", "cline", "--dest", dest, ...extra], { cwd: tree, encoding: "utf8" });
const mode = () => statSync(installed).mode & 0o777;

try {
  const first = install();
  assert.equal(first.status, 0, `first install: ${first.stdout}${first.stderr}`);
  const bytes = readFileSync(installed, "utf8");

  for (const kept of [0o700, 0o750, 0o755, 0o500]) {
    chmodSync(installed, kept);
    const preview = install(["--dry-run"]);
    assert.equal(preview.status, 0, `${kept.toString(8)} dry run: ${preview.stdout}${preview.stderr}`);
    assert.equal(mode(), kept, `${kept.toString(8)} dry run left the mode`);
    const again = install();
    assert.equal(again.status, 0, `${kept.toString(8)} reinstall: ${again.stdout}${again.stderr}`);
    assert.equal(mode().toString(8), kept.toString(8), `reinstall under umask 077 kept ${kept.toString(8)}`);
    assert.equal(readFileSync(installed, "utf8"), bytes, "bytes unchanged");
  }
  console.log("f13 regression check: ok");
} finally {
  rmSync(dest, { recursive: true, force: true });
}
