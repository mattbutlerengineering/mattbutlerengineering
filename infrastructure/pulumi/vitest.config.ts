import { defineVitestConfig } from "@mbe/config/vitest/node";

export default defineVitestConfig({
  include: ["**/*.test.ts"],
  coverage: {
    include: ["**/*.ts"],
    exclude: ["**/*.test.ts", "**/node_modules/**"],
    thresholds: {
      lines: 95,
      branches: 55,
      functions: 95,
      statements: 95,
    },
  },
});
