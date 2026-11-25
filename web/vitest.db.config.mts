import { defineConfig } from "vitest/config";
import path from "node:path";

// Database tests: run the real migrations on a local Postgres (no Docker) and
// exercise the critical SQL functions (holds, approval, check-in, RLS).
// Requires a local Postgres; see README "Database tests".
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/db/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
