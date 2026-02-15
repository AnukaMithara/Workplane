import fs from "node:fs/promises";
import path from "node:path";

import { getWorkplanePaths } from "./config.js";
import { sha256Hex } from "./ids.js";
import { ensureDir, assertPathWithinRoot, safeResolveChild } from "./pathSafety.js";
import { git, gitInRepo } from "./git.js";

export type RepoSourceInput = { repo_url?: string; repo_path?: string };

function normalizeRepoIdentity(input: RepoSourceInput) {
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

export async function ensureRepoCache(input: RepoSourceInput) {
  const paths = getWorkplanePaths();
  ensureDir(paths.root);
  ensureDir(paths.reposDir);
  ensureDir(paths.workspacesDir);
  ensureDir(paths.artifactsDir);

  const identity = normalizeRepoIdentity(input);
  const repo_id = sha256Hex(identity);
  const repoCachePath = safeResolveChild(paths.reposDir, repo_id);
  assertPathWithinRoot(paths.root, repoCachePath, "Repo cache path");

  const exists = await pathExists(repoCachePath);
  if (!exists) {
    if (input.repo_url) {
      const r = await git(["clone", input.repo_url, repoCachePath]);
      if (!r.ok) {
        throw new Error(`Failed to clone repo_url into cache: ${r.stderr || r.stdout}`.trim());
      }
    } else if (input.repo_path) {
      const src = path.resolve(input.repo_path);
      const r = await git(["clone", src, repoCachePath]);
      if (!r.ok) {
        throw new Error(`Failed to clone repo_path into cache: ${r.stderr || r.stdout}`.trim());
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

export async function resolveBaseSha(repoCachePath: string, baseRef: string) {
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

export async function repoCachePathExists(p: string) {
  return await pathExists(p);
}
