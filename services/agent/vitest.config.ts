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
      env: {
        AUTH_AUTHORITY: "https://test.auth0.com/",
        AUTH_AUDIENCE: "https://api.test.com",
        AUTH_BYPASS_IN_TESTS: "true",
      },
    },
  },
});
