import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { artifactList } from "../../core/artifacts.js";
import { ResultBaseSchema, toolErr, toolOk } from "../common.js";

export function registerArtifactListTool(server: McpServer) {
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
}
