import { ensureGitAvailable, gitInRepoWithStdin } from "./git.js";
import { WorkplaneStore } from "./store.js";
import { getWorkplanePaths } from "./config.js";
import { assertSafePathSegment, assertPathWithinRoot } from "./pathSafety.js";
import { checkWorkspaceMutationAllowed } from "./locks.js";
import { artifactPut } from "./artifacts.js";

export type WorkspaceApplyPatchInput = {
  workspace_id: string;
  patch: string;
  holder_id?: string;
  check?: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeGitApplyFailure(stderr: string, stdout: string) {
  const msg = (stderr || stdout || "git apply failed").trim();
  return msg.length ? msg : "git apply failed";
}

export async function workspaceApplyPatch(input: WorkspaceApplyPatchInput) {
  const gitErr = await ensureGitAvailable();
  if (gitErr) return { ok: false as const, error: gitErr };

  const paths = getWorkplanePaths();
  const store = new WorkplaneStore(paths.root, paths.stateFile);

  assertSafePathSegment(input.workspace_id, "workspace_id");
  if (!input.patch || typeof input.patch !== "string") {
    return {
      ok: false as const,
      error: { code: "INVALID_INPUT", message: "patch is required." },
    };
  }

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
        message: "Workspace is closed; cannot apply patch.",
        details: {
          workspace_id: ws.workspace_id,
          status: ws.status,
          closed_at: ws.closed_at,
        },
      },
    };
  }

  const lockCheck = await checkWorkspaceMutationAllowed({
    workspace_id: ws.workspace_id,
    holder_id: input.holder_id,
  });
  if (!lockCheck.ok) return lockCheck;

  assertPathWithinRoot(paths.root, ws.worktree_path, "Recorded worktree path");

  // Store patch content first (evidence) regardless of apply outcome.
  // This also makes "check" failures reproducible.
  const patchArtifact = await artifactPut({
    workspace_id: ws.workspace_id,
    type: "diff",
    name: "applied.patch",
    content: input.patch,
    content_type: "text/x-diff",
    metadata: {
      tool: "workspace.apply_patch",
      check: !!input.check,
      holder_id: input.holder_id,
    },
  });
  if (!patchArtifact.ok) return patchArtifact;

  if (input.check) {
    const chk = await gitInRepoWithStdin(ws.worktree_path, ["apply", "--check", "-"], input.patch);
    if (!chk.ok) {
      return {
        ok: false as const,
        error: {
          code: "PATCH_CHECK_FAILED",
          message: normalizeGitApplyFailure(chk.stderr, chk.stdout),
          details: {
            exit_code: chk.exitCode,
            stderr: chk.stderr,
            stdout: chk.stdout,
            duration_ms: chk.durationMs,
          },
        },
      };
    }
  }

  const apply = await gitInRepoWithStdin(ws.worktree_path, ["apply", "-"], input.patch);
  if (!apply.ok) {
    return {
      ok: false as const,
      error: {
        code: "PATCH_APPLY_FAILED",
        message: normalizeGitApplyFailure(apply.stderr, apply.stdout),
        details: {
          exit_code: apply.exitCode,
          stderr: apply.stderr,
          stdout: apply.stdout,
          duration_ms: apply.durationMs,
        },
      },
    };
  }

  return {
    ok: true as const,
    workspace_id: ws.workspace_id,
    applied: true as const,
    applied_at: nowIso(),
    patch_artifact_id: patchArtifact.artifact_id,
  };
}
