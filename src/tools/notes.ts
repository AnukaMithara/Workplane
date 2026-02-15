import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { ResultBaseSchema, notImplemented } from "./common.js";

export function registerNoteTools(server: McpServer) {
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
