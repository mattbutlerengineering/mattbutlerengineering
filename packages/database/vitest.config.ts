import { defineVitestConfig } from "@mbe/config/vitest/node";

export default defineVitestConfig({
  coverage: {
    reporter: ["text", "json", "json-summary"],
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.test.ts"],
    thresholds: {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
  },
});
