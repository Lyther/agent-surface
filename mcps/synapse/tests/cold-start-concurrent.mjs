// R4-F001 regression: several built server processes cold-booting the SAME
// fresh namespace at once must all initialize the DB (WAL switch + schema +
// bootstrap) and perform one write without a fatal "database is locked".
// Pre-fix this failed ~19/20 rounds because busy_timeout was set AFTER the
// WAL-mode switch. Runs multiple rounds on fresh namespaces to surface the race.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SYNAPSE_CWD = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = join(SYNAPSE_CWD, "dist", "server.js");
const AGENTS = 4;
const ROUNDS = 5;
const OP_TIMEOUT_MS = 8000;

if (!existsSync(SERVER)) {
  console.error(`FAIL: built server missing at ${SERVER} — run \`npm run build\` first.`);
  process.exit(1);
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function spawnClient(agentId, dir, ns) {
  const proc = spawn("node", [SERVER], {
    cwd: SYNAPSE_CWD,
    env: { ...process.env, SYNAPSE_AGENT_ID: agentId, SYNAPSE_DB_DIR: dir, SYNAPSE_NAMESPACE: ns, SYNAPSE_POLL_MS: "60000" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "";
  let stderr = "";
  let exited = null;
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
        /* ignore non-JSON */
      }
    }
  });
  proc.stderr.on("data", (c) => { stderr += c.toString(); });
  proc.on("exit", (code) => { exited = code; });

  function send(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${agentId}: ${method} timed out (exit=${exited}, stderr=${stderr.trim().slice(-200)})`));
      }, OP_TIMEOUT_MS);
      pending.set(id, (m) => { clearTimeout(t); resolve(m); });
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  async function init() {
    await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "cold-start", version: "0.0.1" } });
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  }
  const call = (name, args) => send("tools/call", { name, arguments: args });
  function toolResult(r) {
    if (r.error) throw new Error("RPC error: " + JSON.stringify(r.error));
    if (r.result?.isError) throw new Error("Tool error: " + r.result.content[0].text);
    return JSON.parse(r.result.content[0].text);
  }
  const fatal = () => (exited !== null && exited !== 0) || /fatal: database is locked/i.test(stderr);
  return { proc, init, call, toolResult, fatal, stderr: () => stderr };
}

async function oneRound(round) {
  const dir = mkdtempSync(join(tmpdir(), `synapse-coldstart-${round}-`));
  const ns = `coldstart-ns-${round}`;
  const clients = Array.from({ length: AGENTS }, (_, i) => spawnClient(`agent-${i}`, dir, ns));
  try {
    // All boot + initialize simultaneously — the contended cold path.
    await Promise.all(clients.map((c) => c.init()));
    // Each performs one write.
    const results = await Promise.all(
      clients.map((c) => c.call("bus_publish", { topic: "coldstart", body: `hi-from-${round}` }).then(c.toolResult)),
    );
    for (const c of clients) {
      assert.ok(!c.fatal(), `a process died/locked: ${c.stderr().trim().slice(-200)}`);
    }
    for (const r of results) assert.ok(typeof r.offset === "number", "publish must return an offset");
    return true;
  } finally {
    for (const c of clients) c.proc.kill();
    await delay(50);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function run() {
  for (let round = 1; round <= ROUNDS; round++) {
    await oneRound(round);
    console.log(`PASS: round ${round}/${ROUNDS} — ${AGENTS} agents cold-booted + wrote, no fatal lock`);
  }
  console.log(`\n=== COLD-START CONCURRENT: ${ROUNDS} pass, 0 fail ===`);
}

run().catch((e) => {
  console.error("Fatal:", e.message ?? e);
  process.exit(1);
});
