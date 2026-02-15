import * as z from "zod/v4";

const ErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const ResultBaseSchema = z.object({
  ok: z.boolean(),
  timestamp: z.string(),
  error: ErrorSchema.optional(),
});

export function nowIso() {
  return new Date().toISOString();
}

export function toolOk<T extends object>(payload: T) {
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

export function toolErr(code: string, message: string, details?: unknown) {
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

export function notImplemented(toolName: string) {
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
