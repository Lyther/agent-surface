#!/usr/bin/env node
// The first-party MCP launcher shims, in both platform idioms. These are generated files that no
// other test reads, and a broken one only shows up when a host tries to start the server — so the
// shape is asserted here, and the POSIX shim is additionally EXECUTED where a shell exists.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { shimContent, shimFileName, writeShims } from "../../scripts/agent-surface/mcp-shims.mjs";

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

// ---- writing ---------------------------------------------------------------------
const dir = mkdtempSync(path.join(os.tmpdir(), "as-shims-"));
try {
  const binDir = path.join(dir, "bin");
  const written = writeShims({ binDir, nodeBin: process.execPath, entries: { "probe-tool": path.join(dir, "entry.mjs") }, override: "PROBE_NODE" });
  assert.equal(written.length, 1);
  assert.equal(path.basename(written[0]), shimFileName("probe-tool"));

  if (process.platform === "win32") {
    console.log("mcp-shims: POSIX execution case skipped on win32 (no mode bits; the .cmd shim is exercised by the first-party acceptance)");
  } else {
    assert.equal(statSync(written[0]).mode & 0o111, 0o111, "POSIX shims are executable");
    // Execute it: the shim must reach the entry with its arguments, through the pinned Node.
    const entry = path.join(dir, "entry.mjs");
    rmSync(entry, { force: true });
    writeFileSync(entry, "process.stdout.write(`entry:${process.argv.slice(2).join(',')}`);\n");
    const ran = spawnSync(written[0], ["one", "two words"], { encoding: "utf8" });
    assert.equal(ran.status, 0, `the generated shim runs: ${ran.stderr}`);
    assert.equal(ran.stdout, "entry:one,two words", "arguments survive the shim, including one containing a space");

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

console.log("mcp-shims: ok");
