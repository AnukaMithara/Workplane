import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerPhase1Tools } from "./tools/index.js";

async function main() {
  const server = new McpServer({
    name: "workplane",
    version: "0.1.0",
  });

  registerPhase1Tools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // IMPORTANT: never write to stdout in stdio mode; it corrupts the JSON-RPC stream.
  console.error("Workplane MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal server error:", err);
  process.exitCode = 1;
});

