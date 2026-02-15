import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { workspaceDiff } from "../../core/diffs.js";
import { ResultBaseSchema, toolErr, toolOk } from "../common.js";

export function registerWorkspaceDiffTool(server: McpServer) {
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
}

