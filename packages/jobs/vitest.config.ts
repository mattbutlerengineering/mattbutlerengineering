import { defineVitestConfig } from "@mbe/config/vitest/node";

export default defineVitestConfig({
  include: ["src/**/*.test.ts"],
  coverage: {
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.test.ts", "src/index.ts"],
    thresholds: {
      lines: 80,
      branches: 75,
      functions: 80,
      statements: 80,
    },
  },
});
