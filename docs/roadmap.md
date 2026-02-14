# Workplane Roadmap (Phase 1)

This roadmap tracks Phase 1 milestones from `AGENTS.md`.

## Status Legend
- Done: implemented and smoke-tested
- In progress: partially implemented or not fully tested
- Not started: stubbed or missing

## Milestone 1 — MCP Server Skeleton (Done)
- TypeScript project scaffold (`package.json`, `tsconfig.json`)
- MCP stdio server (`src/server.ts`)
- Phase 1 tools registered (initial stubs)
- Smoke test for tool registration (`npm run smoke`)

## Milestone 2 — Workspace Create/Get/List/Close (Done, JSON persistence)
- Repo cache clone for `repo_url` and `repo_path` under `WORKPLANE_ROOT`
- Worktree creation via `git worktree add` on a dedicated branch
- Metadata persistence to `${WORKPLANE_ROOT}/state.json`
- Safe close via marker + root path checks and `git worktree remove`
- Smoke test exercises create/get/list/close using a temp `WORKPLANE_ROOT`

## Milestone 3 — Patch + Diff (Not started)
- `workspace.apply_patch` (use `git apply`)
- `workspace.diff` (use `git diff`)

## Milestone 4 — Run + Artifacts (Not started)
- `workspace.run` with:
  - timeouts
  - bounded output capture + truncation
  - command denylist/allowlist
  - evidence artifacts for stdout/stderr
- `artifact.put/get/list`

## Milestone 5 — Locks + Safety Hardening (Not started)
- `workspace.lock/release` with TTL and holder enforcement
- Enforce lock in `apply_patch/run/close`
- Additional safety checks for command execution and filesystem operations

## Required Example (Not started)
- `examples/two-workspaces-demo/` demonstrating:
  - creating two workspaces
  - applying patches independently
  - running commands
  - retrieving diffs/logs

