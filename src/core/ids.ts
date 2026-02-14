import crypto from "node:crypto";

export function newId(prefix: string) {
  // Keep it filesystem-friendly.
  return `${prefix}_${crypto.randomUUID()}`;
}

export function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

