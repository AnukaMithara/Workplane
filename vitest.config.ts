import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks", // Isolate `process.env` (WORKPLANE_ROOT / denylist) between test files.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
