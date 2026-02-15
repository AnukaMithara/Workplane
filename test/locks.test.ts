import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { mkTempRoot, rmrf } from "./helpers.js";

import {
  checkWorkspaceMutationAllowed,
  workspaceLock,
  workspaceRelease,
} from "../dist/core/locks.js";

describe("locks", () => {
  let root = "";

  beforeAll(async () => {
    root = await mkTempRoot("workplane-locks-");
    process.env.WORKPLANE_ROOT = root;
  });

  afterAll(async () => {
    await rmrf(root);
  });

  it("allows mutation when unlocked and holder_id omitted", async () => {
    const r = await checkWorkspaceMutationAllowed({ workspace_id: "ws1" });
    expect(r.ok).toBe(true);
  });

  it("rejects mutation when unlocked but holder_id is provided", async () => {
    const r = await checkWorkspaceMutationAllowed({ workspace_id: "ws2", holder_id: "h1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_LOCKED");
  });

  it("enforces holder identity when locked", async () => {
    const lock = await workspaceLock({ workspace_id: "ws3", holder_id: "h1", ttl_ms: 60_000 });
    expect(lock.ok).toBe(true);

    const omitted = await checkWorkspaceMutationAllowed({ workspace_id: "ws3" });
    expect(omitted.ok).toBe(false);
    if (!omitted.ok) expect(omitted.error.code).toBe("LOCKED");

    const wrong = await checkWorkspaceMutationAllowed({ workspace_id: "ws3", holder_id: "h2" });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.code).toBe("LOCKED");

    const right = await checkWorkspaceMutationAllowed({ workspace_id: "ws3", holder_id: "h1" });
    expect(right.ok).toBe(true);

    const rel = await workspaceRelease({ workspace_id: "ws3", holder_id: "h1" });
    expect(rel.ok).toBe(true);
  });

  it("expires locks by ttl", async () => {
    const lock = await workspaceLock({ workspace_id: "ws4", holder_id: "h1", ttl_ms: 1 });
    expect(lock.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 10));

    const after = await checkWorkspaceMutationAllowed({ workspace_id: "ws4" });
    expect(after.ok).toBe(true);
  });
});
