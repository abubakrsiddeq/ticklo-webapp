import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests (pure TypeScript: QR tokens, money/time formatting, validation).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
