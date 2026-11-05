import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** The built server entry point, the file the `synapse-bridge` bin runs. */
export const SERVER_JS = join(HERE, "..", "src", "server.js");
/** The built hook entry point, the file the `synapse-hook` bin runs. */
export const HOOK_JS = join(HERE, "..", "src", "hook.js");

export interface SpawnedServer {
  client: Client;
  pid: number;
  /** Call a tool and return its parsed JSON payload; a tool error rejects. */
  call<T>(name: string, args: Record<string, unknown>): Promise<T>;
  close(): Promise<void>;
}

/** Start the built server as a real child process over stdio, the way a host starts it. */
export async function spawnServer(env: Record<string, string>, clientName = "test-host"): Promise<SpawnedServer> {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER_JS], env, stderr: "pipe" });
  const client = new Client({ name: clientName, version: "0.0.1" });
  await client.connect(transport);
  const pid = transport.pid;
  if (pid === null) throw new Error("the server process has no pid");
  return {
    client,
    pid,
    async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
      const result = await client.callTool({ name, arguments: args });
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
      if (result.isError) throw new Error(`${name} failed: ${text}`);
      return JSON.parse(text) as T;
    },
    close: () => client.close(),
  };
}
