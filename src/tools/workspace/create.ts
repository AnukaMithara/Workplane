import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { workspaceCreate } from "../../core/workspaces.js";
import { ResultBaseSchema, toolErr, toolOk } from "../common.js";

export function registerWorkspaceCreateTool(server: McpServer) {
  server.registerTool(
    "workspace.create",
    {
      description: "Create a new isolated workspace backed by a Git worktree.",
      inputSchema: z
        .object({
          repo_url: z.string().url().optional().describe("Remote git repo URL"),
          repo_path: z.string().optional().describe("Local repo path"),
          base_ref: z.string().optional().describe("Git base ref (branch/tag/sha)"),
          branch_name: z.string().optional().describe("Workspace branch name"),
          task_id: z.string().optional(),
          agent_id: z.string().optional(),
        })
        .superRefine((val, ctx) => {
          if (!val.repo_url && !val.repo_path) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Either repo_url or repo_path is required.",
              path: ["repo_url"],
            });
          }
        }),
      outputSchema: ResultBaseSchema.extend({
        workspace_id: z.string().optional(),
        repo_id: z.string().optional(),
        worktree_path: z.string().optional(),
        branch_name: z.string().optional(),
        base_ref: z.string().optional(),
        base_sha: z.string().optional(),
        created_at: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const r = await workspaceCreate(args as any);
        if (!r.ok) {
          return toolErr(r.error.code, r.error.message, r.error.details);
        }
        return toolOk({
          workspace_id: r.workspace.workspace_id,
          repo_id: r.workspace.repo_id,
          worktree_path: r.workspace.worktree_path,
          branch_name: r.workspace.branch_name,
          base_ref: r.workspace.base_ref,
          base_sha: r.workspace.base_sha,
          created_at: r.workspace.created_at,
        });
      } catch (err: any) {
        return toolErr("CREATE_FAILED", err?.message ?? "workspace.create failed");
      }
    }
  );
}
