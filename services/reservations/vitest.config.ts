import { defineVitestConfig } from "@mbe/config/vitest/node";

export default defineVitestConfig({
  include: ["src/**/*.test.ts"],
  coverage: {
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.test.ts", "src/index.ts"],
    thresholds: {
      lines: 60,
      branches: 40,
      functions: 60,
      statements: 60,
    },
  },
  extend: {
    test: {
      setupFiles: ["vitest.setup.ts"],
      testTimeout: 15000,
      env: {
        AUTH_BYPASS_IN_TESTS: "true",
      },
    },
  },
});
