#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { gooseMcpPath, ideUserDataRoot, traeMcpPath, vsCodeUserRoot, zedConfigRoot, zedInstructionPath, zedLegacyInstructionPath, zedMcpPath } from "../../scripts/agent-surface/roots.mjs";
import { targets } from "../../scripts/agent-surface/targets.mjs";

assert.equal(
  ideUserDataRoot("Code", { platform: "win32", appData: "D:\\Profiles\\agent\\AppData\\Roaming" }),
  "D:\\Profiles\\agent\\AppData\\Roaming\\Code",
);
assert.equal(
  ideUserDataRoot("Code", { platform: "win32", appData: "D:\\Relocated", relocateExternalRoutes: true }),
  "AppData\\Roaming\\Code",
);
assert.equal(
  vsCodeUserRoot("Code", { platform: "win32", appData: "D:\\Relocated" }),
  "AppData\\Roaming\\Code\\User",
);

// Zed reads ~/.config/zed on macOS and Linux and the roaming AppData directory on Windows, resolved
// from the profile home even when %APPDATA% points elsewhere; project scope is the same everywhere.
for (const platform of ["darwin", "linux"]) {
  assert.equal(zedInstructionPath({ scope: "user", platform }), path.join(".config", "zed", "AGENTS.md"));
  assert.equal(zedMcpPath({ scope: "user", platform }), path.join(".config", "zed", "settings.json"));
}
const windowsUser = { scope: "user", platform: "win32", appData: "D:\\Relocated" };
assert.equal(zedConfigRoot(windowsUser), "AppData\\Roaming\\Zed");
assert.equal(zedInstructionPath(windowsUser), "AppData\\Roaming\\Zed\\AGENTS.md");
assert.equal(zedMcpPath(windowsUser), "AppData\\Roaming\\Zed\\settings.json");
for (const platform of ["darwin", "linux", "win32"]) {
  assert.equal(zedInstructionPath({ scope: "project", platform }), "AGENTS.md");
  assert.equal(zedConfigRoot({ scope: "project", platform }), ".zed");
}

// Goose keeps config.yaml under ~/.config/goose on macOS and Linux and under Block\goose\config in the
// roaming AppData directory on Windows.
for (const platform of ["darwin", "linux"]) {
  assert.equal(gooseMcpPath({ scope: "user", platform }), path.join(".config", "goose", "config.yaml"));
}
assert.equal(gooseMcpPath(windowsUser), "AppData\\Roaming\\Block\\goose\\config\\config.yaml");
// The pre-fix Windows routes exist only for Windows user installs; anywhere else the old path is the
// live route or was never written, so no migration or cleanup may name it.
const windowsOnlyRoutes = [
  zedLegacyInstructionPath,
  targets.zed.cleanupConfigRoutes[0].relativeOutput,
  targets.goose.cleanupConfigRoutes[0].relativeOutput,
];
for (const route of windowsOnlyRoutes) {
  assert.notEqual(route({ scope: "user", platform: "win32" }), null);
  for (const context of [{ scope: "user", platform: "darwin" }, { scope: "user", platform: "linux" }, { scope: "project", platform: "win32" }]) {
    assert.equal(route(context), null, `${JSON.stringify(context)} has no pre-fix Windows route`);
  }
}
// Each Trae IDE edition reads user MCP servers from mcp.json beside its per-OS User settings; a
// scope-derived Windows install honors %APPDATA%, and a project keeps .trae/mcp.json.
for (const [product, folder] of [["Trae", "Trae"], ["Trae CN", "Trae CN"]]) {
  const route = traeMcpPath(product);
  assert.equal(route({ scope: "user", platform: "darwin" }), path.join("Library", "Application Support", folder, "User", "mcp.json"));
  assert.equal(route({ scope: "user", platform: "linux" }), path.join(".config", folder, "User", "mcp.json"));
  assert.equal(route({ scope: "user", platform: "win32", appData: "D:\\Profiles\\agent\\AppData\\Roaming" }), path.join(`D:\\Profiles\\agent\\AppData\\Roaming\\${folder}`, "User", "mcp.json"));
  assert.equal(route({ scope: "project", platform: "win32" }), path.join(".trae", "mcp.json"));
}
console.log("roots: ok");
