import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  workspaceClose,
  workspaceCreate,
  workspaceGet,
  workspaceList,
} from "../core/workspaces.js";
import { ResultBaseSchema, toolErr, toolOk } from "./common.js";

const WorkspaceInfoSchema = z.object({
  workspace_id: z.string(),
  status: z.string(),
  repo_id: z.string().optional(),
  worktree_path: z.string().optional(),
  repo_cache_path: z.string().optional(),
  branch_name: z.string().optional(),
  base_ref: z.string().optional(),
  base_sha: z.string().optional(),
  task_id: z.string().optional(),
  agent_id: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  closed_at: z.string().optional(),
});

export function registerWorkspaceTools(server: McpServer) {
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
