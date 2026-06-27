// Multi-agent coordination: two synapse servers, one shared DB.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SYNAPSE_CWD = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(join(tmpdir(), "synapse-multi-"));
const NS = "coord-test-ns";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function createClient(agentId) {
  const proc = spawn("node", ["--import", "tsx", "src/server.ts"], {
    cwd: SYNAPSE_CWD,
    env: {
      ...process.env,
      SYNAPSE_AGENT_ID: agentId,
      SYNAPSE_DB_DIR: dir,
      SYNAPSE_NAMESPACE: NS,
      SYNAPSE_POLL_MS: "100",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "";
  const pending = new Map();
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
        if (msg.id !== undefined && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      } catch {
        /* ignore */
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
    await send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "multi-agent-coord", version: "0.0.1" },
    });
    proc.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
    );
    await delay(100);
  }

  function call(name, args) {
    return send("tools/call", { name, arguments: args });
  }

  function toolResult(r) {
    if (r.error) throw new Error("RPC error: " + JSON.stringify(r.error));
    if (r.result?.isError) throw new Error("Tool error: " + r.result.content[0].text);
    return JSON.parse(r.result.content[0].text);
  }

  return { proc, init, call, toolResult };
}

async function run() {
  let pass = 0;
  let fail = 0;
  let b = null;
  const a = createClient("agent-a");

  function report(label, ok, detail = "") {
    console.log((ok ? "PASS: " : "FAIL: ") + label + (detail ? " — " + detail : ""));
    if (ok) pass++;
    else fail++;
  }

  try {
    await a.init();
    a.toolResult(await a.call("synapse_status", {}));
    await delay(500);
    b = createClient("agent-b");
    await b.init();
    await delay(300);

    const pubBody = "coord-bus-payload-from-A";
    a.toolResult(await a.call("bus_publish", { topic: "coord", body: pubBody }));
    await delay(400);
    try {
      const msgs = b.toolResult(
        await b.call("bus_messages", { topic: "coord", since: 0, limit: 50 }),
      );
      assert.ok(msgs.messages.some((m) => m.body === pubBody && m.agentId === "agent-a"));
      report("1. bus_publish → bus_messages (topic coord)", true);
    } catch (e) {
      report("1. bus_publish → bus_messages (topic coord)", false, e.message);
    }

    a.toolResult(await a.call("bus_reserve", { resourceGlob: "src/x.ts", ttlMs: 300000 }));
    await delay(400);
    try {
      const conflict = b.toolResult(
        await b.call("bus_reserve", { resourceGlob: "src/x.ts", ttlMs: 300000 }),
      );
      assert.equal(conflict.ok, false);
      assert.equal(conflict.heldBy, "agent-a");
      report("2. bus_reserve conflict (heldBy agent-a)", true);
    } catch (e) {
      report("2. bus_reserve conflict (heldBy agent-a)", false, e.message);
    }

    const sharedToken = "coordmemtoken999alfa";
    a.toolResult(
      await a.call("memory_remember", {
        content: sharedToken,
        scope: "shared",
        type: "fact",
      }),
    );
    await delay(400);
    try {
      const recall = b.toolResult(
        await b.call("memory_recall", { query: "coordmemtoken999alfa", limit: 10 }),
      );
      assert.ok(recall.results.some((r) => r.content.includes(sharedToken)));
      report("3. shared memory_recall across agents", true);
    } catch (e) {
      report("3. shared memory_recall across agents", false, e.message);
    }

    const privateToken = "coordprivtoken888bravo";
    a.toolResult(
      await a.call("memory_remember", {
        content: privateToken,
        scope: "private",
        type: "fact",
      }),
    );
    await delay(400);
    try {
      const recallPriv = b.toolResult(
        await b.call("memory_recall", { query: "coordprivtoken888bravo", limit: 10 }),
      );
      assert.ok(!recallPriv.results.some((r) => r.content.includes(privateToken)));
      report("4. private memory scope (B cannot recall A private)", true);
    } catch (e) {
      report("4. private memory scope (B cannot recall A private)", false, e.message);
    }

    const dmBody = "coord-dm-from-B-to-A";
    b.toolResult(await b.call("bus_dm", { to: "agent-a", body: dmBody }));
    await delay(400);
    try {
      const inbox = a.toolResult(await a.call("bus_messages", { since: 0, limit: 100 }));
      assert.ok(inbox.messages.some((m) => m.body === dmBody && m.agentId === "agent-b"));
      report("5. bus_dm → bus_messages DM routing to agent-a", true);
    } catch (e) {
      report("5. bus_dm → bus_messages DM routing to agent-a", false, e.message);
    }

    console.log(`\n=== MULTI-AGENT COORD: ${pass} pass, ${fail} fail ===`);
  } finally {
    a.proc.kill();
    if (b) b.proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }

  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
