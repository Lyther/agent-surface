// R3-F002 regression: the fs.watch tick-path must deliver realtime
// notifications in the BUILT (ESM) server, independent of the poll loop.
// Poll is set to 60s so a notification arriving within ~1.5s can ONLY have
// come from the tick-file watch — proving the tick path actually works.
// (Pre-fix the built server used `require("node:fs")`, which is undefined in
// ESM, so the tick file was never created/watched and this test would hang.)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SYNAPSE_CWD = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = join(SYNAPSE_CWD, "dist", "server.js");
const NS = "tick-builtin-ns";
const TOPIC = "tick-notify";
const BODY = "tick-builtin-payload";
const TICK_DEADLINE_MS = 1500; // must beat the 60s poll
const POLL_MS = "60000";

if (!existsSync(SERVER)) {
  console.error(`FAIL: built server missing at ${SERVER} — run \`npm run build\` first.`);
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "synapse-tick-"));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function createClient(agentId) {
  const proc = spawn("node", [SERVER], {
    cwd: SYNAPSE_CWD,
    env: { ...process.env, SYNAPSE_AGENT_ID: agentId, SYNAPSE_DB_DIR: dir, SYNAPSE_NAMESPACE: NS, SYNAPSE_POLL_MS: POLL_MS },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "";
  const pending = new Map();
  const notifications = [];
  let nextId = 1;
  proc.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.method === "notifications/resources/updated") notifications.push(msg);
        if (msg.id !== undefined && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      } catch {
        /* ignore non-JSON */
      }
    }
  });
  proc.stderr.on("data", (c) => process.stderr.write(`[${agentId}] ${c}`));
  function send(method, params) {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  async function init() {
    await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "tick-builtin-test", version: "0.0.1" } });
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    await delay(150);
  }
  const call = (name, args) => send("tools/call", { name, arguments: args });
  function toolResult(r) {
    if (r.error) throw new Error("RPC error: " + JSON.stringify(r.error));
    if (r.result?.isError) throw new Error("Tool error: " + r.result.content[0].text);
    return JSON.parse(r.result.content[0].text);
  }
  return { proc, init, call, toolResult, notifications };
}

async function run() {
  // Single built-server process (matches the reviewer's probe). publish ->
  // store.onAppend -> watcher.tick() -> fs.watch wake -> sendResourceUpdated.
  // With poll=60s, a notification within 1.5s proves the TICK path, not poll.
  const client = createClient("tick-agent");
  try {
    await client.init();
    client.toolResult(await client.call("bus_subscribe", { topics: [TOPIC] }));
    client.toolResult(await client.call("bus_publish", { topic: TOPIC, body: BODY }));

    const start = Date.now();
    while (client.notifications.length === 0 && Date.now() - start < TICK_DEADLINE_MS) {
      await delay(25);
    }
    const elapsed = Date.now() - start;

    assert.ok(
      existsSync(join(dir, `${NS}.tick`)),
      "tick file must be created before watch()",
    );
    assert.ok(
      client.notifications.some((n) => n.params?.uri === "synapse://events"),
      `no notifications/resources/updated within ${TICK_DEADLINE_MS}ms (poll=${POLL_MS}ms) — tick path dead`,
    );
    console.log(`PASS: tick notification arrived in ~${elapsed}ms (poll=${POLL_MS}ms) — tick path live`);
    console.log("\n=== WATCHER TICK (BUILT SERVER): 1 pass, 0 fail ===");
  } finally {
    client.proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
