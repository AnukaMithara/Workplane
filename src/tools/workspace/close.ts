import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { workspaceClose } from "../../core/workspaces.js";
import { ResultBaseSchema, toolErr, toolOk } from "../common.js";

export function registerWorkspaceCloseTool(server: McpServer) {
  server.registerTool(
    "workspace.close",
    {
      description:
        "Close a workspace (remove its worktree directory) if it was created by Workplane.",
      inputSchema: {
        workspace_id: z.string().min(1),
        holder_id: z.string().optional().describe("Lock holder requesting the close"),
      },
      outputSchema: ResultBaseSchema.extend({
        workspace_id: z.string().optional(),
        closed_at: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const { workspace_id, holder_id } = args as any;
        const r = await workspaceClose({ workspace_id, holder_id });
        if (!r.ok) {
          const details =
            typeof r.error === "object" && r.error && "details" in r.error
              ? (r.error as any).details
              : undefined;
          return toolErr(r.error.code, r.error.message, details);
        }
        return toolOk({
          workspace_id: r.workspace.workspace_id,
          closed_at: r.workspace.closed_at,
        });
      } catch (err: any) {
        return toolErr("CLOSE_FAILED", err?.message ?? "workspace.close failed");
      }
    }
  );
}
