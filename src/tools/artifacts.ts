import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { artifactGet, artifactList, artifactPut } from "../core/artifacts.js";
import { ResultBaseSchema, toolErr, toolOk } from "./common.js";

export function registerArtifactTools(server: McpServer) {
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
}

