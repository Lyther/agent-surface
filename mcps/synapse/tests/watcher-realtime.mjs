// Watcher / realtime notification path: subscribe, publish, detect notifications/resources/updated.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SYNAPSE_CWD = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(join(tmpdir(), "synapse-watcher-"));
const NS = "watcher-test-ns";
const TOPIC = "watcher-notify";
const BODY = "watcher-test-payload-xyz";

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
        if (msg.method === "notifications/resources/updated") {
          notifications.push(msg);
        }
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
      clientInfo: { name: "watcher-realtime-test", version: "0.0.1" },
    });
    proc.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
    );
    await delay(150);
  }

  function call(name, args) {
    return send("tools/call", { name, arguments: args });
  }

  function toolResult(r) {
    if (r.error) throw new Error("RPC error: " + JSON.stringify(r.error));
    if (r.result?.isError) throw new Error("Tool error: " + r.result.content[0].text);
    return JSON.parse(r.result.content[0].text);
  }

  return { proc, init, call, toolResult, notifications };
}

function report(label, ok, detail = "") {
  console.log((ok ? "PASS: " : "FAIL: ") + label + (detail ? " — " + detail : ""));
  return ok;
}

async function run() {
  let pass = 0;
  let fail = 0;
  const client = createClient("watcher-agent");

  try {
    await client.init();

    client.toolResult(await client.call("bus_subscribe", { topics: [TOPIC] }));

    client.toolResult(
      await client.call("bus_publish", { topic: TOPIC, body: BODY }),
    );

    await delay(500);

    const notifCount = client.notifications.length;
    const notifOk = client.notifications.some(
      (n) =>
        n.method === "notifications/resources/updated" &&
        n.params?.uri === "synapse://events",
    );
    // R2-F003: notification MUST arrive — the tick file is now created
    // deterministically and onAppend fires on every write path.
    if (notifOk) {
      report("notifications/resources/updated on stdout after publish", true, `${notifCount} received`);
      pass++;
    } else {
      report("notifications/resources/updated on stdout after publish", false, "none received (expected at least 1)");
      fail++;
    }

    try {
      const msgs = client.toolResult(
        await client.call("bus_messages", { topic: TOPIC, since: 0, limit: 50 }),
      );
      assert.ok(msgs.messages.some((m) => m.body === BODY));
      if (report("bus_messages since=0 reads published message (poll fallback)", true)) pass++;
      else fail++;
    } catch (e) {
      if (report("bus_messages since=0 reads published message (poll fallback)", false, e.message))
        pass++;
      else fail++;
    }

    console.log(`\n=== WATCHER REALTIME: ${pass} pass, ${fail} fail ===`);
  } finally {
    client.proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }

  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
