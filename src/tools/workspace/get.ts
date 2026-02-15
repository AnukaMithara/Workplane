import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { workspaceGet } from "../../core/workspaces.js";
import { ResultBaseSchema, toolErr, toolOk } from "../common.js";
import { WorkspaceInfoSchema } from "./schemas.js";

export function registerWorkspaceGetTool(server: McpServer) {
  server.registerTool(
    "workspace.get",
    {
      description: "Get workspace metadata and status.",
      inputSchema: { workspace_id: z.string().min(1) },
      outputSchema: ResultBaseSchema.extend({
        workspace: WorkspaceInfoSchema.optional(),
      }),
    },
    async (args) => {
      try {
        const { workspace_id } = args as any;
        const r = await workspaceGet(workspace_id);
        if (!r.workspace) return toolOk({});
        return toolOk({
          workspace: {
            workspace_id: r.workspace.workspace_id,
            status: r.workspace.status,
            repo_id: r.workspace.repo_id,
            worktree_path: r.workspace.worktree_path,
            repo_cache_path: r.workspace.repo_cache_path,
            branch_name: r.workspace.branch_name,
            base_ref: r.workspace.base_ref,
            base_sha: r.workspace.base_sha,
            task_id: r.workspace.task_id,
            agent_id: r.workspace.agent_id,
            created_at: r.workspace.created_at,
            updated_at: r.workspace.updated_at,
            closed_at: r.workspace.closed_at,
          },
        });
      } catch (err: any) {
        return toolErr("GET_FAILED", err?.message ?? "workspace.get failed");
      }
    }
  );
}

