import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWorkspaceTools } from "./workspace.js";
import { registerConcurrencyTools } from "./concurrency.js";
import { registerCodeOpsTools } from "./codeOps.js";
import { registerArtifactTools } from "./artifacts.js";
import { registerNoteTools } from "./notes.js";

export function registerPhase1Tools(server: McpServer) {
  registerWorkspaceTools(server);
  registerConcurrencyTools(server);
  registerCodeOpsTools(server);
  registerArtifactTools(server);
  registerNoteTools(server);
}

