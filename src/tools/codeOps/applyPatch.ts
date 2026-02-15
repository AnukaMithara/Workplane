import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { workspaceApplyPatch } from "../../core/patches.js";
import { ResultBaseSchema, toolErr, toolOk } from "../common.js";

export function registerWorkspaceApplyPatchTool(server: McpServer) {
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
}
