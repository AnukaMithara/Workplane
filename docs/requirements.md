# Workplane - Requirements (Phase 1: Workspace Manager)

This document defines WHAT Workplane must do in Phase 1. Implementation details are intentionally flexible.

## 1. MCP Server

- Workplane shall run as an MCP server over stdio.
- It shall expose the tools defined below.
- It shall validate tool inputs and return structured outputs.
- It shall return structured errors (no raw stack trace leakage).

## 2. Workspace Isolation

- Workplane shall create isolated workspaces for a given repo and base ref.
- Each workspace shall be backed by a Git worktree on its own branch.
- Workspaces shall be created under a controlled root directory (default `~/.workplane`).
- Workplane shall persist workspace metadata so workspaces can be listed and fetched.

### workspace.create inputs (minimum)

- repo_url OR repo_path (at least one required)
- base_ref (optional, default: main/master/HEAD depending on repo)
- branch_name (optional; if absent generate deterministic name)
- task_id (optional)
- agent_id (optional)

### workspace.create outputs (minimum)

- workspace_id
- repo identifier
- worktree_path
- branch_name
- base_ref / base_sha
- created_at

## 3. Workspace Tools

Workplane shall implement these tools:

### Workspace lifecycle

- workspace.create: create new isolated workspace
- workspace.get: get metadata and status
- workspace.list: list known workspaces (filtering optional)
- workspace.close: cleanup worktree and mark closed

### Concurrency control

- workspace.lock: lock workspace for mutation by a holder_id
- workspace.release: release lock held by holder_id

Lock rules:

- apply_patch, run, close should require lock OR enforce single-writer policy
- At minimum, prevent simultaneous close/apply/run from different holders

### Code operations

- workspace.apply_patch: apply a unified diff/patch inside workspace
- workspace.diff: return git diff (optionally store as artifact)
- workspace.run: run a command in the workspace and capture evidence

## 4. Command Execution Rules

- workspace.run shall execute commands inside the workspace directory.
- It shall enforce:
  - timeout (configurable, default e.g. 120s)
  - max output size (configurable; truncate)
  - denylist or allowlist for dangerous commands
- It shall return:
  - exit_code
  - duration_ms
  - truncated stdout/stderr
  - references to stored log artifacts

## 5. Artifact Store

Workplane shall store artifacts per workspace.

Artifacts types:

- diff
- log
- file
- note (optional)
- report (optional)

Required tools:

- artifact.put: store artifact content or file payload
- artifact.get: fetch artifact metadata + content (or path)
- artifact.list: list artifacts by workspace_id

## 6. Persistence

Workplane shall persist:

- workspace metadata
- artifact metadata
- lock state (or lock derivation)

Acceptable implementations:

- SQLite (preferred)
- JSON file persistence (allowed for v0.1)

## 7. Safety Constraints

Workplane shall:

- Never operate outside its configured root directories
- Ensure workspace.close only deletes/removes directories it created
- Sanitize path operations and verify workspace ownership
- Avoid unsafe shell invocation; prefer spawning processes with args array

## 8. Documentation + Examples

Workplane shall include:

- docs/architecture.md describing design choices
- docs/tools.md with tool schemas + example payloads
- examples/two-workspaces-demo showing two workspaces from the same repo

## 9. MVP "Definition of Done"

Phase 1 is done when:

- MCP server starts and registers tools
- Can create two workspaces from the same repo base ref without conflicts
- Can apply patches in each workspace independently
- Can run commands in each workspace with logged evidence
- Can diff and retrieve artifacts
- Can close workspaces safely
- Basic locks prevent concurrent mutation

## See Also

- [README.md](README.md)
- [tools.md](tools.md)
- [architecture.md](architecture.md)
- [roadmap.md](roadmap.md)
