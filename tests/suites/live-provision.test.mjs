#!/usr/bin/env node
// LIVE provisioning acceptance for a credentialed external MCP, in four phases:
//   1. bootstrap uv from nothing, install OpenOSINT and its provider extras with it, wire the service
//   2. IMPORT each provider extra inside OpenOSINT's own interpreter (execution, not discovery)
//   3. ACCEPTANCE: launch the UNCHANGED generated command and arguments and require a real MCP
//      session from the installed OpenOSINT server — initialize plus tools/list
//   4. DIAGNOSTIC (explicitly not the acceptance): swap the inner program for a probe to observe
//      that env-file values reach the launched process
// Everything runs in a disposable home, and UV_TOOL_DIR points at a temporary directory —
// deliberately NOT uv's default — so the extras probe has to resolve the interpreter by asking uv
// where its tools live rather than assuming a layout.
//
// Opt-in (network: the uv installer and PyPI): AGENT_SURFACE_LIVE_PROVISION=1. Without it this
// skips, so the default suite stays hermetic and offline.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mcpSession, minimalLaunchEnv } from "../lib/mcp-session.mjs";

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
      ? [
        `${systemRoot}\\system32`,
        systemRoot,
        `${systemRoot}\\system32\\WindowsPowerShell\\v1.0`,
        // PowerShell 7, where present: the uv recipe prefers it, because Windows PowerShell 5.1
        // launched under a pwsh parent's PSModulePath cannot load its own modules.
        path.join(process.env.ProgramFiles ?? "C:\\Program Files", "PowerShell", "7"),
      ].join(path.delimiter)
      : "/usr/bin:/bin";
    // os.homedir() reads USERPROFILE on Windows and HOME elsewhere; both are set so uv's installer and
    // agent-surface agree on where the disposable home is.
    const env = {
      ...process.env, HOME: home, USERPROFILE: home, UV_TOOL_DIR: toolDir,
      PATH: minimalPath, Path: minimalPath,
    };
    // ---- phase 1: provision from nothing and wire the service ----------------------------
    const install = spawnSync(process.execPath, [cli, "install", "--target", "droid", "--dest", dest, "--category", "mcps", "--service", "openosint", "-y"], { encoding: "utf8", env });
    console.log(install.stdout);
    assert.equal(install.status, 0, `install failed: ${install.stderr || install.stdout}`);

    // The same-run bootstrap: uv did not exist at the start of this run, and the next step used it.
    assert.match(install.stdout, /uv MISSING/, "uv was genuinely absent when the run started");
    assert.match(install.stdout, /provisioning: ok Astral uv standalone installer/, "uv was installed by its recipe");
    assert.match(install.stdout, /provisioning: ok uv tool install openosint/, "the freshly installed uv was then used to install openosint");
    const uvBin = path.join(home, ".local", "bin", windows ? "uv.exe" : "uv");
    assert.ok(existsSync(uvBin), `uv was installed where detection looks for it: ${uvBin}`);

    const entry = JSON.parse(readFileSync(path.join(dest, ".factory", "mcp.json"), "utf8")).mcpServers.openosint;
    assert.ok(entry, `openosint was not wired: ${install.stdout}`);
    console.log(`wired: ${entry.command} ${JSON.stringify(entry.args)}`);
    assert.ok(path.isAbsolute(entry.command) && existsSync(entry.command), `the launch command is an absolute path that exists: ${entry.command}`);

    // The real MCP binary sits after the `--` terminator, resolved to an absolute path.
    const inner = entry.args[entry.args.indexOf("--") + 1];
    assert.ok(path.isAbsolute(inner) && existsSync(inner), `the real command is an absolute path that exists: ${inner}`);
    assert.match(path.basename(inner), /^openosint-mcp(\.exe)?$/, `the resolved launch binary is openosint-mcp: ${inner}`);

    // ---- phase 2: the extras EXECUTE, not merely resolve --------------------------------
    // The extras live in the NON-default UV_TOOL_DIR, so a hard-coded layout could not have found this
    // interpreter. Each module is then genuinely imported: importlib.import_module RUNS the package's
    // top-level code, where a broken install actually shows up (a missing transitive dependency, an
    // import-time client constructor). find_spec would only prove the files are discoverable.
    // The import runs under the same minimal environment the MCP itself is launched with, so the
    // result does not depend on whatever the operator's shell exports. The module names come from the
    // registry, so this imports exactly what detection claims to have checked — a weakened probe
    // cannot pass here unnoticed.
    const providers = JSON.parse(readFileSync(path.join(root, "registry", "optional-services.json"), "utf8"))
      .services.openosint.provisioning.prerequisites.find((prereq) => prereq.id === "openosint-extras")
      .detect.python.modules;
    assert.ok(providers.length >= 4, `the registry declares the provider extras to probe: ${providers.join(", ")}`);
    const interpreter = [
      path.join(toolDir, "openosint", "bin", "python"),
      path.join(toolDir, "openosint", "Scripts", "python.exe"),
    ].find((candidate) => existsSync(candidate));
    assert.ok(interpreter, `openosint's interpreter was created under the non-default tool dir ${toolDir}`);
    const importScript = [
      "import importlib",
      `for name in [${providers.map((name) => `'${name}'`).join(", ")}]:`,
      "    module = importlib.import_module(name)",
      "    print(name, getattr(module, '__version__', '?'), module.__file__ or '(namespace)')",
    ].join("\n");
    const modules = spawnSync(interpreter, ["-c", importScript], { encoding: "utf8", env: minimalLaunchEnv(home) });
    assert.equal(modules.status, 0, `every provider extra imports inside openosint's own interpreter: ${modules.stderr}`);
    console.log(`imported in ${interpreter}:\n${modules.stdout.trim()}`);
    const imported = new Set(modules.stdout.split("\n").map((line) => line.split(" ")[0]));
    for (const name of providers) assert.ok(imported.has(name), `${name} reported its own import: ${modules.stdout}`);

    // The env-file the launcher will load. Every OpenOSINT key is declared OPTIONAL, and the
    // installer only ever prompts for REQUIRED keys — so for this service the file is authored by the
    // operator (or the value is exported into the environment), never collected interactively.
    // Writing it here is therefore the real delivery path for OpenOSINT, not a shortcut around one.
    const envFlag = entry.args.indexOf("--as-env-file");
    assert.notEqual(envFlag, -1, "the resolved env-file path is baked into the launch args");
    const envFile = entry.args[envFlag + 1];
    assert.equal(envFile, path.join(dest, ".env"), "the baked path is the installer-resolved project .env");
    writeFileSync(envFile, "SHODAN_API_KEY=operator-authored\n", { mode: 0o600 });

    // ---- phase 3: the acceptance — the REAL server, the UNCHANGED generated command -------
    // Nothing is substituted and nothing is appended: this is exactly what a host launches, run from
    // a different working directory under a minimal PATH that is never repaired here. Only if the
    // installed OpenOSINT actually starts and answers does the provisioning chain count as working.
    const session = await mcpSession(entry.command, entry.args, { cwd: os.tmpdir(), env: minimalLaunchEnv(home) }, async ({ call, serverInfo }) => {
      const { tools } = await call("tools/list", {});
      return { serverInfo, names: tools.map((tool) => tool.name) };
    });
    // The server reports its own MCP version, which is NOT the pinned application version (2.27.0) —
    // assert the identity and the pinned tool surface instead of tying this to a version string.
    assert.equal(session.serverInfo.name, "openosint", `unexpected server identity: ${JSON.stringify(session.serverInfo)}`);
    assert.ok(session.names.length > 0, "the installed server advertised its tools");
    assert.ok(session.names.includes("search_shodan"), `the pinned OpenOSINT tool surface is present: ${session.names.join(", ")}`);
    console.log(`live-provision: MCP session with the installed server — ${session.serverInfo.name} ${session.serverInfo.version}, ${session.names.length} tools`);

    // ---- phase 4: DIAGNOSTIC, not the acceptance ------------------------------------------
    // Above proves the real server starts; this observes something a running MCP server cannot be
    // asked about without calling a provider API — whether the env-file's values actually arrive in
    // the launched process's environment. It uses the ACTUAL generated command and the config's own
    // arguments, swapping ONLY the program after `--`, so the wrapper, the baked env-file path and
    // the platform's process launch are all real. Being a substitute program, it cannot stand in for
    // phase 3 and makes no claim about OpenOSINT itself. On Windows the probe is a batch file, which
    // additionally covers the cmd.exe routing the wrapper uses for npm-style shims — a path the real
    // openosint-mcp.exe never takes.
    const probe = path.join(dir, windows ? "probe.cmd" : "probe.sh");
    writeFileSync(probe, windows
      ? "@echo off\r\necho SHODAN_API_KEY=%SHODAN_API_KEY%\r\n"
      : "#!/bin/sh\nprintf 'SHODAN_API_KEY=%s' \"$SHODAN_API_KEY\"\n", { mode: 0o755 });
    const launchArgs = entry.args.slice(0, entry.args.indexOf("--") + 1).concat([probe]);
    const launched = spawnSync(entry.command, launchArgs, {
      encoding: "utf8",
      cwd: dir, // a different working directory: the env-file must not be found by proximity
      env: minimalLaunchEnv(home),
    });
    assert.equal(launched.status, 0, `diagnostic launch failed: ${launched.stderr}`);
    assert.equal(launched.stdout.trim(), "SHODAN_API_KEY=operator-authored", "the env-file value reaches the launched process under a minimal PATH from another directory");
    console.log(`live-provision: uv bootstrapped, extras imported, installed openosint served tools/list from ${inner}, env-file value forwarded (diagnostic), platform=${process.platform}`);
  } finally {
    // Windows keeps handles open briefly after a process exits — the uv tool directory and the
    // server's own files can still be locked here. Retry, then REPORT rather than throw: a
    // temp-directory lock is not what this acceptance tests, and throwing from `finally` would
    // replace the real failure.
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    } catch (error) {
      console.log(`live-provision: could not remove the temporary directory ${dir} (${error.code})`);
    }
  }

  console.log("live-provision: ok");
}
