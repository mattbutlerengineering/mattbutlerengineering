import { defineVitestConfig } from "@mbe/config/vitest/node";

export default defineVitestConfig({
  include: ["src/**/*.test.ts"],
  coverage: {
    include: ["src/tools/**/*.ts"],
    exclude: ["**/*.test.ts"],
    thresholds: {
      lines: 80,
      functions: 80,
      statements: 80,
    },
  },
});
