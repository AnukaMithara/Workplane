import fs from "node:fs/promises";
import path from "node:path";

const WORKSPACE_MARKER = ".workplane-workspace.json";

function nowIso() {
  return new Date().toISOString();
}

export async function writeWorkspaceMarker(worktreePath: string, workspace_id: string) {
  const markerPath = path.join(worktreePath, WORKSPACE_MARKER);
  const content = {
    workspace_id,
    created_at: nowIso(),
    marker: "workplane",
  };
  await fs.writeFile(markerPath, JSON.stringify(content, null, 2) + "\n", "utf8");
}

export async function verifyWorkspaceMarker(worktreePath: string, workspace_id: string) {
  const markerPath = path.join(worktreePath, WORKSPACE_MARKER);
  try {
    const raw = await fs.readFile(markerPath, "utf8");
    const parsed = JSON.parse(raw) as any;
    return parsed?.workspace_id === workspace_id && parsed?.marker === "workplane";
  } catch {
    return false;
  }
}
