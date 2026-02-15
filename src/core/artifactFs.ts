import fs from "node:fs/promises";
import { assertSafePathSegment, ensureDir, safeResolveChild } from "./pathSafety.js";

export async function pathExists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch (err: any) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

export function ensureWorkspaceArtifactsDir(artifactsDir: string, workspace_id: string) {
  assertSafePathSegment(workspace_id, "workspace_id");
  ensureDir(artifactsDir);
  const wsArtifactsDir = safeResolveChild(artifactsDir, workspace_id);
  ensureDir(wsArtifactsDir);
  return wsArtifactsDir;
}
