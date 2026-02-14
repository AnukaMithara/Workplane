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

### `workspace.apply_patch` (implemented)

Apply a unified diff/patch inside the workspace (will use `git apply`).

Lock enforcement:
- Follows the locking convention above.

Inputs:
- `workspace_id` (string)
- `patch` (string) unified diff content
- `holder_id` (string) optional
- `check` (boolean) optional
  - If true: runs `git apply --check` first and returns `PATCH_CHECK_FAILED` on failure.

Behavior:
- Validates the workspace exists and is `open`.
- Stores the patch text as an artifact (`type=diff`, name `applied.patch`) and returns `patch_artifact_id`.
- Applies the patch via `git apply -` within the workspace worktree directory (no shell).

Output:
- `workspace_id`
- `applied` (boolean)
- `applied_at`
- `patch_artifact_id`

Example request:
```json
{
  "workspace_id": "ws_123",
  "holder_id": "agent-1",
  "check": true,
  "patch": "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1,2 @@\n hello\n+hello from patch\n"
}
```

Example response (success):
```json
{
  "ok": true,
  "timestamp": "2026-02-14T21:00:00.000Z",
  "workspace_id": "ws_123",
  "applied": true,
  "applied_at": "2026-02-14T21:00:00.100Z",
  "patch_artifact_id": "art_abc"
}
```

Example response (check failed):
```json
{
  "ok": false,
  "timestamp": "2026-02-14T21:00:00.000Z",
  "error": {
    "code": "PATCH_CHECK_FAILED",
    "message": "patch failed: README.md:1",
    "details": {
      "exit_code": 1
    }
  }
}
```

### `workspace.diff` (implemented)

Return `git diff` for the workspace (optionally store as an artifact).

Inputs:
- `workspace_id` (string)
- `staged` (boolean) optional
  - If true: runs `git diff --staged`
- `pathspec` (string[]) optional
  - Paths to filter (passed after `--`).
- `store_as_artifact` (boolean) optional
  - If true: stores the diff as an artifact (`type=diff`) and returns `artifact_id`.

Output:
- `workspace_id`
- `diff` (string)
- `artifact_id` (string) optional

Example request:
```json
{
  "workspace_id": "ws_123",
  "pathspec": ["README.md"],
  "store_as_artifact": true
}
```

Example response:
```json
{
  "ok": true,
  "timestamp": "2026-02-14T21:00:00.000Z",
  "workspace_id": "ws_123",
  "diff": "diff --git a/README.md b/README.md\nindex 123..456 100644\n--- a/README.md\n+++ b/README.md\n@@ -1 +1,2 @@\n hello\n+hello from patch\n",
  "artifact_id": "art_diff_1"
}
```

### `workspace.run` (implemented)

Run a command in the workspace and capture bounded stdout/stderr evidence.

Lock enforcement:
- Follows the locking convention above.

Inputs:
- `workspace_id` (string)
- `command` (string)
  - If `args` is not provided, Workplane will tokenize this string (no shell) and run it as an argv array.
- `args` (string[]) optional
  - If provided, Workplane will run `command` with these args (no shell).
- `timeout_ms` (number) optional
  - Default: 120000
- `max_output_bytes` (number) optional
  - Default: 262144 (256KB per stream)
- `holder_id` (string) optional

Behavior:
- Enforces a denylist of dangerous executables.
  - Configure via `WORKPLANE_COMMAND_DENYLIST` (comma-separated).
- Captures bounded stdout/stderr (truncated) and stores each stream as a separate `log` artifact.

Output:
- `workspace_id`
- `exit_code` (number | null)
- `duration_ms`
- `timed_out` (boolean)
- `stdout` / `stderr` (strings, truncated)
- `stdout_truncated` / `stderr_truncated` (booleans)
- `stdout_artifact_id` / `stderr_artifact_id`
- `started_at` / `ended_at`

Example request:
```json
{
  "workspace_id": "ws_123",
  "holder_id": "agent-1",
  "command": "git",
  "args": ["status", "--porcelain"],
  "timeout_ms": 20000,
  "max_output_bytes": 65536
}
```

Example response (success):
```json
{
  "ok": true,
  "timestamp": "2026-02-14T21:00:00.000Z",
  "workspace_id": "ws_123",
  "exit_code": 0,
  "duration_ms": 42,
  "timed_out": false,
  "stdout": " M README.md\n",
  "stderr": "",
  "stdout_truncated": false,
  "stderr_truncated": false,
  "stdout_artifact_id": "art_stdout_1",
  "stderr_artifact_id": "art_stderr_1",
  "started_at": "2026-02-14T21:00:00.010Z",
  "ended_at": "2026-02-14T21:00:00.052Z"
}
```

Example response (denylisted command):
```json
{
  "ok": false,
  "timestamp": "2026-02-14T21:00:00.000Z",
  "error": {
    "code": "DENIED",
    "message": "Command is denied by policy."
  }
}
```

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
