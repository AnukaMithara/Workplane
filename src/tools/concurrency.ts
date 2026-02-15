import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { workspaceLock, workspaceRelease } from "../core/locks.js";
import { ResultBaseSchema, toolErr, toolOk } from "./common.js";

export function registerConcurrencyTools(server: McpServer) {
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
        return toolErr("RELEASE_FAILED", err?.message ?? "workspace.release failed");
      }
    }
  );
}
