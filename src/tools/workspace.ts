import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerWorkspaceCloseTool } from "./workspace/close.js";
import { registerWorkspaceCreateTool } from "./workspace/create.js";
import { registerWorkspaceGetTool } from "./workspace/get.js";
import { registerWorkspaceListTool } from "./workspace/list.js";

export function registerWorkspaceTools(server: McpServer) {
  registerWorkspaceCreateTool(server);
  registerWorkspaceGetTool(server);
  registerWorkspaceListTool(server);
  registerWorkspaceCloseTool(server);
}
