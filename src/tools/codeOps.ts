import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { checkWorkspaceMutationAllowed } from "../core/locks.js";
import { workspaceApplyPatch } from "../core/patches.js";
import { workspaceDiff } from "../core/diffs.js";
import { workspaceRun } from "../core/runs.js";
import { ResultBaseSchema, toolErr, toolOk } from "./common.js";

export function registerCodeOpsTools(server: McpServer) {
  server.registerTool(
    "workspace.apply_patch",
    {
      description: "Apply a unified diff/patch inside a workspace (prefer git apply).",
      inputSchema: {
        workspace_id: z.string().min(1),
        patch: z.string().min(1).describe("Unified diff to apply"),
        holder_id: z.string().optional(),
        check: z
          .boolean()
          .optional()
          .describe("If true, run `git apply --check` first and fail without changes."),
      },
      outputSchema: ResultBaseSchema.extend({
        workspace_id: z.string().optional(),
        applied: z.boolean().optional(),
        applied_at: z.string().optional(),
        patch_artifact_id: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const { workspace_id, patch, holder_id, check } = args as any;
        const r = await workspaceApplyPatch({ workspace_id, patch, holder_id, check });
        if (!r.ok) {
          return toolErr(r.error.code, r.error.message, (r.error as any).details);
        }
        return toolOk({
          workspace_id: r.workspace_id,
          applied: r.applied,
          applied_at: r.applied_at,
          patch_artifact_id: r.patch_artifact_id,
        });
      } catch (err: any) {
        return toolErr("APPLY_PATCH_FAILED", err?.message ?? "workspace.apply_patch failed");
      }
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
        store_as_artifact: z.boolean().optional(),
      },
      outputSchema: ResultBaseSchema.extend({
        workspace_id: z.string().optional(),
        diff: z.string().optional(),
        artifact_id: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const { workspace_id, staged, pathspec, store_as_artifact } = args as any;
        const r = await workspaceDiff({
          workspace_id,
          staged,
          pathspec,
          store_as_artifact,
        });
        if (!r.ok) {
          return toolErr(r.error.code, r.error.message, (r.error as any).details);
        }
        return toolOk({
          workspace_id: r.workspace_id,
          diff: r.diff,
          artifact_id: (r as any).artifact_id,
        });
      } catch (err: any) {
        return toolErr("DIFF_FAILED", err?.message ?? "workspace.diff failed");
      }
    }
  );

  server.registerTool(
    "workspace.run",
    {
      description: "Run a command in the workspace and capture bounded stdout/stderr evidence.",
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
        timed_out: z.boolean().optional(),
        stdout_truncated: z.boolean().optional(),
        stderr_truncated: z.boolean().optional(),
        stdout_artifact_id: z.string().optional(),
        stderr_artifact_id: z.string().optional(),
        started_at: z.string().optional(),
        ended_at: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const {
          workspace_id,
          command,
          args: argv,
          timeout_ms,
          max_output_bytes,
          holder_id,
        } = args as any;

        // Enforce lock rules consistently even if core logic changes.
        const lockCheck = await checkWorkspaceMutationAllowed({ workspace_id, holder_id });
        if (!lockCheck.ok) {
          return toolErr(
            lockCheck.error.code,
            lockCheck.error.message,
            (lockCheck.error as any).details
          );
        }

        const r = await workspaceRun({
          workspace_id,
          command,
          args: argv,
          timeout_ms,
          max_output_bytes,
          holder_id,
        });
        if (!r.ok) {
          return toolErr(r.error.code, r.error.message, (r.error as any).details);
        }
        return toolOk({
          workspace_id: r.workspace_id,
          exit_code: r.exit_code ?? undefined,
          duration_ms: r.duration_ms,
          stdout: r.stdout,
          stderr: r.stderr,
          timed_out: r.timed_out,
          stdout_truncated: r.stdout_truncated,
          stderr_truncated: r.stderr_truncated,
          stdout_artifact_id: r.stdout_artifact_id,
          stderr_artifact_id: r.stderr_artifact_id,
          started_at: r.started_at,
          ended_at: r.ended_at,
        });
      } catch (err: any) {
        return toolErr("RUN_FAILED", err?.message ?? "workspace.run failed");
      }
    }
  );
}
