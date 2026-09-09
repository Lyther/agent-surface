#!/usr/bin/env node
// Install-level provisioning gating, exercised through the real CLI against the real registry — but
// NEVER running a real package manager: the block case denies authorization BEFORE the executor
// runs, and the satisfied case has every prerequisite already present so no recipe fires. Both use a
// disposable HOME so nothing lands in the developer's real ~/.local/bin.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MCP_ENV_LAUNCH_SCRIPT, MCP_ENV_LAUNCHER } from "../../scripts/agent-surface/merge.mjs";
import { provisioningStatus, selectRecipe } from "../../scripts/agent-surface/provision.mjs";
import { selectedMcpServiceEntries } from "../../scripts/agent-surface/targets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = path.join(root, "scripts", "agent-surface.mjs");
const dir = mkdtempSync(path.join(os.tmpdir(), "as-prov-install-"));

// ---- excludeServices is the single wiring-exclusion chokepoint --------------------
// A service dropped for failed provisioning must vanish from the entry list WITHOUT being reported as
// a "missing" explicitly-requested service (exclusion happens after the request is validated).
{
  const ctx = (extra) => ({ mode: "install", scope: "project", optionalServices: new Set(["openosint"]), ...extra });
  const included = await selectedMcpServiceEntries(true, ctx());
  assert.deepEqual(included.map(([id]) => id), ["openosint"], "the requested service is selected");
  const excluded = await selectedMcpServiceEntries(true, ctx({ excludeServices: new Set(["openosint"]) }));
  assert.deepEqual(excluded.map(([id]) => id), [], "excludeServices drops the service and does not raise a missing-service error");
}

function install(home, dest, env, extra) {
  mkdirSync(home, { recursive: true });
  mkdirSync(dest, { recursive: true });
  return spawnSync(process.execPath, [cli, "install", "--target", "droid", "--dest", dest, "--category", "mcps", "--service", "openosint", ...extra], {
    encoding: "utf8",
    // os.homedir() reads USERPROFILE on Windows and HOME elsewhere; set both so the disposable
    // home applies on every platform.
    env: { ...env, HOME: home, USERPROFILE: home },
  });
}

try {
  // ---- Arch/openSUSE browser provisioning: Chromium from the official repo ----------
  // Chrome has no official Arch/openSUSE package, so the browser prerequisite must select that
  // distro's chromium recipe instead of having none (which previously made it a hard blocker).
  // Asserted against the REAL registry by exposing only one package manager on PATH. (Full detection
  // is not used here: this host's own /Applications Chrome would satisfy the absolute detect paths.)
  const registry = JSON.parse(readFileSync(path.join(root, "registry", "optional-services.json"), "utf8")).services;
  const browserPrereq = registry["chrome-devtools"].provisioning.prerequisites.find((p) => p.id === "google-chrome");
  assert.equal(browserPrereq.launch_arg, "--executablePath", "the browser prerequisite wires its resolved path into the launch command");
  assert.ok(browserPrereq.detect.paths.includes("/usr/bin/chromium"), "chromium is a detected browser location, so an Arch/openSUSE install resolves after provisioning");
  // Selecting a Linux recipe means resolving its package manager under the POSIX executable-bit
  // rule, and a Windows filesystem cannot express that bit — so this block runs where the rule it
  // depends on exists. The registry contracts below are pure data and are checked everywhere.
  if (process.platform !== "win32") {
    const pickLinuxRecipe = (manager) => {
      const bin = path.join(dir, `${manager}-bin`);
      mkdirSync(bin, { recursive: true });
      writeFileSync(path.join(bin, manager), "#!/bin/sh\n", { mode: 0o755 });
      return selectRecipe(browserPrereq.recipes.linux, { platform: "linux", env: { PATH: bin } });
    };
    assert.deepEqual(pickLinuxRecipe("pacman").run, ["sudo", "pacman", "-S", "--noconfirm", "chromium"], "Arch installs chromium via pacman");
    assert.deepEqual(pickLinuxRecipe("zypper").run, ["sudo", "zypper", "--non-interactive", "install", "chromium"], "openSUSE installs chromium via zypper");
    assert.deepEqual(pickLinuxRecipe("apt-get").run, ["sudo", "apt-get", "install", "-y", "google-chrome-stable"], "Debian/Ubuntu still installs Google Chrome from the Google apt repo");
    assert.equal(selectRecipe(browserPrereq.recipes.linux, { platform: "linux", env: { PATH: path.join(dir, "empty-bin") } }), null, "a Linux host with no supported package manager reports no runnable browser recipe");
  }

  // ---- Windows setup contracts, asserted against the REAL registry --------------------
  const openosintPrereqs = registry.openosint.provisioning.prerequisites;
  const uvPrereq = openosintPrereqs.find((p) => p.id === "uv");

  // The same-run bootstrap must close on Windows too: whatever installs uv has to leave it somewhere
  // re-detection already looks. WinGet packages install into WinGet's own portable locations, which
  // are not on the running process's PATH and are not a declared detect path — so the next
  // `uv tool install` would still fail. The standalone installer targets ~/.local/bin, which IS one.
  const uvWin = selectRecipe(uvPrereq.recipes.win32, { platform: "win32", env: { PATH: "" } });
  assert.ok(uvWin, "a Windows host with no package manager can still bootstrap uv (no `requires` gate)");
  assert.ok(uvWin.run.join(" ").includes("astral.sh/uv/install.ps1"), "Windows uses the standalone installer, whose install directory is predictable");
  assert.ok(!JSON.stringify(uvPrereq.recipes.win32).includes("winget"), "no WinGet uv recipe: its portable install location is not a declared detect path, so the same-run bootstrap would break");
  assert.ok(uvPrereq.detect.paths.includes("~/.local/bin/uv.exe"), "the standalone installer's Windows target IS a declared detect path, closing the bootstrap");

  // Once the operator has authorized installation, WinGet must not stop for agreements or prompts.
  for (const [service, id] of [["synapse", "node-runtime"], ["grimoire", "node-runtime"], ["chrome-devtools", "node-runtime"], ["chrome-devtools", "google-chrome"]]) {
    const recipe = registry[service].provisioning.prerequisites.find((p) => p.id === id).recipes.win32[0];
    assert.equal(recipe.requires, "winget", `${service}/${id} uses winget on Windows`);
    for (const flag of ["--silent", "--disable-interactivity", "--accept-package-agreements", "--accept-source-agreements"]) {
      assert.ok(recipe.run.includes(flag), `${service}/${id} carries the granted authorization into WinGet as ${flag}`);
    }
    assert.equal(recipe.elevation, true, `${service}/${id} declares that its machine-wide install still needs OS elevation`);
  }

  // The extras probe must ask uv where its tool environments live rather than assume a layout:
  // Windows uv defaults to %APPDATA%\uv\data\tools, so a hard-coded POSIX path drops a good install.
  const extras = openosintPrereqs.find((p) => p.id === "openosint-extras").detect.python;
  assert.deepEqual(extras.interpreter_root, { prerequisite: "uv", run: ["tool", "dir"] }, "the extras interpreter root is resolved from the detected uv");
  assert.ok(extras.interpreter_subpaths.includes("openosint/Scripts/python.exe"), "the Windows venv layout is covered under that root");
  assert.ok(!JSON.stringify(extras.interpreter).includes("Scripts"), "no hard-coded Windows tool directory remains in the fallback list");
  assert.ok(openosintPrereqs.indexOf(uvPrereq) < openosintPrereqs.findIndex((p) => p.id === "openosint-extras"), "uv is detected before the extras that query it (registry order is dependency order)");

  // ---- launch_arg wiring: the resolved browser path reaches the generated launch command ----
  const wired = await selectedMcpServiceEntries(true, {
    mode: "install", scope: "project", optionalServices: new Set(["chrome-devtools"]),
    launchWiring: { "chrome-devtools": { command: "/abs/bin/npx", args: ["--executablePath", "/usr/bin/chromium"] } },
  });
  const [, chromeSvc] = wired.find(([id]) => id === "chrome-devtools");
  assert.equal(chromeSvc.mcp.server.command, "/abs/bin/npx", "the bare launch command is replaced by the resolved absolute path");
  assert.deepEqual(chromeSvc.mcp.server.args.slice(-2), ["--executablePath", "/usr/bin/chromium"], "the provisioned browser path is appended as --executablePath");

  // ---- an env-shebang launch binary is wrapped so the validated Node reaches the WHOLE chain ----
  // npx is `#!/usr/bin/env node`, and so is the MCP bin npx spawns: under a host's minimal PATH the
  // chain dies at `env: node`. Such a server launches through the wrapper (which puts the validated
  // Node on the child's PATH) — but must NOT receive the credential env-file, since it declares none.
  const envShebangCmd = path.join(dir, "npx-like");
  writeFileSync(envShebangCmd, "#!/usr/bin/env node\n", { mode: 0o755 });
  const shebangWired = await selectedMcpServiceEntries(true, {
    mode: "install", scope: "project", optionalServices: new Set(["chrome-devtools"]), envFilePath: path.join(dir, "proj.env"),
    launchWiring: { "chrome-devtools": { command: envShebangCmd, args: ["--executablePath", "/usr/bin/chromium"] } },
  });
  const [, shebangSvc] = shebangWired.find(([id]) => id === "chrome-devtools");
  assert.equal(path.basename(shebangSvc.mcp.server.command), "agent-surface-mcp-env", "an env-shebang launch binary is routed through the runtime wrapper");
  assert.ok(!shebangSvc.mcp.server.args.includes("--as-env-file"), "a keyless server wrapped only for the runtime PATH is NOT handed the credential env-file");
  assert.equal(shebangSvc.mcp.server.args.filter((a) => a === "--executablePath").length, 1, "the browser path is appended exactly once");
  assert.equal(shebangSvc.mcp.server.args[shebangSvc.mcp.server.args.indexOf("--") + 1], envShebangCmd, "the real command follows the -- terminator");

  // ---- native Windows: the wrapper is the pinned node.exe, and .cmd shims route through it ----
  // npm installs console entry points as .cmd shims that fall back to a bare `node` (no node.exe is
  // adjacent to an npx cache dir), and a Node-based host cannot spawn a batch file directly at all.
  // So a Windows install wraps them — but the wrapper must NOT itself be a .cmd/extensionless stub
  // for the same reason: it is the install-pinned node.exe plus the launcher module.
  const winCmd = "C:\\Program Files\\nodejs\\npx.cmd";
  const winChrome = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
  const winWired = await selectedMcpServiceEntries(true, {
    mode: "install", scope: "project", platform: "win32", optionalServices: new Set(["chrome-devtools"]),
    envFilePath: path.join(dir, "proj.env"),
    launchWiring: { "chrome-devtools": { command: winCmd, args: ["--executablePath", winChrome] } },
  });
  const [, winSvc] = winWired.find(([id]) => id === "chrome-devtools");
  assert.equal(winSvc.mcp.server.command, process.execPath, "on Windows the wrapper is the install-pinned node.exe — a real executable every host can spawn");
  assert.equal(winSvc.mcp.server.args[0], MCP_ENV_LAUNCH_SCRIPT, "the launcher module is node's first argument");
  assert.ok(!winSvc.mcp.server.args.includes("--as-env-file"), "a keyless server still receives no credential env-file on Windows");
  assert.equal(winSvc.mcp.server.args[winSvc.mcp.server.args.indexOf("--") + 1], winCmd, "the real .cmd shim follows the -- terminator (the launcher runs it through cmd.exe)");
  assert.deepEqual(winSvc.mcp.server.args.slice(-2), ["--executablePath", winChrome], "the provisioned Windows browser path is wired exactly once");
  assert.equal(winSvc.mcp.server.args.filter((a) => a === "--executablePath").length, 1);

  // A Windows .exe launch binary is self-sufficient: no shim, no PATH lookup → direct launch.
  const winExeWired = await selectedMcpServiceEntries(true, {
    mode: "install", scope: "project", platform: "win32", optionalServices: new Set(["chrome-devtools"]),
    launchWiring: { "chrome-devtools": { command: "C:\\tools\\thing.exe" } },
  });
  assert.equal(winExeWired.find(([id]) => id === "chrome-devtools")[1].mcp.server.command, "C:\\tools\\thing.exe", "a Windows .exe keeps its direct launch path");

  // dist/build must stay machine-agnostic: no host Node path and no platform baked in.
  const built = await selectedMcpServiceEntries(true, { mode: "build", scope: "project", platform: "win32", optionalServices: new Set(["openosint"]) });
  assert.equal(built.find(([id]) => id === "openosint")[1].mcp.server.command, MCP_ENV_LAUNCHER, "build output keeps the portable launcher path (never a host's node.exe)");

  // A launch binary that is NOT an env-shebang script keeps its direct launch path (no wrapper) —
  // this is why synapse/grimoire (`#!/bin/sh`, absolute interpreter) are untouched.
  const plainCmd = path.join(dir, "plain-bin");
  writeFileSync(plainCmd, "#!/bin/sh\n", { mode: 0o755 });
  const plainWired = await selectedMcpServiceEntries(true, {
    mode: "install", scope: "project", optionalServices: new Set(["chrome-devtools"]),
    launchWiring: { "chrome-devtools": { command: plainCmd } },
  });
  const [, plainSvc] = plainWired.find(([id]) => id === "chrome-devtools");
  assert.equal(plainSvc.mcp.server.command, plainCmd, "an absolute-interpreter binary stays on its direct launch path");

  // ---- headless + missing REQUIRED prerequisite + no -y → block, wire nothing ----
  // A restricted PATH hides uv/openosint-mcp, and the disposable HOME has no ~/.local/bin binary, so
  // both required prerequisites read missing. Headless without -y must refuse to run the recipes.
  const blockHome = path.join(dir, "block-home");
  const blockDest = path.join(dir, "block-proj");
  const blocked = install(blockHome, blockDest, { PATH: "/usr/bin:/bin" }, []);
  assert.equal(blocked.status, 1, "a missing required prerequisite blocks a headless install");
  assert.match(blocked.stdout, /re-run with -y/, "the block explains how to authorize the install");
  // The executor logs "provisioning: ok"/"provisioning: FAILED" only AFTER a real spawn; their
  // absence proves no recipe ran (the remediation text may echo the recipe command — that is fine).
  assert.doesNotMatch(blocked.stdout, /provisioning: (ok|FAILED)/, "no recipe is executed when authorization is denied");
  assert.ok(!existsSync(path.join(blockDest, ".factory", "mcp.json")), "no host config is written when prerequisites are unmet (existing config preserved)");
  assert.ok(!existsSync(path.join(blockHome, ".local", "bin", "openosint-mcp")), "the installer did not install the missing binary");
  assert.ok(!existsSync(path.join(blockHome, ".local", "bin", "agent-surface-mcp-env")), "no launcher is materialized for a blocked install");

  // ---- satisfied prerequisites → wire openosint with the RESOLVED ABSOLUTE launch path (P1) ------
  // Real-environment integration evidence (peer#3): symlink the developer's ACTUAL openosint uv-tool
  // env into the disposable HOME so the extras are probed in the REAL interpreter against the REAL
  // libraries — no `exit 0` stub stands in as proof. openosint-mcp/uv resolve via the real PATH. If
  // that real env is absent (e.g. CI without openosint), the integration prerequisite is reported
  // unavailable and this case is skipped rather than faked.
  const realVenv = path.join(os.homedir(), ".local", "share", "uv", "tools", "openosint");
  const realEntries = await selectedMcpServiceEntries(true, { mode: "install", scope: "project", optionalServices: new Set(["openosint"]) });
  const realSatisfied = existsSync(realVenv)
    && provisioningStatus(realEntries).every((s) => s.prerequisites.every((p) => p.satisfied));
  if (!realSatisfied) {
    console.log("provision-install: openosint integration prerequisite unavailable — skipping the real-env wire assertion");
  } else {
    const okHome = path.join(dir, "ok-home");
    const okDest = path.join(dir, "ok-proj");
    mkdirSync(path.join(okHome, ".local", "share", "uv", "tools"), { recursive: true });
    symlinkSync(realVenv, path.join(okHome, ".local", "share", "uv", "tools", "openosint"));
    const ok = install(okHome, okDest, process.env, ["-y"]);
    assert.equal(ok.status, 0, `a satisfied install proceeds: ${ok.stderr || ok.stdout}`);
    assert.match(ok.stdout, /openosint-mcp ok/, "the already-present binary is reported satisfied");
    assert.match(ok.stdout, /openosint-extras ok/, "the provider extras are satisfied (probed in the REAL openosint interpreter)");
    assert.doesNotMatch(ok.stdout, /uv tool install|brew install/, "no recipe runs when prerequisites are already satisfied");
    const entry = JSON.parse(readFileSync(path.join(okDest, ".factory", "mcp.json"), "utf8")).mcpServers.openosint;
    assert.ok(entry, "openosint is wired once its prerequisites are satisfied");
    // P1: the wrapped launch command is the resolved ABSOLUTE path, not the bare registry name, so a
    // tool installed outside the launch PATH is still found.
    const launched = entry.args[entry.args.indexOf("--") + 1];
    assert.ok(path.isAbsolute(launched), `wrapped launch command must be absolute, got: ${launched}`);
    assert.equal(path.basename(launched), "openosint-mcp", "the resolved launch binary is openosint-mcp");
    assert.ok(existsSync(launched), "the resolved launch path exists on disk");
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("provision-install: ok");
