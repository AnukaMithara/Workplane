import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerArtifactGetTool } from "./artifacts/get.js";
import { registerArtifactListTool } from "./artifacts/list.js";
import { registerArtifactPutTool } from "./artifacts/put.js";

export function registerArtifactTools(server: McpServer) {
  registerArtifactPutTool(server);
  registerArtifactGetTool(server);
  registerArtifactListTool(server);
}
