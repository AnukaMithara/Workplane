import fs from "node:fs/promises";

import { getWorkplanePaths } from "./config.js";
import { newId } from "./ids.js";
import { assertPathWithinRoot, safeResolveChild, assertSafePathSegment } from "./pathSafety.js";
import { ensureGitAvailable } from "./git.js";
import { WorkplaneStore, type WorkspaceRecord } from "./store.js";
import { checkWorkspaceMutationAllowed, workspaceRelease } from "./locks.js";
import { ensureRepoCache, resolveBaseSha } from "./repoCache.js";
import { verifyWorkspaceMarker, writeWorkspaceMarker } from "./workspaceMarker.js";
import { worktreeAdd, worktreeRemove, worktreePathExists, worktreePrune } from "./worktree.js";

export type WorkspaceCreateInput = {
  repo_url?: string;
  repo_path?: string;
  base_ref?: string;
  branch_name?: string;
  task_id?: string;
  agent_id?: string;
};

export type WorkspaceCloseInput = {
  workspace_id: string;
  holder_id?: string;
};

function nowIso() {
  return new Date().toISOString();
}

export async function workspaceCreate(input: WorkspaceCreateInput) {
  const gitErr = await ensureGitAvailable();
  if (gitErr) return { ok: false as const, error: gitErr };

  const paths = getWorkplanePaths();
  const store = new WorkplaneStore(paths.root, paths.stateFile);

  const { repo_id, repoCachePath } = await ensureRepoCache(input);

  const workspace_id = newId("ws");
  const worktreePath = safeResolveChild(paths.workspacesDir, workspace_id);
  assertPathWithinRoot(paths.root, worktreePath, "Worktree path");

  const base_ref = input.base_ref?.trim() ? input.base_ref.trim() : "HEAD";
  const base_sha = await resolveBaseSha(repoCachePath, base_ref);

  const branch_name =
    input.branch_name?.trim() || `workplane-ws-${workspace_id.replaceAll(":", "_")}`;

  // Create worktree
  const add = await worktreeAdd({
    repo_cache_path: repoCachePath,
    worktree_path: worktreePath,
    branch_name,
    base_sha,
  });
  if (!add.ok) {
    throw new Error(`Failed to create worktree: ${add.stderr || add.stdout}`.trim());
  }

  await writeWorkspaceMarker(worktreePath, workspace_id);

  const rec: WorkspaceRecord = {
    workspace_id,
    repo_id,
    repo_source: { repo_url: input.repo_url, repo_path: input.repo_path },
    repo_cache_path: repoCachePath,
    worktree_path: worktreePath,
    base_ref,
    base_sha,
    branch_name,
    task_id: input.task_id,
    agent_id: input.agent_id,
    status: "open",
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  await store.upsertWorkspace(rec);

  return { ok: true as const, workspace: rec };
}

export async function workspaceGet(workspace_id: string) {
  const paths = getWorkplanePaths();
  const store = new WorkplaneStore(paths.root, paths.stateFile);
  const rec = await store.getWorkspace(workspace_id);
  if (!rec) return { ok: true as const, workspace: null };
  return { ok: true as const, workspace: rec };
}

export async function workspaceList(filters?: {
  repo_id?: string;
  task_id?: string;
  agent_id?: string;
  status?: string;
}) {
  const paths = getWorkplanePaths();
  const store = new WorkplaneStore(paths.root, paths.stateFile);
  const recs = await store.listWorkspaces(filters);
  return { ok: true as const, workspaces: recs };
}

export async function workspaceClose(input: WorkspaceCloseInput) {
  const gitErr = await ensureGitAvailable();
  if (gitErr) return { ok: false as const, error: gitErr };

  const paths = getWorkplanePaths();
  const store = new WorkplaneStore(paths.root, paths.stateFile);

  assertSafePathSegment(input.workspace_id, "workspace_id");

  const rec = await store.getWorkspace(input.workspace_id);
  if (!rec) {
    return {
      ok: false as const,
      error: { code: "NOT_FOUND", message: "Unknown workspace_id." },
    };
  }

  const lockCheck = await checkWorkspaceMutationAllowed({
    workspace_id: rec.workspace_id,
    holder_id: input.holder_id,
  });
  if (!lockCheck.ok) return lockCheck;

  // Hard safety checks: never operate outside Workplane root.
  assertPathWithinRoot(paths.root, rec.worktree_path, "Recorded worktree path");
  assertPathWithinRoot(paths.root, rec.repo_cache_path, "Recorded repo cache path");

  const markerOk = await verifyWorkspaceMarker(rec.worktree_path, rec.workspace_id);
  if (!markerOk) {
    return {
      ok: false as const,
      error: {
        code: "SAFETY_CHECK_FAILED",
        message: "Workspace marker missing or does not match; refusing to remove worktree.",
      },
    };
  }

  const rm = await worktreeRemove({
    repo_cache_path: rec.repo_cache_path,
    worktree_path: rec.worktree_path,
  });

  // Fallback: if git failed but the directory still exists, remove it directly
  // (only after marker + root checks).
  const stillExists = await worktreePathExists(rec.worktree_path);
  if (!rm.ok && stillExists) {
    await fs.rm(rec.worktree_path, { recursive: true, force: true });
  }

  // Best-effort prune.
  await worktreePrune(rec.repo_cache_path);

  const closed_at = nowIso();
  const updated: WorkspaceRecord = {
    ...rec,
    status: "closed",
    closed_at,
    updated_at: closed_at,
  };
  await store.upsertWorkspace(updated);

  // After close, clear lock held by this holder if provided (avoid dangling locks).
  if (input.holder_id) {
    await workspaceRelease({
      workspace_id: rec.workspace_id,
      holder_id: input.holder_id,
    }).catch(() => {});
  }

  return { ok: true as const, workspace: updated };
}
