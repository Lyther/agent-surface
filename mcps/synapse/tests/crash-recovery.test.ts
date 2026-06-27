// Crash recovery + projection persistence — MCP stdio e2e.
// 1) Write memories/reservations/presence via MCP, 2) SIGTERM server,
// 3) New server on same DB, 4) Verify recall, eventCount, sqlite file.

import assert from "node:assert/strict";
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SYNAPSE_ROOT = join(import.meta.dirname, "..");
const NAMESPACE = "crash-recovery-ns";
const AGENT_ID = "crash-recovery-agent";
const MEM_MARKER_A = "crashrecoverymarkeralpha7f3a";
const MEM_MARKER_B = "crashrecoverymarkerbeta9c2e";
const RESOURCE_GLOB = "src/crash-recovery-test.ts";

const dbDir = mkdtempSync(join(tmpdir(), "synapse-crash-"));
const sqlitePath = join(dbDir, `${NAMESPACE}.sqlite`);

let pass = 0;
let fail = 0;

function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  PASS: ${label}`);
      pass++;
    })
    .catch((e) => {
      console.log(`  FAIL: ${label} — ${(e as Error).message}`);
      fail++;
    });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type McpClient = {
  proc: ChildProcessWithoutNullStreams;
  send: (method: string, params?: unknown) => Promise<unknown>;
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  toolResult: (r: unknown) => unknown;
  close: () => Promise<void>;
};

function createMcpClient(): McpClient {
  const env = {
    ...process.env,
    SYNAPSE_AGENT_ID: AGENT_ID,
    SYNAPSE_DB_DIR: dbDir,
    SYNAPSE_NAMESPACE: NAMESPACE,
    SYNAPSE_POLL_MS: "100",
  };

  const proc = spawn("node", ["--import", "tsx", "src/server.ts"], {
    cwd: SYNAPSE_ROOT,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buffer = "";
  const pending = new Map<number, (r: unknown) => void>();
  let nextId = 0;

  proc.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as { id?: number };
        if (msg.id !== undefined && pending.has(msg.id)) {
          const resolve = pending.get(msg.id)!;
          pending.delete(msg.id);
          resolve(msg);
        }
      } catch {
        /* ignore non-JSON */
      }
    }
  });

  proc.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(`[server] ${chunk.toString()}`);
  });

  function send(method: string, params?: unknown): Promise<unknown> {
    const id = ++nextId;
    const req = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve) => {
      pending.set(id, resolve);
      proc.stdin.write(req + "\n");
    });
  }

  function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    return send("tools/call", { name, arguments: args });
  }

  function toolResult(r: unknown): unknown {
    const msg = r as {
      error?: unknown;
      result?: { isError?: boolean; content?: { text: string }[] };
    };
    if (msg.error) throw new Error("RPC error: " + JSON.stringify(msg.error));
    if (msg.result?.isError) throw new Error("Tool error: " + msg.result.content?.[0]?.text);
    return JSON.parse(msg.result!.content![0].text);
  }

  async function close(): Promise<void> {
    proc.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve();
      }, 5000);
      proc.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  return { proc, send, call, toolResult, close };
}

async function initialize(client: McpClient): Promise<void> {
  const init = (await client.send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "crash-recovery-test", version: "0.0.1" },
  })) as { result?: { serverInfo?: { name: string } } };
  assert.equal(init.result?.serverInfo?.name, "synapse");
  await client.send("notifications/initialized", {}).catch(() => { });
}

async function run(): Promise<void> {
  console.log("=== Synapse MCP crash recovery test ===");
  console.log(`DB dir: ${dbDir}`);
  console.log(`Expected sqlite: ${sqlitePath}\n`);

  let expectedEventCount = 0;
  let memIdA = 0;

  console.log("--- Phase 1: first server — write state ---");
  const client1 = createMcpClient();
  try {
    await initialize(client1);

    await delay(200);
    const memA = client1.toolResult(
      await client1.call("memory_remember", {
        content: `Persistence test fact: ${MEM_MARKER_A}`,
        scope: "shared",
        type: "fact",
        tags: ["crash-test"],
      }),
    ) as { id: number };
    memIdA = memA.id;

    await delay(200);
    client1.toolResult(
      await client1.call("memory_remember", {
        content: `Second memory for FTS rebuild: ${MEM_MARKER_B}`,
        scope: "shared",
        type: "decision",
      }),
    );

    await delay(200);
    const reserve = client1.toolResult(
      await client1.call("bus_reserve", { resourceGlob: RESOURCE_GLOB, ttlMs: 3_600_000 }),
    ) as { ok: boolean };
    assert.equal(reserve.ok, true);

    await delay(200);
    const presence = client1.toolResult(
      await client1.call("bus_presence", { caps: ["crash-test"] }),
    ) as { agents: { agentId: string }[] };
    assert.ok(presence.agents.some((a) => a.agentId === AGENT_ID));

    await delay(200);
    client1.toolResult(
      await client1.call("bus_publish", { topic: "crash-test", body: "pre-crash bus message" }),
    );

    await delay(200);
    const status1 = client1.toolResult(await client1.call("synapse_status", {})) as {
      eventCount: number;
      namespace: string;
    };
    expectedEventCount = status1.eventCount;
    assert.ok(expectedEventCount > 0, "expected events after writes");
    assert.equal(status1.namespace, NAMESPACE);
  } finally {
    await client1.close();
  }

  console.log("\n--- Phase 2: post-exit filesystem ---");
  await check(`SQLite file exists at ${NAMESPACE}.sqlite`, () => {
    assert.ok(existsSync(sqlitePath), `missing ${sqlitePath}`);
  });

  console.log("\n--- Phase 3: second server — WAL reopen + recall ---");
  const client2 = createMcpClient();
  try {
    await initialize(client2);
    await delay(200);

    await check("synapse_status eventCount not zeroed after restart", async () => {
      const status2 = client2.toolResult(await client2.call("synapse_status", {})) as {
        eventCount: number;
      };
      assert.equal(
        status2.eventCount,
        expectedEventCount,
        `expected ${expectedEventCount}, got ${status2.eventCount}`,
      );
    });

    await check("memory_recall finds first-server memory (marker A)", async () => {
      const recall = client2.toolResult(
        await client2.call("memory_recall", { query: MEM_MARKER_A, limit: 10 }),
      ) as { results: { id: number; content: string }[] };
      assert.ok(recall.results.length > 0, "no recall hits");
      assert.ok(
        recall.results.some((r) => r.content.includes(MEM_MARKER_A)),
        "marker A not in results",
      );
      assert.ok(recall.results.some((r) => r.id === memIdA), "expected stable memory id");
    });

    await check("memory_recall finds second memory (marker B) — projections/FTS usable", async () => {
      const recall = client2.toolResult(
        await client2.call("memory_recall", { query: MEM_MARKER_B, limit: 10 }),
      ) as { results: { content: string }[] };
      assert.ok(recall.results.some((r) => r.content.includes(MEM_MARKER_B)));
    });

    await check("bus_reservations persisted across restart", async () => {
      const res = client2.toolResult(await client2.call("bus_reservations", {})) as {
        reservations: { resourceGlob: string; agentId: string }[];
      };
      assert.ok(
        res.reservations.some(
          (r) => r.resourceGlob === RESOURCE_GLOB && r.agentId === AGENT_ID,
        ),
        "reservation missing after restart",
      );
    });

    await check("bus_presence / listPresence after restart (from events table)", async () => {
      const status = client2.toolResult(await client2.call("synapse_status", {})) as {
        agents: { agentId: string }[];
      };
      assert.ok(
        status.agents.some((a) => a.agentId === AGENT_ID),
        "agent not listed in status.agents after reopen",
      );
    });

    await check("bus_messages includes pre-crash publish", async () => {
      const msgs = client2.toolResult(
        await client2.call("bus_messages", { since: 0, limit: 50 }),
      ) as { messages: { body: string }[] };
      assert.ok(msgs.messages.some((m) => m.body === "pre-crash bus message"));
    });
  } finally {
    await client2.close();
  }

  console.log(`\n=== CRASH RECOVERY RESULTS: ${pass} pass, ${fail} fail ===`);
  rmSync(dbDir, { recursive: true, force: true });
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Fatal:", e);
  rmSync(dbDir, { recursive: true, force: true });
  process.exit(1);
});
