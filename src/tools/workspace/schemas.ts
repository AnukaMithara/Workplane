import * as z from "zod/v4";

export const WorkspaceInfoSchema = z.object({
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

