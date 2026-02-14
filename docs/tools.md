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

Locking convention (mutation tools):
- Mutation tools are `workspace.apply_patch`, `workspace.run`, and `workspace.close`.
- If `holder_id` is provided: the mutation requires an active lock held by that `holder_id` (otherwise `NOT_LOCKED` or `LOCKED`).
- If `holder_id` is omitted: the mutation is allowed only if the workspace is currently unlocked (otherwise `LOCKED`).

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
- `holder_id` (string) optional

Safety:
- Refuses to remove the directory unless it is under `WORKPLANE_ROOT` and contains a matching `.workplane-workspace.json` marker.
- Lock enforcement follows the locking convention above.

Output:
- `workspace_id`
- `closed_at`

## Concurrency

### `workspace.lock` (implemented)

Acquire a mutation lock for a workspace.

Inputs:
- `workspace_id` (string)
- `holder_id` (string)
- `ttl_ms` (number) optional

Output:
- `workspace_id`
- `holder_id`
- `locked_until`

Notes:
- If already locked by a different holder, returns `{ ok: false, error: { code: "LOCKED", ... } }`.
- Re-locking with the same holder renews the lock and updates `locked_until`.

### `workspace.release` (implemented)

Release a mutation lock for a workspace.

Inputs:
- `workspace_id` (string)
- `holder_id` (string)

Output:
- `workspace_id`
- `released_at`

## Code Operations

### `workspace.apply_patch` (stub)

Apply a unified diff/patch inside the workspace (will use `git apply`).

Lock enforcement:
- Follows the locking convention above.

### `workspace.diff` (stub)

Return `git diff` for the workspace (optionally store as an artifact).

### `workspace.run` (stub)

Run a command in the workspace and capture bounded stdout/stderr evidence.

Lock enforcement:
- Follows the locking convention above.

## Artifacts

### `artifact.put` (implemented)

Store an artifact for a workspace.

Inputs:
- `workspace_id` (string)
- `type` (`diff` | `log` | `file` | `note` | `report`)
- `name` (string) optional
- `content` (string) optional (utf-8)
- `content_base64` (string) optional
- `content_type` (string) optional
- `metadata` (object) optional

Rules:
- Exactly one of `content` or `content_base64` is required.

Output:
- `workspace_id`
- `artifact_id`
- `stored_at`

### `artifact.get` (implemented)

Fetch an artifact by id.

Output:
- `artifact` object with:
  - `artifact_id`
  - `type`
  - `name` (optional)
  - `content` (optional, when stored as utf-8)
  - `content_base64` (optional, when stored as bytes)
  - `content_type` (optional)
  - `created_at`

### `artifact.list` (implemented)

List artifacts for a workspace.

## Optional Tools

### `workspace.note.add` (stub)
### `workspace.note.list` (stub)
