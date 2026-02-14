# Two Workspaces Demo (Phase 1)

This demo shows the core Phase 1 workflow:

- start the Workplane MCP stdio server
- create **two** Git worktree-backed workspaces from the **same** repo + base ref
- apply a different patch in each workspace
- run a command in each workspace (capturing evidence)
- collect diffs and list artifacts

## Prereqs

- Node.js installed
- Git installed and available on `PATH`

## Run

From the repo root:

```bash
npm run build
npx tsx examples/two-workspaces-demo/demo.ts
```

## What It Does

The script creates a temporary git repository (so it is runnable anywhere) and points
Workplane at that `repo_path`. It also sets `WORKPLANE_ROOT` to a temporary folder
so it does not touch `~/.workplane`.

At the end, it prints a short summary including:

- the two `workspace_id`s
- diff artifact ids
- run stdout/stderr artifact ids
- artifact lists for each workspace

