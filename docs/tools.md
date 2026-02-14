# Workplane Tools (Phase 1)

This document lists Phase 1 MCP tools, their intent, and example payloads.

Notes:
- Workplane runs over MCP stdio (`npm run dev`).
- Tools return a structured object via `structuredContent` and also include a JSON string in `content[0].text`.
- Errors are returned as `{ ok: false, error: { code, message, details? } }` (no raw stack traces).

## Conventions

Common fields:
- `timestamp`: ISO-8601 string
- `ok`: boolean

## Workspace Lifecycle

### `workspace.create` (implemented)

Create an isolated workspace backed by a Git worktree.

Inputs:
- `repo_url` (string, url) optional
- `repo_path` (string) optional
- `base_ref` (string) optional, default `HEAD`
- `branch_name` (string) optional
- `task_id` (string) optional
- `agent_id` (string) optional

Rules:
- At least one of `repo_url` or `repo_path` is required.

Output (minimum):
- `workspace_id`
- `repo_id`
- `worktree_path`
- `branch_name`
- `base_ref`
- `base_sha`
- `created_at`

Example:
```json
{
  "repo_path": "D:\\Desktop\\Projects\\Workplane",
  "base_ref": "HEAD",
  "task_id": "t-123",
  "agent_id": "a-1"
}
```

### `workspace.get` (implemented)

Get persisted workspace metadata.

Inputs:
- `workspace_id` (string)

Output:
- `workspace` (object) if found
- If not found: `ok=true` and `workspace` omitted

### `workspace.list` (implemented)

List workspaces, optionally filtered.

Inputs (all optional):
- `repo_id`
- `task_id`
- `agent_id`
- `status` (`open` or `closed`)

Output:
- `workspaces`: array of workspace records (subset of metadata)

### `workspace.close` (implemented)

Close a workspace (remove its worktree) and mark it closed.

Inputs:
- `workspace_id`
- `holder_id` (string) optional (reserved for future lock enforcement)

Safety:
- Refuses to remove the directory unless it is under `WORKPLANE_ROOT` and contains a matching `.workplane-workspace.json` marker.

Output:
- `workspace_id`
- `closed_at`

## Concurrency

### `workspace.lock` (stub)

Acquire a mutation lock for a workspace.

### `workspace.release` (stub)

Release a mutation lock for a workspace.

## Code Operations

### `workspace.apply_patch` (stub)

Apply a unified diff/patch inside the workspace (will use `git apply`).

### `workspace.diff` (stub)

Return `git diff` for the workspace (optionally store as an artifact).

### `workspace.run` (stub)

Run a command in the workspace and capture bounded stdout/stderr evidence.

## Artifacts

### `artifact.put` (stub)

Store an artifact for a workspace.

### `artifact.get` (stub)

Fetch an artifact by id.

### `artifact.list` (stub)

List artifacts for a workspace.

## Optional Tools

### `workspace.note.add` (stub)
### `workspace.note.list` (stub)

