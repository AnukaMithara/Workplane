# Workplane — AGENTS.md

Workplane is an MCP server that provides a centralized Workspace Manager for safe, reproducible, multi-agent software delivery workflows. Phase 1 focuses on Git worktree–based isolation, patch application, command execution with evidence capture, and an artifact store.

## Project Goals (Phase 1)

Implement a TypeScript MCP server that can:

- Provision isolated workspaces (Git worktrees) from a repo + base ref/sha
- Apply patches and generate diffs inside a workspace
- Run commands in a workspace and capture bounded logs/evidence
- Store and retrieve artifacts (diffs/logs/files/notes)
- Provide basic locking to prevent concurrent workspace mutation

## Non-Goals (Phase 1)

- Full multi-agent orchestrator (planning/dispatch/retry)
- Container-based sandboxing (worktrees only for v1)
- Deep CI/CD integrations (Jenkins/GitHub Actions later)
- Security scanning suite (later)

## Operating Model

- The MCP server is the "control plane" and should be safe-by-default.
- Each task/agent should operate in its own workspace (one workspace = one isolated worktree).
- Agents never directly edit a shared folder; they operate via workspace APIs and return patches/diffs/artifacts.

## Repository Layout (expected)

Workplane should use a clear modular structure (Codex may adapt as needed):

- `src/server.ts` — MCP server entrypoint (stdio transport)
- `src/tools/*` — tool handlers
- `src/core/*` — git/worktree/execution/locks/storage/artifacts
- `src/shared/*` — shared types, constants
- `docs/*` — architecture + tool schemas
- `examples/*` — demo workflows and scripts

## Phase 1 Tools (MCP)

Workplane MUST expose at least these MCP tools:

### Workspace lifecycle

- `workspace.create`
- `workspace.get`
- `workspace.list`
- `workspace.close`

### Concurrency

- `workspace.lock`
- `workspace.release`

### Code operations

- `workspace.apply_patch`
- `workspace.diff`
- `workspace.run`

### Artifacts

- `artifact.put`
- `artifact.get`
- `artifact.list`

> Optional (nice-to-have): `workspace.note.add`, `workspace.note.list`

All tools should:

- Validate inputs
- Return structured outputs with IDs and timestamps
- Return structured error objects (no raw stack traces to client)

## Workspace Semantics

A workspace is:

- An isolated directory rooted under a single Workplane root (default `~/.workplane`)
- Backed by a Git worktree on its own branch
- Associated with metadata: repo_url/path, base_ref, branch_name, task_id (optional), agent_id (optional)

Suggested directory conventions (Codex may revise):

- Repo cache: `~/.workplane/repos/<repoHash>/`
- Workspaces: `~/.workplane/workspaces/<workspace_id>/`
- Artifacts: `~/.workplane/artifacts/<workspace_id>/`

## Safety Requirements (must-haves)

Workplane MUST implement guardrails:

- Never read/write/delete outside the Workplane root directories
- `workspace.close` must only remove the workspace worktree it created
- Command execution must enforce:
  - timeouts
  - output size limits (truncate)
  - denylist or allowlist for dangerous commands (`sudo`, destructive `rm`, etc.)
- Patch application should be safe; prefer `git apply` and validate failures cleanly
- Locking must prevent concurrent mutation (apply_patch/run/close) when locked by another holder

## Storage Requirements

Phase 1 requires persistence of workspace + artifact metadata.
Implementation is flexible:

- SQLite is preferred
- JSON file store is acceptable for v0.1 if documented and reliable

## Evidence & Observability

Every `workspace.run` should return:

- exit_code
- duration_ms
- truncated stdout/stderr
- a reference to stored log artifact(s)

Record at least:

- command string
- start/end timestamps
- workspace_id
- return code

## Local Dev Experience

Provide:

- `npm run dev` to start the MCP server locally
- `npm run build` and `npm start` for production usage
- Basic lint/format scripts

## Documentation Requirements

Add docs that let other developers contribute quickly:

- `docs/architecture.md`
- `docs/tools.md` (tool schemas & examples)
- `docs/roadmap.md`

## Examples

Provide at least one runnable example:

- `examples/two-workspaces-demo/` demonstrating creating two workspaces, applying patches, running commands, retrieving diffs/logs.

---

# Codex CLI Runbook

Codex should implement Workplane iteratively. After each milestone:

- Ensure TypeScript build passes
- Add/adjust tests if present
- Keep changes small and reviewable

Recommended milestone order:

## Milestone 1 — MCP server skeleton

- Setup TS project, scripts, lint/format
- Start MCP server over stdio
- Register all Phase 1 tools with stub handlers

## Milestone 2 — Workspace create/get/list/close

- Implement repo cache clone (repo_url) and local repo_path support
- Implement `git worktree add` for workspace creation
- Persist workspace metadata
- Implement safe `workspace.close` cleanup

## Milestone 3 — Patch + diff

- Implement `workspace.apply_patch` using `git apply`
- Implement `workspace.diff` using `git diff`

## Milestone 4 — Run + artifacts

- Implement `workspace.run` with timeout + output truncation
- Store stdout/stderr logs as artifacts
- Implement `artifact.put/get/list`

## Milestone 5 — Locks + safety hardening

- Implement `workspace.lock/release` with a robust locking strategy
- Ensure apply/run/close respects locks
- Add path safety checks, command denylist, output truncation

---

# Notes for Contributors

- Keep the tool surface stable; add new tools as additive changes.
- Avoid introducing vendor-specific assumptions. Workplane is model/agent neutral.
- Prefer clear errors and deterministic behavior over cleverness.
