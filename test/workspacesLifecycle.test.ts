import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mkTempRoot, rmrf, runCmd, writeFile } from "./helpers.js";

import { workspaceCreate, workspaceClose, workspaceGet } from "../dist/core/workspaces.js";
import { workspaceLock } from "../dist/core/locks.js";

async function initGitRepo(repoPath: string) {
  await fs.mkdir(repoPath, { recursive: true });
  expect((await runCmd("git", ["init"], { cwd: repoPath })).code).toBe(0);
  expect(
    (await runCmd("git", ["config", "user.email", "test@example.com"], { cwd: repoPath })).code
  ).toBe(0);
  expect(
    (await runCmd("git", ["config", "user.name", "Workplane Tests"], { cwd: repoPath })).code
  ).toBe(0);
  await writeFile(path.join(repoPath, "README.md"), "# Test Repo\n");
  expect((await runCmd("git", ["add", "."], { cwd: repoPath })).code).toBe(0);
  expect((await runCmd("git", ["commit", "-m", "init"], { cwd: repoPath })).code).toBe(0);
}

describe("workspaces lifecycle", () => {
  let root = "";
  let srcRepo = "";

  beforeAll(async () => {
    root = await mkTempRoot("workplane-ws-");
    process.env.WORKPLANE_ROOT = root;

    srcRepo = await mkTempRoot("workplane-src-repo-");
    await initGitRepo(srcRepo);
  });

  afterAll(async () => {
    await rmrf(root);
    await rmrf(srcRepo);
  });

  it("closes when unlocked and holder_id omitted", async () => {
    const created = await workspaceCreate({ repo_path: srcRepo, base_ref: "HEAD" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const worktreePath = created.workspace.worktree_path;
    const markerPath = path.join(worktreePath, ".workplane-workspace.json");
    expect(await fs.stat(markerPath)).toBeTruthy();

    const closed = await workspaceClose({ workspace_id: created.workspace.workspace_id });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;

    await expect(fs.stat(worktreePath)).rejects.toMatchObject({ code: "ENOENT" });
    const got = await workspaceGet(created.workspace.workspace_id);
    expect(got.ok).toBe(true);
    expect(got.workspace?.status).toBe("closed");
  });

  it("rejects close when unlocked but holder_id is provided", async () => {
    const created = await workspaceCreate({ repo_path: srcRepo, base_ref: "HEAD" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const r = await workspaceClose({
      workspace_id: created.workspace.workspace_id,
      holder_id: "h1",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("NOT_LOCKED");
  });

  it("rejects close when locked and holder_id omitted", async () => {
    const created = await workspaceCreate({ repo_path: srcRepo, base_ref: "HEAD" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const lock = await workspaceLock({
      workspace_id: created.workspace.workspace_id,
      holder_id: "h1",
      ttl_ms: 60_000,
    });
    expect(lock.ok).toBe(true);

    const r = await workspaceClose({ workspace_id: created.workspace.workspace_id });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("LOCKED");
  });

  it("fails safety check if marker is missing and does not delete the directory", async () => {
    const created = await workspaceCreate({ repo_path: srcRepo, base_ref: "HEAD" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const worktreePath = created.workspace.worktree_path;
    const markerPath = path.join(worktreePath, ".workplane-workspace.json");
    await fs.rm(markerPath, { force: true });

    const r = await workspaceClose({ workspace_id: created.workspace.workspace_id });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("SAFETY_CHECK_FAILED");

    // Still exists, and record remains open.
    expect(await fs.stat(worktreePath)).toBeTruthy();
    const got = await workspaceGet(created.workspace.workspace_id);
    expect(got.workspace?.status).toBe("open");
  });

  it("fails safety check if marker workspace_id does not match", async () => {
    const created = await workspaceCreate({ repo_path: srcRepo, base_ref: "HEAD" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const worktreePath = created.workspace.worktree_path;
    const markerPath = path.join(worktreePath, ".workplane-workspace.json");
    const raw = await fs.readFile(markerPath, "utf8");
    const parsed = JSON.parse(raw) as any;
    parsed.workspace_id = "ws_tampered";
    await fs.writeFile(markerPath, JSON.stringify(parsed, null, 2) + "\n", "utf8");

    const r = await workspaceClose({ workspace_id: created.workspace.workspace_id });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("SAFETY_CHECK_FAILED");
  });

  it("closes when locked with correct holder_id (and releases lock after close)", async () => {
    const created = await workspaceCreate({ repo_path: srcRepo, base_ref: "HEAD" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const lock = await workspaceLock({
      workspace_id: created.workspace.workspace_id,
      holder_id: "h1",
      ttl_ms: 60_000,
    });
    expect(lock.ok).toBe(true);

    const r = await workspaceClose({
      workspace_id: created.workspace.workspace_id,
      holder_id: "h1",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // If lock was not released, a subsequent lock by another holder would fail.
    const relock = await workspaceLock({
      workspace_id: created.workspace.workspace_id,
      holder_id: "h2",
      ttl_ms: 60_000,
    });
    expect(relock.ok).toBe(true);
  });
});
