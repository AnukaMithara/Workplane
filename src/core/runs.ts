import path from "node:path";
import { spawn } from "node:child_process";
import { ensureGitAvailable } from "./git.js";
import { WorkplaneStore } from "./store.js";
import { getWorkplanePaths, getCommandDenylist } from "./config.js";
import { assertPathWithinRoot, assertSafePathSegment } from "./pathSafety.js";
import { checkWorkspaceMutationAllowed } from "./locks.js";
import { artifactPut } from "./artifacts.js";

export type WorkspaceRunInput = {
  workspace_id: string;
  command: string;
  args?: string[];
  timeout_ms?: number;
  max_output_bytes?: number;
  holder_id?: string;
};

export type WorkspaceRunResult =
  | {
      ok: true;
      workspace_id: string;
      started_at: string;
      ended_at: string;
      duration_ms: number;
      exit_code: number | null;
      timed_out: boolean;
      stdout: string;
      stderr: string;
      stdout_truncated: boolean;
      stderr_truncated: boolean;
      stdout_artifact_id: string;
      stderr_artifact_id: string;
    }
  | {
      ok: false;
      error: { code: string; message: string; details?: unknown };
    };

function nowIso() {
  return new Date().toISOString();
}

function normalizeExeName(name: string) {
  const base = name.trim().toLowerCase();
  // Strip common Windows extensions to make denylist matching consistent.
  return base.replace(/\.(exe|cmd|bat|com)$/i, "");
}

function isDeniedCommand(command: string) {
  const deny = new Set(getCommandDenylist().map(normalizeExeName));
  const base = path.basename(command);
  const normalized = normalizeExeName(base);
  return deny.has(normalized);
}

function tokenizeCommandLine(input: string): string[] | null {
  // Minimal argv tokenizer (no shell). Supports:
  // - whitespace splitting
  // - double quotes to include spaces
  // - backslash escaping of quotes inside quoted segments
  const s = input.trim();
  if (!s) return null;

  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "\\" && inQuotes && i + 1 < s.length && s[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (!inQuotes && /\s/.test(ch)) {
      if (cur.length) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += ch;
  }
  if (inQuotes) return null;
  if (cur.length) out.push(cur);
  return out.length ? out : null;
}

type SpawnCapturedResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number;
  timedOut: boolean;
};

async function spawnCaptured(
  file: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number; maxOutputBytes: number }
): Promise<SpawnCapturedResult> {
  const start = Date.now();
  const startedAt = Date.now();

  return await new Promise<SpawnCapturedResult>((resolve) => {
    const child = spawn(file, args, {
      cwd: opts.cwd,
      windowsHide: true,
      shell: false,
    });

    const max = opts.maxOutputBytes;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      // Best-effort kill; on Windows this still terminates the process.
      child.kill("SIGKILL");
      setTimeout(() => child.kill("SIGTERM"), 200).unref?.();
    }, opts.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdoutBytes >= max) {
        stdoutTruncated = true;
        return;
      }
      stdoutChunks.push(chunk);
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes >= max) stdoutTruncated = true;
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrBytes >= max) {
        stderrTruncated = true;
        return;
      }
      stderrChunks.push(chunk);
      stderrBytes += chunk.byteLength;
      if (stderrBytes >= max) stderrTruncated = true;
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).subarray(0, max).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).subarray(0, max).toString("utf8");
      resolve({
        exitCode: code,
        signal,
        stdout,
        stderr,
        stdoutTruncated,
        stderrTruncated,
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    });

    // If spawn fails (ENOENT), we'll see 'error' and then 'close' might not fire.
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: null,
        signal: null,
        stdout: "",
        stderr: String((err as any)?.message ?? err),
        stdoutTruncated: false,
        stderrTruncated: false,
        durationMs: Date.now() - start,
        timedOut: false,
      });
    });
  });
}

export async function workspaceRun(input: WorkspaceRunInput): Promise<WorkspaceRunResult> {
  // Git isn't strictly required to *run* commands, but it's a Phase 1 hard dependency
  // and we want a consistent error if the environment isn't set up.
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
        message: "Workspace is closed; cannot run commands.",
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
  if (!lockCheck.ok) return lockCheck as any;

  assertPathWithinRoot(paths.root, ws.worktree_path, "Recorded worktree path");

  const timeoutMs =
    input.timeout_ms && input.timeout_ms > 0 ? input.timeout_ms : 120_000;
  const maxOutputBytes =
    input.max_output_bytes && input.max_output_bytes > 0
      ? input.max_output_bytes
      : 256 * 1024;

  let file = input.command;
  let args = Array.isArray(input.args) ? input.args : undefined;

  if (!args) {
    const tok = tokenizeCommandLine(input.command);
    if (!tok) {
      return {
        ok: false as const,
        error: {
          code: "INVALID_INPUT",
          message:
            "command could not be parsed. Provide args[] for unambiguous execution.",
        },
      };
    }
    file = tok[0];
    args = tok.slice(1);
  }

  if (!file || typeof file !== "string") {
    return {
      ok: false as const,
      error: { code: "INVALID_INPUT", message: "command is required." },
    };
  }

  if (isDeniedCommand(file)) {
    return {
      ok: false as const,
      error: {
        code: "DENIED",
        message: "Command is denied by policy.",
        details: { command: file, denylist: getCommandDenylist() },
      },
    };
  }

  const started_at = nowIso();
  const r = await spawnCaptured(file, args ?? [], {
    cwd: ws.worktree_path,
    timeoutMs,
    maxOutputBytes,
  });
  const ended_at = nowIso();

  // Store evidence as artifacts (even on non-zero exit / timeout).
  const stdoutArtifact = await artifactPut({
    workspace_id: ws.workspace_id,
    type: "log",
    name: "run.stdout.log",
    content: r.stdout,
    content_type: "text/plain",
    metadata: {
      tool: "workspace.run",
      command: file,
      args,
      exit_code: r.exitCode,
      timed_out: r.timedOut,
      truncated: r.stdoutTruncated,
    },
  });
  if (!stdoutArtifact.ok) return stdoutArtifact as any;

  const stderrArtifact = await artifactPut({
    workspace_id: ws.workspace_id,
    type: "log",
    name: "run.stderr.log",
    content: r.stderr,
    content_type: "text/plain",
    metadata: {
      tool: "workspace.run",
      command: file,
      args,
      exit_code: r.exitCode,
      timed_out: r.timedOut,
      truncated: r.stderrTruncated,
    },
  });
  if (!stderrArtifact.ok) return stderrArtifact as any;

  return {
    ok: true as const,
    workspace_id: ws.workspace_id,
    started_at,
    ended_at,
    duration_ms: r.durationMs,
    exit_code: r.exitCode,
    timed_out: r.timedOut,
    stdout: r.stdout,
    stderr: r.stderr,
    stdout_truncated: r.stdoutTruncated,
    stderr_truncated: r.stderrTruncated,
    stdout_artifact_id: stdoutArtifact.artifact_id,
    stderr_artifact_id: stderrArtifact.artifact_id,
  };
}

