// The built server over real stdio, started the way a host starts `synapse-bridge`.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { canonicalRoot, hashKey } from "../src/namespace.js";
import { SERVER_JS, spawnServer } from "./helpers.js";

const EXIT_DEADLINE_MS = 5000;

function tempProject(): { dir: string; dbDir: string; project: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "synapse-server-"));
  const dbDir = join(dir, "db");
  const project = join(dir, "project");
  mkdirSync(project);
  return { dir, dbDir, project, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function exitOf(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("the server did not exit after its stdin closed")); }, EXIT_DEADLINE_MS);
    child.once("exit", (code) => { clearTimeout(timer); resolve(code); });
  });
}

test("a spawned server lists the seven tools and round-trips remember -> recall in its project DB", async () => {
  const t = tempProject();
  const server = await spawnServer({ SYNAPSE_DB_DIR: t.dbDir, SYNAPSE_PROJECT: t.project });
  try {
    const { tools } = await server.client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), ["lock_acquire", "lock_list", "lock_release", "memory_forget", "memory_get", "memory_recall", "memory_remember"]);
    const capabilities = server.client.getServerCapabilities() ?? {};
    assert.deepEqual(Object.keys(capabilities).sort(), ["tools"], "no resources, subscriptions or experimental features");

    const written = await server.call<{ id: number; ts: number; agentId: string }>("memory_remember", { content: "stdio server round trip" });
    assert.deepEqual(Object.keys(written).sort(), ["agentId", "id", "ts"]);
    assert.equal(written.agentId, "test-host", "without SYNAPSE_AGENT_ID the agent id is the MCP client name");
    const recalled = await server.call<{ results: { id: number }[] }>("memory_recall", { query: "round trip" });
    assert.deepEqual(recalled.results.map((r) => r.id), [written.id]);
    assert.ok(existsSync(join(t.dbDir, `${hashKey(canonicalRoot(t.project))}.sqlite`)), "the write landed in the project's own DB file");
    assert.deepEqual(readdirSync(t.dbDir).filter((name) => !/\.sqlite(-wal|-shm)?$/.test(name)), [], "nothing but SQLite files under the data directory");
  } finally { await server.close(); t.cleanup(); }
});

test("SYNAPSE_AGENT_ID names the agent over the client name", async () => {
  const t = tempProject();
  const server = await spawnServer({ SYNAPSE_DB_DIR: t.dbDir, SYNAPSE_PROJECT: t.project, SYNAPSE_AGENT_ID: "reviewer-1" });
  try {
    assert.equal((await server.call<{ agentId: string }>("memory_remember", { content: "named agent" })).agentId, "reviewer-1");
  } finally { await server.close(); t.cleanup(); }
});

test("the server exits when its stdin closes, before and after initialize", async () => {
  const t = tempProject();
  try {
    const env = { ...process.env, SYNAPSE_DB_DIR: t.dbDir, SYNAPSE_PROJECT: t.project };
    const idle = spawn(process.execPath, [SERVER_JS], { env, stdio: ["pipe", "ignore", "ignore"] });
    const idleExit = exitOf(idle);
    idle.stdin.end();
    assert.equal(await idleExit, 0);

    const used = spawn(process.execPath, [SERVER_JS], { env, stdio: ["pipe", "pipe", "ignore"] });
    const usedExit = exitOf(used);
    const answered = new Promise<void>((resolve) => used.stdout.once("data", () => resolve()));
    used.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "raw", version: "0" } } })}\n`);
    await answered;
    used.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    used.stdin.end();
    assert.equal(await usedExit, 0);
  } finally { t.cleanup(); }
});
