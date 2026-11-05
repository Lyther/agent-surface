#!/usr/bin/env node
// Synapse host acceptance (roadmap S3.1, Q-01): a host's real hook loader hands a headless session a
// record another agent wrote while it worked, once.
//
// Per host: a temp git project with synapse-hook registered at project scope (the entry the installer
// writes, pointing at a wrapper that runs this build's hook over a temp SYNAPSE_DB_DIR), and agent B, a
// headless session without the Synapse MCP server. Writer A, this build's server over stdio, creates the
// project DB, waits until B's first hook run has created B's cursor, then writes SYN-<random> while B
// sleeps. PASS: B's answer holds the marker, B's cursor is at or past it, and one more hook run for B
// prints nothing. A host that cannot run here is BLOCKED, with the reason.
//
// Usage, after `npm run build` in mcps/synapse:
//   node mcps/synapse/scripts/host-acceptance.mjs [claude[=model]] [codex[=model]] [droid[=model]]
// With no host named, all three run. droid needs FACTORY_API_KEY. Exits 0 only when every run passes.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { mergeSynapseHook, synapseHookRoute } from "../../../scripts/agent-surface/synapse-hook.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_JS = path.join(here, "..", "dist", "src", "server.js");
const HOOK_JS = path.join(here, "..", "dist", "src", "hook.js");
// Covers a cold host start and the model's first turn before its first tool call.
const FIRST_HOOK_WAIT_MS = 300_000;
const HOST_TIMEOUT_MS = 600_000;
const POLL_MS = 200;

const PROMPT = [
  "This is a test of tool hooks. Do exactly these steps in order, one tool call per step, and run nothing else:",
  "1. Run the shell command: echo start",
  "2. Run the shell command: sleep 8",
  "3. Run the shell command: echo done",
  "Then reply with every line of text you received after a tool call that begins with \"[project #\", verbatim, one per line, or NONE if there were none.",
].join("\n");

const lastLine = (text, pick) => text.split("\n").filter(Boolean).map((line) => {
  try { return pick(JSON.parse(line)); } catch { return undefined; }
}).filter((value) => typeof value === "string").at(-1) ?? "";

const HOSTS = {
  claude: {
    cli: "claude",
    target: "claude-code",
    args: (run) => [
      "-p", PROMPT, "--output-format", "json", "--model", run.model ?? "sonnet",
      // Project settings only, so the user's own hooks stay out; no MCP server at all.
      "--setting-sources", "project", "--strict-mcp-config", "--mcp-config", run.emptyMcpConfig,
      "--allowedTools", "Bash(echo:*)", "Bash(sleep:*)",
    ],
    answer: (stdout) => String(JSON.parse(stdout).result ?? ""),
  },
  codex: {
    cli: "codex",
    target: "codex",
    args: (run) => [
      "exec", "-C", run.project, "-s", "workspace-write",
      // ADR-17: a user trusts the hook once through /hooks; an unattended run skips that review.
      "--dangerously-bypass-hook-trust",
      "-c", "mcp_servers.synapse.enabled=false", "-c", "model_reasoning_effort=\"low\"",
      ...(run.model ? ["-m", run.model] : []), "--json", PROMPT,
    ],
    answer: (stdout) => lastLine(stdout, (event) => (event.type === "item.completed" && event.item?.type === "agent_message" ? event.item.text : undefined)),
  },
  droid: {
    cli: "droid",
    target: "droid",
    blocked: () => (process.env.FACTORY_API_KEY ? null : "FACTORY_API_KEY is not set"),
    args: (run) => [
      "exec", "--cwd", run.project, "--auto", "medium", "--remove-tools", "MCP:synapse", "-o", "stream-json",
      ...(run.model ? ["-m", run.model] : []), "-f", run.promptFile,
    ],
    answer: (stdout) => lastLine(stdout, (event) => (event.type === "completion" ? event.finalText : undefined)),
  },
};

const shellQuote = (value) => `'${value.replace(/'/g, "'\\''")}'`;

function versionOf(cli) {
  const result = spawnSync(cli, ["--version"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim().split("\n")[0] : null;
}

async function startWriter(dbDir, project) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_JS],
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", SYNAPSE_DB_DIR: dbDir, SYNAPSE_PROJECT: project, SYNAPSE_AGENT_ID: "acceptance-writer" },
    stderr: "pipe",
  });
  const client = new Client({ name: "host-acceptance", version: "0.0.1" });
  await client.connect(transport);
  return {
    async remember(content) {
      const result = await client.callTool({ name: "memory_remember", arguments: { content } });
      const text = result.content?.[0]?.text ?? "";
      if (result.isError) throw new Error(`memory_remember failed: ${text}`);
      return JSON.parse(text).id;
    },
    close: () => client.close(),
  };
}

function startHost(host, run) {
  const child = spawn(host.cli, host.args(run), { cwd: run.project, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => child.kill("SIGKILL"), HOST_TIMEOUT_MS);
  const done = new Promise((resolve) => {
    child.on("error", (error) => { stderr += String(error); });
    child.on("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
  });
  let exited = false;
  done.then(() => { exited = true; });
  return { done, exited: () => exited };
}

async function waitForReceiver(db, b) {
  const deadline = Date.now() + FIRST_HOOK_WAIT_MS;
  while (Date.now() < deadline && !b.exited()) {
    const row = db.prepare("SELECT receiver FROM hook_cursors ORDER BY updated_at LIMIT 1").get();
    if (row) return row.receiver;
    await delay(POLL_MS);
  }
  return null;
}

async function runHost(name, model) {
  const host = HOSTS[name];
  const version = versionOf(host.cli);
  if (version === null) return { name, status: "BLOCKED", detail: `${host.cli} is not on PATH` };
  const blocker = host.blocked?.();
  if (blocker) return { name, version, status: "BLOCKED", detail: blocker };

  const dir = mkdtempSync(path.join(tmpdir(), `synapse-acceptance-${name}-`));
  const project = path.join(dir, "project");
  const dbDir = path.join(dir, "db");
  mkdirSync(project);
  spawnSync("git", ["init", "-q"], { cwd: project });
  const wrapper = path.join(dir, "synapse-hook");
  writeFileSync(wrapper, `#!/bin/sh\nSYNAPSE_DB_DIR=${shellQuote(dbDir)} exec ${shellQuote(process.execPath)} ${shellQuote(HOOK_JS)}\n`);
  chmodSync(wrapper, 0o755);
  const route = await synapseHookRoute(host.target, project);
  mkdirSync(path.dirname(path.join(project, route.relativeOutput)), { recursive: true });
  writeFileSync(path.join(project, route.relativeOutput), mergeSynapseHook(null, route.eventPath, wrapper, true, route.relativeOutput));
  const run = { project, model, emptyMcpConfig: path.join(dir, "no-mcp.json"), promptFile: path.join(dir, "prompt.txt") };
  writeFileSync(run.emptyMcpConfig, "{\"mcpServers\":{}}\n");
  writeFileSync(run.promptFile, `${PROMPT}\n`);

  const fail = (detail, extra = "") => ({ name, version, status: "FAIL", detail: `${detail}; kept ${dir}${extra}` });
  const writer = await startWriter(dbDir, project);
  let db;
  let passed = false;
  try {
    // A project file must exist before B's first hook run, or the hook stays silent for good.
    await writer.remember("host acceptance seed");
    const file = readdirSync(dbDir).find((entry) => entry.endsWith(".sqlite") && entry !== "global.sqlite");
    db = new DatabaseSync(path.join(dbDir, file));
    db.exec("PRAGMA busy_timeout=5000");
    const b = startHost(host, run);
    const receiver = await waitForReceiver(db, b);
    if (receiver === null) {
      const result = await b.done;
      return fail("B's first hook run never set its baseline", `\n${result.stderr.slice(-1500)}`);
    }
    const marker = `SYN-${randomBytes(6).toString("hex")}`;
    const markerId = await writer.remember(`acceptance marker ${marker}`);
    const result = await b.done;
    let answer = "";
    try { answer = host.answer(result.stdout); } catch { /* reported below */ }
    if (!answer.includes(marker)) {
      return fail(`B's answer lacks ${marker} (exit ${result.code ?? result.signal})`, `\nanswer: ${answer.slice(0, 600)}\nstderr: ${result.stderr.slice(-1500)}`);
    }
    const cursor = db.prepare("SELECT project_after AS p FROM hook_cursors WHERE receiver=?").get(receiver)?.p ?? 0;
    if (cursor < markerId) return fail(`B's cursor ${cursor} is short of the marker #${markerId}`);
    const [sessionId, agentId] = receiver.split(":");
    const rerun = spawnSync(wrapper, {
      input: JSON.stringify({ session_id: sessionId, ...(agentId ? { agent_id: agentId } : {}), cwd: project, hook_event_name: "PostToolUse", tool_name: "Bash" }),
      encoding: "utf8",
    });
    if (rerun.status !== 0 || rerun.stdout !== "") return fail(`a further hook run for B printed ${JSON.stringify(rerun.stdout)} (exit ${rerun.status})`);
    passed = true;
    return { name, version, status: "PASS", detail: `${marker} (#${markerId}) delivered once; cursor ${cursor}` };
  } finally {
    db?.close();
    await writer.close();
    // A failed run keeps its directory for inspection.
    if (passed) rmSync(dir, { recursive: true, force: true });
  }
}

if (!existsSync(SERVER_JS) || !existsSync(HOOK_JS)) {
  console.error("host-acceptance: build first (npm run build in mcps/synapse)");
  process.exit(1);
}
const requested = process.argv.slice(2).map((arg) => arg.split("="));
const unknown = requested.filter(([name]) => !HOSTS[name]).map(([name]) => name);
if (unknown.length > 0) {
  console.error(`host-acceptance: unknown host ${unknown.join(", ")}; choose from ${Object.keys(HOSTS).join(", ")}`);
  process.exit(1);
}
const runs = requested.length > 0 ? requested : Object.keys(HOSTS).map((name) => [name]);
const results = [];
for (const [name, model] of runs) {
  const result = await runHost(name, model);
  results.push(result);
  console.log(`${result.name}${result.version ? ` (${result.version})` : ""}: ${result.status} - ${result.detail}`);
}
process.exitCode = results.every((result) => result.status === "PASS") ? 0 : 1;
