// Concurrent write integrity: two synapse processes, one WAL DB.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SYNAPSE_CWD = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(join(tmpdir(), "synapse-concurrent-"));
const NS = "concurrent-write-ns";
const TOPIC = "concurrent-test";
const RESERVE_GLOB = "concurrent/reserve-same-glob.ts";

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
  let sawLock = false;
  proc.stderr.on("data", (c) => {
    const s = c.toString();
    if (/SQLITE_BUSY|database is locked/i.test(s)) {
      sawLock = true;
      process.stderr.write(`[${agentId}] SQLITE_BUSY/lock: ${s}`);
    }
  });

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
      clientInfo: { name: "concurrent-write-integrity", version: "0.0.1" },
    });
    proc.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
    );
  }

  function call(name, args) {
    return send("tools/call", { name, arguments: args });
  }

  function toolResult(r) {
    if (r.error) throw new Error("RPC error: " + JSON.stringify(r.error));
    if (r.result?.isError) throw new Error("Tool error: " + r.result.content[0].text);
    return JSON.parse(r.result.content[0].text);
  }

  return { proc, init, call, toolResult, agentId, get sawLock() { return sawLock; } };
}

async function run() {
  let pass = 0;
  let fail = 0;
  let a = null;
  let b = null;

  function report(label, ok, detail = "") {
    console.log((ok ? "PASS: " : "FAIL: ") + label + (detail ? " — " + detail : ""));
    if (ok) pass++;
    else fail++;
  }

  try {
    const warm = createClient("bootstrap");
    await warm.init();
    warm.proc.kill();
    await delay(300);

    a = createClient("agent-a");
    b = createClient("agent-b");
    await Promise.all([a.init(), b.init()]);
    await delay(500);

    const bodyA = "concurrent-payload-from-agent-a";
    const bodyB = "concurrent-payload-from-agent-b";
    const pubA = a.call("bus_publish", { topic: TOPIC, body: bodyA });
    const pubB = b.call("bus_publish", { topic: TOPIC, body: bodyB });
    const [rPubA, rPubB] = await Promise.all([pubA, pubB]);
    let pubAData;
    let pubBData;
    try {
      pubAData = a.toolResult(rPubA);
      pubBData = b.toolResult(rPubB);
      report("0. concurrent bus_publish (no RPC/tool errors)", true);
    } catch (e) {
      report("0. concurrent bus_publish (no RPC/tool errors)", false, e.message);
      pubAData = null;
      pubBData = null;
    }

    await delay(500);

    let msgs;
    try {
      msgs = a.toolResult(
        await a.call("bus_messages", { topic: TOPIC, since: 0, limit: 50 }),
      );
    } catch (e) {
      report("bus_messages query", false, e.message);
      msgs = { messages: [] };
    }

    const onTopic = msgs.messages.filter((m) => m.topic === TOPIC);
    const mA = onTopic.find((m) => m.body === bodyA && m.agentId === "agent-a");
    const mB = onTopic.find((m) => m.body === bodyB && m.agentId === "agent-b");

    report(
      "a. both concurrent publishes present (no lost writes)",
      Boolean(mA && mB),
      mA && mB ? "" : `found ${onTopic.length} on topic; a=${!!mA} b=${!!mB}`,
    );

    if (mA && mB) {
      report(
        "b. different offsets (no collision)",
        mA.offset !== mB.offset,
        `offsets: ${mA.offset}, ${mB.offset}`,
      );
      const lo = Math.min(mA.offset, mB.offset);
      const hi = Math.max(mA.offset, mB.offset);
      report("c. offsets contiguous for pair (gap of 1)", hi - lo === 1, `lo=${lo} hi=${hi}`);
    } else {
      report("b. different offsets (no collision)", false, "missing messages");
      report("c. offsets contiguous for pair (gap of 1)", false, "missing messages");
    }

    report(
      "d. agentId provenance on both messages",
      Boolean(mA?.agentId === "agent-a" && mB?.agentId === "agent-b"),
    );

    if (pubAData && pubBData) {
      const pubOffsets = [pubAData.offset, pubBData.offset].sort((x, y) => x - y);
      const msgOffsets = mA && mB ? [mA.offset, mB.offset].sort((x, y) => x - y) : [];
      report(
        "e. publish return offsets match stored messages",
        msgOffsets.length === 2 &&
        pubOffsets[0] === msgOffsets[0] &&
        pubOffsets[1] === msgOffsets[1],
        `publish=[${pubOffsets}] msgs=[${msgOffsets}]`,
      );
    }

    const resA = a.call("bus_reserve", { resourceGlob: RESERVE_GLOB, ttlMs: 300000 });
    const resB = b.call("bus_reserve", { resourceGlob: RESERVE_GLOB, ttlMs: 300000 });
    const [rResA, rResB] = await Promise.all([resA, resB]);
    let okCount = 0;
    let failCount = 0;
    let resDetail = "";
    for (const [label, r, client] of [
      ["agent-a", rResA, a],
      ["agent-b", rResB, b],
    ]) {
      try {
        const data = client.toolResult(r);
        if (data.ok === true) okCount++;
        else if (data.ok === false) failCount++;
        else resDetail += `${label}: unexpected shape; `;
      } catch (e) {
        resDetail += `${label}: ${e.message}; `;
      }
    }
    report(
      "f. concurrent bus_reserve: exactly one ok:true and one ok:false",
      okCount === 1 && failCount === 1,
      resDetail || `ok=${okCount} conflict=${failCount}`,
    );

    if (okCount === 1 && failCount === 1) {
      let winner;
      let loser;
      try {
        const da = a.toolResult(rResA);
        const db = b.toolResult(rResB);
        if (da.ok) {
          winner = "agent-a";
          assert.equal(db.ok, false);
          assert.ok(db.heldBy === "agent-a");
        } else {
          winner = "agent-b";
          assert.equal(db.ok, true);
          assert.equal(da.ok, false);
          assert.ok(da.heldBy === "agent-b");
        }
        report("g. loser heldBy points at winner", true, `winner=${winner}`);
      } catch (e) {
        report("g. loser heldBy points at winner", false, e.message);
      }
    }

    report(
      "h. no SQLITE_BUSY / fatal lock during concurrent mutating ops",
      !a.sawLock && !b.sawLock,
      a.sawLock || b.sawLock ? "lock reported on stderr" : "",
    );

    console.log(`\n=== CONCURRENT WRITE INTEGRITY: ${pass} pass, ${fail} fail ===`);
    console.log(`DB dir (cleaned on exit): ${dir}`);
  } finally {
    if (a) a.proc.kill();
    if (b) b.proc.kill();
    await delay(100);
    rmSync(dir, { recursive: true, force: true });
  }

  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
