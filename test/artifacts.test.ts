import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mkTempRoot, rmrf } from "./helpers.js";

import { WorkplaneStore } from "../dist/core/store.js";
import { getWorkplanePaths } from "../dist/core/config.js";
import { artifactGet, artifactList, artifactPut } from "../dist/core/artifacts.js";

describe("artifacts", () => {
  let root = "";
  let workspace_id = "";

  beforeAll(async () => {
    root = await mkTempRoot("workplane-artifacts-");
    process.env.WORKPLANE_ROOT = root;

    workspace_id = "ws_art_1";
    const paths = getWorkplanePaths();

    const worktree_path = path.join(paths.root, "workdir");
    const repo_cache_path = path.join(paths.root, "repo-cache");
    await fs.mkdir(worktree_path, { recursive: true });
    await fs.mkdir(repo_cache_path, { recursive: true });

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

  it("puts and gets a text artifact", async () => {
    const put = await artifactPut({
      workspace_id,
      type: "note",
      name: "hello",
      content: "hello",
      content_type: "text/plain",
    });
    expect(put.ok).toBe(true);
    if (!put.ok) return;

    const get = await artifactGet({ workspace_id, artifact_id: put.artifact_id });
    expect(get.ok).toBe(true);
    if (!get.ok) return;
    expect(get.artifact.type).toBe("note");
    expect(get.artifact.content).toBe("hello");
    expect(get.artifact.content_base64).toBeUndefined();
  });

  it("puts and gets a binary artifact", async () => {
    const put = await artifactPut({
      workspace_id,
      type: "file",
      name: "bin",
      content_base64: Buffer.from("abc", "utf8").toString("base64"),
      content_type: "application/octet-stream",
    });
    expect(put.ok).toBe(true);
    if (!put.ok) return;

    const get = await artifactGet({ workspace_id, artifact_id: put.artifact_id });
    expect(get.ok).toBe(true);
    if (!get.ok) return;
    expect(get.artifact.content).toBeUndefined();
    expect(get.artifact.content_base64).toBe(Buffer.from("abc", "utf8").toString("base64"));
  });

  it("rejects invalid base64", async () => {
    const put = await artifactPut({
      workspace_id,
      type: "file",
      content_base64: "!!!notbase64!!!",
    });
    expect(put.ok).toBe(false);
    if (!put.ok) expect(put.error.code).toBe("INVALID_INPUT");
  });

  it("errors TOO_LARGE for >1MB inline returns", async () => {
    const big = "a".repeat(1_000_001);
    const put = await artifactPut({ workspace_id, type: "log", content: big });
    expect(put.ok).toBe(true);
    if (!put.ok) return;

    const get = await artifactGet({ workspace_id, artifact_id: put.artifact_id });
    expect(get.ok).toBe(false);
    if (!get.ok) expect(get.error.code).toBe("TOO_LARGE");
  });

  it("errors MISSING_ARTIFACT_FILE when metadata exists but file is missing", async () => {
    const put = await artifactPut({ workspace_id, type: "note", content: "tmp" });
    expect(put.ok).toBe(true);
    if (!put.ok) return;

    // Remove the underlying file based on metadata in state.json
    const paths = getWorkplanePaths();
    const store = new WorkplaneStore(paths.root, paths.stateFile);
    const rec = await store.getArtifact(workspace_id, put.artifact_id);
    expect(rec).not.toBeNull();
    if (!rec) return;

    const absPath = path.join(paths.root, rec.rel_path);
    await fs.rm(absPath, { force: true });

    const get = await artifactGet({ workspace_id, artifact_id: put.artifact_id });
    expect(get.ok).toBe(false);
    if (!get.ok) expect(get.error.code).toBe("MISSING_ARTIFACT_FILE");
  });

  it("lists artifacts for a workspace", async () => {
    const list = await artifactList({ workspace_id });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(Array.isArray(list.artifacts)).toBe(true);
    expect(list.artifacts.length).toBeGreaterThan(0);
  });
});

