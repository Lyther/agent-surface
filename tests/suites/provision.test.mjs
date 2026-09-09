#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectPrerequisite, formatProvisioningPlan, isExecutableFile, launchNameOf, provisioningActions,
  provisioningStatus, satisfiesFloor, selectRecipe, unrecipedRequired, whichSync,
} from "../../scripts/agent-surface/provision.mjs";

// ---- version floor comparison ------------------------------------------
assert.equal(satisfiesFloor("22.17.0", ">=22.17.0"), true, "equal satisfies");
assert.equal(satisfiesFloor("26.8.1", ">=22.17.0"), true, "higher major satisfies");
assert.equal(satisfiesFloor("22.18.0", ">=22.17.0"), true, "higher minor satisfies");
assert.equal(satisfiesFloor("22.16.9", ">=22.17.0"), false, "lower minor fails");
assert.equal(satisfiesFloor("20.19.5", ">=22.17.0"), false, "lower major fails (root CLI's floor ≠ MCP floor)");
assert.equal(satisfiesFloor(null, ">=22.17.0"), false, "unknown version fails closed");
assert.equal(satisfiesFloor("22.17.0", "garbage"), false, "malformed floor fails closed");

const dir = mkdtempSync(path.join(os.tmpdir(), "as-provision-"));
try {
  const bin = path.join(dir, "toolx");
  writeFileSync(bin, "#!/bin/sh\n", { mode: 0o755 });
  const subdir = path.join(dir, "adir");
  mkdirSync(subdir);
  const nonexec = path.join(dir, "plain.txt");
  writeFileSync(nonexec, "not a program\n", { mode: 0o644 });

  // ---- Windows: "exists" is not "executable" either — the OS decides by EXTENSION ----
  // The same defect class as above, in its Windows form: a POSIX-style extensionless launch path
  // (`~/.local/bin/uv`) or a stray text file is NOT a runnable binary there, so it must not read
  // satisfied. Only the executability RULE is platform-driven, so this runs against real files.
  const winExe = path.join(dir, "tool.exe");
  writeFileSync(winExe, "MZ\n", { mode: 0o644 }); // no POSIX exec bit: irrelevant on Windows
  const winCmd = path.join(dir, "shim.cmd");
  writeFileSync(winCmd, "@echo off\n", { mode: 0o644 });
  const winBare = path.join(dir, "uv");
  writeFileSync(winBare, "not a windows program\n", { mode: 0o644 });
  assert.equal(isExecutableFile(winExe, "win32"), true, "a .exe is executable on Windows regardless of POSIX mode bits");
  assert.equal(isExecutableFile(winCmd, "win32"), true, "a .cmd shim is executable on Windows");
  assert.equal(isExecutableFile(winBare, "win32"), false, "an extensionless file is NOT executable on Windows");
  assert.equal(isExecutableFile(nonexec, "win32"), false, "a .txt file is NOT executable on Windows");
  assert.equal(isExecutableFile(subdir, "win32"), false, "a directory is NOT executable on Windows");
  assert.equal(isExecutableFile(winExe, "win32", { PATHEXT: ".COM;.BAT" }), false, "the host's PATHEXT decides: .EXE excluded → not executable");

  // PATH lookup applies PATHEXT: a bare name resolves to its .exe/.cmd; an extensionless file does not.
  const winEnv = { PATH: dir, PATHEXT: ".COM;.EXE;.BAT;.CMD" };
  assert.equal(whichSync("tool", { platform: "win32", env: winEnv }), path.resolve(winExe), "a bare Windows command resolves through PATHEXT");
  assert.equal(whichSync("shim", { platform: "win32", env: winEnv }), path.resolve(winCmd), "a .cmd shim resolves through PATHEXT");
  assert.equal(whichSync("tool.exe", { platform: "win32", env: winEnv }), path.resolve(winExe), "a command that already carries its extension is not double-suffixed");
  assert.equal(whichSync("uv", { platform: "win32", env: winEnv }), null, "an extensionless file on PATH does not resolve on Windows");
  assert.equal(whichSync("plain", { platform: "win32", env: winEnv }), null, "a non-PATHEXT extension on PATH does not resolve on Windows");

  // A resolved Windows binary must still match its bare registry command (npx → npx.cmd, uv → uv.exe).
  assert.equal(launchNameOf("C:\\Program Files\\nodejs\\npx.cmd", "win32"), "npx", "the Windows launch name drops the PATHEXT extension");
  assert.equal(launchNameOf("C:\\Users\\u\\.local\\bin\\uv.exe", "win32"), "uv", "…including .exe");
  assert.equal(launchNameOf("C:\\tools\\my.tool.exe", "win32"), "my.tool", "only the trailing extension is dropped");
  assert.equal(launchNameOf("C:\\data\\report.txt", "win32"), "report.txt", "a non-PATHEXT extension is kept (it is part of the name)");
  assert.equal(launchNameOf("/usr/local/bin/openosint-mcp", "linux"), "openosint-mcp", "POSIX keeps the plain basename");

  // ---- POSIX executability: everything below resolves binaries by the execute BIT, and runs
  // real `#!/bin/sh` stubs as interpreters. A Windows filesystem can express neither, so these
  // cases run where the rule they test exists; their Windows counterparts are asserted above.
  if (process.platform === "win32") {
    console.log("provision: POSIX executability cases skipped on win32 (exec bits and shell stubs are not expressible)");
  } else {
    // ---- "exists" is not "executable" (a directory / non-exec file is not a usable binary) ----
    assert.equal(isExecutableFile(bin, "linux"), true, "an executable regular file is usable");
    assert.equal(isExecutableFile(subdir, "linux"), false, "a directory is NOT an executable file");
    assert.equal(isExecutableFile(nonexec, "linux"), false, "a non-executable regular file is NOT usable");
    assert.equal(isExecutableFile(path.join(dir, "missing"), "linux"), false, "a missing path is not executable");


    // ---- PATH resolution accepts only an executable regular file -----------
    assert.equal(whichSync("toolx", { platform: "linux", env: { PATH: dir } }), path.resolve(bin), "resolves an executable PATH binary to an absolute path");
    assert.equal(whichSync("plain.txt", { platform: "linux", env: { PATH: dir } }), null, "a non-executable file on PATH does not resolve (POSIX)");
    assert.equal(whichSync("adir", { platform: "linux", env: { PATH: dir } }), null, "a directory on PATH does not resolve");
    assert.equal(whichSync("definitely-not-real-xyz", { platform: "linux", env: { PATH: dir } }), null, "missing command → null");
    assert.equal(whichSync(bin), path.resolve(bin), "an absolute-path input is returned when it is executable");

    // ---- selectRecipe: pick the first alternative whose manager is present -
    assert.equal(
      selectRecipe([{ requires: "absent-mgr", run: ["a"], source: "a" }, { requires: "toolx", run: ["b"], source: "b" }], { platform: "linux", env: { PATH: dir } }).source,
      "b", "selectRecipe skips an alternative whose manager is absent and picks the first present one");
    assert.equal(selectRecipe([{ requires: "absent-mgr", run: ["a"], source: "a" }], { platform: "linux", env: { PATH: dir } }), null, "no alternative applies when no required manager is present");
    assert.equal(selectRecipe([{ run: ["a"], source: "a" }], { platform: "linux", env: { PATH: "" } }).source, "a", "an alternative with no `requires` always applies");

    // ---- detection: present via explicit (executable) path ----------------
    const present = detectPrerequisite(
      { id: "toolx", kind: "tool", detect: { paths: [bin] }, recipes: { linux: [{ run: ["x"], source: "s" }] } },
      { platform: "linux", env: { PATH: dir } },
    );
    assert.equal(present.satisfied, true);
    assert.equal(present.resolvedPath, path.resolve(bin), "resolves the absolute launch path (no shell PATH needed)");
    assert.equal(present.recipe, null, "satisfied prerequisite carries no recipe");

    // ---- detection: a directory / non-exec file at the launch path is NOT satisfied ----
    const atDir = detectPrerequisite(
      { id: "d", kind: "launch-binary", detect: { paths: [subdir] }, recipes: { linux: [{ run: ["x"], source: "s" }] } },
      { platform: "linux", env: { PATH: dir } },
    );
    assert.equal(atDir.satisfied, false, "a directory at the launch path is not a satisfied binary");
    const atNonExec = detectPrerequisite(
      { id: "n", kind: "launch-binary", detect: { paths: [nonexec] }, recipes: { linux: [{ run: ["x"], source: "s" }] } },
      { platform: "linux", env: { PATH: dir } },
    );
    assert.equal(atNonExec.satisfied, false, "a non-executable file at the launch path is not satisfied");

    // ---- detection: missing with a platform recipe (now a single selected alternative) ----
    const missing = detectPrerequisite(
      { id: "absent", kind: "tool", detect: { paths: [path.join(dir, "nope")] }, recipes: { linux: [{ run: ["apt", "install", "x"], elevation: true, source: "apt x" }] } },
      { platform: "linux", env: { PATH: dir } },
    );
    assert.equal(missing.satisfied, false);
    assert.deepEqual(missing.recipe, { run: ["apt", "install", "x"], elevation: true, source: "apt x" }, "missing prerequisite carries the selected recipe (single alternative)");

    // ---- detection: manager selection among Linux alternatives ------------
    const mgr = detectPrerequisite(
      { id: "m", kind: "tool", detect: { paths: [path.join(dir, "nope")] }, recipes: { linux: [{ requires: "absent-mgr", run: ["x"], source: "apt path" }, { requires: "toolx", run: ["y"], elevation: true, source: "detected-mgr path" }] } },
      { platform: "linux", env: { PATH: dir } },
    );
    assert.equal(mgr.recipe.source, "detected-mgr path", "the selected recipe is the first alternative whose manager resolves on PATH");

    // ---- detection: missing but NO runnable recipe for this platform ------
    const noRecipe = detectPrerequisite(
      { id: "absent2", kind: "tool", detect: { paths: [path.join(dir, "nope2")] }, recipes: { win32: [{ run: ["x"], source: "s" }] } },
      { platform: "linux", env: { PATH: dir } },
    );
    assert.equal(noRecipe.satisfied, false);
    assert.equal(noRecipe.recipe, null, "no current-platform recipe → null (a blocker)");
    const noManager = detectPrerequisite(
      { id: "absent3", kind: "tool", detect: { paths: [path.join(dir, "nope3")] }, recipes: { linux: [{ requires: "absent-mgr", run: ["x"], source: "s" }] } },
      { platform: "linux", env: { PATH: dir } },
    );
    assert.equal(noManager.recipe, null, "recipes exist but no required manager is present → null (a blocker)");

    // ---- detection: node floor against the real node ---------------------
    const nodeLow = detectPrerequisite({ id: "node-runtime", kind: "runtime", detect: { command: "node", node: ">=1.0.0" }, recipes: { [process.platform]: [{ run: ["brew", "install", "node"], source: "brew" }] } });
    assert.equal(nodeLow.satisfied, true, "real node satisfies a >=1.0.0 floor");
    assert.ok(nodeLow.resolvedPath, "node resolves to an absolute path");
    const nodeHigh = detectPrerequisite({ id: "node-runtime", kind: "runtime", detect: { command: "node", node: ">=999.0.0" }, recipes: { [process.platform]: [{ run: ["brew", "install", "node"], source: "brew" }] } });
    assert.equal(nodeHigh.satisfied, false, "an unreachable node floor is unsatisfied");
    assert.equal(nodeHigh.nodeOk, false);
    assert.ok(nodeHigh.recipe, "unsatisfied floor yields the install recipe");

    // ---- detection: Python modules in the tool's OWN interpreter ----------
    // An installed launcher must not mask missing library extras: probe the modules in the interpreter.
    const okPy = path.join(dir, "py-ok");
    writeFileSync(okPy, "#!/bin/sh\nexit 0\n", { mode: 0o755 }); // stub: "modules present"
    const badPy = path.join(dir, "py-bad");
    writeFileSync(badPy, "#!/bin/sh\nexit 1\n", { mode: 0o755 }); // stub: "modules missing"
    const pyRecipe = { linux: [{ run: ["uv", "tool", "install"], source: "uv extras" }] };
    const pyOk = detectPrerequisite({ id: "extras", kind: "tool", detect: { python: { interpreter: [okPy], modules: ["shodan"] } }, recipes: pyRecipe }, { platform: "linux", env: { PATH: dir } });
    assert.equal(pyOk.satisfied, true, "python modules importable in the interpreter → satisfied");
    assert.equal(pyOk.recipe, null);
    const pyBad = detectPrerequisite({ id: "extras", kind: "tool", detect: { python: { interpreter: [badPy], modules: ["shodan"] } }, recipes: pyRecipe }, { platform: "linux", env: { PATH: dir } });
    assert.equal(pyBad.satisfied, false, "missing python modules → unsatisfied");
    assert.equal(pyBad.recipe.source, "uv extras", "the extras recipe is surfaced when modules are missing");
    const pyNone = detectPrerequisite({ id: "extras", kind: "tool", detect: { python: { interpreter: [path.join(dir, "no-python")], modules: ["shodan"] } }, recipes: pyRecipe }, { platform: "linux", env: { PATH: dir } });
    assert.equal(pyNone.satisfied, false, "no interpreter found → unsatisfied (extras cannot be present)");
    // ---- the interpreter ROOT comes from the tool manager, not a hard-coded layout ----
    // uv keeps tool environments under ~/.local/share/uv/tools on POSIX but %APPDATA%\uv\data\tools on
    // Windows, and either can be redirected by config — so a hard-coded path makes a SUCCESSFUL
    // install read as missing extras and silently drops the service. Ask the resolved manager instead.
    const toolsRoot = path.join(dir, "custom-uv-tools"); // deliberately NOT the default layout
    mkdirSync(path.join(toolsRoot, "openosint", "bin"), { recursive: true });
    const rootedPy = path.join(toolsRoot, "openosint", "bin", "python");
    writeFileSync(rootedPy, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const uvStub = path.join(dir, "uv-stub");
    writeFileSync(uvStub, `#!/bin/sh\necho "${toolsRoot}"\n`, { mode: 0o755 });
    const extrasPrereq = {
      id: "extras", kind: "tool", recipes: pyRecipe,
      detect: { python: {
        interpreter_root: { prerequisite: "uv", run: ["tool", "dir"] },
        interpreter_subpaths: ["openosint/bin/python", "openosint/Scripts/python.exe"],
        interpreter: [path.join(dir, "default-layout-python")], // the old hard-coded fallback: absent here
        modules: ["shodan"],
      } },
    };
    const uvDetected = new Map([["uv", { id: "uv", resolvedPath: uvStub }]]);
    const rooted = detectPrerequisite(extrasPrereq, { platform: "linux", env: { PATH: dir } }, uvDetected);
    assert.equal(rooted.pythonInterpreter, rootedPy, "the interpreter is found under the directory the manager reported, not the assumed default");
    assert.equal(rooted.satisfied, true, "a real install in a non-default tool directory is correctly satisfied");

    // The Windows venv layout (Scripts/python.exe) is selected from the same reported root.
    mkdirSync(path.join(toolsRoot, "openosint", "Scripts"), { recursive: true });
    const winPy = path.join(toolsRoot, "openosint", "Scripts", "python.exe");
    writeFileSync(winPy, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const uvStubWin = path.join(dir, "uv-stub.exe");
    writeFileSync(uvStubWin, `#!/bin/sh\necho "${toolsRoot}"\n`, { mode: 0o755 });
    const winRooted = detectPrerequisite(extrasPrereq, { platform: "win32", env: { PATH: dir, PATHEXT: ".COM;.EXE;.BAT;.CMD" } }, new Map([["uv", { id: "uv", resolvedPath: uvStubWin }]]));
    assert.equal(winRooted.pythonInterpreter, winPy, "on Windows the Scripts/python.exe layout is selected under the same reported root");

    // Manager unresolvable (not yet installed) → fall back to the declared literal locations.
    const fallbackPrereq = { ...extrasPrereq, detect: { python: { ...extrasPrereq.detect.python, interpreter: [okPy] } } };
    const fallback = detectPrerequisite(fallbackPrereq, { platform: "linux", env: { PATH: dir } }, new Map());
    assert.equal(fallback.pythonInterpreter, okPy, "with no resolved manager the declared fallback interpreter is used");

    // A manager that fails (or prints nothing) must not resolve a bogus root.
    const brokenUv = path.join(dir, "uv-broken");
    writeFileSync(brokenUv, "#!/bin/sh\nexit 3\n", { mode: 0o755 });
    const broken = detectPrerequisite(extrasPrereq, { platform: "linux", env: { PATH: dir } }, new Map([["uv", { id: "uv", resolvedPath: brokenUv }]]));
    assert.equal(broken.satisfied, false, "a failing directory query yields no interpreter (fails closed, no guessed path)");

    // Detection order must make this possible at all: siblings are carried forward in registry order.
    const orderedStatus = provisioningStatus([["svc", { provisioning: { prerequisites: [
      { id: "uv", kind: "tool", detect: { paths: [uvStub] }, recipes: pyRecipe },
      extrasPrereq,
    ] } }]], { platform: "linux", env: { PATH: dir } });
    assert.equal(orderedStatus[0].prerequisites[1].pythonInterpreter, rootedPy, "provisioningStatus feeds an earlier prerequisite's resolved path to a later one");

    // The exact peer#3 defect: an existing executable does NOT suppress a missing python extra.
    const combined = detectPrerequisite({ id: "c", kind: "tool", detect: { paths: [bin], python: { interpreter: [badPy], modules: ["shodan"] } }, recipes: pyRecipe }, { platform: "linux", env: { PATH: dir } });
    assert.equal(combined.satisfied, false, "an existing executable does NOT mask a missing python extra");

    // ---- status / actions / blockers / plan ------------------------------
    const services = [
      ["svc", { provisioning: { prerequisites: [
        { id: "uv", kind: "tool", detect: { paths: [path.join(dir, "nope")] }, recipes: { linux: [{ run: ["apt", "install", "uv"], elevation: true, source: "apt uv" }] } },
        { id: "bin", kind: "launch-binary", detect: { paths: [bin] }, recipes: { linux: [{ run: ["x"], source: "s" }] } },
      ] } }],
      ["keyless", {}],
    ];
    const status = provisioningStatus(services, { platform: "linux", env: { PATH: dir } });
    assert.equal(status.length, 1, "a service without a provisioning block is omitted");
    const actions = provisioningActions(status);
    assert.deepEqual(actions.map((a) => a.prerequisite), ["uv"], "only missing prerequisites with recipes become actions, in dependency order");
    assert.equal(actions[0].elevation, true, "elevation is surfaced per action");

    const blockerStatus = provisioningStatus([["svc2", { provisioning: { prerequisites: [{ id: "x", kind: "tool", detect: { paths: [path.join(dir, "nope")] }, recipes: { win32: [{ run: ["x"], source: "s" }] } }] } }]], { platform: "linux", env: { PATH: dir } });
    assert.deepEqual(unrecipedRequired(blockerStatus, "linux").map((b) => b.id), ["x"], "a required prerequisite with no current-platform recipe is a blocker");

    const plan = formatProvisioningPlan(status);
    assert.ok(plan.some((line) => /uv MISSING .* \[needs elevation\]/.test(line)), "plan shows the missing prerequisite, source, and elevation");
    assert.ok(plan.some((line) => /bin ok/.test(line)), "plan shows a satisfied prerequisite");
  }

} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("provision: ok");
