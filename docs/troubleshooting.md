# Troubleshooting

This page maps common Workplane Phase 1 failure modes to likely causes and fixes.

## First Checks

- Confirm Git is installed and on `PATH`: `git --version`
- Confirm Node.js is installed and on `PATH`: `node --version`
- Confirm the MCP host is running Workplane as a stdio server (`npm run dev` locally)
- Confirm your `WORKPLANE_ROOT` is writable

## Workspace Create Fails

Symptoms:

- `workspace.create` returns `{ ok:false, error:{ code:"CREATE_FAILED", ... } }` (or a tool-level failure).

Common causes:

- Private repo auth (HTTPS token/SSO/SSH agent not available to the server process)
- Invalid `repo_url` / `repo_path`
- Invalid `base_ref`

Fixes:

- Prefer SSH URLs for private repos (so Git credential helpers are not required).
- If using HTTPS, ensure credentials are configured for the same user context running the MCP server.
- Verify `base_ref` exists in the repo cache: try a local `git rev-parse <base_ref>`.

## Lock Errors During Mutation

Mutation tools are:

- `workspace.apply_patch`
- `workspace.run`
- `workspace.close`

Lock rules:

- If you pass `holder_id`: the workspace must be locked by that holder.
- If you omit `holder_id`: mutation is allowed only when the workspace is currently unlocked.

Errors you may see:

- `LOCKED`: another holder currently owns the lock (or you omitted `holder_id` and the workspace is locked)
- `NOT_LOCKED`: you provided `holder_id` but no lock is currently held

Fixes:

- Acquire a lock first with `workspace.lock` and the same `holder_id`.
- If a lock is stuck, see `docs/operations.md`.

## Patch Apply Fails

Errors you may see:

- `PATCH_CHECK_FAILED`: `check=true` and `git apply --check` failed
- `PATCH_APPLY_FAILED`: patch application failed

Fixes:

- Ensure the patch was generated against the workspace base (or current HEAD) and paths match.
- Run `workspace.diff` to understand the current state before applying.
- Prefer `check=true` first to get a fast failure without mutating the workspace.

## Command Is Denied

Error:

- `DENIED`: the executable name is blocked by the denylist policy.

Fixes:

- Adjust `WORKPLANE_COMMAND_DENYLIST` (comma-separated list of executable names) if you intentionally want to permit something.
- Prefer running the underlying executable directly rather than via shell entrypoints.

## Command Times Out

Symptoms:

- `workspace.run` returns `timed_out=true`.

Fixes:

- Increase `timeout_ms` for the specific call if the command is expected to take longer.
- For long-running processes, run a narrower command (for example `git status` vs a full build) and capture evidence.

## Artifact Get Fails

Errors you may see:

- `MISSING_ARTIFACT_FILE`: metadata exists but the file is gone on disk
- `TOO_LARGE`: artifact is larger than the inline return cap (1MB)

Fixes:

- For `MISSING_ARTIFACT_FILE`, treat it as an operator issue under `WORKPLANE_ROOT` and audit any cleanup scripts.
- For `TOO_LARGE`, store logs/diffs as smaller chunks, or adjust the design to support streaming/out-of-band retrieval in a future version.
