import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { workspaceList } from "../../core/workspaces.js";
import { ResultBaseSchema, toolErr, toolOk } from "../common.js";
import { WorkspaceInfoSchema } from "./schemas.js";

export function registerWorkspaceListTool(server: McpServer) {
  server.registerTool(
    "workspace.list",
    {
      description: "List known workspaces (filtering optional).",
      inputSchema: z
        .object({
          repo_id: z.string().optional(),
          task_id: z.string().optional(),
          agent_id: z.string().optional(),
          status: z.string().optional(),
        })
        .optional(),
      outputSchema: ResultBaseSchema.extend({
        workspaces: z.array(WorkspaceInfoSchema).optional(),
      }),
    },
    async (args) => {
      try {
        const filters = (args ?? {}) as any;
        const r = await workspaceList(filters);
        return toolOk({
          workspaces: r.workspaces.map((w) => ({
            workspace_id: w.workspace_id,
            status: w.status,
            repo_id: w.repo_id,
            worktree_path: w.worktree_path,
            repo_cache_path: w.repo_cache_path,
            branch_name: w.branch_name,
            base_ref: w.base_ref,
            base_sha: w.base_sha,
            task_id: w.task_id,
            agent_id: w.agent_id,
            created_at: w.created_at,
            updated_at: w.updated_at,
            closed_at: w.closed_at,
          })),
        });
      } catch (err: any) {
        return toolErr("LIST_FAILED", err?.message ?? "workspace.list failed");
      }
    }
  );
}
