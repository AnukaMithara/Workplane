import path from "node:path";
import { getCommandDenylist } from "./config.js";

function normalizeExeName(name: string) {
  const base = name.trim().toLowerCase();
  // Strip common Windows extensions to make denylist matching consistent.
  return base.replace(/\.(exe|cmd|bat|com)$/i, "");
}

export function isDeniedCommand(command: string) {
  const deny = new Set(getCommandDenylist().map(normalizeExeName));
  const base = path.basename(command);
  const normalized = normalizeExeName(base);
  return deny.has(normalized);
}

export function tokenizeCommandLine(input: string): string[] | null {
  // Minimal argv tokenizer (no shell). Supports:
  // - whitespace splitting
  // - double quotes to include spaces
  // - backslash escaping of quotes inside quoted segments
  const s = input.trim();
  if (!s) return null;

  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "\\" && inQuotes && i + 1 < s.length && s[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (!inQuotes && /\s/.test(ch)) {
      if (cur.length) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += ch;
  }
  if (inQuotes) return null;
  if (cur.length) out.push(cur);
  return out.length ? out : null;
}
