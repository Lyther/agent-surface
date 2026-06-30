// grimoire — stdio MCP server. Read-only: opens the self-contained index via Store and
// serves the 4 tools. Every result is structuredContent (the typed status DTO) plus a
// text mirror prefixed so hosts/models treat it as reference DATA, not instructions.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CONTRACT_VERSION, REFERENCE_LABEL, SERVER_INSTRUCTIONS } from "./contract.js";
import { Store } from "./store.js";
import { grimoireTools } from "./tools.js";

export function createServer(store: Store): McpServer {
  const server = new McpServer(
    { name: "grimoire", version: CONTRACT_VERSION },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
  );
  for (const tool of grimoireTools()) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputShape, annotations: { readOnlyHint: true } },
      (args) => {
        const result = tool.run(store, args);
        return {
          structuredContent: result as Record<string, unknown>,
          content: [{ type: "text" as const, text: `${REFERENCE_LABEL}\n${JSON.stringify(result)}` }],
        };
      },
    );
  }
  return server;
}

async function main(): Promise<void> {
  const store = new Store();
  const server = createServer(store);
  await server.connect(new StdioServerTransport());
  process.stderr.write("[grimoire-server] stdio MCP ready\n");
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  main().catch((e) => {
    process.stderr.write(`[grimoire-server] fatal: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
