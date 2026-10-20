#!/usr/bin/env node
// The first-party MCP launcher shims, in both platform idioms. These are generated files that no
// other test reads, and a broken one only shows up when a host tries to start the server — so the
// shape is asserted here, and the generated shim is additionally EXECUTED on this platform.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchSpec } from "../../scripts/agent-surface/mcp-env-launch.mjs";
import { pinnedNodePath, shimContent, shimFileName, writeShims } from "../../scripts/agent-surface/mcp-shims.mjs";

const spec = { name: "synapse-bridge", nodeBin: "/opt/node/bin/node", entry: "/repo/mcps/synapse/dist/src/bridge.js", override: "SYNAPSE_NODE" };
const windowsSpec = { ...spec, nodeBin: "C:\\Program Files\\nodejs\\node.exe", entry: "C:\\repo\\mcps\\synapse\\dist\\src\\bridge.js" };

// ---- the invariant that keeps ONE floor check valid in two quoting regimes ----------------
// The same source string is embedded in a single-quoted `sh` argument and a double-quoted cmd.exe
// argument. A quote character of either kind would terminate one of them early and leave a shim
// that fails only at launch, on one platform.
const posix = shimContent(spec, "linux");
const windows = shimContent(windowsSpec, "win32");
const floorCheck = /-e ['"](.+?)['"]/.exec(posix)[1];
assert.doesNotMatch(floorCheck, /['"]/, "the floor check embeds in both quoting regimes, so it contains no quotes");
assert.equal(windows.includes(floorCheck), true, "both shims run the same floor check");
assert.match(floorCheck, /process\.versions\.node/, "the floor check reads the running runtime's version");

// ---- POSIX shape ----------------------------------------------------------------
assert.match(posix, /^#!\/bin\/sh\n/, "POSIX shims are shell scripts");
assert.match(posix, /NODE="\$\{SYNAPSE_NODE:-\/opt\/node\/bin\/node\}"/, "the pinned Node is baked in, overridable by the declared variable");
assert.match(posix, /exec "\$NODE" "\/repo\/mcps\/synapse\/dist\/src\/bridge\.js" "\$@"/, "arguments are forwarded to the entry");
assert.equal(shimFileName("synapse-bridge", "linux"), "synapse-bridge");

// ---- Windows shape --------------------------------------------------------------
assert.equal(shimFileName("synapse-bridge", "win32"), "synapse-bridge.cmd", "Windows executability comes from the extension");
assert.equal(windows.includes("\n") && !/[^\r]\n/.test(windows), true, "batch files are written with CRLF line endings");
// An undefined %VAR% stays literal inside a batch file, so the override must be guarded rather than
// assigned unconditionally — otherwise NODE becomes the text "%SYNAPSE_NODE%".
assert.match(windows, /set "NODE=C:\\Program Files\\nodejs\\node\.exe"/, "the pinned Node is baked in");
assert.match(windows, /if defined SYNAPSE_NODE set "NODE=%SYNAPSE_NODE%"/, "the override is guarded by `if defined`");
assert.match(windows, /"%NODE%" "C:\\repo\\mcps\\synapse\\dist\\src\\bridge\.js" %\*/, "every token that can contain a space is quoted, and arguments are forwarded");
assert.match(windows, /exit \/b %ERRORLEVEL%/, "the server's exit status is propagated");
assert.doesNotMatch(windows, /needs .*>=/, "the message avoids characters cmd would treat as redirection");
// cmd parses a parenthesised block IN FULL when it reaches the `if`, so one unescaped parenthesis
// anywhere inside breaks the file even on the branch never taken. Outside quotes there must be none.
const unquoted = windows.replaceAll(/"[^"]*"/g, '""');
assert.doesNotMatch(unquoted, /[()]/, `no unquoted parenthesis reaches cmd's parser: ${unquoted}`);

// ---- writing ---------------------------------------------------------------------
const dir = mkdtempSync(path.join(os.tmpdir(), "as-shims-"));
try {
  const binDir = path.join(dir, "bin");
  const written = writeShims({ binDir, nodeBin: process.execPath, entries: { "probe-tool": path.join(dir, "entry.mjs") }, override: "PROBE_NODE" });
  assert.equal(written.length, 1);
  assert.equal(path.basename(written[0]), shimFileName("probe-tool"));

  // EXECUTE the generated shim on this platform. A batch file that cmd cannot parse, or a shell
  // script with a broken guard, otherwise only shows up when a host tries to start the server.
  const entry = path.join(dir, "entry.mjs");
  writeFileSync(entry, "process.stdout.write(`entry:${process.argv.slice(2).join(',')}`);\n");
  const invocation = launchSpec(written[0], ["one", "two words"]);
  const ran = spawnSync(invocation.file, invocation.args, { encoding: "utf8", ...invocation.options });
  assert.equal(ran.status, 0, `the generated shim runs: ${ran.stderr || ran.stdout}`);
  assert.equal(ran.stdout.trim(), "entry:one,two words", "arguments survive the shim, including one containing a space");

  if (process.platform === "win32") {
    console.log("mcp-shims: the floor-refusal case runs on POSIX — a Windows stand-in runtime would have to be a batch file, which transfers control instead of returning");
  } else {
    assert.equal(statSync(written[0]).mode & 0o111, 0o111, "POSIX shims are executable");
    // The floor guard must refuse a runtime below the floor rather than crash inside node:sqlite.
    const fake = path.join(dir, "fake-node");
    writeFileSync(fake, "#!/bin/sh\nif [ \"$1\" = \"-e\" ]; then exit 1; fi\nexit 0\n", { mode: 0o755 });
    const refused = spawnSync(written[0], [], { encoding: "utf8", env: { ...process.env, PROBE_NODE: fake } });
    assert.equal(refused.status, 1, "an old runtime is refused");
    assert.match(refused.stderr, /probe-tool: needs Node 22\.17 or newer/, "and says so by name");
  }
  assert.match(readFileSync(written[0], "utf8"), /probe-tool/, "the shim names the tool it launches");
} finally {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

// ---- the pinned Node path -------------------------------------------------------
// Homebrew's process.execPath is a versioned Cellar binary that `brew cleanup` deletes after an
// upgrade, while the formula's opt link moves to the new version. A disposable prefix laid out the
// same way stands in for Homebrew: plain files where only identity matters, links to this Node where
// the shim has to launch.
if (process.platform === "win32") {
  console.log("mcp-shims: the Homebrew pin case runs on POSIX — Homebrew does not install Node on Windows");
} else {
  const prefix = mkdtempSync(path.join(os.tmpdir(), "as-brew-"));
  try {
    const keg = (formula, version, runnable = false) => {
      const bin = path.join(prefix, "Cellar", formula, version, "bin");
      mkdirSync(bin, { recursive: true });
      if (runnable) symlinkSync(process.execPath, path.join(bin, "node"));
      else writeFileSync(path.join(bin, "node"), "");
      return path.join(bin, "node");
    };
    const link = (formula, version) => {
      mkdirSync(path.join(prefix, "opt"), { recursive: true });
      rmSync(path.join(prefix, "opt", formula), { force: true });
      symlinkSync(path.join("..", "Cellar", formula, version), path.join(prefix, "opt", formula));
      return path.join(prefix, "opt", formula, "bin", "node");
    };
    const cellar = keg("node", "1.0.0");
    assert.equal(pinnedNodePath(cellar), cellar, "a Cellar Node without an opt link is pinned as is");
    const opt = link("node", "1.0.0");
    assert.equal(pinnedNodePath(cellar), opt, "a Cellar Node is pinned through its formula's opt link");
    assert.equal(pinnedNodePath(keg("node", "1.0.1")), path.join(prefix, "Cellar", "node", "1.0.1", "bin", "node"), "an opt link that resolves to another version is not substituted");
    const versioned = keg("node@22", "22.17.0");
    const versionedOpt = link("node@22", "22.17.0");
    assert.equal(pinnedNodePath(versioned), versionedOpt, "a versioned formula is pinned through its own opt link");
    assert.equal(pinnedNodePath("/usr/local/bin/node"), "/usr/local/bin/node", "a Node outside a Cellar is pinned as is");

    // The upgrade itself: once cleanup deletes the old keg, a shim pinned through the opt link still
    // launches. The PATH holds no node, so only the pin can reach one.
    const old = keg("probe", "2.0.0", true);
    link("probe", "2.0.0");
    const entry = path.join(prefix, "entry.mjs");
    writeFileSync(entry, "process.stdout.write('upgraded-ok');\n");
    const [shim] = writeShims({ binDir: path.join(prefix, "bin"), nodeBin: pinnedNodePath(old), entries: { "probe-tool": entry }, override: "PROBE_NODE" });
    keg("probe", "2.0.1", true);
    link("probe", "2.0.1");
    rmSync(path.join(prefix, "Cellar", "probe", "2.0.0"), { recursive: true, force: true });
    const emptyPath = path.join(prefix, "empty-path");
    mkdirSync(emptyPath);
    const upgraded = spawnSync(shim, [], { encoding: "utf8", env: { PATH: emptyPath } });
    assert.equal(upgraded.status, 0, upgraded.stderr);
    assert.equal(upgraded.stdout, "upgraded-ok", "the shim reaches the upgraded keg through the opt link");
  } finally {
    rmSync(prefix, { recursive: true, force: true });
  }
}

console.log("mcp-shims: ok");
