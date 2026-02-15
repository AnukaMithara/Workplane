# Workflows (Recommended)

Workplane does not prescribe an orchestrator. It provides the operational substrate: isolated workspaces, locks, patching, command evidence capture, and artifacts.

## Roles

- Orchestrator (planner/controller): decomposes work, provisions workspaces, validates outputs
- Worker agents: implement changes in their assigned workspace and return patches/artifacts
- Reviewer agent (optional): reviews diffs and evidence artifacts

## Golden Rules

1. One workspace per task/agent (no shared mutable folder)
2. Lock before mutation (`workspace.apply_patch`, `workspace.run`, `workspace.close`)
3. Exchange changes as patches/diffs/artifacts, not ad-hoc edits
4. Capture evidence (tests/logs) as artifacts
5. Close workspaces when done

## Prompt Templates

### Orchestrator: System Prompt Template

Purpose: coordinate multiple worker agents safely with Workplane tools.

Key rules:

- Provision a workspace per task/agent via `workspace.create`
- Use `workspace.lock(holder_id)` before any mutation tools
- Require patches/diffs as outputs, and store important logs via `artifact.put`
- Require evidence (build/test output) for changes

Full copy/paste prompt:

- [prompts/workplane-orchestrator-initial-system-prompt.md](prompts/workplane-orchestrator-initial-system-prompt.md)

### Worker: Task Prompt Template

Inputs:

- `workspace_id`
- `task_id` (optional)
- `holder_id`

Rules:

- Operate only inside this workspace
- Run commands through `workspace.run`
- Apply changes through `workspace.apply_patch`
- Return a patch and the evidence artifacts (stdout/stderr logs) for verification

### Reviewer: Review Prompt Template

Inputs:

- `workspace_id`
- diff artifact id(s)
- run log artifact id(s)

Checklist:

- Matches acceptance criteria
- Safety and correctness
- Evidence is present (tests/build)

## See Also

- [README.md](README.md)
- [tools.md](tools.md)
- [architecture.md](architecture.md)
