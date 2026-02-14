import fs from "node:fs/promises";
import path from "node:path";
import { getWorkplanePaths } from "./config.js";
import { sha256Hex, newId } from "./ids.js";
import { ensureDir, assertPathWithinRoot, safeResolveChild } from "./pathSafety.js";
import { ensureGitAvailable, gitInRepo, git } from "./git.js";
import { WorkplaneStore, type WorkspaceRecord } from "./store.js";

const WORKSPACE_MARKER = ".workplane-workspace.json";

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
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeRepoIdentity(input: { repo_url?: string; repo_path?: string }) {
  if (input.repo_url) return `url:${input.repo_url}`;
  // Normalize local path: absolute, platform-specific.
  return `path:${path.resolve(input.repo_path ?? "")}`;
}

async function pathExists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch (err: any) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

async function ensureRepoCache(input: WorkspaceCreateInput) {
  const paths = getWorkplanePaths();
  ensureDir(paths.root);
  ensureDir(paths.reposDir);
  ensureDir(paths.workspacesDir);
  ensureDir(paths.artifactsDir);

  const identity = normalizeRepoIdentity(input);
  const repo_id = sha256Hex(identity);
  const repoCachePath = safeResolveChild(paths.reposDir, repo_id);

  const exists = await pathExists(repoCachePath);
  if (!exists) {
    if (input.repo_url) {
      const r = await git(["clone", input.repo_url, repoCachePath]);
      if (!r.ok) {
        throw new Error(
          `Failed to clone repo_url into cache: ${r.stderr || r.stdout}`.trim()
        );
      }
    } else if (input.repo_path) {
      const src = path.resolve(input.repo_path);
      const r = await git(["clone", src, repoCachePath]);
      if (!r.ok) {
        throw new Error(
          `Failed to clone repo_path into cache: ${r.stderr || r.stdout}`.trim()
        );
      }
    } else {
      throw new Error("Either repo_url or repo_path is required.");
    }
  } else {
    // Best-effort keep cache fresh for remote repos.
    if (input.repo_url) {
      await gitInRepo(repoCachePath, ["fetch", "--all", "--prune"]).catch(() => {});
    }
  }

  return { repo_id, repoCachePath };
}

async function resolveBaseSha(repoCachePath: string, baseRef: string) {
  // Verify and resolve the ref to a commit SHA.
  let r = await gitInRepo(repoCachePath, ["rev-parse", "--verify", `${baseRef}^{commit}`]);
  if (!r.ok) {
    // Try a fetch and retry once (helps for remote branches/tags).
    await gitInRepo(repoCachePath, ["fetch", "--all", "--prune"]).catch(() => {});
    r = await gitInRepo(repoCachePath, ["rev-parse", "--verify", `${baseRef}^{commit}`]);
  }
  if (!r.ok) {
    throw new Error(`Invalid base_ref: ${baseRef}`.trim());
  }
  return r.stdout.trim();
}

async function writeWorkspaceMarker(worktreePath: string, workspace_id: string) {
  const markerPath = path.join(worktreePath, WORKSPACE_MARKER);
  const content = {
    workspace_id,
    created_at: nowIso(),
    marker: "workplane",
  };
  await fs.writeFile(markerPath, JSON.stringify(content, null, 2) + "\n", "utf8");
}

async function verifyWorkspaceMarker(worktreePath: string, workspace_id: string) {
  const markerPath = path.join(worktreePath, WORKSPACE_MARKER);
  try {
    const raw = await fs.readFile(markerPath, "utf8");
    const parsed = JSON.parse(raw) as any;
    return parsed?.workspace_id === workspace_id && parsed?.marker === "workplane";
  } catch {
    return false;
  }
}

export async function workspaceCreate(input: WorkspaceCreateInput) {
  const gitErr = await ensureGitAvailable();
  if (gitErr) return { ok: false as const, error: gitErr };

  const paths = getWorkplanePaths();
  const store = new WorkplaneStore(paths.root, paths.stateFile);

  const { repo_id, repoCachePath } = await ensureRepoCache(input);
  assertPathWithinRoot(paths.root, repoCachePath, "Repo cache path");

  const workspace_id = newId("ws");
  const worktreePath = safeResolveChild(paths.workspacesDir, workspace_id);
  assertPathWithinRoot(paths.root, worktreePath, "Worktree path");

  const base_ref = input.base_ref?.trim() ? input.base_ref.trim() : "HEAD";
  const base_sha = await resolveBaseSha(repoCachePath, base_ref);

  const branch_name =
    input.branch_name?.trim() || `workplane-ws-${workspace_id.replaceAll(":", "_")}`;

  // Create worktree
  const add = await gitInRepo(repoCachePath, [
    "worktree",
    "add",
    worktreePath,
    "-b",
    branch_name,
    base_sha,
  ]);
  if (!add.ok) {
    throw new Error(
      `Failed to create worktree: ${add.stderr || add.stdout}`.trim()
    );
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

  const rec = await store.getWorkspace(input.workspace_id);
  if (!rec) {
    return {
      ok: false as const,
      error: { code: "NOT_FOUND", message: "Unknown workspace_id." },
    };
  }

  // Hard safety checks: never operate outside Workplane root.
  assertPathWithinRoot(paths.root, rec.worktree_path, "Recorded worktree path");
  assertPathWithinRoot(paths.root, rec.repo_cache_path, "Recorded repo cache path");

  const markerOk = await verifyWorkspaceMarker(rec.worktree_path, rec.workspace_id);
  if (!markerOk) {
    return {
      ok: false as const,
      error: {
        code: "SAFETY_CHECK_FAILED",
        message:
          "Workspace marker missing or does not match; refusing to remove worktree.",
      },
    };
  }

  // Prefer git's worktree removal, which also cleans metadata.
  const rm = await gitInRepo(rec.repo_cache_path, [
    "worktree",
    "remove",
    "--force",
    rec.worktree_path,
  ]);

  // Fallback: if git failed but the directory still exists, remove it directly
  // (only after marker + root checks).
  const stillExists = await pathExists(rec.worktree_path);
  if (!rm.ok && stillExists) {
    await fs.rm(rec.worktree_path, { recursive: true, force: true });
  }

  // Best-effort prune.
  await gitInRepo(rec.repo_cache_path, ["worktree", "prune"]).catch(() => {});

  const closed_at = nowIso();
  const updated: WorkspaceRecord = {
    ...rec,
    status: "closed",
    closed_at,
    updated_at: closed_at,
  };
  await store.upsertWorkspace(updated);

  return { ok: true as const, workspace: updated };
}

