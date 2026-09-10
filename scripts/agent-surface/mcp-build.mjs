// Shared build steps for the first-party MCP installers: verify the Node floor, then install
// dependencies and compile, on whatever platform the installer is running on.
//
// The installers themselves run under Node — which both MCPs already require — so the same script
// serves POSIX and Windows instead of a shell script plus a PowerShell translation that would drift
// apart. npm's console entry point is a batch shim on Windows, which Node refuses to spawn
// directly, so every command goes through the launcher's own cmd.exe routing.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { launchSpec } from "./mcp-env-launch.mjs";
import { whichSync } from "./provision.mjs";

export const NODE_FLOOR = "22.17";

export function meetsNodeFloor(version = process.versions.node) {
  const [major, minor] = version.split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 17);
}

// A globally disabled TLS check must not silently extend to fetching dependencies: drop it for the
// child rather than inheriting whatever the operator's shell exports.
export function installEnv(base = process.env) {
  const env = { ...base };
  delete env.NODE_TLS_REJECT_UNAUTHORIZED;
  return env;
}

/** Run a command, streaming its output, and fail the installer if it does not succeed. */
export function run(command, args, { cwd, env = installEnv(), label = command } = {}) {
  const spec = launchSpec(command, args);
  const result = spawnSync(spec.file, spec.args, { cwd, env, stdio: "inherit", ...spec.options });
  if (result.error) throw new Error(`${label} could not run: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed (exit ${result.status ?? result.signal})`);
}

/** Resolve npm to an absolute path so the build never depends on how the shell spells it. */
export function resolveNpm() {
  const npm = whichSync("npm");
  if (!npm) throw new Error("npm is required to build the first-party MCPs but was not found on PATH");
  return npm;
}

/** `npm ci` when a lockfile is present (reproducible), `npm install` otherwise, then compile. */
export function installAndBuild(packageDir, { npm = resolveNpm() } = {}) {
  const locked = existsSync(path.join(packageDir, "package-lock.json"));
  run(npm, [locked ? "ci" : "install"], { cwd: packageDir, label: `npm ${locked ? "ci" : "install"}` });
  run(npm, ["run", "build"], { cwd: packageDir, label: "npm run build" });
}

/** The bin map from a package manifest, resolved to absolute entry paths. */
export function binEntries(packageDir, manifest) {
  return Object.fromEntries(
    Object.entries(manifest.bin ?? {}).map(([name, rel]) => [name, path.join(packageDir, rel)]),
  );
}

export function assertNodeFloor(name) {
  if (meetsNodeFloor()) return;
  throw new Error(`${name} needs Node >=${NODE_FLOOR} for node:sqlite; this installer is running on ${process.version}`);
}
