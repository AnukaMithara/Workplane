# Sample Project Prompts (copy/paste)

Use these prompts in your MCP host (Codex CLI, Cursor, Claude Code, etc.) to kick off a project with Workplane as the workspace control plane.

## 1) Budget Management App (Full-stack MVP)

```text
We are starting a new project using the Workplane workspace control plane.

Goal:
Build a Budget Management web app MVP.

Must-have features:
- User can add income and expenses
- Categories (Food, Bills, Transport, etc.)
- Monthly summary (total income, total expense, balance)
- Basic charts optional (nice-to-have)
- Simple authentication (email/password) if fast; otherwise local-only MVP

Tech constraints:
- Frontend: Next.js (TypeScript)
- Backend: Node.js (Express/Fastify) OR Python FastAPI (your choice)
- DB: SQLite or Postgres (choose simplest)
- API contract: define endpoints clearly before frontend integration

Quality bar:
- Lint + typecheck
- Minimum unit tests for core calculations
- A short README with setup steps

Repo:
Use the existing repo at: <repo_url_or_repo_path>

Orchestrator instructions:
1) Do an environment handshake and choose Normal or Fallback mode.
2) Create a task graph (max 8 tasks).
3) Provision isolated workspaces per task (frontend/backend/contracts).
4) Delegate to sub-agents with clear acceptance criteria.
5) Require patch/diff + evidence logs as artifacts.
6) Maintain a Project Journal artifact with workspace IDs, decisions, evidence.

Start with a small vertical slice:
- Create transaction model + one API endpoint + one UI screen.
```

---

## 2) Backend-only API Service (FastAPI example)

```text
We are starting a backend-only project using Workplane.

Goal:
Create a Budget API service with:
- CRUD for categories
- CRUD for transactions
- Monthly summary endpoint

Tech:
- Python FastAPI
- SQLite for MVP
- OpenAPI is the contract; keep it clean

Repo:
<repo_url_or_repo_path>

Instructions:
- Orchestrator: create tasks for schema, endpoints, tests, docs.
- Use one workspace per task.
- Require evidence logs for tests and lint.
- Record decisions in a Project Journal artifact.
```

---

## 3) Frontend-only UI (Next.js + mocked API)

```text
We are starting a frontend-only project using Workplane.

Goal:
Create a Budget UI with:
- Add transaction form
- Transactions list
- Monthly summary card
- Basic category filtering

Tech:
- Next.js + TypeScript
- Use a mocked API layer initially (local JSON or mock service)

Repo:
<repo_url_or_repo_path>

Instructions:
- Orchestrator: define UI pages/components and state model first.
- One workspace per task (layout/components/state).
- Require a patch/diff and screenshots are optional; logs are required if tests exist.
- Keep changes minimal and documented in the Project Journal artifact.
```

---

## 4) Quick Demo Prompt (shows Workplane concept fast)

```text
I want a 15-minute demo to understand Workplane.

Repo:
<repo_url_or_repo_path>

Demo goal:
- Create two isolated workspaces from the same repo
- Make a tiny change in each (different files)
- Capture diffs and store them as artifacts
- Close workspaces safely
- Maintain a Project Journal artifact documenting what happened

If patch/diff/run are unavailable, use fallback mode:
- sub-agents upload patches and logs via artifacts
- record all outputs in the journal
```

---

## 5) Multi-agent Workflow Prompt (explicit worker roles)

```text
We are using Workplane for a multi-agent workflow.

Goal:
Build <your project> with parallel agents.

Roles:
- Backend Worker: API + DB
- Frontend Worker: UI + integration
- Reviewer Worker: reviews diffs and checks acceptance criteria

Repo:
<repo_url_or_repo_path>

Instructions:
- Orchestrator: create 3-6 tasks max.
- Create one workspace per role/task.
- Assign each worker a workspace_id and holder identity.
- Enforce locks before mutation.
- Require: patch/diff + evidence logs as artifacts.
- Keep a Project Journal artifact with status updates.
```
