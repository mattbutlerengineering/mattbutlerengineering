import { defineVitestConfig } from "@mbe/config/vitest/node";

export default defineVitestConfig({
  globals: false,
  include: ["src/**/*.test.ts"],
  coverage: {
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.test.ts", "src/index.ts", "src/cli.ts"],
    thresholds: {
      lines: 90,
      branches: 80,
      functions: 90,
      statements: 90,
    },
  },
});
