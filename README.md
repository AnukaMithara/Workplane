# Workplane

Workplane is an **MCP (Model Context Protocol) stdio server** that provides a **Workspace Manager** for safe, reproducible multi-agent software delivery.

Phase 1 goals:
- Isolated workspaces using **Git worktrees**
- Centralized **state + artifact store** under a single root directory
- **Locks** to prevent concurrent workspace mutation
- Safe-by-default tool surface for orchestrators and worker agents

## Features (Phase 1)
- Create, list, inspect, and close workspaces backed by Git worktrees
- Apply patches inside a workspace using `git apply` (`--check` supported)
- Compute diffs inside a workspace using `git diff` (optional artifact storage)
- Run commands in a workspace with:
  - denylist policy (configurable)
  - timeout enforcement
  - bounded stdout/stderr capture (truncation flags)
  - stdout/stderr stored as separate log artifacts
- Artifact store: put/get/list per workspace
- JSON persistence (`state.json`) with atomic writes (v0.1)

## Tool Status
Implemented tools:
- Workspace: `workspace.create`, `workspace.get`, `workspace.list`, `workspace.close`
- Concurrency: `workspace.lock`, `workspace.release`
- Code ops: `workspace.apply_patch`, `workspace.diff`, `workspace.run`
- Artifacts: `artifact.put`, `artifact.get`, `artifact.list`

Optional (not implemented):
- `workspace.note.add`, `workspace.note.list`

## Quickstart
Prereqs:
- Node.js (LTS recommended)
- Git available on `PATH`

Install and build:
```bash
npm install
npm run build
```

Run the server (dev):
```bash
npm run dev
```

Run the server (prod):
```bash
npm start
```

Run smoke checks:
```bash
npm run smoke
```

## Configuration
Environment variables:
- `WORKPLANE_ROOT`: Workplane data root directory (default: `~/.workplane`)
- `WORKPLANE_COMMAND_DENYLIST`: comma-separated executable denylist for `workspace.run`

Docs: `docs/configuration.md`

## Documentation
- `docs/README.md` (start here)
- `docs/tools.md` (schemas + examples)
- `docs/architecture.md` (design + safety guardrails)
- `docs/requirements.md` (Phase 1 requirements)
- `docs/roadmap.md` (milestones)

## Examples
- `examples/phase1-smoke/` (end-to-end smoke test)
- `examples/two-workspaces-demo/` (create two workspaces, patch/run/diff, list artifacts)

## Development
Scripts:
- `npm run dev` (tsx) starts the MCP stdio server from `src/`
- `npm run build` builds to `dist/`
- `npm start` runs the built server
- `npm run smoke` runs an end-to-end smoke test against `dist/server.js`

Contributing: `CONTRIBUTING.md`

## License
`LICENSE`

