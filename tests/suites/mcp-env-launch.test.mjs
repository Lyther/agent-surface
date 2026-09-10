#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { expandHome, launchSpec, loadEnvFile, mergedEnv, parseLaunchArgs, withRuntimePath } from "../../scripts/agent-surface/mcp-env-launch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const launcher = path.join(root, "scripts", "agent-surface", "mcp-env-launch.mjs");
const dir = mkdtempSync(path.join(tmpdir(), "as-mcp-launch-"));
try {
  // ---- argument split ----------------------------------------------------
  assert.deepEqual(
    parseLaunchArgs(["--as-env-file", "/e", "--", "cmd", "a", "b"]),
    { envFile: "/e", command: "cmd", args: ["a", "b"] },
    "canonical --env-file … -- command args",
  );
  assert.deepEqual(parseLaunchArgs(["--", "cmd"]), { envFile: null, command: "cmd", args: [] }, "no env-file is allowed");
  assert.deepEqual(parseLaunchArgs(["cmd", "x"]), { envFile: null, command: "cmd", args: ["x"] }, "a bare command (no --) is tolerated");
  assert.deepEqual(parseLaunchArgs([]), { envFile: null, command: null, args: [] }, "empty argv yields no command");

  // ---- env-file read + precedence ---------------------------------------
  const envPath = path.join(dir, ".env");
  writeFileSync(envPath, "FROM_FILE=file-value\nSHARED=file-shared\nQUOTED='two words'\n", { mode: 0o600 });
  assert.deepEqual({ ...loadEnvFile(envPath) }, { FROM_FILE: "file-value", SHARED: "file-shared", QUOTED: "two words" }, "parseEnv reads the file");
  assert.deepEqual(loadEnvFile(path.join(dir, "absent.env")), {}, "a missing file yields no variables");
  assert.deepEqual(loadEnvFile(null), {}, "no path yields no variables");
  assert.deepEqual(mergedEnv({ A: "1" }, { A: "2", B: "3" }), { A: "1", B: "3" }, "ambient env wins; file fills only absent keys");

  // ---- ~ expansion of the wrapped command (no shell at spawn) -----------
  assert.equal(expandHome("~/.local/bin/x", "/home/u"), path.join("/home/u", ".local/bin/x"), "leading ~/ expands to home");
  assert.equal(expandHome("/abs/x", "/home/u"), "/abs/x", "absolute path is unchanged");
  assert.equal(expandHome("plain", "/home/u"), "plain", "bare command is unchanged");

  // ---- end-to-end: child receives file values, process env wins ---------
  const probe = "process.stdout.write(JSON.stringify({ fromFile: process.env.FROM_FILE ?? null, shared: process.env.SHARED ?? null, cwd: process.cwd() }))";
  const run = spawnSync(process.execPath, [launcher, "--as-env-file", envPath, "--", process.execPath, "-e", probe], {
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, SHARED: "process-shared" },
  });
  assert.equal(run.status, 0, "launcher exits 0 when the child succeeds");
  const seen = JSON.parse(run.stdout);
  assert.equal(seen.fromFile, "file-value", "child receives a value only present in the env-file");
  assert.equal(seen.shared, "process-shared", "process env wins over the file at launch");
  assert.equal(seen.cwd, realpathSync(dir), "the launcher preserves the working directory (no cd)");

  // ---- only the explicit --as-env-file is loaded (no implicit cwd search) --
  // A project .env in the working directory must NOT be picked up implicitly — the launcher loads
  // exactly the installer-selected file, so credentials never depend on the launch directory.
  const strayProj = path.join(dir, "stray");
  mkdirSync(strayProj, { recursive: true });
  writeFileSync(path.join(strayProj, ".env"), "STRAY=should-not-load\n");
  const noSearch = spawnSync(process.execPath, [launcher, "--", process.execPath, "-e", "process.stdout.write(process.env.STRAY ?? 'unset')"], {
    encoding: "utf8",
    cwd: strayProj,
    env: { ...process.env },
  });
  assert.equal(noSearch.status, 0);
  assert.equal(noSearch.stdout, "unset", "a cwd .env is NOT loaded without an explicit --as-env-file");

  // ---- missing env-file is a clean passthrough --------------------------
  const cleanEnv = { ...process.env };
  delete cleanEnv.FROM_FILE;
  const passthrough = spawnSync(process.execPath, [launcher, "--as-env-file", path.join(dir, "absent.env"), "--", process.execPath, "-e", "process.stdout.write(process.env.FROM_FILE ?? 'unset')"], {
    encoding: "utf8",
    env: cleanEnv,
  });
  assert.equal(passthrough.status, 0);
  assert.equal(passthrough.stdout, "unset", "absent env-file leaves the environment unchanged");

  // ---- the validated Node reaches the CHILD's PATH (whole-chain launch fix) ----
  assert.deepEqual(withRuntimePath({ PATH: "/usr/bin:/bin" }, "/opt/n/bin/node"), { PATH: `/opt/n/bin${path.delimiter}/usr/bin:/bin` }, "the running Node's directory is prepended to the child PATH");
  assert.deepEqual(withRuntimePath({}, "/opt/n/bin/node"), { PATH: "/opt/n/bin" }, "an absent PATH becomes just the Node directory");
  assert.deepEqual(withRuntimePath({ PATH: `/opt/n/bin${path.delimiter}/usr/bin` }, "/opt/n/bin/node"), { PATH: `/opt/n/bin${path.delimiter}/usr/bin` }, "an already-present directory is not duplicated");
  assert.equal(withRuntimePath({ PATH: "/usr/bin", KEEP: "yes" }, "/opt/n/bin/node").KEEP, "yes", "other variables are untouched");

  // The child's PATH must actually start with the Node the wrapper runs under.
  const pathProbe = spawnSync(process.execPath, [launcher, "--", process.execPath, "-e", "process.stdout.write(process.env.PATH)"], {
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin" },
  });
  assert.equal(pathProbe.status, 0);
  assert.equal(pathProbe.stdout.split(path.delimiter)[0], path.dirname(process.execPath), "the child's PATH starts with the validated Node's directory");

  // The real defect: a `#!/usr/bin/env node` child (npx, and everything npx spawns) cannot start when
  // the host launches with a minimal PATH. Through the wrapper it must start. Shebangs are a POSIX
  // mechanism — Windows has none, and its equivalent (npm's .cmd shims) is covered by launchSpec
  // above and by the native launch acceptance in the live-launch suite.
  if (process.platform !== "win32") {
    const envShebang = path.join(dir, "env-shebang-child");
    writeFileSync(envShebang, "#!/usr/bin/env node\nprocess.stdout.write('started');\n", { mode: 0o755 });
    const wrappedRun = spawnSync(process.execPath, [launcher, "--", envShebang], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", HOME: process.env.HOME },
    });
    assert.equal(wrappedRun.status, 0, `a #!/usr/bin/env node child starts under a minimal PATH via the wrapper: ${wrappedRun.stderr}`);
    assert.equal(wrappedRun.stdout, "started", "the env-shebang child actually ran");
    if (!existsSync("/usr/bin/node")) {
      // Control (only where /usr/bin/node does not mask the dependency): the same child fails directly.
      const direct = spawnSync(envShebang, [], { encoding: "utf8", env: { PATH: "/usr/bin:/bin" } });
      assert.notEqual(direct.status, 0, "control: the same child fails under a minimal PATH without the wrapper");
    }
  }

  // ---- Windows: PATH is spelled `Path`, and must be EXTENDED, not shadowed ----
  // Creating a second `PATH` variable next to Windows' own `Path` leaves the child resolving an
  // ambiguous search path; the runtime directory has to be prepended to the existing one.
  const winPath = withRuntimePath({ Path: "C:\\Windows\\system32", SystemRoot: "C:\\Windows" }, "C:\\Program Files\\nodejs\\node.exe", "win32");
  assert.deepEqual(Object.keys(winPath).sort(), ["Path", "SystemRoot"], "no second PATH variable is introduced on Windows");
  assert.equal(winPath.Path.split(path.win32.delimiter)[0], "C:\\Program Files\\nodejs", "the pinned Node directory is prepended to the existing Path");
  assert.equal(winPath.Path, `C:\\Program Files\\nodejs;C:\\Windows\\system32`, "Windows entries are joined with ';' regardless of the host running the install");
  assert.equal(
    withRuntimePath({ Path: "C:\\PROGRAM FILES\\NODEJS" }, "C:\\Program Files\\nodejs\\node.exe", "win32").Path,
    "C:\\PROGRAM FILES\\NODEJS", "an already-present directory is not duplicated (Windows paths are case-insensitive)",
  );

  // ---- Windows: npm's .cmd shims must go through cmd.exe, correctly quoted ----
  // Node refuses to spawn a .cmd/.bat without a shell, and `shell: true` would join the arguments
  // unquoted — which breaks every `C:\Program Files\…` path. A real .exe is still spawned directly.
  const direct = launchSpec("C:\\Program Files\\nodejs\\node.exe", ["a b"], "win32", "C:\\Windows\\system32\\cmd.exe");
  assert.deepEqual(direct, { file: "C:\\Program Files\\nodejs\\node.exe", args: ["a b"], options: {} }, "a Windows .exe is spawned directly, arguments untouched");
  assert.deepEqual(
    launchSpec("/opt/homebrew/bin/npx", ["-y", "pkg"], "darwin"),
    { file: "/opt/homebrew/bin/npx", args: ["-y", "pkg"], options: {} }, "POSIX is unchanged: no shell, no rewriting",
  );
  const batch = launchSpec("C:\\Program Files\\nodejs\\npx.cmd", ["-y", "chrome-devtools-mcp@1.8.0", "--executablePath", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"], "win32", "C:\\Windows\\system32\\cmd.exe");
  assert.equal(batch.file, "C:\\Windows\\system32\\cmd.exe", "a .cmd shim is run by the interpreter named in ComSpec");
  assert.deepEqual(batch.args.slice(0, 3), ["/d", "/s", "/c"], "AutoRun is disabled (/d) and the outer quotes are stripped verbatim (/s)");
  assert.equal(batch.options.windowsVerbatimArguments, true, "the command line is passed verbatim so our own quoting survives");
  assert.equal(
    batch.args[3],
    '""C:\\Program Files\\nodejs\\npx.cmd" "-y" "chrome-devtools-mcp@1.8.0" "--executablePath" "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe""',
    "every token is quoted, so spaces and (x86) parentheses survive intact",
  );
  assert.match(launchSpec("x.bat", ['say "hi"'], "win32", "cmd.exe").args[3], /\\"hi\\"/, "an embedded quote is escaped rather than terminating the token");
  assert.equal(launchSpec("C:\\t\\shim.CMD", [], "win32", "cmd.exe").file, "cmd.exe", "the batch extension test is case-insensitive");

  // ---- exit status + no-command guard -----------------------------------
  const exit7 = spawnSync(process.execPath, [launcher, "--", process.execPath, "-e", "process.exit(7)"], { encoding: "utf8" });
  assert.equal(exit7.status, 7, "the child's exit code propagates");
  const noCommand = spawnSync(process.execPath, [launcher, "--as-env-file", envPath], { encoding: "utf8" });
  assert.equal(noCommand.status, 2, "a launch with no command fails with a usage error");
  assert.doesNotMatch(`${noCommand.stdout}${noCommand.stderr}`, /file-value|two words/, "the launcher never prints credential values");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("mcp-env-launch: ok");
