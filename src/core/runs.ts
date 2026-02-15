import { ensureGitAvailable } from "./git.js";
import { WorkplaneStore } from "./store.js";
import { getWorkplanePaths, getCommandDenylist } from "./config.js";
import { assertPathWithinRoot, assertSafePathSegment } from "./pathSafety.js";
import { checkWorkspaceMutationAllowed } from "./locks.js";
import { artifactPut } from "./artifacts.js";
import { isDeniedCommand, tokenizeCommandLine } from "./runPolicy.js";
import { spawnCaptured } from "./spawnCaptured.js";

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

  const timeoutMs = input.timeout_ms && input.timeout_ms > 0 ? input.timeout_ms : 120_000;
  const maxOutputBytes =
    input.max_output_bytes && input.max_output_bytes > 0 ? input.max_output_bytes : 256 * 1024;

  let file = input.command;
  let args = Array.isArray(input.args) ? input.args : undefined;

  if (!args) {
    const tok = tokenizeCommandLine(input.command);
    if (!tok) {
      return {
        ok: false as const,
        error: {
          code: "INVALID_INPUT",
          message: "command could not be parsed. Provide args[] for unambiguous execution.",
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
