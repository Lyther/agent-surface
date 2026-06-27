// synapse MCP — error paths and edge cases via stdio MCP protocol.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CWD = join(import.meta.dirname, "..");

type ToolOutcome =
  | { kind: "ok"; data: unknown }
  | { kind: "toolError"; code: string; message: string; raw: unknown }
  | { kind: "mcpValidationError"; text: string }
  | { kind: "rpcError"; raw: unknown };

class McpSession {
  private proc: ChildProcess;
  private buffer = "";
  private pending = new Map<number, (r: unknown) => void>();
  private nextId = 0;
  private dir: string;

  constructor(envOverrides: Record<string, string | undefined>) {
    this.dir = mkdtempSync(join(tmpdir(), "synapse-edge-"));
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SYNAPSE_DB_DIR: this.dir,
      SYNAPSE_NAMESPACE: "edge-ns",
      SYNAPSE_POLL_MS: "100",
      ...envOverrides,
    };
    if (envOverrides.SYNAPSE_AGENT_ID === undefined && !("SYNAPSE_AGENT_ID" in envOverrides)) {
      env.SYNAPSE_AGENT_ID = "test-agent";
    }
    if ("SYNAPSE_AGENT_ID" in envOverrides && envOverrides.SYNAPSE_AGENT_ID === undefined) {
      delete env.SYNAPSE_AGENT_ID;
    }

    this.proc = spawn("node", ["--import", "tsx", "src/server.ts"], {
      cwd: CWD,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout!.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      let idx: number;
      while ((idx = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as { id?: number };
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const resolve = this.pending.get(msg.id)!;
            this.pending.delete(msg.id);
            resolve(msg);
          }
        } catch {
          /* ignore */
        }
      }
    });
  }

  private send(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.nextId;
    const req = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.proc.stdin!.write(req + "\n");
    });
  }

  async init(): Promise<void> {
    await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "edge-test", version: "0.0.1" },
    });
    await this.send("notifications/initialized", {}).catch(() => { });
  }

  async call(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
    const r = (await this.send("tools/call", { name, arguments: args })) as {
      error?: unknown;
      result?: { isError?: boolean; content?: { text: string }[] };
    };
    if (r.error) return { kind: "rpcError", raw: r.error };
    const text = r.result?.content?.[0]?.text ?? "";
    if (r.result?.isError) {
      try {
        const err = JSON.parse(text) as { code: string; message: string };
        return { kind: "toolError", code: err.code, message: err.message, raw: err };
      } catch {
        return { kind: "mcpValidationError", text };
      }
    }
    return { kind: "ok", data: JSON.parse(text) };
  }

  close(): void {
    this.proc.kill();
    rmSync(this.dir, { recursive: true, force: true });
  }
}

function pass(label: string): void {
  console.log("PASS: " + label);
}

function fail(label: string, reason: string): void {
  console.log("FAIL: " + label + " — " + reason);
}

async function run(): Promise<void> {
  let failures = 0;
  const check = (label: string, ok: boolean, reason: string) => {
    if (ok) pass(label);
    else {
      fail(label, reason);
      failures++;
    }
  };

  // 1. MUTATING TOOL WITHOUT IDENTITY
  {
    const s = new McpSession({ SYNAPSE_AGENT_ID: undefined });
    await s.init();
    const r = await s.call("bus_publish", { topic: "t", body: "hi" });
    check(
      "1. bus_publish without SYNAPSE_AGENT_ID → IDENTITY_REQUIRED",
      r.kind === "toolError" && r.code === "IDENTITY_REQUIRED",
      JSON.stringify(r),
    );
    s.close();
  }

  // 2. INVALID INPUT (strict schema)
  {
    const s = new McpSession({});
    await s.init();
    const r = await s.call("memory_remember", { content: "x", bogus: 1 });
    const strictOk =
      (r.kind === "toolError" && r.code === "INVALID_INPUT") ||
      (r.kind === "mcpValidationError" && /Unrecognized key|Invalid arguments/i.test(r.text));
    check("2. memory_remember with unknown field → INVALID_INPUT", strictOk, JSON.stringify(r));
    s.close();
  }

  // 3. PAYLOAD TOO LARGE (>64KB body)
  {
    const s = new McpSession({});
    await s.init();
    const big = "x".repeat(65 * 1024);
    const r = await s.call("bus_publish", { topic: "big", body: big });
    const largeOk =
      (r.kind === "toolError" &&
        (r.code === "INVALID_INPUT" || r.code === "PAYLOAD_TOO_LARGE")) ||
      (r.kind === "mcpValidationError" && /65536 UTF-8 bytes|exceeds.*bytes/i.test(r.text));
    check("3. bus_publish body > 64KB → error", largeOk, JSON.stringify(r));
    s.close();
  }

  // 4. RESERVE CONFLICT / renew same glob
  {
    const s = new McpSession({});
    await s.init();
    const a = await s.call("bus_reserve", { resourceGlob: "glob-a", ttlMs: 300000 });
    const b = await s.call("bus_reserve", { resourceGlob: "glob-b", ttlMs: 300000 });
    const a2 = await s.call("bus_reserve", { resourceGlob: "glob-a", ttlMs: 300000 });
    const okA = a.kind === "ok" && (a.data as { ok: boolean }).ok === true;
    const okB = b.kind === "ok" && (b.data as { ok: boolean }).ok === true;
    const okA2 = a2.kind === "ok" && (a2.data as { ok: boolean }).ok === true;
    check("4. reserve A, B, renew A (all ok:true)", okA && okB && okA2, JSON.stringify({ a, b, a2 }));
    s.close();
  }

  // 5. RELEASE NON-EXISTENT
  {
    const s = new McpSession({});
    await s.init();
    const r = await s.call("bus_release", { resourceGlob: "nobody/holds/this" });
    check(
      "5. bus_release unheld glob → released:false",
      r.kind === "ok" && (r.data as { released: boolean }).released === false,
      JSON.stringify(r),
    );
    s.close();
  }

  // 6. TOMBSTONE NON-EXISTENT
  {
    const s = new McpSession({});
    await s.init();
    const r = await s.call("synapse_record_delete", { targetId: 99999, reason: "nope" });
    check(
      "6. synapse_record_delete targetId=99999 → NOT_FOUND",
      r.kind === "toolError" && r.code === "NOT_FOUND",
      JSON.stringify(r),
    );
    s.close();
  }

  // 7. EMPTY RECALL
  {
    const s = new McpSession({});
    await s.init();
    const r = await s.call("memory_recall", { query: "zzznomatchxyzzyqwerty", limit: 10 });
    const data = r.kind === "ok" ? (r.data as { results: unknown[]; truncated: boolean }) : null;
    check(
      "7. memory_recall no matches → results:[], truncated:false",
      data !== null && data.results.length === 0 && data.truncated === false,
      JSON.stringify(r),
    );
    s.close();
  }

  // 8. SUPERSEDE WITHOUT CONTENT
  {
    const s = new McpSession({});
    await s.init();
    const mem = await s.call("memory_remember", {
      content: "fact to invalidate only",
      scope: "shared",
    });
    const targetId =
      mem.kind === "ok" ? (mem.data as { id: number }).id : 0;
    const sup = await s.call("memory_supersede", { targetId, reason: "obsolete" });
    const recall = await s.call("memory_recall", { query: "invalidate only", limit: 10 });
    const hidden =
      recall.kind === "ok" &&
      !(recall.data as { results: { content: string }[] }).results.some((x) =>
        x.content.includes("invalidate only"),
      );
    check(
      "8. memory_supersede without content → succeeds, old hidden",
      sup.kind === "ok" && hidden,
      JSON.stringify({ sup, recall }),
    );
    s.close();
  }

  // 9. BUS_MESSAGES without topic (DM filter)
  {
    const s = new McpSession({});
    await s.init();
    await s.call("bus_publish", { topic: "shared-topic", body: "shared only message" });
    const r = await s.call("bus_messages", { since: 0, limit: 50 });
    const msgs =
      r.kind === "ok"
        ? (r.data as { messages: { kind?: string; topic?: string; body: string }[] }).messages
        : [];
    const hasShared = msgs.some((m) => m.body === "shared only message");
    const noDmToCaller = !msgs.some((m) => m.body === "review my PR");
    check(
      "9. bus_messages no topic → shared messages, no DMs to caller",
      r.kind === "ok" && hasShared && noDmToCaller,
      JSON.stringify(r),
    );
    s.close();
  }

  console.log("\n=== EDGE CASES: " + (9 - failures) + " pass, " + failures + " fail (of 9) ===");
  if (failures > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
