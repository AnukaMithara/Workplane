import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mkTempRoot, rmrf, runCmd } from "./helpers.js";

import { WorkplaneStore } from "../dist/core/store.js";
import { getWorkplanePaths } from "../dist/core/config.js";
import { workspaceRun } from "../dist/core/runs.js";
import { artifactGet } from "../dist/core/artifacts.js";

describe("workspace.run", () => {
  let root = "";
  let workspace_id = "";
  let worktree_path = "";

  beforeAll(async () => {
    root = await mkTempRoot("workplane-run-");
    process.env.WORKPLANE_ROOT = root;
    process.env.WORKPLANE_COMMAND_DENYLIST = ""; // default allow `git` in tests unless overridden

    workspace_id = "ws_run_1";
    const paths = getWorkplanePaths();

    worktree_path = path.join(paths.root, "workdir");
    const repo_cache_path = path.join(paths.root, "repo-cache");

    await fs.mkdir(worktree_path, { recursive: true });
    await fs.mkdir(repo_cache_path, { recursive: true });

    // Minimal git repo so `git status` works.
    const init = await runCmd("git", ["init"], { cwd: worktree_path });
    expect(init.code).toBe(0);

    const store = new WorkplaneStore(paths.root, paths.stateFile);
    await store.upsertWorkspace({
      workspace_id,
      repo_id: "repo_test",
      repo_source: { repo_path: "local-test" },
      repo_cache_path,
      worktree_path,
      base_ref: "HEAD",
      base_sha: "0000000000000000000000000000000000000000",
      branch_name: "workplane-test",
      status: "open",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    await rmrf(root);
  });

  it("denies commands on the denylist", async () => {
    process.env.WORKPLANE_COMMAND_DENYLIST = "git";
    const r = await workspaceRun({ workspace_id, command: "git", args: ["status"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("DENIED");
  });

  it("returns INVALID_INPUT for unparseable command strings", async () => {
    process.env.WORKPLANE_COMMAND_DENYLIST = "";
    const r = await workspaceRun({ workspace_id, command: 'git "unterminated' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_INPUT");
  });

  it("runs a harmless command and stores stdout/stderr artifacts", async () => {
    process.env.WORKPLANE_COMMAND_DENYLIST = "";
    const r = await workspaceRun({
      workspace_id,
      command: "git",
      args: ["status", "--porcelain"],
      timeout_ms: 10_000,
      max_output_bytes: 64 * 1024,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(typeof r.stdout_artifact_id).toBe("string");
    expect(typeof r.stderr_artifact_id).toBe("string");

    const stdout = await artifactGet({ workspace_id, artifact_id: r.stdout_artifact_id });
    expect(stdout.ok).toBe(true);
    const stderr = await artifactGet({ workspace_id, artifact_id: r.stderr_artifact_id });
    expect(stderr.ok).toBe(true);
  });

  it("enforces timeouts and reports timed_out=true", async () => {
    process.env.WORKPLANE_COMMAND_DENYLIST = "";
    const r = await workspaceRun({
      workspace_id,
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 2000)"],
      timeout_ms: 50,
      max_output_bytes: 16 * 1024,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.timed_out).toBe(true);
  });
});
