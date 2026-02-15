# Operations (Phase 1)

This page is for operators and contributors running Workplane locally or in a dev host.

## State and Directories

Everything lives under a single root directory:

- Root: `WORKPLANE_ROOT` (default `~/.workplane`)
- State file: `<root>/state.json`
- Repo cache: `<root>/repos/<repo_id>/`
- Workspaces (git worktrees): `<root>/workspaces/<workspace_id>/`
- Artifacts: `<root>/artifacts/<workspace_id>/`

## Safety Model Recap

- Workplane refuses to operate outside `WORKPLANE_ROOT`.
- `workspace.close` refuses to remove a workspace directory unless it contains a valid `.workplane-workspace.json` marker matching the `workspace_id`.
- Mutations (`workspace.apply_patch`, `workspace.run`, `workspace.close`) enforce workspace locks.

## Stuck Locks

If an agent crashes or a host disconnects, locks may remain until TTL expires.

Recommended recovery path:

1. Prefer waiting for TTL expiry if it is short and safe to wait.
2. If you must recover sooner, release the lock with the original `holder_id` using `workspace.release`.

If you cannot recover the original `holder_id`:

- Treat this as an operator intervention scenario.
- Do not mutate the workspace via tools until the lock is cleared.
- As a last resort, you can remove the lock record from `state.json` for that `workspace_id`.
  - This is not an API-supported workflow and should be recorded in a project journal / incident note.

## Workspace Cleanup Failures

If `workspace.close` fails:

- Check the workspace directory exists under `<root>/workspaces/<workspace_id>/`.
- Verify the marker file exists and matches the workspace:
  - `<root>/workspaces/<workspace_id>/.workplane-workspace.json`
- If the marker is missing or mismatched, Workplane will correctly refuse to delete the directory.

Do not manually delete directories outside `WORKPLANE_ROOT`.

## Multi-Process Warning

Phase 1 persistence uses a JSON file with in-process mutation serialization.

- Safe for concurrent calls within a single server process.
- Not safe for multiple Workplane server processes writing to the same `WORKPLANE_ROOT`.

Operational guidance:

- Run one Workplane process per `WORKPLANE_ROOT`.
- If you need multiple processes, use separate roots (different `WORKPLANE_ROOT` values).
