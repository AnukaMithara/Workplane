import fs from "node:fs";
import path from "node:path";

function normalizeForPrefix(p: string) {
  // Ensure consistent prefix checks (case-insensitive behavior varies by FS).
  // We still rely on resolved absolute paths to avoid traversal.
  return p.endsWith(path.sep) ? p : p + path.sep;
}

export function isPathWithinRoot(rootAbs: string, candidateAbs: string): boolean {
  const root = normalizeForPrefix(path.resolve(rootAbs));
  const cand = path.resolve(candidateAbs);
  return cand === path.resolve(rootAbs) || cand.startsWith(root);
}

export function assertPathWithinRoot(
  rootAbs: string,
  candidateAbs: string,
  label: string
) {
  if (!isPathWithinRoot(rootAbs, candidateAbs)) {
    throw new Error(
      `${label} resolves outside Workplane root. root=${path.resolve(
        rootAbs
      )} candidate=${path.resolve(candidateAbs)}`
    );
  }
}

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function safeResolveChild(rootAbs: string, ...parts: string[]) {
  const resolved = path.resolve(rootAbs, ...parts);
  assertPathWithinRoot(rootAbs, resolved, "Resolved path");
  return resolved;
}

