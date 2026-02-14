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
- `workspace.apply_patch` (via `git apply`, optional `--check`, patch stored as an artifact)
- `artifact.put`
- `artifact.get`
- `artifact.list`

🚧 **Stubbed (planned next)**
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
```

### Build

```bash
npm run build
```

### Run smoke checks

```bash
npm run smoke
```

---

## Running the MCP server

### Dev mode (recommended while building)

```bash
npm run dev
```

### Prod mode

```bash
npm run build
npm start
```

### Configure root directory

```bash
# Linux/macOS
export WORKPLANE_ROOT="$HOME/.workplane"

# Windows (PowerShell)
$env:WORKPLANE_ROOT="$env:USERPROFILE\.workplane"
```

---

## Using Workplane from an MCP Host

Workplane is a **stdio MCP server**. Configure your MCP host (IDE, orchestrator runtime, or agent host) to start Workplane as a command.

Typical setups:

* command: `npm`
* args: `["run", "dev"]` (or `["start"]` after build)
* env: `{ "WORKPLANE_ROOT": "/path/to/.workplane" }`

> The exact JSON format depends on your host. Workplane itself is host-agnostic.

---

## Tool API (Phase 1)

See `docs/tools.md` for full details and payload examples.

### Workspace lifecycle

* `workspace.create` — create isolated workspace (git worktree)
* `workspace.get` — fetch workspace metadata
* `workspace.list` — list workspaces
* `workspace.close` — safely remove worktree + mark closed

### Concurrency

* `workspace.lock` — lock workspace for mutation
* `workspace.release` — release lock

### Code operations

* `workspace.apply_patch` — apply a unified diff inside a workspace (`git apply`)
* `workspace.diff` — planned (`git diff`)
* `workspace.run` — planned (command execution + bounded evidence capture)

### Artifacts

* `artifact.put` — store artifact
* `artifact.get` — fetch artifact
* `artifact.list` — list artifacts

### Tool response shape

Tools return:

* `structuredContent` (object)
* `content[0].text` (JSON string)
* Errors return:

```json
{ "ok": false, "error": { "code": "SOME_CODE", "message": "Human readable", "details": {} } }
```

---

## Recommended multi-agent workflow

Workplane does **not** force a specific orchestrator. It provides the **shared operational substrate**.

### Roles

* **Orchestrator** (planner/controller): breaks work into tasks, provisions workspaces, verifies results
* **Worker agents** (Codex CLI / Claude Code / IDE agents): implement changes in their assigned workspace
* **Reviewer agent** (optional): sanity checks, runs tests, reviews diffs

### Golden rules

1. **One workspace per task/agent** (no shared mutable folder)
2. **Lock before mutation** (apply/run/close)
3. Exchange changes as **patches/diffs/artifacts**, not ad-hoc edits
4. Capture evidence (logs/tests) as artifacts
5. Close workspaces when done

---

## Prompting guides (Orchestrator + Sub-agents)

Below are **copy/paste templates** you can adapt for your orchestrator and worker agents.

> Note: `workspace.apply_patch`, `workspace.diff`, `workspace.run` are stubbed today; the prompts assume they exist once Milestones 3–4 land. Until then, use `artifact.put` to store patches/logs and apply manually.

---

### Orchestrator: System Prompt Template

**Purpose:** turn a product goal into a task graph and coordinate workspaces safely.

> **System Prompt (Orchestrator)**

* You are the Orchestrator for a multi-agent coding workflow.
* You MUST use Workplane MCP tools to provision isolated workspaces per task/agent.
* Never allow two agents to write in the same workspace.
* For any mutation tool (apply_patch/run/close), acquire a workspace lock first using `workspace.lock(holder_id)`.
* Store important outputs (patches, diffs, logs, decisions) as Workplane artifacts using `artifact.put`.
* Prefer contract-first: define API/schema expectations before parallel work begins.
* Require evidence: tests/build logs should be stored as artifacts.
* On conflicts, do not “guess”; ask for a new patch/diff and re-verify.

**Orchestrator operational loop**

1. Decompose goal → tasks (frontend/backend/schema/tests)
2. For each task:

   * `workspace.create` with `task_id`, `agent_id`
   * (optional) `workspace.lock`
   * instruct worker with workspace_id + acceptance criteria
3. Collect outputs:

   * diff/patch + logs as artifacts
4. Validate:

   * run tests (when `workspace.run` exists)
5. Merge/close:

   * release lock, `workspace.close` when finished

---

### Worker Agent: Prompt Template (Backend/Frontend)

**Purpose:** constrain the worker to one workspace and enforce patch/evidence discipline.

> **Worker Prompt**
> You are a worker agent implementing a single task inside a Workplane workspace.

Workspace:

* workspace_id: `<WORKSPACE_ID>`
* task_id: `<TASK_ID>`
* holder_id: `<HOLDER_ID>`

Rules:

* Operate ONLY inside this workspace.
* Before applying changes or running commands, ensure the orchestrator has locked the workspace for your holder_id.
* Produce your changes as a unified diff/patch (or store files and a patch artifact).
* Provide evidence: list commands you ran and attach logs (as artifacts).
* Do not modify unrelated files. Keep changes minimal and scoped.
* When done, provide:

  1. a patch (unified diff)
  2. a short summary of changes
  3. test/build commands executed + results

Acceptance Criteria:

* `<ACCEPTANCE_CRITERIA_HERE>`

---

### Reviewer Agent: Prompt Template

> **Reviewer Prompt**
> You review changes produced in Workplane artifacts and diffs.

Inputs:

* workspace_id: `<WORKSPACE_ID>`
* diff artifact: `<ARTIFACT_ID>` (or request `workspace.diff`)
* logs/test artifacts: `<ARTIFACT_IDS>`

Checklist:

* Does the diff match acceptance criteria?
* Are there obvious bugs or security issues?
* Are tests/lint results provided and passing?
* Are changes minimal and consistent with repo conventions?
  Return a concise review and required fixes (if any).

---

## Example workflow: Budget app (two workspaces)

Once Milestones 3–4 are implemented, a typical run looks like:

1. Orchestrator creates two workspaces:

* Backend: endpoints + schema
* Frontend: UI + API integration

2. Each worker returns a patch + evidence logs

3. Orchestrator validates with `workspace.run` (tests/lint) and stores evidence

4. Orchestrator merges via your normal Git process (PRs can be added in Phase 2/3)

---

## Development

### Scripts

* `npm run dev` — start MCP stdio server
* `npm run build` — build to `dist/`
* `npm start` — run built server
* `npm run smoke` — basic end-to-end checks (server + core tools)

### Implementation notes

* Git commands use `spawn` with args (no shell interpolation)
* Persistence is `state.json` with atomic writes (v0.1)
* Safety checks prevent deleting anything outside `WORKPLANE_ROOT`

---

## Roadmap (high-level)

Phase 1 continues with:

* Milestone 3: `workspace.apply_patch` + `workspace.diff`
* Milestone 4: `workspace.run` + evidence artifacts
* Required example: `examples/two-workspaces-demo/`

Next phases:

* Policy gates (OpenAPI/schema/lint/test enforcement)
* CI integrations (Jenkins/GitHub Actions)
* Optional containerized workspaces

---

## Contributing

Contributions are welcome:

* Core tool implementations (`apply_patch`, `diff`, `run`)
* Windows compatibility improvements
* Better artifact backends
* Documentation + examples

See `CONTRIBUTING.md`.

---

## License

See `LICENSE`.

```
