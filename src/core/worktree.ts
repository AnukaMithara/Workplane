import fs from "node:fs/promises";

import { gitInRepo } from "./git.js";

async function pathExists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch (err: any) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

export async function worktreeAdd(opts: {
  repo_cache_path: string;
  worktree_path: string;
  branch_name: string;
  base_sha: string;
}) {
  return await gitInRepo(opts.repo_cache_path, [
    "worktree",
    "add",
    opts.worktree_path,
    "-b",
    opts.branch_name,
    opts.base_sha,
  ]);
}

export async function worktreeRemove(opts: { repo_cache_path: string; worktree_path: string }) {
  // Prefer git's worktree removal, which also cleans metadata.
  return await gitInRepo(opts.repo_cache_path, [
    "worktree",
    "remove",
    "--force",
    opts.worktree_path,
  ]);
}

export async function worktreePrune(repo_cache_path: string) {
  await gitInRepo(repo_cache_path, ["worktree", "prune"]).catch(() => {});
}

export async function removeWorktreeDirIfExists(worktree_path: string) {
  const stillExists = await pathExists(worktree_path);
  if (!stillExists) return { existed: false as const };
  await fs.rm(worktree_path, { recursive: true, force: true });
  return { existed: true as const };
}

export async function worktreePathExists(worktree_path: string) {
  return await pathExists(worktree_path);
}
