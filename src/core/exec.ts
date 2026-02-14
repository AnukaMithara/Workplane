import { spawn } from "node:child_process";

export type ExecResult = {
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type ExecOptions = {
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
};

function truncateUtf8(input: Buffer, maxBytes: number) {
  if (input.byteLength <= maxBytes) return input.toString("utf8");
  return input.subarray(0, maxBytes).toString("utf8");
}

export async function execFileCaptured(
  file: string,
  args: string[],
  opts: ExecOptions = {}
): Promise<ExecResult> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const maxOutputBytes = opts.maxOutputBytes ?? 256 * 1024;

  return await new Promise<ExecResult>((resolve) => {
    const child = spawn(file, args, {
      cwd: opts.cwd,
      env: opts.env,
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdoutBytes >= maxOutputBytes) return;
      stdoutChunks.push(chunk);
      stdoutBytes += chunk.byteLength;
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrBytes >= maxOutputBytes) return;
      stderrChunks.push(chunk);
      stderrBytes += chunk.byteLength;
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const stdoutBuf = Buffer.concat(stdoutChunks);
      const stderrBuf = Buffer.concat(stderrChunks);

      resolve({
        ok: code === 0 && !killed,
        exitCode: code,
        signal,
        stdout: truncateUtf8(stdoutBuf, maxOutputBytes),
        stderr: truncateUtf8(stderrBuf, maxOutputBytes),
        durationMs: Date.now() - start,
      });
    });
  });
}

