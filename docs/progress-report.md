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
