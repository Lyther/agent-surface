#!/usr/bin/env node
// LIVE provisioning acceptance for a credentialed external MCP: bootstrap uv from nothing, install
// OpenOSINT and its provider extras with it, wire the service, and prove the installer-collected
// credential reaches the launched process. Everything runs in a disposable home, and UV_TOOL_DIR
// points at a temporary directory — deliberately NOT uv's default — so the extras probe has to
// resolve the interpreter by asking uv where its tools live rather than assuming a layout.
//
// Opt-in (network: the uv installer and PyPI): AGENT_SURFACE_LIVE_PROVISION=1. Without it this
// skips, so the default suite stays hermetic and offline.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Opt-in guard. NOT process.exit(): these suites are imported by the shared runner, so
// exiting here would silently end the whole run and report success for suites never run.
const enabled = process.env.AGENT_SURFACE_LIVE_PROVISION === "1";
if (!enabled) console.log("live-provision: skipped (set AGENT_SURFACE_LIVE_PROVISION=1 to run the networked provisioning acceptance)");

if (enabled) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const cli = path.join(root, "scripts", "agent-surface.mjs");
  const windows = process.platform === "win32";

  const dir = mkdtempSync(path.join(os.tmpdir(), "as-live-prov-"));
  try {
    const home = path.join(dir, "home");
    const dest = path.join(dir, "project");
    const toolDir = path.join(dir, "uv-tools"); // not uv's default on ANY platform
    mkdirSync(home, { recursive: true });
    mkdirSync(dest, { recursive: true });

    // A PATH with the system directories and NOTHING else, so uv is genuinely unavailable at the start
    // of the run on every platform — the bootstrap is then proven here rather than depending on
    // whatever the machine happens to have installed. Windows needs the PowerShell directory because
    // that is the interpreter the uv recipe names.
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
    const minimalPath = windows
      ? [`${systemRoot}\\system32`, systemRoot, `${systemRoot}\\system32\\WindowsPowerShell\\v1.0`].join(path.delimiter)
      : "/usr/bin:/bin";
    // os.homedir() reads USERPROFILE on Windows and HOME elsewhere; both are set so uv's installer and
    // agent-surface agree on where the disposable home is.
    const env = {
      ...process.env, HOME: home, USERPROFILE: home, UV_TOOL_DIR: toolDir,
      PATH: minimalPath, Path: minimalPath,
    };
    const install = spawnSync(process.execPath, [cli, "install", "--target", "droid", "--dest", dest, "--category", "mcps", "--service", "openosint", "-y"], { encoding: "utf8", env });
    console.log(install.stdout);
    assert.equal(install.status, 0, `install failed: ${install.stderr || install.stdout}`);

    // The same-run bootstrap: uv did not exist at the start of this run, and the next step used it.
    assert.match(install.stdout, /uv MISSING/, "uv was genuinely absent when the run started");
    assert.match(install.stdout, /provisioning: ok Astral uv standalone installer/, "uv was installed by its recipe");
    assert.match(install.stdout, /provisioning: ok uv tool install openosint/, "the freshly installed uv was then used to install openosint");
    const uvBin = path.join(home, ".local", "bin", windows ? "uv.exe" : "uv");
    assert.ok(existsSync(uvBin), `uv was installed where detection looks for it: ${uvBin}`);

    // The extras live in the NON-default UV_TOOL_DIR, so a hard-coded layout could not have found this
    // interpreter — and the provider modules must genuinely import inside it. Probed directly rather
    // than inferred from the install log.
    const interpreter = [
      path.join(toolDir, "openosint", "bin", "python"),
      path.join(toolDir, "openosint", "Scripts", "python.exe"),
    ].find((candidate) => existsSync(candidate));
    assert.ok(interpreter, `openosint's interpreter was created under the non-default tool dir ${toolDir}`);
    const modules = spawnSync(interpreter, ["-c", "import importlib.util as u, sys; sys.exit(0 if all(u.find_spec(m) for m in ['shodan','censys','openai','ollama']) else 1)"], { encoding: "utf8" });
    assert.equal(modules.status, 0, `every provider extra imports inside openosint's own interpreter: ${modules.stderr}`);

    const entry = JSON.parse(readFileSync(path.join(dest, ".factory", "mcp.json"), "utf8")).mcpServers.openosint;
    assert.ok(entry, `openosint was not wired: ${install.stdout}`);
    console.log(`wired: ${entry.command} ${JSON.stringify(entry.args)}`);
    assert.ok(path.isAbsolute(entry.command) && existsSync(entry.command), `the launch command is an absolute path that exists: ${entry.command}`);

    // The real MCP binary sits after the `--` terminator, resolved to an absolute path.
    const inner = entry.args[entry.args.indexOf("--") + 1];
    assert.ok(path.isAbsolute(inner) && existsSync(inner), `the real command is an absolute path that exists: ${inner}`);
    assert.match(path.basename(inner), /^openosint-mcp(\.exe)?$/, `the resolved launch binary is openosint-mcp: ${inner}`);

    // ---- credential delivery through the generated command ----------------------------
    // Launch the ACTUAL generated command with the config's own arguments — only the MCP binary after
    // `--` is swapped for a probe, so the wrapper, the baked env-file path and the platform's process
    // launch are all the real ones. On Windows the probe is a batch file, which also exercises the
    // cmd.exe routing the wrapper uses for npm-style shims.
    const envFlag = entry.args.indexOf("--as-env-file");
    assert.notEqual(envFlag, -1, "the resolved env-file path is baked into the launch args");
    const envFile = entry.args[envFlag + 1];
    assert.equal(envFile, path.join(dest, ".env"), "the baked path is the installer-resolved project .env");
    writeFileSync(envFile, "SHODAN_API_KEY=installer-collected\n", { mode: 0o600 });

    const probe = path.join(dir, windows ? "probe.cmd" : "probe.sh");
    writeFileSync(probe, windows
      ? "@echo off\r\necho SHODAN_API_KEY=%SHODAN_API_KEY%\r\n"
      : "#!/bin/sh\nprintf 'SHODAN_API_KEY=%s' \"$SHODAN_API_KEY\"\n", { mode: 0o755 });
    const launchArgs = entry.args.slice(0, entry.args.indexOf("--") + 1).concat([probe]);
    const launched = spawnSync(entry.command, launchArgs, {
      encoding: "utf8",
      cwd: dir, // a different working directory: the env-file must not be found by proximity
      env: windows
        ? { Path: `${process.env.SystemRoot ?? "C:\\Windows"}\\system32`, SystemRoot: process.env.SystemRoot ?? "C:\\Windows", ComSpec: process.env.ComSpec ?? "C:\\Windows\\system32\\cmd.exe", USERPROFILE: home, HOME: home }
        : { PATH: "/usr/bin:/bin", HOME: home },
    });
    assert.equal(launched.status, 0, `launch failed: ${launched.stderr}`);
    assert.equal(launched.stdout.trim(), "SHODAN_API_KEY=installer-collected", "the installer-collected credential reaches the launched process under a minimal PATH from another directory");
    console.log(`live-provision: uv bootstrapped, openosint wired at ${inner}, credential delivered, platform=${process.platform}`);
  } finally {
    // Windows keeps handles open briefly after a process exits — the browser profile the MCP server
    // created is still locked here. Retry, then REPORT rather than throw: a temp-directory lock is
    // not what this acceptance tests, and throwing from `finally` would replace the real failure.
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    } catch (error) {
      console.log(`live-provision: could not remove the temporary directory ${dir} (${error.code})`);
    }
  }

  console.log("live-provision: ok");
}
