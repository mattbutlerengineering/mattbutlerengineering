import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["**/*.ts"],
      exclude: ["**/*.test.ts", "**/node_modules/**"],
      thresholds: {
        lines: 95,
        branches: 55,
        functions: 95,
        statements: 95,
      },
    },
  },
});
