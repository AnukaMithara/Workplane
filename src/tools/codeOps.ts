import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerWorkspaceApplyPatchTool } from "./codeOps/applyPatch.js";
import { registerWorkspaceDiffTool } from "./codeOps/diff.js";
import { registerWorkspaceRunTool } from "./codeOps/run.js";

export function registerCodeOpsTools(server: McpServer) {
  registerWorkspaceApplyPatchTool(server);
  registerWorkspaceDiffTool(server);
  registerWorkspaceRunTool(server);
}
