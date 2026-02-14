import fs from "node:fs/promises";
import path from "node:path";
import { getWorkplanePaths } from "./config.js";
import { newId } from "./ids.js";
import {
  assertPathWithinRoot,
  assertSafePathSegment,
  ensureDir,
  safeResolveChild,
} from "./pathSafety.js";
import { WorkplaneStore, type ArtifactRecord, type ArtifactType } from "./store.js";

function nowIso() {
  return new Date().toISOString();
}

async function pathExists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch (err: any) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

function decodeBase64ToBuffer(b64: string) {
  try {
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

export type ArtifactPutInput = {
  workspace_id: string;
  type: ArtifactType;
  name?: string;
  content?: string;
  content_base64?: string;
  content_type?: string;
  metadata?: Record<string, unknown>;
};

export async function artifactPut(input: ArtifactPutInput) {
  const paths = getWorkplanePaths();
  const store = new WorkplaneStore(paths.root, paths.stateFile);

  assertSafePathSegment(input.workspace_id, "workspace_id");
  const ws = await store.getWorkspace(input.workspace_id);
  if (!ws) {
    return {
      ok: false as const,
      error: { code: "NOT_FOUND", message: "Unknown workspace_id." },
    };
  }

  ensureDir(paths.artifactsDir);
  const wsArtifactsDir = safeResolveChild(paths.artifactsDir, input.workspace_id);
  ensureDir(wsArtifactsDir);

  const artifact_id = newId("art");
  assertSafePathSegment(artifact_id, "artifact_id");

  if (!input.content && !input.content_base64) {
    return {
      ok: false as const,
      error: {
        code: "INVALID_INPUT",
        message: "Either content or content_base64 is required.",
      },
    };
  }
  if (input.content && input.content_base64) {
    return {
      ok: false as const,
      error: {
        code: "INVALID_INPUT",
        message: "Provide only one of content or content_base64.",
      },
    };
  }

  let bytes: Buffer;
  let ext = ".txt";
  if (typeof input.content === "string") {
    bytes = Buffer.from(input.content, "utf8");
    ext = ".txt";
  } else {
    const buf = decodeBase64ToBuffer(input.content_base64 ?? "");
    if (!buf) {
      return {
        ok: false as const,
        error: { code: "INVALID_INPUT", message: "Invalid base64 content." },
      };
    }
    bytes = buf;
    ext = ".bin";
  }

  const fileName = `${artifact_id}${ext}`;
  const absPath = safeResolveChild(wsArtifactsDir, fileName);
  assertPathWithinRoot(paths.root, absPath, "Artifact path");

  await fs.writeFile(absPath, bytes);

  const rel_path = path.relative(paths.root, absPath);
  const created_at = nowIso();
  const rec: ArtifactRecord = {
    artifact_id,
    workspace_id: input.workspace_id,
    type: input.type,
    name: input.name,
    content_type: input.content_type,
    rel_path,
    size_bytes: bytes.byteLength,
    created_at,
    metadata: input.metadata,
  };
  await store.upsertArtifact(rec);

  return {
    ok: true as const,
    workspace_id: input.workspace_id,
    artifact_id,
    stored_at: created_at,
  };
}

export async function artifactGet(input: {
  workspace_id: string;
  artifact_id: string;
}) {
  const paths = getWorkplanePaths();
  const store = new WorkplaneStore(paths.root, paths.stateFile);

  assertSafePathSegment(input.workspace_id, "workspace_id");
  const ws = await store.getWorkspace(input.workspace_id);
  if (!ws) {
    return {
      ok: false as const,
      error: { code: "NOT_FOUND", message: "Unknown workspace_id." },
    };
  }

  const rec = await store.getArtifact(input.workspace_id, input.artifact_id);
  if (!rec) {
    return {
      ok: false as const,
      error: { code: "NOT_FOUND", message: "Unknown artifact_id." },
    };
  }

  const absPath = safeResolveChild(paths.root, rec.rel_path);
  assertPathWithinRoot(paths.root, absPath, "Artifact path");

  const exists = await pathExists(absPath);
  if (!exists) {
    return {
      ok: false as const,
      error: {
        code: "MISSING_ARTIFACT_FILE",
        message: "Artifact metadata exists but file is missing on disk.",
      },
    };
  }

  const stat = await fs.stat(absPath);
  const maxBytes = 1_000_000; // 1MB
  if (stat.size > maxBytes) {
    return {
      ok: false as const,
      error: {
        code: "TOO_LARGE",
        message: "Artifact content is too large to return inline.",
        details: { size_bytes: stat.size, max_bytes: maxBytes, rel_path: rec.rel_path },
      },
    };
  }

  const buf = await fs.readFile(absPath);
  const isText = absPath.endsWith(".txt");
  const content = isText ? buf.toString("utf8") : undefined;
  const content_base64 = isText ? undefined : buf.toString("base64");

  return {
    ok: true as const,
    artifact: {
      artifact_id: rec.artifact_id,
      type: rec.type,
      name: rec.name,
      content,
      content_base64,
      content_type: rec.content_type,
      created_at: rec.created_at,
    },
  };
}

export async function artifactList(input: { workspace_id: string; type?: string }) {
  const paths = getWorkplanePaths();
  const store = new WorkplaneStore(paths.root, paths.stateFile);

  assertSafePathSegment(input.workspace_id, "workspace_id");
  const ws = await store.getWorkspace(input.workspace_id);
  if (!ws) {
    return {
      ok: false as const,
      error: { code: "NOT_FOUND", message: "Unknown workspace_id." },
    };
  }

  const artifacts = await store.listArtifacts({
    workspace_id: input.workspace_id,
    type: input.type,
  });

  return {
    ok: true as const,
    artifacts: artifacts.map((a) => ({
      artifact_id: a.artifact_id,
      type: a.type,
      name: a.name,
      created_at: a.created_at,
    })),
  };
}

