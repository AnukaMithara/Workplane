import path from "node:path";
import { execFileCaptured } from "./exec.js";

export type GitError = {
  code: "GIT_ERROR" | "GIT_NOT_FOUND";
  message: string;
  details?: unknown;
};

export async function ensureGitAvailable(): Promise<GitError | null> {
  const r = await execFileCaptured("git", ["--version"], {
    timeoutMs: 10_000,
    maxOutputBytes: 32 * 1024,
  });
  if (r.ok) return null;
  return {
    code: "GIT_NOT_FOUND",
    message: "git is not available on PATH.",
    details: { stderr: r.stderr, stdout: r.stdout },
  };
}

export async function git(args: string[], cwd?: string) {
  return await execFileCaptured("git", args, {
    cwd,
    timeoutMs: 240_000,
    maxOutputBytes: 512 * 1024,
  });
}

export async function gitWithStdin(args: string[], stdinUtf8: string, cwd?: string) {
  return await execFileCaptured("git", args, {
    cwd,
    timeoutMs: 240_000,
    maxOutputBytes: 512 * 1024,
    stdinUtf8,
  });
}

export async function gitInRepo(repoDir: string, args: string[]) {
  return await git(["-C", path.resolve(repoDir), ...args]);
}

export async function gitInRepoWithStdin(
  repoDir: string,
  args: string[],
  stdinUtf8: string
) {
  return await gitWithStdin(["-C", path.resolve(repoDir), ...args], stdinUtf8);
}
