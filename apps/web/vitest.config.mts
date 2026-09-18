import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(fileURLToPath(new URL(".", import.meta.url)), "src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      "**/.next/**",
      "**/coverage/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "e2e/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        branches: 60,
        functions: 60,
        lines: 60,
        statements: 60,
      },
    },
  },
});