# Docs Progress Report (Phase 1)

Date: 2026-02-15

## What Exists Today

- [requirements.md](requirements.md)
  - Phase 1 functional requirements (tools, safety constraints, persistence, evidence).
- [architecture.md](architecture.md)
  - Implementation approach, safety guardrails, filesystem layout, and command execution safety rules.
- [tools.md](tools.md)
  - Tool list, conventions, and request/response examples.
- [roadmap.md](roadmap.md)
  - Milestone tracker.
- [README.md](README.md)
  - Documentation index.
- [configuration.md](configuration.md)
  - Environment variables and command policy configuration.
- [hosting.md](hosting.md)
  - How to run Workplane from an MCP host.
- [workflows.md](workflows.md)
  - Recommended multi-agent workflow and prompt templates.

## What We Implemented (Phase 1)

- MCP stdio server (`npm run dev`, `npm start`)
- Workspace lifecycle via Git worktrees:
  - `workspace.create|get|list|close`
  - repo cache clone + worktree provisioning
  - safe close with marker + root boundary checks
- Concurrency:
  - `workspace.lock|release` with TTL
  - consistent mutation enforcement across `apply_patch`, `run`, and `close`
- Code operations:
  - `workspace.apply_patch` using `git apply` (optional `--check`) with patch artifact capture
  - `workspace.diff` using `git diff` (optional artifact storage)
  - `workspace.run` using `spawn` (no shell), denylist + timeouts + bounded output capture, stdout/stderr artifacts
- Artifacts:
  - `artifact.put|get|list` with on-disk storage and persisted metadata
- Persistence:
  - JSON store (`state.json`) with atomic writes

## Repo Hygiene / Refactor Safety (Added)

- GitHub Actions CI matrix:
  - runs `npm ci`, `npm run build`, `npm run format:check`, `npm run lint`, `npm test`, `npm run smoke`
- ESLint + Prettier + EditorConfig:
  - `npm run lint`, `npm run format`, `npm run format:check`
  - sources and docs formatted for reviewable diffs
- Unit tests (Vitest):
  - `npm test` runs build + unit tests
  - initial coverage: `pathSafety`, lock enforcement semantics, and `workspace.run` denylist/parse/timeout + artifact evidence
  - added coverage: `workspace.close` safety + lock enforcement edge cases, and JSON store write-safety on Windows

## Refactors (Behavior-Preserving)

To keep Phase 1 maintainable, several "safest path" refactors were completed with tests as guardrails:

- Workspace lifecycle core split into focused modules:
  - `src/core/repoCache.ts` (repo cache clone/fetch + base sha resolution)
  - `src/core/worktree.ts` (worktree add/remove/prune helpers)
  - `src/core/workspaceMarker.ts` (marker file write/verify)
  - `src/core/workspaces.ts` (thin orchestration layer)
- Tools layer split into per-tool modules (public tool names unchanged):
  - `src/tools/workspace/*` for lifecycle tools
  - `src/tools/codeOps/*` for apply_patch/diff/run
- Artifact tools split into per-tool modules (public tool names unchanged):
  - `src/tools/artifacts/*` for put/get/list
- JSON store hardening (`src/core/store.ts`):
  - in-process serialization of state mutations to prevent lost updates under concurrent tool calls
  - safer atomic replace behavior on Windows
- Artifacts core split into focused helpers:
  - `src/core/artifactEncoding.ts` (strict-ish base64 decoding)
  - `src/core/artifactFs.ts` (artifact directory creation + path existence helper)
  - `src/core/artifacts.ts` remains the stable public entrypoint used by tools/tests

## Repo Scripts / Examples

- `npm run smoke` covers:
  - tool registration
  - workspace lifecycle
  - locks
  - artifacts
  - apply_patch
  - diff
  - run (success, denylist, timeout)
- [../examples/two-workspaces-demo/](../examples/two-workspaces-demo/) demonstrates two independent workspaces from the same repo.

## Current Validation Status

As of 2026-02-15, the following checks pass locally:

- `npm run format:check`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm run smoke`

## Code Review Notes (2026-02-15)

High-level review highlights:

- Lock enforcement is centralized in `src/core/locks.ts` and enforced by mutation cores (`src/core/patches.ts`, `src/core/runs.ts`, `src/core/workspaces.ts`).
- `workspace.run` also enforces locks in the tool layer (`src/tools/codeOps/run.ts`) as a defense-in-depth check.
- Workspace deletion is guarded by:
  - path boundary checks under `WORKPLANE_ROOT`
  - a per-worktree marker file (`.workplane-workspace.json`) that must match the `workspace_id`

Known limitations / follow-ups:

- `src/core/runPolicy.ts` tokenization is intentionally minimal; for complex quoting scenarios, prefer providing `args[]` explicitly.
- Command denylist matches by executable basename; this is good for safety-by-default but not a sandbox.
- Persistence is single-process per `WORKPLANE_ROOT` (JSON store). Multi-process safety requires SQLite or file locking.
- Workspace metadata persists `repo_url`; users should avoid embedding secrets in URLs until redaction is added.

## What We Still Need To Do (Phase 1 Hardening)

1. Command policy hardening for `workspace.run`:
   - consider allowlists and per-tool policies
   - better cross-platform process termination semantics
2. Expand unit test coverage for core modules:
   - workspace lifecycle core (create/close safety edge cases)
   - artifact store (large artifacts, missing files)
   - store concurrency behavior (before moving to SQLite)
3. Optional notes tools:
   - `workspace.note.add`, `workspace.note.list`
4. Persistence upgrade (optional for v0.1):
   - move from JSON (`state.json`) to SQLite

## See Also

- [README.md](README.md)
- [roadmap.md](roadmap.md)
- [tools.md](tools.md)
