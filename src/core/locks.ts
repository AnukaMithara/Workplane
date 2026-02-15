import { getWorkplanePaths } from "./config.js";
import { WorkplaneStore, type WorkspaceLockRecord } from "./store.js";

function nowIso() {
  return new Date().toISOString();
}

function toIso(ms: number) {
  return new Date(ms).toISOString();
}

function parseMs(iso: string) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function defaultTtlMs() {
  return 10 * 60 * 1000; // 10 minutes
}

async function getStore() {
  const paths = getWorkplanePaths();
  return new WorkplaneStore(paths.root, paths.stateFile);
}

async function readActiveLock(
  store: WorkplaneStore,
  workspace_id: string
): Promise<WorkspaceLockRecord | null> {
  const rec = await store.getLock(workspace_id);
  if (!rec) return null;
  const untilMs = parseMs(rec.locked_until);
  if (untilMs && untilMs <= Date.now()) {
    // Expired; clear.
    await store.deleteLock(workspace_id);
    return null;
  }
  return rec;
}

export async function workspaceLock(input: {
  workspace_id: string;
  holder_id: string;
  ttl_ms?: number;
}) {
  const store = await getStore();
  const now = Date.now();
  const ttl = input.ttl_ms && input.ttl_ms > 0 ? input.ttl_ms : defaultTtlMs();
  const locked_until = toIso(now + ttl);

  const existing = await readActiveLock(store, input.workspace_id);
  if (existing && existing.holder_id !== input.holder_id) {
    return {
      ok: false as const,
      error: {
        code: "LOCKED",
        message: "Workspace is locked by another holder.",
        details: {
          workspace_id: input.workspace_id,
          holder_id: existing.holder_id,
          locked_until: existing.locked_until,
        },
      },
    };
  }

  const ts = nowIso();
  const rec: WorkspaceLockRecord = {
    workspace_id: input.workspace_id,
    holder_id: input.holder_id,
    created_at: existing?.created_at ?? ts,
    updated_at: ts,
    locked_until,
  };

  await store.upsertLock(rec);

  return {
    ok: true as const,
    workspace_id: rec.workspace_id,
    holder_id: rec.holder_id,
    locked_until: rec.locked_until,
  };
}

export async function workspaceRelease(input: { workspace_id: string; holder_id: string }) {
  const store = await getStore();
  const existing = await readActiveLock(store, input.workspace_id);
  if (!existing) {
    return {
      ok: false as const,
      error: { code: "NOT_LOCKED", message: "Workspace is not locked." },
    };
  }
  if (existing.holder_id !== input.holder_id) {
    return {
      ok: false as const,
      error: {
        code: "LOCKED",
        message: "Workspace is locked by another holder.",
        details: {
          workspace_id: input.workspace_id,
          holder_id: existing.holder_id,
          locked_until: existing.locked_until,
        },
      },
    };
  }

  await store.deleteLock(input.workspace_id);
  return {
    ok: true as const,
    workspace_id: input.workspace_id,
    released_at: nowIso(),
  };
}

export async function checkWorkspaceMutationAllowed(input: {
  workspace_id: string;
  holder_id?: string;
}) {
  const store = await getStore();
  const existing = await readActiveLock(store, input.workspace_id);
  // Lock policy for all mutating operations (apply_patch/run/close):
  // - If holder_id is provided: require an active lock held by that holder.
  // - If holder_id is omitted: allow mutation only when currently unlocked.
  if (!existing) {
    if (input.holder_id) {
      return {
        ok: false as const,
        error: {
          code: "NOT_LOCKED",
          message: "Mutation requires an active lock held by holder_id.",
          details: { workspace_id: input.workspace_id, holder_id: input.holder_id },
        },
      };
    }
    return { ok: true as const };
  }

  if (!input.holder_id || existing.holder_id !== input.holder_id) {
    return {
      ok: false as const,
      error: {
        code: "LOCKED",
        message: "Workspace is locked by another holder.",
        details: {
          workspace_id: input.workspace_id,
          holder_id: existing.holder_id,
          locked_until: existing.locked_until,
        },
      },
    };
  }

  return { ok: true as const };
}
