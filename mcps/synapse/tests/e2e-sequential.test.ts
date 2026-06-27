// synapse MCP — sequential end-to-end protocol test.
// Sends MCP requests one at a time through stdio, using returned offsets
// for dependent calls (supersede, tombstone). This is the /verify-prove gate.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "synapse-e2e-"));
const env = {
  ...process.env,
  SYNAPSE_AGENT_ID: "e2e-agent",
  SYNAPSE_DB_DIR: dir,
  SYNAPSE_NAMESPACE: "e2e-ns",
  SYNAPSE_POLL_MS: "100",
};

// Spawn the server as a child process.
const proc = spawn("node", ["--import", "tsx", "src/server.ts"], {
  cwd: process.cwd(),
  env,
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
const responses = new Map<number, any>();
const pending = new Map<number, (r: any) => void>();

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
        const resolve = pending.get(msg.id)!;
        pending.delete(msg.id);
        resolve(msg);
      }
    } catch { }
  }
});

proc.stderr.on("data", (chunk) => {
  // Log server stderr for debugging (do NOT suppress).
  process.stderr.write("[server] " + chunk.toString());
});

function send(method: string, params?: any): Promise<any> {
  const id = responses.size + 1;
  const req = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve) => {
    pending.set(id, resolve);
    proc.stdin.write(req + "\n");
  });
}

function call(name: string, args: any): Promise<any> {
  return send("tools/call", { name, arguments: args });
}

function toolResult(r: any): any {
  if (r.error) throw new Error("RPC error: " + JSON.stringify(r.error));
  if (r.result?.isError) throw new Error("Tool error: " + r.result.content[0].text);
  return JSON.parse(r.result.content[0].text);
}

async function run() {
  let pass = 0;
  let fail = 0;
  function check(label: string, fn: () => void) {
    try { fn(); console.log("  PASS: " + label); pass++; }
    catch (e) { console.log("  FAIL: " + label + " — " + (e as Error).message); fail++; }
  }

  // 1. Initialize
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "e2e-test", version: "0.0.1" },
  });
  check("initialize", () => {
    assert.equal(init.result.serverInfo.name, "synapse");
  });
  await send("notifications/initialized", undefined as any).catch(() => { });

  // 2. tools/list — all 15 tools
  const tools = await send("tools/list", {});
  check("tools/list (15 tools)", () => {
    const names = tools.result.tools.map((t: any) => t.name);
    assert.equal(names.length, 15);
    for (const expected of ["synapse_status", "synapse_export", "synapse_record_delete", "bus_publish", "bus_subscribe", "bus_messages", "bus_dm", "bus_reserve", "bus_release", "bus_reservations", "bus_presence", "memory_remember", "memory_recall", "memory_supersede", "memory_history"]) {
      assert.ok(names.includes(expected), "missing: " + expected);
    }
  });

  // 3. synapse_status
  const status = toolResult(await call("synapse_status", {}));
  check("synapse_status", () => {
    assert.equal(status.namespace, "e2e-ns");
    assert.equal(status.agentId, "e2e-agent");
    assert.equal(status.eventCount, 0);
  });

  // 4. bus_publish
  const pub = toolResult(await call("bus_publish", { topic: "build-status", body: "agent A starting work on src/auth.ts" }));
  check("bus_publish", () => {
    assert.ok(pub.offset > 0);
    assert.ok(pub.ts > 0);
  });

  // 5. bus_subscribe
  const sub = toolResult(await call("bus_subscribe", { topics: ["build-status"] }));
  check("bus_subscribe", () => {
    assert.equal(sub.ok, true);
  });

  // 6. bus_messages
  const msgs = toolResult(await call("bus_messages", { since: 0, limit: 50 }));
  check("bus_messages", () => {
    assert.ok(msgs.messages.length > 0);
    assert.equal(msgs.messages[0].body, "agent A starting work on src/auth.ts");
    assert.equal(msgs.messages[0].agentId, "e2e-agent");
  });

  // 7. bus_dm
  const dm = toolResult(await call("bus_dm", { to: "agent-b", body: "review my PR" }));
  check("bus_dm", () => {
    assert.ok(dm.offset > 0);
  });

  // 8. bus_reserve
  const res = toolResult(await call("bus_reserve", { resourceGlob: "src/auth.ts", ttlMs: 300000 }));
  check("bus_reserve", () => {
    assert.equal(res.ok, true);
    assert.equal(res.reservation.resourceGlob, "src/auth.ts");
    assert.equal(res.reservation.agentId, "e2e-agent");
  });

  // 9. bus_reservations
  const resList = toolResult(await call("bus_reservations", {}));
  check("bus_reservations", () => {
    assert.equal(resList.reservations.length, 1);
    assert.equal(resList.reservations[0].resourceGlob, "src/auth.ts");
  });

  // 10. bus_presence
  const presence = toolResult(await call("bus_presence", { caps: ["code", "review"] }));
  check("bus_presence", () => {
    assert.ok(presence.agents.length > 0);
    assert.ok(presence.agents.some((a: any) => a.agentId === "e2e-agent"));
  });

  // 11. memory_remember (with secrets — test redaction)
  const mem1 = toolResult(await call("memory_remember", {
    content: "The API key is Bearer ya29.a0ARrdaM-abc123 and ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD",
    scope: "shared",
    type: "fact",
  }));
  check("memory_remember (redaction)", () => {
    assert.ok(mem1.id > 0);
    assert.ok(mem1.redactions >= 2, "expected >=2 redactions, got " + mem1.redactions);
  });
  const mem1Id = mem1.id; // save for tombstone

  // 12. memory_remember (clean fact)
  const mem2 = toolResult(await call("memory_remember", {
    content: "Auth uses JWT at /v2/token endpoint",
    scope: "shared",
    type: "decision",
    tags: ["auth", "api"],
  }));
  check("memory_remember (clean)", () => {
    assert.ok(mem2.id > 0);
    assert.equal(mem2.redactions, 0);
  });
  const mem2Id = mem2.id; // save for supersede

  // 13. memory_recall
  const recall1 = toolResult(await call("memory_recall", { query: "JWT auth", limit: 10 }));
  check("memory_recall", () => {
    assert.ok(recall1.results.length > 0);
    assert.ok(recall1.results.some((r: any) => r.content.includes("JWT")));
  });

  // 14. memory_supersede — use the ACTUAL offset from mem2
  const sup = toolResult(await call("memory_supersede", {
    targetId: mem2Id,
    content: "Auth moved to /v3/token",
    reason: "endpoint changed",
  }));
  check("memory_supersede", () => {
    assert.ok(sup.offset > 0);
  });

  // 15. memory_recall — should find the new fact, not the old
  const recall2 = toolResult(await call("memory_recall", { query: "auth token endpoint", limit: 10 }));
  check("memory_recall after supersede (new visible, old hidden)", () => {
    assert.ok(recall2.results.some((r: any) => r.content.includes("/v3/token")), "new fact not in recall");
    assert.ok(!recall2.results.some((r: any) => r.content.includes("/v2/token")), "old fact should be hidden");
  });

  // 16. memory_history — should show both old and new
  const history = toolResult(await call("memory_history", { query: "auth token", limit: 10 }));
  check("memory_history (both old and new)", () => {
    assert.ok(history.records.length >= 2, "expected >=2 records, got " + history.records.length);
  });

  // 17. synapse_export
  const exportResult = toolResult(await call("synapse_export", { limit: 100 }));
  check("synapse_export", () => {
    assert.ok(exportResult.events.length > 0);
    // Verify private events from other agents are excluded
    assert.ok(exportResult.events.every((e: any) => e.scope === "shared" || e.agentId === "e2e-agent"));
  });

  // 18. bus_release
  const release = toolResult(await call("bus_release", { resourceGlob: "src/auth.ts" }));
  check("bus_release", () => {
    assert.equal(release.released, true);
  });

  // 19. synapse_record_delete — tombstone the leaked-secret memory
  const tomb = toolResult(await call("synapse_record_delete", { targetId: mem1Id, reason: "leaked secrets" }));
  check("synapse_record_delete (tombstone)", () => {
    assert.ok(tomb.offset > 0);
  });

  // 20. memory_recall — tombstoned record should be gone from recall
  const recall3 = toolResult(await call("memory_recall", { query: "Bearer GitHub token API key", limit: 10 }));
  check("memory_recall after tombstone (gone)", () => {
    assert.ok(!recall3.results.some((r: any) => r.id === mem1Id), "tombstoned record still in recall");
  });

  // 21. memory_history — tombstoned record still in history
  const history2 = toolResult(await call("memory_history", { id: mem1Id, limit: 10 }));
  check("memory_history after tombstone (preserved)", () => {
    assert.ok(history2.records.length >= 1, "tombstoned record should be in history");
  });

  // 22. Tombstone idempotency — second tombstone returns the same event
  const tomb2 = toolResult(await call("synapse_record_delete", { targetId: mem1Id, reason: "duplicate" }));
  check("tombstone idempotent", () => {
    assert.equal(tomb.offset, tomb2.offset, "re-tombstone should return the same event");
  });

  console.log("\n=== E2E RESULTS: " + pass + " pass, " + fail + " fail ===");

  proc.kill();
  rmSync(dir, { recursive: true, force: true });

  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Fatal:", e);
  proc.kill();
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
