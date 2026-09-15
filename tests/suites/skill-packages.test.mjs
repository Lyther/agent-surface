#!/usr/bin/env node
// A skill is a directory, and its companion files are part of what gets installed. The half of that
// contract this suite covers is the destructive half: what happens when a companion DISAPPEARS from
// the source. Proving it requires deleting a tracked file between two installs, so everything here
// runs against a DISPOSABLE COPY of the checkout. Mutating the real one would be unsafe in a shared
// tree — a killed process skips any restore, and a concurrent edit would be clobbered by it.
//
// The installer, the registry, and the skill sources are the real ones; only their location differs.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { root } from "../lib/helpers.mjs";

// Copy the WORKING TREE's tracked sources (not HEAD — the point is to exercise the current code),
// minus the external submodules, which are large and read-only here and so are linked instead.
function disposableCheckout() {
  const checkout = mkdtempSync(path.join(os.tmpdir(), "as-skill-pkg-"));
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter((file) => file.length > 0 && !file.startsWith("external/"));
  for (const file of tracked) {
    const destination = path.join(checkout, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(root, file), destination);
  }
  for (const linked of ["node_modules", "external"]) {
    const source = path.join(root, linked);
    if (existsSync(source)) symlinkSync(source, path.join(checkout, linked));
  }
  return checkout;
}

const checkout = disposableCheckout();
const dest = path.join(checkout, "installed");
try {
  const cli = path.join(checkout, "scripts", "agent-surface.mjs");
  assert.ok(existsSync(cli), "the disposable checkout carries the installer it will run");
  const sourceSkill = path.join(checkout, "skills", "ops-swarm");
  const companion = path.join(sourceSkill, "references", "report-template.md");
  assert.ok(existsSync(companion), "the pilot skill's companion exists in the disposable checkout");

  const install = (target) => {
    const result = spawnSync(process.execPath, [cli, "install", "--target", target, "--dest", dest], { cwd: checkout, encoding: "utf8" });
    assert.equal(result.status, 0, `${target} install failed: ${result.stderr || result.stdout}`);
    return result.stdout;
  };
  const installedSkillDir = (target) => {
    const manifest = JSON.parse(readFileSync(path.join(dest, ".agent-surface", `${target}-manifest.json`), "utf8"));
    const entry = manifest.managed.find((item) => item.output.endsWith(path.join("ops-swarm", "SKILL.md")));
    assert.ok(entry, `${target}: the pilot skill was installed`);
    return path.join(dest, path.dirname(entry.output));
  };

  // Two adapters with DIFFERENT skill roots, so what this proves is the ownership layer's behavior
  // rather than one adapter's arrangement.
  for (const target of ["codex", "copilot"]) {
    install(target);
    const skillDir = installedSkillDir(target);
    assert.ok(existsSync(path.join(skillDir, "references", "report-template.md")), `${target}: the companion installed`);
    assert.ok(existsSync(path.join(skillDir, "references", "runtime-catalog.md")), `${target}: so did its siblings`);

    // A file the operator put inside the managed directory. It is not ours, so it must survive.
    const operatorFile = path.join(skillDir, "references", "operator-note.md");
    writeFileSync(operatorFile, "operator note\n");

    rmSync(companion);
    install(target);
    assert.ok(!existsSync(path.join(skillDir, "references", "report-template.md")), `${target}: a companion deleted at the source is removed from the install`);
    assert.ok(existsSync(path.join(skillDir, "references", "runtime-catalog.md")), `${target}: its siblings are untouched`);
    assert.ok(existsSync(operatorFile), `${target}: an unmanaged file in the same directory is preserved`);
    assert.ok(existsSync(path.join(skillDir, "SKILL.md")), `${target}: the skill itself is untouched`);

    // Restoring it at the source brings it back: removal is reconciliation, not a one-way delete.
    writeFileSync(companion, readFileSync(path.join(root, "skills", "ops-swarm", "references", "report-template.md")));
    install(target);
    assert.ok(existsSync(path.join(skillDir, "references", "report-template.md")), `${target}: restoring the source companion reinstalls it`);
    assert.equal(
      readFileSync(path.join(skillDir, "references", "report-template.md"), "utf8"),
      readFileSync(companion, "utf8"),
      `${target}: and it arrives with its source contents`,
    );
  }

  // An executable companion, delivered by BOTH writers. `install` and `build` materialize outputs
  // independently, and an export target is buildOnly — so for that target dist/ is not a preview,
  // it is the artifact handed to a plugin manager. A script that arrives there unrunnable is broken
  // at the only point it ever gets written. Running it is the assertion; a mode bit could be right
  // while the file is not actually executable by the OS.
  if (process.platform !== "win32") {
    const script = path.join(sourceSkill, "references", "probe.sh");
    writeFileSync(script, "#!/bin/sh\necho companion-ran\n");
    chmodSync(script, 0o755);

    install("codex");
    const installed = path.join(installedSkillDir("codex"), "references", "probe.sh");
    assert.equal(spawnSync(installed, { encoding: "utf8" }).stdout.trim(), "companion-ran", "an executable companion runs from where install put it");

    const built = spawnSync(process.execPath, [cli, "build", "--target", "codex-plugin"], { cwd: checkout, encoding: "utf8" });
    assert.equal(built.status, 0, `export build failed: ${built.stderr || built.stdout}`);
    const exported = path.join(checkout, "dist", "codex-plugin", "plugins", "agent-surface", "skills", "ops-swarm", "references", "probe.sh");
    assert.ok(existsSync(exported), "the export package carries the executable companion");
    assert.equal(spawnSync(exported, { encoding: "utf8" }).stdout.trim(), "companion-ran", "and it runs straight out of the exported package");

    rmSync(script);
    install("codex");
    assert.ok(!existsSync(installed), "removing it at the source removes the installed copy too");
  }

  assert.equal(readFileSync(path.join(root, "skills", "ops-swarm", "references", "report-template.md"), "utf8").length > 0, true, "the real checkout was never the thing being mutated");
  assert.ok(!existsSync(path.join(root, "skills", "ops-swarm", "references", "probe.sh")), "and the probe script never existed in it");
} finally {
  rmSync(checkout, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

console.log("skill-packages: ok");
