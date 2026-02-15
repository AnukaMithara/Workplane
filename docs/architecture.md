# Workplane Architecture (Phase 1)

This document describes the current Phase 1 implementation approach and the guardrails it enforces.

## Overview

Workplane is an MCP server over stdio (`src/server.ts`). Tool handlers are registered in `src/tools/index.ts` and delegate to `src/core/*` modules.

Phase 1 focuses on:

- Workspace isolation via Git worktrees
- Safe-by-default filesystem boundaries under a single Workplane root
- Persistent workspace metadata

## Directory Layout

Workplane stores all state under a single root directory:

- Default: `~/.workplane`
- Override: `WORKPLANE_ROOT=/some/path`

Under the root:

- `repos/`
  - A repo cache per source repo, keyed by a hash of `repo_url` or `repo_path`
- `workspaces/`
  - One directory per `workspace_id` (a Git worktree)
- `artifacts/`
  - Per-workspace artifact files and metadata references
- `state.json`
  - JSON metadata store (v0.1 persistence)

The layout and root computation live in `src/core/config.ts`.

## Workspace Model

A workspace is:

- A Git worktree directory under `${WORKPLANE_ROOT}/workspaces/<workspace_id>/`
- Backed by a repo cache directory under `${WORKPLANE_ROOT}/repos/<repo_id>/`
- Created at a specific `base_ref` resolved to a concrete `base_sha`
- Created on a dedicated branch (`branch_name`)

Workspace metadata is persisted to `state.json` via `src/core/store.ts` and the operations are implemented in `src/core/workspaces.ts`.

## Repo Cache Strategy

`workspace.create` ensures there is a cached clone of the source repo:

- If `repo_url` is provided: `git clone <repo_url> <cachePath>`
- If `repo_path` is provided: `git clone <absoluteLocalPath> <cachePath>`

For remote repos, the cache is best-effort refreshed with `git fetch --all --prune`.

This approach keeps worktree creation fast and avoids mutating the original local repo.

## Safety Guardrails

Workplane enforces "operate only inside Workplane root":

- Any recorded or computed path is resolved to an absolute path and verified to be within `WORKPLANE_ROOT` (`src/core/pathSafety.ts`).

Workplane enforces "only delete what we created" for `workspace.close`:

- Each created worktree contains a marker file `.workplane-workspace.json`.
- `workspace.close` refuses to remove a worktree if the marker is missing or does not match the `workspace_id`.

Workplane enforces "single writer" via workspace locks:

- `workspace.lock` / `workspace.release` persist a lock record in `state.json` with an expiry (`locked_until`).
- Mutation tools are `workspace.apply_patch`, `workspace.run`, and `workspace.close`.
- Lock enforcement for all mutation tools:
  - If `holder_id` is provided: the mutation requires an active lock held by that `holder_id`.
  - If `holder_id` is omitted: the mutation is allowed only when the workspace is currently unlocked.

Workplane avoids corrupting MCP stdio:

- The server never logs to stdout; logs go to stderr only (`src/server.ts`).

## Git Execution

All Git commands are executed via `spawn` with arguments (no shell interpolation):

- Captured stdout/stderr with output bounds
- Timeouts to prevent hanging

Implementation: `src/core/exec.ts`, `src/core/git.ts`.

## Command Execution Safety (workspace.run)

`workspace.run` executes an argv array in the workspace worktree directory and captures evidence safely-by-default:

- No shell: commands run via `spawn(..., { shell: false })`.
- Working directory: `cwd` is the workspace `worktree_path` (validated to be within `WORKPLANE_ROOT`).
- Lock enforcement: follows the global mutation lock rules (see Safety Guardrails above).
- Denylist: dangerous executable names are blocked.
  - Configure with `WORKPLANE_COMMAND_DENYLIST` (comma-separated).
  - Defaults include common destructive commands and shell entrypoints (for example `rm`, `del`, `powershell`, `cmd`).
- Timeout: bounded by `timeout_ms` (default 120000). On timeout, the process is killed and `timed_out=true` is returned.
- Output bounds: stdout and stderr are each captured up to `max_output_bytes` (default 256KB per stream). Extra output is truncated and indicated via `stdout_truncated` / `stderr_truncated`.
- Evidence capture: stdout and stderr are stored as separate `log` artifacts and returned as `stdout_artifact_id` / `stderr_artifact_id`.

## Persistence

Phase 1 persistence uses a JSON state file:

- `${WORKPLANE_ROOT}/state.json`
- Atomic write pattern: write to `.tmp` then rename

Implementation: `src/core/store.ts`.

Persisted entities (v0.1):

- Workspaces
- Locks
- Artifacts (metadata; content stored under `artifacts/<workspace_id>/`)

SQLite is still preferred longer-term, but JSON persistence is acceptable for v0.1.

## What's Next

Remaining milestones will add:

- A more robust command policy for `workspace.run` (allowlists, per-tool policies, safer defaults)
- More tests beyond smoke tests (unit tests for core modules)
- Optional notes tools (`workspace.note.add` / `workspace.note.list`)
- SQLite persistence (replacing `state.json`)

## See Also

- [README.md](README.md)
- [tools.md](tools.md)
- [configuration.md](configuration.md)
- [requirements.md](requirements.md)
