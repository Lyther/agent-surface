#!/usr/bin/env node
// Opt-in acceptance against a preinstalled REA: no package acquisition, model calls or native
// provider setup. The real generated command analyzes source files without executing Electron.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as TOML from "@decimalturn/toml-patch";
import { mcpSession, minimalLaunchEnv, resultText } from "../lib/mcp-session.mjs";

if (process.env.AGENT_SURFACE_LIVE_REA !== "1") {
  console.log("live-rea: skipped (set AGENT_SURFACE_LIVE_REA=1 with the reviewed REA on PATH)");
} else {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dir = mkdtempSync(path.join(os.tmpdir(), "as-live-rea-"));
  try {
    const home = path.join(dir, "home");
    const project = path.join(dir, "project");
    const fixture = path.join(dir, "electron-source");
    for (const folder of [home, project, fixture]) mkdirSync(folder);
    writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ name: "rea-acceptance", version: "1.0.0", main: "main.js" }));
    writeFileSync(path.join(fixture, "main.js"), "const { ipcMain } = require('electron');\nipcMain.handle('qa:status', async () => 42);\n");
    writeFileSync(path.join(fixture, "preload.js"), "const { contextBridge, ipcRenderer } = require('electron');\ncontextBridge.exposeInMainWorld('qaApi', { status: () => ipcRenderer.invoke('qa:status') });\n");
    const install = spawnSync(process.execPath, [path.join(root, "scripts/agent-surface.mjs"), "install",
      "--target", "droid,codex", "--scope", "user", "--dest", project, "--category", "mcps", "--service", "rea"], {
      encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    const jsonEntry = JSON.parse(readFileSync(path.join(project, ".factory/mcp.json"), "utf8")).mcpServers.rea;
    const tomlEntry = TOML.parse(readFileSync(path.join(project, ".codex/config.toml"), "utf8")).mcp_servers.rea;
    assert.ok(jsonEntry && tomlEntry, "both config families contain REA");
    assert.deepEqual([tomlEntry.command, tomlEntry.args], [jsonEntry.command, jsonEntry.args]);
    assert.ok(path.isAbsolute(jsonEntry.command), "the host does not need to find the launcher on PATH");
    assert.ok(!jsonEntry.args.includes("--as-env-file"), "keyless analysis receives no credential file");

    await mcpSession(jsonEntry.command, jsonEntry.args, {
      cwd: os.tmpdir(), env: minimalLaunchEnv(home), timeoutMs: 60000,
    }, async ({ call, serverInfo }) => {
      assert.equal(serverInfo.name, "rea");
      const { tools } = await call("tools/list", {});
      assert.ok(tools.some((tool) => tool.name === "analyze_javascript_application"));
      const result = await call("tools/call", {
        name: "analyze_javascript_application",
        arguments: { input_path: fixture, format: "directory", source_paths: ["package.json", "main.js", "preload.js"], detail: "summary" },
      });
      assert.ok(!result.isError, resultText(result));
      const evidence = result.structuredContent ?? JSON.parse(resultText(result));
      const summary = evidence.normalized_result.summary;
      assert.equal(summary.statistics.parsed_javascript_files, 2);
      assert.equal(summary.statistics.parse_failures, 0);
      assert.equal(summary.electron.context_bridge_apis, 1);
      assert.equal(summary.electron.ipc.renderer_transmissions, 1);
      assert.equal(summary.electron.ipc.main_handlers, 1);
      assert.equal(summary.electron.ipc.paired_renderer_transmissions, 1);
      console.log(`live-rea: ${serverInfo.name} ${serverInfo.version}, ${tools.length} tools, Electron IPC analysis passed`);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
