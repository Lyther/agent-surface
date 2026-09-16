#!/usr/bin/env node
// A host posix_spawns an MCP stdio command with no shell, so a bare command name only launches when
// its directory is already on the launching runtime's PATH. For an externally-installed server whose
// location agent-surface does not fix, the installer must DETECT the real executable and wire its
// absolute path — not assume one directory.
//
// NOTHING HERE IS A SUBSTITUTE. The two present-binary cases run the genuinely installed `pentest-ai`
// console script; they are opt-in (AGENT_SURFACE_LIVE_PENTEST_AI=1) because that binary is a real
// prerequisite, and an explicitly requested run that cannot get one fails rather than passing. Each
// case SYMLINKS that same real executable into the layout under test: what varies is only its
// LOCATION, which is the whole variable, and the file that gets executed is the real application.
// The absent case plants no file at all, so it needs no binary and stays offline — but it proves
// REGISTRATION behavior only (what gets wired when nothing is detectable), never that an
// unavailable service is usable.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cli } from "../lib/helpers.mjs";

const live = process.env.AGENT_SURFACE_LIVE_PENTEST_AI === "1";

// The genuinely installed console script: its default pipx/uv location first, then this machine's
// PATH. Returns null when the tool is not installed here.
function installedPentestAi() {
  const candidates = [path.join(os.homedir(), ".local", "bin", "pentest-ai")];
  for (const entry of (process.env.PATH ?? "").split(path.delimiter)) {
    if (entry) candidates.push(path.join(entry, "pentest-ai"));
  }
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

if (process.platform === "win32") {
  // The layouts and symlinks here are POSIX-shaped; the resolution logic itself is platform-shared.
  console.log("mcp-launch-resolve: skipped on win32 (POSIX detection layouts)");
} else {
  const dir = mkdtempSync(path.join(os.tmpdir(), "as-launch-resolve-"));
  const realExecutable = live ? installedPentestAi() : null;
  // Run the real installer with a controlled HOME and PATH, and return the pentest-ai command it
  // wired. `link` places the real executable at a location inside the disposable tree; `onPath` puts
  // a directory of that tree on the PATH detection searches.
  const wiredCommand = (label, { link = null, onPath = null } = {}) => {
    const home = path.join(dir, `${label}-home`);
    const dest = path.join(dir, `${label}-dest`);
    mkdirSync(home, { recursive: true });
    mkdirSync(dest, { recursive: true });
    if (link) {
      const target = path.join(dir, link);
      mkdirSync(path.dirname(target), { recursive: true });
      symlinkSync(realExecutable, target);
    }
    const searchPath = onPath ? `${path.join(dir, onPath)}:/usr/bin:/bin` : "/usr/bin:/bin";
    const result = spawnSync(
      process.execPath,
      [cli, "install", "--target", "droid", "--dest", dest, "--category", "mcps", "--service", "pentest-ai", "--allow-scope-root", "-y"],
      { encoding: "utf8", env: { HOME: home, USERPROFILE: home, PATH: searchPath } },
    );
    // Selecting an opt-in service must never fail an install, present or absent.
    assert.equal(result.status, 0, `${label}: install exited ${result.status}: ${result.stderr || result.stdout}`);
    const configPath = path.join(dest, ".factory", "mcp.json");
    if (!existsSync(configPath)) return null;
    return JSON.parse(readFileSync(configPath, "utf8")).mcpServers?.["pentest-ai"]?.command ?? null;
  };

  try {
    // ---- offline: nothing is detectable ---------------------------------------------------
    // No file is planted, so no stand-in exists. There is no absolute path to wire, and the bare
    // command is the honest fallback — it launches if the runtime later has the tool on its PATH.
    const absent = wiredCommand("absent");
    assert.equal(absent, "pentest-ai", `an undetectable tool falls back to the bare command, got: ${absent}`);

    if (!live) {
      console.log("mcp-launch-resolve: registration case ok; resolved-path acceptance skipped (set AGENT_SURFACE_LIVE_PENTEST_AI=1 with pentest-ai installed)");
    } else {
      // Explicitly requested and unable to proceed is a failure, not a pass.
      assert.ok(realExecutable, "AGENT_SURFACE_LIVE_PENTEST_AI=1 requires an installed pentest-ai; none was found in ~/.local/bin or on PATH. Install the pinned ptai application and re-run; this acceptance is not emulated");
      const version = spawnSync(realExecutable, ["--version"], { encoding: "utf8" });
      assert.match(version.stdout, /ptai/, `the located executable is the real application: ${version.stdout || version.stderr}`);

      // The default pipx/uv location, with that directory NOT on PATH — exactly where a runtime
      // spawned outside a login shell fails to launch a bare command. Detection resolves it by path.
      const defaultLink = path.join("default-home", ".local", "bin", "pentest-ai");
      const resolvedDefault = wiredCommand("default", { link: defaultLink });
      assert.ok(resolvedDefault && path.isAbsolute(resolvedDefault), `default-location install must wire an absolute path, got: ${resolvedDefault}`);
      assert.equal(resolvedDefault, path.join(dir, defaultLink), "and it is the detected executable's own path");

      // A supported alternate layout: the executable is in a directory that IS on PATH and is not
      // ~/.local/bin (uv honours UV_TOOL_BIN_DIR; MOMO's Kali image sets it to /usr/local/bin). A
      // path hard-coded to ~/.local/bin is ENOENT here, so detection must follow PATH instead.
      const altLink = path.join("altbin", "pentest-ai");
      const resolvedAlt = wiredCommand("alternate", { link: altLink, onPath: "altbin" });
      assert.ok(resolvedAlt && path.isAbsolute(resolvedAlt), `alternate-PATH install must wire an absolute path, got: ${resolvedAlt}`);
      assert.equal(resolvedAlt, path.join(dir, altLink), "resolved from the on-PATH alternate directory, not ~/.local/bin");

      // The point of resolving a path is that the emitted command spawns at all. Run the wired
      // command itself from an environment with neither directory on PATH — the exact condition a
      // bare name fails under. `--version` is used instead of the generated ["mcp"] args because the
      // claim here is EXECUTABLE RESOLUTION, not MCP behavior: a server started here would hold the
      // pipe open. End-to-end MCP acceptance belongs to the live first-party/launch suites.
      for (const [label, command] of [["default", resolvedDefault], ["alternate", resolvedAlt]]) {
        const launched = spawnSync(command, ["--version"], { encoding: "utf8", env: { HOME: os.homedir(), PATH: "/usr/bin:/bin" } });
        assert.equal(launched.status, 0, `${label}: the wired command failed to launch: ${launched.stderr}`);
        assert.match(launched.stdout, /ptai/, `${label}: the wired command runs the real application`);
      }
      console.log(`mcp-launch-resolve: both install layouts resolved and launched (${version.stdout.trim()})`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
