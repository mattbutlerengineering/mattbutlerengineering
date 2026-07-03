import { defineVitestConfig } from "@mbe/config/vitest/node";

export default defineVitestConfig({
  globals: false,
  include: ["src/**/*.test.ts"],
  coverage: {
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.test.ts", "src/index.ts"],
    thresholds: {
      lines: 95,
      branches: 85,
      functions: 95,
      statements: 95,
    },
  },
});
