import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["vitest/**/*.test.ts", "eslint/**/*.test.ts"],
    reporters: ["default", "junit"],
    outputFile: { junit: "test-results/junit.xml" },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["vitest/*.js"],
      exclude: ["vitest/*.test.ts", "vitest/*.d.ts"],
      thresholds: {
        lines: 90,
        branches: 80,
        functions: 90,
        statements: 90,
      },
    },
  },
});
