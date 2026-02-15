import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { artifactGet } from "../../core/artifacts.js";
import { ResultBaseSchema, toolErr, toolOk } from "../common.js";

export function registerArtifactGetTool(server: McpServer) {
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
}
