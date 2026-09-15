#!/usr/bin/env node
// A host posix_spawns an MCP stdio command with no shell, so a bare command name only launches when
// its directory is already on the launching runtime's PATH. For an externally-installed server whose
// location is not fixed by agent-surface, the installer must DETECT the real executable and wire its
// absolute path — not assume one directory. This suite reproduces, through the actual installer, the
// two install layouts a hard-coded path gets wrong, plus the absent case that must degrade quietly.
//
// pentest-ai is the pilot: an opt-in MCP with a detection-only prerequisite (no install recipe). The
// fake executables here stand in for a real install; detection is by path and PATH lookup, so their
// location is the whole point and their contents are irrelevant.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cli } from "../lib/helpers.mjs";

if (process.platform === "win32") {
  // Detection and the fake binaries are POSIX-shaped here; the resolution logic is platform-shared
  // and covered on POSIX. A Windows-native harness would use .exe paths and a different PATH lookup.
  console.log("mcp-launch-resolve: skipped on win32 (POSIX detection layouts)");
} else {
  const dir = mkdtempSync(path.join(os.tmpdir(), "as-launch-resolve-"));
  // The wired pentest-ai command after an install run with a controlled HOME and PATH. A fake
  // executable is planted at `binDir` (a real one would be installed by pipx/uv); nothing else on the
  // sanitized PATH provides the command, so what resolves is exactly what detection found.
  const wiredCommand = (label, { binDir, onPath }) => {
    const home = path.join(dir, `${label}-home`);
    const dest = path.join(dir, `${label}-dest`);
    mkdirSync(home, { recursive: true });
    mkdirSync(dest, { recursive: true });
    if (binDir) {
      const abs = path.join(dir, binDir);
      mkdirSync(abs, { recursive: true });
      const exe = path.join(abs, "pentest-ai");
      writeFileSync(exe, "#!/bin/sh\n:\n");
      chmodSync(exe, 0o755);
    }
    const detectPath = onPath ? `${path.join(dir, onPath)}:/usr/bin:/bin` : "/usr/bin:/bin";
    const result = spawnSync(
      process.execPath,
      [cli, "install", "--target", "droid", "--dest", dest, "--category", "mcps", "--service", "pentest-ai", "--allow-scope-root", "-y"],
      { encoding: "utf8", env: { HOME: home, USERPROFILE: home, PATH: detectPath } },
    );
    // The install must never fail merely because an opt-in tool is or is not present.
    assert.equal(result.status, 0, `${label}: install exited ${result.status}: ${result.stderr || result.stdout}`);
    const configPath = path.join(dest, ".factory", "mcp.json");
    if (!existsSync(configPath)) return null;
    return JSON.parse(readFileSync(configPath, "utf8")).mcpServers?.["pentest-ai"]?.command ?? null;
  };

  try {
    // The default pipx/uv location, with the directory NOT on PATH — the exact case a runtime spawned
    // outside a login shell fails to launch a bare command. Detection resolves it by path.
    const homeLocal = path.join("default-home", ".local", "bin");
    const defaultCase = wiredCommand("default", { binDir: homeLocal });
    assert.ok(defaultCase && path.isAbsolute(defaultCase), `default-location install must wire an absolute path, got: ${defaultCase}`);
    assert.equal(path.basename(defaultCase), "pentest-ai", "and it points at the detected executable");
    assert.ok(defaultCase.includes(path.join(".local", "bin")), `resolved from the default location, got: ${defaultCase}`);

    // A supported alternate layout: the executable lives in a directory that IS on PATH but is not
    // ~/.local/bin (uv honours UV_TOOL_BIN_DIR; MOMO's Kali image sets it to /usr/local/bin). A path
    // hard-coded to ~/.local/bin would be ENOENT here; detection must follow PATH instead.
    const altCase = wiredCommand("alternate", { binDir: "altbin", onPath: "altbin" });
    assert.ok(altCase && path.isAbsolute(altCase), `alternate-PATH install must wire an absolute path, got: ${altCase}`);
    assert.ok(altCase.includes("altbin"), `resolved from the on-PATH alternate directory, not ~/.local/bin, got: ${altCase}`);

    // Not installed anywhere the installer can see. There is no absolute path to wire, so the bare
    // command is the honest fallback (it launches if the runtime later has it on PATH) and the run
    // still succeeds — selecting an opt-in service must not fail just because its tool is absent.
    const absentCase = wiredCommand("absent", {});
    assert.equal(absentCase, "pentest-ai", `an undetectable tool falls back to the bare command, got: ${absentCase}`);

    console.log("mcp-launch-resolve: ok");
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
