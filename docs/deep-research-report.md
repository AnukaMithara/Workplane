# Workplane Deep Research Report (Phase 1)

Date: 2026-02-15

This report summarizes what is implemented today, what gaps remain for a high-quality Phase 1 deliverable, and the safest next steps.

## Current Status

Phase 1 is functionally implemented and integrated on `main`:

- MCP stdio server (`src/server.ts`)
- Workspace lifecycle backed by Git worktrees
  - `workspace.create`, `workspace.get`, `workspace.list`, `workspace.close`
- Concurrency controls
  - `workspace.lock`, `workspace.release` (TTL-based locks)
  - Mutation tools consistently enforce lock rules: `workspace.apply_patch`, `workspace.run`, `workspace.close`
- Code operations
  - `workspace.apply_patch` via `git apply` (optional `--check`) and stores the patch as a `diff` artifact
  - `workspace.diff` via `git diff` / `git diff --staged` (optional artifact storage)
  - `workspace.run` via `spawn` (no shell), with timeout, bounded output capture, denylist policy, and stdout/stderr stored as `log` artifacts
- Artifacts
  - `artifact.put`, `artifact.get`, `artifact.list` with on-disk content storage and persisted metadata
- Persistence (v0.1)
  - JSON `state.json` under `WORKPLANE_ROOT`, with atomic replace and in-process mutation serialization (`src/core/store.ts`)
- Examples and tests
  - End-to-end smoke flow exists and is runnable
  - Unit tests exist for critical safety behaviors (locks, close safety, store behavior, path safety, run policy)
- Repo hygiene
  - ESLint + Prettier and CI checks are present

Optional tools `workspace.note.add` / `workspace.note.list` remain stubbed.

## What Works Well

- Safe-by-default stance: no shell execution, path boundary checks under `WORKPLANE_ROOT`, marker file protection for `workspace.close`.
- Lock enforcement is consistent across all mutation tools and supports holder-based ownership.
- Evidence capture is first-class: `workspace.run` and code operations store diffs/logs as artifacts.
- Git worktree isolation matches the Phase 1 operating model (one workspace per agent/task).

## Gaps / Risks (Phase 1 Hardening)

These are the highest-impact remaining items for stability and real-world usage:

1. Multi-process safety
   - The JSON store is safe for concurrent tool calls within a single process, but it is not a cross-process database.
   - Current assumption should remain: one Workplane server process per `WORKPLANE_ROOT`.

2. Credential hygiene
   - Workspace metadata persists `repo_url` into `state.json`.
   - If users embed tokens in a URL, secrets can land on disk. Recommend documenting this prominently and adding redaction.

3. Operational readiness
   - Operator playbooks exist (`docs/operations.md`) and common failure guides exist (`docs/troubleshooting.md`).
   - Remaining need: keep extending these as new real-world failure modes show up (private repo auth, stuck locks, worktree cleanup, missing artifact files, safe cleanup under `WORKPLANE_ROOT`).

4. Command policy usability and security
   - Denylist is safe-by-default, but real projects often need a clear policy story (allowlist mode, per-tool policies, better documentation of what is blocked and why).
   - Timeout behavior is best-effort; killing process trees is OS-dependent and should be documented.

5. Remaining refactor debt
   - Some core files remain relatively large (notably `src/core/artifacts.ts`, `src/core/runs.ts`).
   - Safest path is behavior-preserving splits with tests first.

## Recommended Next Steps (Safest Order)

1. Security hardening (targeted)
   - Redact secrets from persisted `repo_url` (strip embedded credentials; consider removing query params).
   - Add clearer documentation around `WORKPLANE_ROOT` trust model and what is safe to delete.

2. Refactor for maintainability (behavior-preserving)
   - Split `src/core/artifacts.ts` into smaller modules without changing tool behavior; add/extend tests.
   - Split `src/core/runs.ts` to isolate spawn/capture vs persisted run metadata; add/extend tests.

3. Command policy hardening (usability + safety)
   - Add an optional allowlist mode and/or per-tool policies.
   - Improve documentation of denylist defaults and recommended operator configuration.
   - Document process termination semantics (especially Windows) and current limitations clearly.

4. Persistence evolution (optional for v0.1, likely for v0.2)
   - Introduce a storage interface and add a SQLite backend (WAL) if multi-process or higher concurrency is required.

## File Pointers

- Tool contracts and examples: `docs/tools.md`
- Architecture and safety model: `docs/architecture.md`
- Core implementation: `src/core/*`
- Tool handlers: `src/tools/*`
- Smoke example(s): `examples/*`
- Tests: `test/*`
