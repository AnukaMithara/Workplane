# Workplane

**Workplane** is an **MCP (Model Context Protocol) server** that provides a **centralized Workspace Manager** for safe, reproducible, multi-agent software delivery.

Phase 1 focuses on:
- **Isolated workspaces** using **Git worktrees**
- **Centralized state + artifacts** under a single root directory
- **Locks** to enforce “single-writer” mutations
- A stable tool surface for orchestrators and worker agents

> Think: “control plane for agent workspaces” — vendor-neutral and IDE/agent-agnostic.

---

## Why Workplane?

Multi-agent coding breaks down fast without guardrails:
- agents overwrite each other
- changes become non-reproducible
- tests/logs are lost
- cleanup becomes dangerous

Workplane solves the *operational layer*:
- **one task/agent → one workspace**
- **centralized evidence/artifacts**
- **safe cleanup**
- **consistent tool API via MCP**

---

## Project status

Phase 1 milestones (see `docs/roadmap.md`):

✅ **Implemented**
- `workspace.create`
- `workspace.get`
- `workspace.list`
- `workspace.close`
- `workspace.lock`
- `workspace.release`
- `artifact.put`
- `artifact.get`
- `artifact.list`

🚧 **Stubbed (planned next)**
- `workspace.apply_patch` (via `git apply`)
- `workspace.diff` (via `git diff`)
- `workspace.run` (command execution + bounded evidence capture)

📌 Docs:
- `docs/requirements.md` — WHAT Phase 1 must do  
- `docs/architecture.md` — HOW Phase 1 is implemented  
- `docs/tools.md` — tool list + example payloads  
- `docs/roadmap.md` — milestone tracker  

---

## Architecture overview

Workplane runs as an **MCP stdio server** (`src/server.ts`). Tools are registered in `src/tools/index.ts` and implemented in `src/core/*`.

### Root directory layout

All state is stored under a single root:

- Default: `~/.workplane`
- Override: `WORKPLANE_ROOT=/some/path`

Under the root:
- `repos/` — cached clones keyed by repo hash
- `workspaces/` — worktree directory per workspace
- `artifacts/` — per-workspace artifact storage
- `state.json` — metadata store (v0.1 persistence)

### Safety guardrails (already enforced)
- Workplane operates **only inside `WORKPLANE_ROOT`**
- `workspace.close` only removes directories it created (marker file: `.workplane-workspace.json`)
- Avoids corrupting MCP stdio by writing logs only to **stderr**

Details: `docs/architecture.md`

---

## Installation

### Prerequisites
- Node.js (LTS recommended)
- Git installed and available on PATH

### Install deps
```bash
npm install
