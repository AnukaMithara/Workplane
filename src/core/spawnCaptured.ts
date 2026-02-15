import { spawn } from "node:child_process";

export type SpawnCapturedResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number;
  timedOut: boolean;
};

export async function spawnCaptured(
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
