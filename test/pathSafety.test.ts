import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertSafePathSegment,
  isPathWithinRoot,
  safeResolveChild,
} from "../dist/core/pathSafety.js";

describe("pathSafety", () => {
  it("assertSafePathSegment allows conservative ids", () => {
    expect(() => assertSafePathSegment("ws_123", "id")).not.toThrow();
    expect(() => assertSafePathSegment("art.1-2_3", "id")).not.toThrow();
  });

  it("assertSafePathSegment rejects traversal and separators", () => {
    expect(() => assertSafePathSegment("", "id")).toThrow();
    expect(() => assertSafePathSegment("a/b", "id")).toThrow();
    expect(() => assertSafePathSegment("a\\b", "id")).toThrow();
    expect(() => assertSafePathSegment("..", "id")).toThrow();
    expect(() => assertSafePathSegment("a..b", "id")).toThrow();
  });

  it("isPathWithinRoot handles root and descendants", () => {
    const root = path.resolve("workplane-root");
    expect(isPathWithinRoot(root, root)).toBe(true);
    expect(isPathWithinRoot(root, path.join(root, "child"))).toBe(true);
    expect(isPathWithinRoot(root, path.resolve("other-root"))).toBe(false);
  });

  it("safeResolveChild prevents escaping the root", () => {
    const root = path.resolve("workplane-root");
    expect(() => safeResolveChild(root, "a", "b")).not.toThrow();
    expect(() => safeResolveChild(root, "..", "other")).toThrow();
  });
});
