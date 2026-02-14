# Workplane Roadmap (Phase 1)

This roadmap tracks Phase 1 milestones from `AGENTS.md`.

## Status Legend
- Done: implemented and smoke-tested
- In progress: partially implemented or not fully tested
- Not started: stubbed or missing

## Milestone 1 - MCP Server Skeleton (Done)
- TypeScript project scaffold (`package.json`, `tsconfig.json`)
- MCP stdio server (`src/server.ts`)
- Phase 1 tools registered (initial stubs)
- Smoke test for tool registration (`npm run smoke`)

## Milestone 2 - Workspace Create/Get/List/Close (Done, JSON persistence)
- Repo cache clone for `repo_url` and `repo_path` under `WORKPLANE_ROOT`
- Worktree creation via `git worktree add` on a dedicated branch
- Metadata persistence to `${WORKPLANE_ROOT}/state.json`
- Safe close via marker + root path checks and `git worktree remove`
- Smoke test exercises create/get/list/close using a temp `WORKPLANE_ROOT`

## Milestone 3 - Patch + Diff (Done)
- `workspace.apply_patch` (Done; uses `git apply` with optional `--check`, stores patch as an artifact)
- `workspace.diff` (Done; uses `git diff`, can store diff as an artifact)

## Milestone 4 - Run + Artifacts (Done)
- `artifact.put/get/list` (Done)
- `workspace.run` (Done)
  - timeouts + `timed_out` flag
  - bounded output capture + truncation flags
  - configurable command denylist (`WORKPLANE_COMMAND_DENYLIST`)
  - evidence artifacts for stdout/stderr

## Milestone 5 - Locks + Safety Hardening (In progress)
- `workspace.lock/release` with TTL and holder enforcement
- Enforce lock in `close` (Done)
- Enforce lock in `apply_patch` (Done)
- Enforce lock in `workspace.run` (Done)
- Additional safety checks for command execution and filesystem operations (ongoing hardening)

## Required Example (Done)
- `examples/two-workspaces-demo/` demonstrating:
  - creating two workspaces
  - applying patches independently
  - running commands
  - retrieving diffs/logs

