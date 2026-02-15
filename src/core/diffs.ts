import { ensureGitAvailable, gitInRepo } from "./git.js";
import { WorkplaneStore } from "./store.js";
import { getWorkplanePaths } from "./config.js";
import { assertPathWithinRoot, assertSafePathSegment } from "./pathSafety.js";
import { artifactPut } from "./artifacts.js";

export type WorkspaceDiffInput = {
  workspace_id: string;
  staged?: boolean;
  pathspec?: string[];
  store_as_artifact?: boolean;
};

function isUnsafePathspecSegment(p: string) {
  if (!p || typeof p !== "string") return true;
  if (p.includes("\0")) return true;
  // Disallow absolute paths / drive-letter paths / traversal.
  if (/^[A-Za-z]:[\\/]/.test(p)) return true;
  if (p.startsWith("/") || p.startsWith("\\")) return true;
  if (p.includes("..")) return true;
  // Keep v0.1 conservative (avoid pathspec magic like :(exclude)).
  if (p.includes(":")) return true;
  return false;
}

export async function workspaceDiff(input: WorkspaceDiffInput) {
  const gitErr = await ensureGitAvailable();
  if (gitErr) return { ok: false as const, error: gitErr };

  const paths = getWorkplanePaths();
  const store = new WorkplaneStore(paths.root, paths.stateFile);

  assertSafePathSegment(input.workspace_id, "workspace_id");

  const ws = await store.getWorkspace(input.workspace_id);
  if (!ws) {
    return {
      ok: false as const,
      error: { code: "NOT_FOUND", message: "Unknown workspace_id." },
    };
  }
  if (ws.status !== "open") {
    return {
      ok: false as const,
      error: {
        code: "WORKSPACE_CLOSED",
        message: "Workspace is closed; cannot diff.",
        details: {
          workspace_id: ws.workspace_id,
          status: ws.status,
          closed_at: ws.closed_at,
        },
      },
    };
  }

  assertPathWithinRoot(paths.root, ws.worktree_path, "Recorded worktree path");

  const pathspec = Array.isArray(input.pathspec) ? input.pathspec : [];
  for (const p of pathspec) {
    if (isUnsafePathspecSegment(p)) {
      return {
        ok: false as const,
        error: {
          code: "INVALID_INPUT",
          message: "pathspec contains an unsafe path segment.",
          details: { pathspec: p },
        },
      };
    }
  }

  const args = [
    "diff",
    "--no-color",
    "--no-ext-diff",
    ...(input.staged ? ["--staged"] : []),
    ...(pathspec.length ? ["--", ...pathspec] : []),
  ];

  const r = await gitInRepo(ws.worktree_path, args);
  if (!r.ok) {
    return {
      ok: false as const,
      error: {
        code: "DIFF_FAILED",
        message: (r.stderr || r.stdout || "git diff failed").trim(),
        details: {
          exit_code: r.exitCode,
          stderr: r.stderr,
          stdout: r.stdout,
          duration_ms: r.durationMs,
        },
      },
    };
  }

  const diff = r.stdout ?? "";

  if (input.store_as_artifact) {
    const put = await artifactPut({
      workspace_id: ws.workspace_id,
      type: "diff",
      name: input.staged ? "diff.staged.patch" : "diff.patch",
      content: diff,
      content_type: "text/x-diff",
      metadata: {
        tool: "workspace.diff",
        staged: !!input.staged,
        pathspec,
      },
    });
    if (!put.ok) return put;
    return {
      ok: true as const,
      workspace_id: ws.workspace_id,
      diff,
      artifact_id: put.artifact_id,
    };
  }

  return { ok: true as const, workspace_id: ws.workspace_id, diff };
}
