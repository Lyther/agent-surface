// A minimal MCP stdio client for the LIVE acceptances: launch a command, complete the initialize
// handshake, then drive requests over the same pipes a host would. Shared so live-launch and
// live-provision make the same claim in the same way — a chain that fails to start is an error
// carrying the server's stderr, never a quiet skip.
import { spawn } from "node:child_process";
import os from "node:os";

// A minimal-but-valid launch environment: the system directories a process is always given, and
// NOTHING else. The runtime's own directory is deliberately absent — that is the defect under test,
// so the harness must not add it back. On Windows the OS itself requires SystemRoot/ComSpec to
// create a process at all; supplying those is not a PATH repair.
export function minimalLaunchEnv(home, platform = process.platform, env = process.env) {
  if (platform !== "win32") return { PATH: "/usr/bin:/bin", HOME: home };
  const systemRoot = env.SystemRoot ?? "C:\\Windows";
  return {
    Path: `${systemRoot}\\system32;${systemRoot}`,
    SystemRoot: systemRoot,
    ComSpec: env.ComSpec ?? `${systemRoot}\\system32\\cmd.exe`,
    TEMP: env.TEMP ?? os.tmpdir(),
    TMP: env.TMP ?? os.tmpdir(),
    USERPROFILE: home,
    HOME: home,
  };
}

// An MCP stdio session over the launched process. `steps` is an async driver that receives a
// `call(method, params)` function; the session resolves with whatever the driver returns, or
// rejects with why the chain failed to start.
export function mcpSession(command, args, { cwd, env, timeoutMs = 300000 }, steps) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    const pending = new Map();
    let buffer = "";
    let stderr = "";
    let started = false;
    let nextId = 1;
    const settle = (fn, value) => { clearTimeout(timer); child.kill(); fn(value); };
    const timer = setTimeout(() => settle(reject, new Error(`timed out; stderr: ${stderr.slice(-1200)}`)), timeoutMs);
    const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    const call = (method, params) => new Promise((ok, fail) => {
      const id = nextId += 1;
      pending.set(id, { ok, fail });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
    child.on("error", (error) => settle(reject, new Error(`${error.message}; stderr: ${stderr.slice(-1200)}`)));
    child.on("exit", (code) => { if (!started) settle(reject, new Error(`exited ${code} before initialize; stderr: ${stderr.slice(-1200)}`)); });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        if (message.id === 1) {
          if (message.error) { settle(reject, new Error(`initialize failed: ${JSON.stringify(message.error)}`)); return; }
          started = true;
          notify("notifications/initialized");
          steps({ call, serverInfo: message.result.serverInfo }).then((value) => settle(resolve, value), (error) => settle(reject, error));
          continue;
        }
        const waiter = pending.get(message.id);
        if (!waiter) continue;
        pending.delete(message.id);
        if (message.error) waiter.fail(new Error(`rpc error: ${JSON.stringify(message.error)}`));
        else waiter.ok(message.result);
      }
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "agent-surface-acceptance", version: "0" } } })}\n`);
  });
}

// Flatten an MCP tool result's content blocks to text.
export const resultText = (result) => (result?.content ?? []).map((block) => block.text ?? "").join("\n");

// A failed tool call comes back as a normal result carrying isError, not as a JSON-RPC error, so it
// has to be checked explicitly — otherwise a failure reads as an empty success.
export async function callTool(call, name, args) {
  const result = await call("tools/call", { name, arguments: args });
  const text = resultText(result);
  if (result?.isError) throw new Error(`${name} failed: ${text}`);
  return text;
}
