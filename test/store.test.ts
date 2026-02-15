import { afterAll, beforeAll, describe, expect, it } from "vitest";

import path from "node:path";

import { mkTempRoot, rmrf } from "./helpers.js";

import { WorkplaneStore } from "../dist/core/store.js";

describe("store", () => {
  let root = "";

  beforeAll(async () => {
    root = await mkTempRoot("workplane-store-");
  });

  afterAll(async () => {
    await rmrf(root);
  });

  it("writes state repeatedly (cross-platform atomic replace)", async () => {
    const stateFile = path.join(root, "state.json");
    const store = new WorkplaneStore(root, stateFile);

    await store.upsertWorkspace({
      workspace_id: "ws1",
      repo_id: "r1",
      repo_source: { repo_path: "x" },
      repo_cache_path: path.join(root, "repo-cache"),
      worktree_path: path.join(root, "worktree"),
      base_ref: "HEAD",
      base_sha: "0000000000000000000000000000000000000000",
      branch_name: "b1",
      status: "open",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Second write should not fail even on Windows where rename-over-existing is not allowed.
    await store.upsertWorkspace({
      workspace_id: "ws1",
      repo_id: "r1",
      repo_source: { repo_path: "x" },
      repo_cache_path: path.join(root, "repo-cache"),
      worktree_path: path.join(root, "worktree"),
      base_ref: "HEAD",
      base_sha: "0000000000000000000000000000000000000000",
      branch_name: "b1",
      status: "closed",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      closed_at: new Date().toISOString(),
    });

    const ws = await store.getWorkspace("ws1");
    expect(ws?.status).toBe("closed");
  });
});

