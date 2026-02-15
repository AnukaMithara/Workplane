import os from "node:os";
import path from "node:path";

export type WorkplanePaths = {
  root: string;
  reposDir: string;
  workspacesDir: string;
  artifactsDir: string;
  stateFile: string;
};

export function getWorkplaneRoot(): string {
  // Allow tests/dev to redirect state away from the user's real home directory.
  const envRoot = process.env.WORKPLANE_ROOT?.trim();
  if (envRoot) return path.resolve(envRoot);
  return path.join(os.homedir(), ".workplane");
}

export function getWorkplanePaths(): WorkplanePaths {
  const root = getWorkplaneRoot();
  return {
    root,
    reposDir: path.join(root, "repos"),
    workspacesDir: path.join(root, "workspaces"),
    artifactsDir: path.join(root, "artifacts"),
    stateFile: path.join(root, "state.json"),
  };
}

function parseCsvEnvList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function getCommandDenylist(): string[] {
  // Configure via env: comma-separated, e.g. "powershell,cmd,rm"
  const env = process.env.WORKPLANE_COMMAND_DENYLIST;
  if (env !== undefined) return parseCsvEnvList(env);

  // Safe-by-default, but configurable.
  // Note: denylist checks normalize by stripping common executable extensions.
  return [
    "sudo",
    "rm",
    "del",
    "rmdir",
    "diskpart",
    "format",
    "shutdown",
    "reboot",
    "powershell",
    "pwsh",
    "cmd",
    "bash",
    "sh",
    "zsh",
    "fish",
  ];
}
