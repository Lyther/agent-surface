// The built synapse-hook, run as each host runs it: one process per tool call, the host's recorded
// PostToolUse event on stdin (test/fixtures/hooks, captured from real sessions in S0.1).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { SystemClock } from "../src/clock.js";
import { LIMITS } from "../src/contract.js";
import { HEADER } from "../src/hook.js";
import { hashKey, projectKey } from "../src/namespace.js";
import { Store } from "../src/store.js";
import { HOOK_JS } from "./helpers.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "test", "fixtures", "hooks");
const HOSTS = ["claude", "codex", "droid"] as const;
type HookPayload = Record<string, unknown> & { session_id: string; cwd: string; tool_response?: unknown };

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "synapse-hook-"));
  const dbDir = join(dir, "db");
  const project = join(dir, "project");
  mkdirSync(project);
  const projectDbPath = join(dbDir, `${hashKey(projectKey(project))}.sqlite`);
  const store = new Store({ clock: new SystemClock(), dbDir, globalDbPath: join(dbDir, "global.sqlite") });
  const env = { PATH: process.env["PATH"] ?? "", HOME: dir, SYNAPSE_DB_DIR: dbDir };
  const event = (name: string, overrides: Partial<HookPayload> = {}): HookPayload =>
    ({ ...(JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")) as HookPayload), cwd: project, ...overrides });
  const write = (content: string, global = false): number => store.remember({ projectDbPath, agentId: "writer", content, global }).id;
  const hook = (payload: unknown) => {
    const r = spawnSync(process.execPath, [HOOK_JS], { input: typeof payload === "string" ? payload : JSON.stringify(payload), env, encoding: "utf8" });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  const cleanup = () => { store.close(); rmSync(dir, { recursive: true, force: true }); };
  return { dir, dbDir, project, projectDbPath, env, event, write, hook, cleanup };
}

/** The added context of one run, or "" when the hook printed nothing. */
function contextOf(run: { status: number | null; stdout: string; stderr: string }): string {
  assert.equal(run.status, 0, `hook failed: ${run.stderr}`);
  if (run.stdout === "") return "";
  const out = JSON.parse(run.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
  return out.hookSpecificOutput.additionalContext;
}

const deliveredIds = (context: string): number[] => [...context.matchAll(/^\[(?:project|global) #(\d+)\]/gm)].map((m) => Number(m[1]));

test("stays silent and creates no file in a project where no agent used Synapse", () => {
  const t = setup();
  try {
    assert.equal(contextOf(t.hook(t.event("claude-shell"))), "");
    assert.equal(existsSync(t.dbDir), false, "the hook created nothing under the data directory");
  } finally { t.cleanup(); }
});

for (const host of HOSTS) {
  test(`${host}: the first run sets a baseline, a new record arrives once, then the hook is silent`, () => {
    const t = setup();
    try {
      t.write("written before this session's first tool call");
      assert.equal(contextOf(t.hook(t.event(`${host}-shell`))), "", "the first run only sets the baseline");
      const marker = `SYN-${host}-${Date.now()}`;
      const id = t.write(`decision ${marker}`);
      const context = contextOf(t.hook(t.event(`${host}-shell`)));
      assert.ok(context.startsWith(`${HEADER}\n`), context);
      assert.match(context, new RegExp(`^\\[project #${id}\\] writer \\d{4}-\\d\\d-\\d\\dT[^ ]+Z: decision ${marker}$`, "m"));
      assert.doesNotMatch(context, /before this session/);
      assert.equal(contextOf(t.hook(t.event(`${host}-shell`))), "", "a record is handed over once");
    } finally { t.cleanup(); }
  });

  test(`${host}: the record this event's own memory_remember returned is not handed back`, () => {
    const t = setup();
    try {
      t.write("seed");
      const mine = t.event(`${host}-mcp`);
      const other = { ...t.event(`${host}-shell`), session_id: "another-session" };
      t.hook(mine);
      t.hook(other);
      const own = t.write("written by this session");
      const peer = t.write("written by a peer");
      // The recorded result names the spike's id; point it at the record this session just wrote.
      const recorded = JSON.stringify(mine.tool_response);
      assert.match(recorded, /\\"id\\":\s*\d+/, "the fixture carries the remembered id");
      const response = recorded.replace(/(\\"id\\":\s*)\d+/, `$1${own}`);
      const context = contextOf(t.hook({ ...mine, tool_response: JSON.parse(response) }));
      assert.deepEqual(deliveredIds(context), [peer]);
      assert.deepEqual(deliveredIds(contextOf(t.hook(other))), [own, peer], "another session gets both");
      assert.equal(contextOf(t.hook(mine)), "", "the skipped id is not offered again");
    } finally { t.cleanup(); }
  });
}

test("a record this session wrote past the byte budget is still never handed back", () => {
  const t = setup();
  try {
    t.write("seed");
    const mine = t.event("claude-mcp");
    t.hook(mine);
    const peers = Array.from({ length: 60 }, (_, i) => t.write(`peer backlog ${i} ${"x".repeat(400)}`));
    const own = t.write("written by this session");
    const response = JSON.stringify(mine.tool_response).replace(/(\\"id\\":\s*)\d+/, `$1${own}`);
    const first = contextOf(t.hook({ ...mine, tool_response: JSON.parse(response) }));
    assert.ok(deliveredIds(first).length < peers.length, "premise: the budget stops this run before the session's own record");
    const delivered = [...deliveredIds(first)];
    for (let runs = 0; runs < 20; runs++) {
      const context = contextOf(t.hook(t.event("claude-shell")));
      if (context === "") break;
      delivered.push(...deliveredIds(context));
    }
    assert.deepEqual(delivered, peers, "every peer record once, in order, and not the session's own");
  } finally { t.cleanup(); }
});

test("a subagent is its own receiver: Claude Code by agent_id, Droid by its own session_id", () => {
  const t = setup();
  try {
    t.write("seed");
    const receivers = ["claude-shell", "claude-subagent", "droid-shell", "droid-subagent"].map((name) => t.event(name));
    for (const r of receivers) assert.equal(contextOf(t.hook(r)), "");
    const id = t.write("for every receiver");
    for (const r of receivers) assert.deepEqual(deliveredIds(contextOf(t.hook(r))), [id], `${String(r["agent_id"] ?? r.session_id)} got it`);
  } finally { t.cleanup(); }
});

test("global records arrive through their own cursor, in time order with project records", async () => {
  const t = setup();
  try {
    t.write("seed");
    t.hook(t.event("codex-shell"));
    // Records written in one millisecond share a timestamp; the waits make the time order the written order.
    const p1 = t.write("project one");
    await delay(5);
    const g1 = t.write("global one", true);
    await delay(5);
    const p2 = t.write("project two");
    const context = contextOf(t.hook(t.event("codex-shell")));
    assert.deepEqual(deliveredIds(context), [p1, g1, p2]);
    assert.match(context, new RegExp(`^\\[global #${g1}\\] writer .*: global one$`, "m"));
    assert.ok(g1 >= 1_000_000_000_000, "a global record shows the id memory_get takes");
    assert.equal(contextOf(t.hook(t.event("codex-shell"))), "");
  } finally { t.cleanup(); }
});

test("records beyond the byte budget arrive with later runs, each once", () => {
  const t = setup();
  try {
    t.write("seed");
    t.hook(t.event("droid-shell"));
    const written = Array.from({ length: 60 }, (_, i) => t.write(`backlog ${i} ${"x".repeat(400)}`));
    const seen: number[] = [];
    let runs = 0;
    for (; runs < 20; runs++) {
      const context = contextOf(t.hook(t.event("droid-shell")));
      if (context === "") break;
      assert.ok(Buffer.byteLength(context, "utf8") <= LIMITS.MAXBYTES_DEFAULT, `run ${runs} stays within the budget`);
      const ids = deliveredIds(context);
      if (seen.length + ids.length < written.length) assert.match(context, /\n\(\d+ more; they arrive after later tool calls/);
      seen.push(...ids);
    }
    assert.ok(runs > 1, "the backlog needed more than one run");
    assert.deepEqual(seen, written, "every record arrived once, in order");
  } finally { t.cleanup(); }
});

test("a record longer than the budget arrives as a snippet that keeps its id", () => {
  const t = setup();
  try {
    t.write("seed");
    t.hook(t.event("claude-shell"));
    const id = t.write(`start ${"y".repeat(20_000)} end`);
    const context = contextOf(t.hook(t.event("claude-shell")));
    assert.deepEqual(deliveredIds(context), [id]);
    assert.match(context, /… \(memory_get for the rest\)$/);
    assert.doesNotMatch(context, / end$/);
    assert.ok(Buffer.byteLength(context, "utf8") <= LIMITS.MAXBYTES_DEFAULT);
  } finally { t.cleanup(); }
});

test("concurrent runs for one receiver hand each record over once (Q-02)", async () => {
  const t = setup();
  try {
    t.write("seed");
    t.hook(t.event("claude-shell"));
    const written = Array.from({ length: 30 }, (_, i) => t.write(`parallel ${i}`));
    const runOnce = () => new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [HOOK_JS], { env: t.env, stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      child.stdout.on("data", (c: Buffer) => { out += c.toString("utf8"); });
      child.stderr.on("data", (c: Buffer) => { err += c.toString("utf8"); });
      child.on("error", reject);
      child.on("close", (status) => resolve(contextOf({ status, stdout: out, stderr: err })));
      child.stdin.end(JSON.stringify(t.event("claude-shell")));
    });
    const contexts = await Promise.all(Array.from({ length: 6 }, runOnce));
    const delivered = contexts.flatMap(deliveredIds);
    assert.deepEqual([...delivered].sort((a, b) => a - b), written, "every record once across the concurrent runs");
  } finally { t.cleanup(); }
});

test("with nothing new the hook takes no write lock (Q-04)", () => {
  const t = setup();
  try {
    t.write("seed");
    t.hook(t.event("codex-shell"));
    const holder = new DatabaseSync(t.projectDbPath);
    holder.exec("BEGIN IMMEDIATE");
    try {
      const started = Date.now();
      assert.equal(contextOf(t.hook(t.event("codex-shell"))), "");
      assert.ok(Date.now() - started < 4000, "it did not wait on the held write lock");
    } finally { holder.exec("ROLLBACK"); holder.close(); }
  } finally { t.cleanup(); }
});

test("a malformed event exits 1 with one stderr line and prints nothing", () => {
  const t = setup();
  try {
    t.write("seed");
    for (const input of ["not json", JSON.stringify({ cwd: t.project }), JSON.stringify({ session_id: "s" })]) {
      const run = t.hook(input);
      assert.equal(run.status, 1, input);
      assert.equal(run.stdout, "");
      // Node 22 also prints its own SQLite ExperimentalWarning; only the synapse-hook line is ours.
      const own = run.stderr.split("\n").filter((line) => line.startsWith("[synapse-hook]"));
      assert.equal(own.length, 1, run.stderr);
      assert.match(own[0]!, /^\[synapse-hook\] \S/);
    }
    assert.deepEqual(readdirSync(t.dbDir).filter((f) => f.endsWith(".sqlite")).length, 1, "nothing new was created");
  } finally { t.cleanup(); }
});
