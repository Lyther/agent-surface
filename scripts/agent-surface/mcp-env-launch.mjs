#!/usr/bin/env node
// MCP launch wrapper: load a credential env-file, then exec the real MCP server command with its
// stdio protocol and working directory preserved. Secrets live only in the env-file (0600); they
// never appear in host config, which references solely this launcher, the file PATH, and the real
// command + args. Self-contained (node builtins only) so it stays portable in ~/.local/bin.
//
// Invocation: agent-surface-mcp-env --as-env-file <path> -- <command> [args...]
//   - `--as-env-file <path>` names the ONLY env-file loaded — the installer bakes the absolute path
//     it resolved and validated, so there is no implicit cwd/home search (the launched process gets
//     exactly the installer-selected credentials regardless of working directory). When absent or
//     the file is missing, the command runs with the ambient environment unchanged. The flag is
//     namespaced (not Node's native `--env-file`) so Node does not intercept it during bootstrap.
//   - Everything after `--` is the real command line, launched verbatim.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

// Split `--as-env-file <path> -- <command> [args...]`. The `--` terminator is required in practice
// (callers always emit it) but we also tolerate a bare command so the wrapper degrades gracefully.
export function parseLaunchArgs(argv) {
  let envFile = null;
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--as-env-file") { envFile = argv[i + 1] ?? null; i += 1; continue; }
    if (arg === "--") { rest.push(...argv.slice(i + 1)); break; }
    rest.push(arg);
  }
  return { envFile, command: rest[0] ?? null, args: rest.slice(1) };
}

// A missing or malformed file yields no variables; we never guess secret contents. Parsing goes
// through Node's built-in parseEnv, the same reader the installer uses, so values round-trip
// exactly (no shell-eval / `$`-expansion footguns).
export function loadEnvFile(file) {
  if (!file) return {};
  try { return parseEnv(readFileSync(file, "utf8")); }
  catch { return {}; }
}

// The MCP config stores the real command with a literal `~/…`, but spawn() runs no shell and will
// not expand it. Resolve a leading `~/` (or bare `~`) against the home directory so the wrapped
// first-party binaries at ~/.local/bin still launch.
export function expandHome(target, homedir = os.homedir()) {
  if (target === "~") return homedir;
  if (target.startsWith("~/")) return path.join(homedir, target.slice(2));
  return target;
}

// dotenv precedence: a value already present in the ambient environment WINS over the file, so an
// operator-exported secret is never shadowed by a stale file entry.
export function mergedEnv(base, fileValues) {
  const out = { ...base };
  for (const [key, value] of Object.entries(fileValues)) {
    if (!(key in out)) out[key] = value;
  }
  return out;
}

// This wrapper always runs under the Node the installer validated (the ~/.local/bin stub execs it by
// absolute path), so put THAT Node's directory at the front of the CHILD's PATH. A host launches MCP
// servers with a minimal PATH; an npx-based server dies at `#!/usr/bin/env node`, and so does every
// process it spawns, because the whole chain resolves `node` through PATH — an absolute npx is not
// enough. Scoped to this child's environment only: no shell profile, login environment, or other
// server is modified. Already-present directory is left alone so PATH never grows on repeat launches.
export function withRuntimePath(env, execPath = process.execPath, platform = process.platform) {
  const windows = platform === "win32";
  const api = windows ? path.win32 : path;
  const dir = api.dirname(execPath);
  if (!dir) return env;
  // Windows spells the variable `Path`. Find the existing key case-insensitively so the runtime
  // directory is PREPENDED to the real search path instead of creating a second, ambiguous variable
  // that the child would resolve unpredictably. Entry comparison is case-insensitive there too.
  const key = windows ? (Object.keys(env).find((name) => name.toLowerCase() === "path") ?? "PATH") : "PATH";
  const current = env[key] ?? "";
  const same = (entry) => (windows ? entry.toLowerCase() === dir.toLowerCase() : entry === dir);
  if (current.split(api.delimiter).some(same)) return env;
  return { ...env, [key]: current ? `${dir}${api.delimiter}${current}` : dir };
}

// npm installs console entry points on Windows as BATCH shims (`npx.cmd`, `<package>.cmd`). Node
// refuses to spawn a .cmd/.bat without a shell — cmd.exe re-parses the command line, so passing
// arguments through unquoted is a command-injection hazard — and a bare `shell: true` would join the
// arguments with spaces and no quoting, breaking every `C:\Program Files\…` path. So build the
// cmd.exe command line here, quoting each token, and pass it verbatim. A real .exe (and everything
// on POSIX) is still spawned directly.
const WINDOWS_BATCH = /\.(cmd|bat)$/i;

// Quote one token for cmd.exe. Inside double quotes cmd treats spaces, `&`, `|`, `<`, `>` and
// parentheses (`Program Files (x86)`) as literal; an embedded quote is escaped the way the callee's
// own argument parser expects.
function cmdQuote(token) {
  return `"${String(token).replaceAll('"', '\\"')}"`;
}

// What to actually hand to spawn(): the file, its arguments, and any extra spawn options.
export function launchSpec(command, args, platform = process.platform, comSpec = process.env.ComSpec) {
  if (platform !== "win32" || !WINDOWS_BATCH.test(command)) return { file: command, args, options: {} };
  // `/d` skips AutoRun commands (a user's registry AutoRun must not run inside an MCP launch); `/s`
  // makes cmd strip exactly the outer quote pair and use the rest verbatim, which is what keeps the
  // per-token quoting intact.
  const line = [command, ...args].map(cmdQuote).join(" ");
  return {
    file: comSpec || "cmd.exe",
    args: ["/d", "/s", "/c", `"${line}"`],
    options: { windowsVerbatimArguments: true },
  };
}

// Launch the real command with the merged environment. `stdio: "inherit"` hands the host's stdio
// pipes straight to the server (the MCP transport is untouched); no `cwd` is set, so the server
// keeps the launcher's working directory (synapse derives project isolation from it). Signals are
// forwarded and the child's exit status is propagated so the process tree settles cleanly.
export function runLaunch(argv, { env = process.env, spawnFn = spawn, onExit = (code) => process.exit(code) } = {}) {
  const { envFile, command, args } = parseLaunchArgs(argv);
  if (!command) {
    process.stderr.write("mcp-env-launch: no command given (expected: --as-env-file <path> -- <command> [args...])\n");
    onExit(2);
    return null;
  }
  // Load ONLY the explicitly-selected env-file: the installer bakes the absolute --as-env-file it
  // resolved and validated, so the launched process gets exactly those credentials regardless of the
  // working directory. No implicit cwd/home search (which would depend on where the host launches).
  const spec = launchSpec(expandHome(command), args);
  const child = spawnFn(spec.file, spec.args, {
    stdio: "inherit",
    env: withRuntimePath(mergedEnv(env, loadEnvFile(envFile))),
    ...spec.options,
  });
  const forwarded = ["SIGINT", "SIGTERM", "SIGHUP"];
  const listeners = forwarded.map((signal) => {
    const handler = () => { if (child.killed === false) child.kill(signal); };
    process.on(signal, handler);
    return [signal, handler];
  });
  const cleanup = () => { for (const [signal, handler] of listeners) process.removeListener(signal, handler); };
  child.on("error", (err) => {
    cleanup();
    process.stderr.write(`mcp-env-launch: cannot launch ${command}: ${err.message}\n`);
    onExit(127);
  });
  child.on("exit", (code, signal) => {
    cleanup();
    if (signal) { process.kill(process.pid, signal); return; }
    onExit(code ?? 0);
  });
  return child;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runLaunch(process.argv.slice(2));
}
