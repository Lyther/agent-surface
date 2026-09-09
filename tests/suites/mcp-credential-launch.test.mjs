#!/usr/bin/env node
// End-to-end credential delivery: install a credentialed MCP into a disposable HOME, then run the
// EXACT generated command from the config (only the real MCP binary after `--` is swapped for a
// probe) to prove the installer-collected credential reaches the launched process. A disposable
// HOME — not a bin-directory override — keeps the generated command and the materialized wrapper on
// the same path, so the test exercises entry.command itself. The probe run is an env-delivery
// DIAGNOSTIC, not real-MCP evidence (the real OpenOSINT process is verified out of band).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { provisioningStatus } from "../../scripts/agent-surface/provision.mjs";
import { selectedMcpServiceEntries } from "../../scripts/agent-surface/targets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = path.join(root, "scripts", "agent-surface.mjs");
const dir = mkdtempSync(path.join(os.tmpdir(), "as-cred-launch-"));

// Install into a disposable HOME so the config's "~" and the wrapper both resolve to the same place.
function install(home, dest, extra) {
  mkdirSync(home, { recursive: true });
  mkdirSync(dest, { recursive: true });
  return spawnSync(process.execPath, [cli, "install", "--target", "droid", "--dest", dest, "--category", "mcps", ...extra, "-y"], {
    encoding: "utf8",
    env: { ...process.env, HOME: home },
  });
}

// Seed the path-based prerequisites inside the disposable HOME so this suite runs NO package
// manager and needs no network: provisioning EXECUTION is proven in provision-exec and
// provision-install, while this suite is about credential delivery and launch shape. These stubs
// stand in only for "a binary exists at this path"; none of them is offered as evidence that the
// real tool works. Without them the installer would authorize (-y) real recipes on any machine that
// happens to lack uv — which is exactly what a hermetic suite must not do.
function seedBin(home, name, body = "#!/bin/sh\nexit 0\n") {
  const bin = path.join(home, ".local", "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, name), body, { mode: 0o755 });
}

function seedOpenosintPrerequisites(home) {
  const tools = path.join(home, ".local", "share", "uv", "tools");
  // `uv tool dir` is how the extras probe locates openosint's own interpreter; answer with the
  // seeded tools directory so that resolution path is the one exercised.
  seedBin(home, "uv", `#!/bin/sh\necho "${tools}"\n`);
  seedBin(home, "openosint-mcp");
  const venvBin = path.join(tools, "openosint", "bin");
  mkdirSync(venvBin, { recursive: true });
  writeFileSync(path.join(venvBin, "python"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
}

// Whether the installer could proceed for a service under this HOME, asked of the REAL detector so
// the skip condition is exactly the block condition. Some prerequisites are properties of the host
// and must not be faked: synapse's Node >=22.17 floor (node:sqlite), and openosint's extras, which
// are probed by running a real Python interpreter — creating one is not possible on Windows, where
// executability is by extension and a shell stub is not an executable.
async function serviceIsProvisionable(id, homedir) {
  const entries = (await selectedMcpServiceEntries(true, { mode: "install", scope: "project", optionalServices: new Set([id]) })).filter(([entryId]) => entryId === id);
  const status = provisioningStatus(entries, { homedir });
  const unmet = status.flatMap((service) => service.prerequisites.filter((prereq) => !prereq.satisfied).map((prereq) => prereq.id));
  return { ok: unmet.length === 0, unmet };
}

try {
  // ---- credentialed server: wrapper materialized AT the generated command path ----
  const home = path.join(dir, "home");
  const dest = path.join(dir, "proj");
  seedOpenosintPrerequisites(home);
  const openosintReady = await serviceIsProvisionable("openosint", home);
  if (!openosintReady.ok) {
    console.log(`mcp-credential-launch: openosint prerequisite unavailable here (${openosintReady.unmet.join(", ")}) — skipping the credential-delivery case`);
  } else {
    const res = install(home, dest, ["--service", "openosint"]);
    assert.equal(res.status, 0, `install failed: ${res.stderr || res.stdout}`);

    const entry = JSON.parse(readFileSync(path.join(dest, ".factory", "mcp.json"), "utf8")).mcpServers.openosint;

    // F008/F009: the generated command IS the materialized wrapper — config points exactly where the
    // wrapper was written (both resolve against the same $HOME), and it exists.
    const wrapper = path.join(home, ".local", "bin", "agent-surface-mcp-env");
    assert.equal(entry.command, wrapper, "generated command is the wrapper at the resolved $HOME path");
    assert.ok(existsSync(entry.command), "the wrapper exists at exactly the path the config launches");

    // F007: the wrapper pins the install Node by absolute path (survives a minimal PATH).
    const wrapperText = readFileSync(entry.command, "utf8");
    assert.match(wrapperText, /^#!\/bin\/sh/, "wrapper is a shell script");
    assert.ok(wrapperText.includes(process.execPath), "wrapper pins the install Node by absolute path");
    assert.ok(statSync(entry.command).mode & 0o100, "wrapper is executable");

    // F006: the installer-resolved env-file path is baked into the launch args (project .env here).
    const envFlag = entry.args.indexOf("--as-env-file");
    assert.notEqual(envFlag, -1, "the resolved env-file path is baked into the launch args");
    const bakedEnvPath = entry.args[envFlag + 1];
    assert.equal(bakedEnvPath, path.join(dest, ".env"), "baked path is the installer-resolved project .env");
    // P1: the real command after "--" is the provisioning-resolved ABSOLUTE openosint-mcp path (not the
    // bare name), so the wrapper finds it even when its install dir is not on the launch PATH.
    const innerCommand = entry.args[entry.args.indexOf("--") + 1];
    assert.ok(path.isAbsolute(innerCommand) && path.basename(innerCommand) === "openosint-mcp", `real command after -- is the resolved absolute openosint-mcp path, got: ${innerCommand}`);

    // Env-delivery DIAGNOSTIC: seed the baked env-file, then run the ACTUAL generated command with the
    // config's own args (only the real MCP binary after `--` swapped for a probe), from a DIFFERENT cwd
    // under a restricted PATH. The probe must receive the installer-collected value.
    writeFileSync(bakedEnvPath, "SHODAN_API_KEY=installer-collected\n", { mode: 0o600 });
    const probe = path.join(dir, "probe.sh");
    writeFileSync(probe, "#!/bin/sh\nprintf 'SHODAN_API_KEY=%s' \"$SHODAN_API_KEY\"\n", { mode: 0o755 });
    const launchArgs = entry.args.slice(0, entry.args.indexOf("--") + 1).concat([probe]);
    const launch = spawnSync(entry.command, launchArgs, { encoding: "utf8", cwd: dir, env: { PATH: "/usr/bin:/bin", HOME: home } });
    assert.equal(launch.status, 0, `launch failed: ${launch.stderr}`);
    assert.equal(launch.stdout, "SHODAN_API_KEY=installer-collected", "installer-collected credential reaches the launched process under minimal PATH from another cwd");

    // ---- custom --credentials-file is honored and baked verbatim (F006) --------
    // (--env-file would be swallowed by Node's own bootstrap flag; the CLI uses --credentials-file.)
    const customDest = path.join(dir, "custom");
    const customFile = path.join(customDest, "secrets.env");
    const custom = install(home, customDest, ["--service", "openosint", "--credentials-file", customFile]);
    assert.equal(custom.status, 0, `custom install failed: ${custom.stderr || custom.stdout}`);
    const customEntry = JSON.parse(readFileSync(path.join(customDest, ".factory", "mcp.json"), "utf8")).mcpServers.openosint;
    assert.equal(customEntry.args[customEntry.args.indexOf("--as-env-file") + 1], customFile, "a custom --credentials-file path is baked in verbatim");
  }

  // ---- keyless server: direct launch preserved, no wrapper materialized -------
  const keylessHome = path.join(dir, "keyless-home");
  seedBin(keylessHome, "synapse-bridge");
  const provisionable = await serviceIsProvisionable("synapse", keylessHome);
  if (!provisionable.ok) {
    console.log(`mcp-credential-launch: synapse prerequisite unavailable here (${provisionable.unmet.join(", ")}) — skipping the keyless install case`);
  } else {
    const keylessDest = path.join(dir, "keyless");
    const keyless = install(keylessHome, keylessDest, ["--service", "synapse"]);
    assert.equal(keyless.status, 0, `keyless install failed: ${keyless.stderr || keyless.stdout}`);
    const keylessConfig = JSON.parse(readFileSync(path.join(keylessDest, ".factory", "mcp.json"), "utf8"));
    assert.equal(
      keylessConfig.mcpServers.synapse.command,
      path.join(keylessHome, ".local", "bin", "synapse-bridge"),
      "keyless synapse keeps its direct launch command",
    );
    assert.ok(!existsSync(path.join(keylessHome, ".local", "bin", "agent-surface-mcp-env")), "a keyless install never materializes the wrapper");
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("mcp-credential-launch: ok");
