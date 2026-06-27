// FTS5 BM25 memory_recall quality checks
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SYNAPSE_CWD = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(join(tmpdir(), "synapse-fts5-"));
const NS = "fts5-bm25-test";
const AGENT = "fts5-agent";

const MEMORIES = [
  "The authentication service uses JWT tokens at /v2/token",
  "The database connection string is postgres://localhost:5432/myapp",
  "The rate limiter is configured at 100 requests per minute",
  "Authentication failed for user admin due to expired JWT",
  "The API gateway routes /auth/* to the authentication service",
];

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
      clientInfo: { name: "fts5-bm25-recall", version: "0.0.1" },
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
  const client = createClient(AGENT);

  function report(label, ok, detail = "") {
    console.log((ok ? "PASS: " : "FAIL: ") + label + (detail ? " — " + detail : ""));
    if (ok) pass++;
    else fail++;
  }

  try {
    await client.init();
    client.toolResult(await client.call("synapse_status", {}));

    for (const content of MEMORIES) {
      client.toolResult(
        await client.call("memory_remember", { content, scope: "shared", type: "fact" }),
      );
      await delay(200);
    }
    await delay(300);

    let authJwt;
    try {
      authJwt = client.toolResult(
        await client.call("memory_recall", { query: "authentication JWT", limit: 10 }),
      );
      assert.ok(authJwt.results.length >= 2, "expected >= 2 results");
      report("a. authentication JWT returns at least 2 results", true);
    } catch (e) {
      report("a. authentication JWT returns at least 2 results", false, e.message);
    }

    try {
      assert.ok(authJwt.results.length >= 1);
      for (const r of authJwt.results) {
        assert.ok(typeof r.rank === "number", "missing rank on " + r.content?.slice(0, 40));
      }
      report("b. results include rank (BM25 score)", true);
    } catch (e) {
      report("b. results include rank (BM25 score)", false, e.message);
    }

    try {
      const ranks = authJwt.results.map((r) => r.rank);
      const sorted = [...ranks].sort((a, b) => a - b);
      assert.deepEqual(ranks, sorted, "results not ordered by rank ASC");
      report("c. results ordered by BM25 rank", true);
    } catch (e) {
      report("c. results ordered by BM25 rank", false, e.message);
    }

    try {
      const jwtSvc = authJwt.results.find((r) =>
        r.content.includes("authentication service uses JWT tokens"),
      );
      const rateLim = authJwt.results.find((r) =>
        r.content.includes("rate limiter is configured"),
      );
      assert.ok(jwtSvc, "JWT service memory not in recall set");
      if (rateLim) {
        assert.ok(
          jwtSvc.rank < rateLim.rank,
          `JWT service rank ${jwtSvc.rank} should be < rate limiter ${rateLim.rank}`,
        );
      }
      report("d. JWT service memory ranks above rate limiter when both match", true);
    } catch (e) {
      report("d. JWT service memory ranks above rate limiter when both match", false, e.message);
    }

    try {
      const dbRecall = client.toolResult(
        await client.call("memory_recall", { query: "database connection", limit: 10 }),
      );
      assert.ok(
        dbRecall.results.some((r) => r.content.includes("postgres://localhost:5432/myapp")),
      );
      report("e. database connection query finds DB memory", true);
    } catch (e) {
      report("e. database connection query finds DB memory", false, e.message);
    }

    try {
      const none = client.toolResult(
        await client.call("memory_recall", { query: "quantum physics", limit: 10 }),
      );
      assert.equal(none.results.length, 0);
      report("f. no-match query returns empty results", true);
    } catch (e) {
      report("f. no-match query returns empty results", false, e.message);
    }

    try {
      const priv = client.toolResult(
        await client.call("memory_recall", {
          query: "authentication JWT",
          scope: "private",
          limit: 10,
        }),
      );
      const sharedSnippets = MEMORIES.filter((m) => priv.results.some((r) => r.content === m));
      assert.equal(sharedSnippets.length, 0);
      report("g. scope=private excludes shared memories", true);
    } catch (e) {
      report("g. scope=private excludes shared memories", false, e.message);
    }

    console.log(`\n=== FTS5 BM25 RECALL: ${pass} pass, ${fail} fail ===`);
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
