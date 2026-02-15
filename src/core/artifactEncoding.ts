export function decodeBase64ToBuffer(b64: string): Buffer | null {
  // Node's Buffer.from(..., "base64") is permissive (it may ignore invalid chars).
  // We want strict-ish validation so callers can rely on INVALID_INPUT.
  const clean = b64.trim().replace(/\s+/g, "");
  if (clean.length === 0) return Buffer.alloc(0);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;

  // Base64 length mod 4 cannot be 1. Padding (if present) must make length a multiple of 4.
  const mod = clean.length % 4;
  if (mod === 1) return null;
  if (clean.includes("=") && mod !== 0) return null;

  const buf = Buffer.from(clean, "base64");
  const normalize = (s: string) => s.replace(/=+$/g, "");
  if (normalize(buf.toString("base64")) !== normalize(clean)) return null;
  return buf;
}
