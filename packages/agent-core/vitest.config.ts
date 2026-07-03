import { defineVitestConfig } from "@mbe/config/vitest/node";

export default defineVitestConfig({
  include: ["src/**/*.test.ts"],
  coverage: {
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.test.ts", "src/index.ts"],
    thresholds: {
      lines: 85,
      branches: 75,
      functions: 85,
      statements: 85,
    },
  },
});
