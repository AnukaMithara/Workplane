import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  workspaceClose,
  workspaceCreate,
  workspaceGet,
  workspaceList,
} from "../core/workspaces.js";
import {
  checkWorkspaceMutationAllowed,
  workspaceLock,
  workspaceRelease,
} from "../core/locks.js";
import { artifactGet, artifactList, artifactPut } from "../core/artifacts.js";

const ErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

const ResultBaseSchema = z.object({
  ok: z.boolean(),
  timestamp: z.string(),
  error: ErrorSchema.optional(),
});

function nowIso() {
  return new Date().toISOString();
}

function toolOk<T extends object>(payload: T) {
  const result = {
    ok: true as const,
    timestamp: nowIso(),
    ...payload,
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
  };
}

function toolErr(code: string, message: string, details?: unknown) {
  const result = {
    ok: false as const,
    timestamp: nowIso(),
    error: { code, message, details },
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
  };
}

function notImplemented(toolName: string) {
  const result = {
    ok: false as const,
    timestamp: nowIso(),
    error: {
      code: "NOT_IMPLEMENTED",
      message: `${toolName} is not implemented yet (Phase 1 stub).`,
    },
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
  };
}

export function registerPhase1Tools(server: McpServer) {
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

  // Workspace lifecycle
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

  // Concurrency
  server.registerTool(
    "workspace.lock",
    {
      description: "Acquire a mutation lock for a workspace.",
      inputSchema: {
        workspace_id: z.string().min(1),
        holder_id: z.string().min(1),
        ttl_ms: z.number().int().positive().optional(),
      },
      outputSchema: ResultBaseSchema.extend({
        workspace_id: z.string().optional(),
        holder_id: z.string().optional(),
        locked_until: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const { workspace_id, holder_id, ttl_ms } = args as any;
        const r = await workspaceLock({ workspace_id, holder_id, ttl_ms });
        if (!r.ok) {
          return toolErr(r.error.code, r.error.message, (r.error as any).details);
        }
        return toolOk({
          workspace_id: r.workspace_id,
          holder_id: r.holder_id,
          locked_until: r.locked_until,
        });
      } catch (err: any) {
        return toolErr("LOCK_FAILED", err?.message ?? "workspace.lock failed");
      }
    }
  );

  server.registerTool(
    "workspace.release",
    {
      description: "Release a mutation lock for a workspace.",
      inputSchema: {
        workspace_id: z.string().min(1),
        holder_id: z.string().min(1),
      },
      outputSchema: ResultBaseSchema.extend({
        workspace_id: z.string().optional(),
        released_at: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const { workspace_id, holder_id } = args as any;
        const r = await workspaceRelease({ workspace_id, holder_id });
        if (!r.ok) {
          return toolErr(r.error.code, r.error.message, (r.error as any).details);
        }
        return toolOk({ workspace_id: r.workspace_id, released_at: r.released_at });
      } catch (err: any) {
        return toolErr(
          "RELEASE_FAILED",
          err?.message ?? "workspace.release failed"
        );
      }
    }
  );

  // Code operations
  server.registerTool(
    "workspace.apply_patch",
    {
      description: "Apply a unified diff/patch inside a workspace (prefer git apply).",
      inputSchema: {
        workspace_id: z.string().min(1),
        patch: z.string().min(1).describe("Unified diff to apply"),
        holder_id: z.string().optional(),
      },
      outputSchema: ResultBaseSchema.extend({
        workspace_id: z.string().optional(),
        applied: z.boolean().optional(),
        applied_at: z.string().optional(),
      }),
    },
    async (args) => {
      const { workspace_id, holder_id } = args as any;
      const lockCheck = await checkWorkspaceMutationAllowed({ workspace_id, holder_id });
      if (!lockCheck.ok) {
        return toolErr(lockCheck.error.code, lockCheck.error.message, (lockCheck.error as any).details);
      }
      return notImplemented("workspace.apply_patch");
    }
  );

  server.registerTool(
    "workspace.diff",
    {
      description: "Return git diff for a workspace (optionally store as artifact).",
      inputSchema: {
        workspace_id: z.string().min(1),
        staged: z.boolean().optional(),
        pathspec: z.array(z.string()).optional(),
      },
      outputSchema: ResultBaseSchema.extend({
        workspace_id: z.string().optional(),
        diff: z.string().optional(),
        artifact_id: z.string().optional(),
      }),
    },
    async () => notImplemented("workspace.diff")
  );

  server.registerTool(
    "workspace.run",
    {
      description:
        "Run a command in the workspace and capture bounded stdout/stderr evidence.",
      inputSchema: {
        workspace_id: z.string().min(1),
        command: z.string().min(1).describe("Command to run (string form)"),
        args: z.array(z.string()).optional().describe("Optional args array form"),
        timeout_ms: z.number().int().positive().optional(),
        max_output_bytes: z.number().int().positive().optional(),
        holder_id: z.string().optional(),
      },
      outputSchema: ResultBaseSchema.extend({
        workspace_id: z.string().optional(),
        exit_code: z.number().int().optional(),
        duration_ms: z.number().int().optional(),
        stdout: z.string().optional(),
        stderr: z.string().optional(),
        log_artifact_id: z.string().optional(),
        started_at: z.string().optional(),
        ended_at: z.string().optional(),
      }),
    },
    async (args) => {
      const { workspace_id, holder_id } = args as any;
      const lockCheck = await checkWorkspaceMutationAllowed({ workspace_id, holder_id });
      if (!lockCheck.ok) {
        return toolErr(lockCheck.error.code, lockCheck.error.message, (lockCheck.error as any).details);
      }
      return notImplemented("workspace.run");
    }
  );

  // Artifacts
  server.registerTool(
    "artifact.put",
    {
      description: "Store an artifact for a workspace.",
      inputSchema: {
        workspace_id: z.string().min(1),
        type: z
          .enum(["diff", "log", "file", "note", "report"])
          .describe("Artifact type"),
        name: z.string().optional(),
        content: z.string().optional().describe("Inline artifact content (utf-8)"),
        content_base64: z
          .string()
          .optional()
          .describe("Inline artifact content (base64)"),
        content_type: z.string().optional().describe("MIME type hint"),
        metadata: z.record(z.string(), z.unknown()).optional(),
      },
      outputSchema: ResultBaseSchema.extend({
        workspace_id: z.string().optional(),
        artifact_id: z.string().optional(),
        stored_at: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const r = await artifactPut(args as any);
        if (!r.ok) {
          return toolErr(r.error.code, r.error.message, (r.error as any).details);
        }
        return toolOk({
          workspace_id: r.workspace_id,
          artifact_id: r.artifact_id,
          stored_at: r.stored_at,
        });
      } catch (err: any) {
        return toolErr("PUT_FAILED", err?.message ?? "artifact.put failed");
      }
    }
  );

  server.registerTool(
    "artifact.get",
    {
      description: "Fetch artifact metadata and content (or a path reference).",
      inputSchema: {
        workspace_id: z.string().min(1),
        artifact_id: z.string().min(1),
      },
      outputSchema: ResultBaseSchema.extend({
        artifact: z
          .object({
            artifact_id: z.string(),
            type: z.string(),
            name: z.string().optional(),
            content: z.string().optional(),
            content_base64: z.string().optional(),
            content_type: z.string().optional(),
            created_at: z.string().optional(),
          })
          .optional(),
      }),
    },
    async (args) => {
      try {
        const { workspace_id, artifact_id } = args as any;
        const r = await artifactGet({ workspace_id, artifact_id });
        if (!r.ok) {
          return toolErr(r.error.code, r.error.message, (r.error as any).details);
        }
        return toolOk({ artifact: r.artifact });
      } catch (err: any) {
        return toolErr("GET_FAILED", err?.message ?? "artifact.get failed");
      }
    }
  );

  server.registerTool(
    "artifact.list",
    {
      description: "List artifacts for a workspace.",
      inputSchema: {
        workspace_id: z.string().min(1),
        type: z.string().optional(),
      },
      outputSchema: ResultBaseSchema.extend({
        artifacts: z
          .array(
            z.object({
              artifact_id: z.string(),
              type: z.string(),
              name: z.string().optional(),
              created_at: z.string().optional(),
            })
          )
          .optional(),
      }),
    },
    async (args) => {
      try {
        const { workspace_id, type } = args as any;
        const r = await artifactList({ workspace_id, type });
        if (!r.ok) {
          return toolErr(r.error.code, r.error.message, (r.error as any).details);
        }
        return toolOk({ artifacts: r.artifacts });
      } catch (err: any) {
        return toolErr("LIST_FAILED", err?.message ?? "artifact.list failed");
      }
    }
  );

  // Nice-to-have notes (stubbed)
  server.registerTool(
    "workspace.note.add",
    {
      description: "Add a note to a workspace (optional tool).",
      inputSchema: {
        workspace_id: z.string().min(1),
        note: z.string().min(1),
      },
      outputSchema: ResultBaseSchema.extend({
        workspace_id: z.string().optional(),
        note_id: z.string().optional(),
        created_at: z.string().optional(),
      }),
    },
    async () => notImplemented("workspace.note.add")
  );

  server.registerTool(
    "workspace.note.list",
    {
      description: "List notes for a workspace (optional tool).",
      inputSchema: {
        workspace_id: z.string().min(1),
      },
      outputSchema: ResultBaseSchema.extend({
        notes: z
          .array(
            z.object({
              note_id: z.string(),
              note: z.string(),
              created_at: z.string().optional(),
            })
          )
          .optional(),
      }),
    },
    async () => notImplemented("workspace.note.list")
  );
}
