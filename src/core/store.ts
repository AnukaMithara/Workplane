import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, safeResolveChild } from "./pathSafety.js";

export type WorkspaceStatus = "open" | "closed";

export type WorkspaceRecord = {
  workspace_id: string;
  repo_id: string;
  repo_source: { repo_url?: string; repo_path?: string };
  repo_cache_path: string;
  worktree_path: string;
  base_ref: string;
  base_sha: string;
  branch_name: string;
  task_id?: string;
  agent_id?: string;
  status: WorkspaceStatus;
  created_at: string;
  updated_at: string;
  closed_at?: string;
};

type StateFile = {
  version: number;
  updated_at: string;
  workspaces: Record<string, WorkspaceRecord>;
};

function newState(): StateFile {
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    workspaces: {},
  };
}

async function readJsonIfExists(p: string): Promise<StateFile> {
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    // Minimal validation: tolerate future schema expansions.
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "workspaces" in parsed
    ) {
      const state = parsed as StateFile;
      state.workspaces = state.workspaces ?? {};
      return state;
    }
    return newState();
  } catch (err: any) {
    if (err?.code === "ENOENT") return newState();
    throw err;
  }
}

async function atomicWriteJson(p: string, value: unknown) {
  const dir = path.dirname(p);
  ensureDir(dir);
  const tmp = p + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(tmp, p);
}

export class WorkplaneStore {
  private readonly stateFile: string;
  private readonly root: string;

  constructor(root: string, stateFile: string) {
    // Pin state file under root.
    this.root = path.resolve(root);
    this.stateFile = safeResolveChild(this.root, path.relative(this.root, stateFile));
  }

  async getWorkspace(id: string): Promise<WorkspaceRecord | null> {
    const s = await readJsonIfExists(this.stateFile);
    return s.workspaces[id] ?? null;
  }

  async listWorkspaces(filters?: {
    repo_id?: string;
    task_id?: string;
    agent_id?: string;
    status?: string;
  }): Promise<WorkspaceRecord[]> {
    const s = await readJsonIfExists(this.stateFile);
    let items = Object.values(s.workspaces);
    if (filters?.repo_id) items = items.filter((w) => w.repo_id === filters.repo_id);
    if (filters?.task_id) items = items.filter((w) => w.task_id === filters.task_id);
    if (filters?.agent_id) items = items.filter((w) => w.agent_id === filters.agent_id);
    if (filters?.status) items = items.filter((w) => w.status === filters.status);
    // Stable order for callers.
    items.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return items;
  }

  async upsertWorkspace(rec: WorkspaceRecord) {
    const s = await readJsonIfExists(this.stateFile);
    s.workspaces[rec.workspace_id] = rec;
    s.updated_at = new Date().toISOString();
    await atomicWriteJson(this.stateFile, s);
  }
}

