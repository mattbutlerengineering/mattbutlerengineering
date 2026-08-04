import { defineVitestConfig } from "@mbe/config/vitest/node";

export default defineVitestConfig({
  include: ["src/**/*.test.ts"],
  coverage: {
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.test.ts", "src/index.ts"],
    thresholds: {
      lines: 10,
      branches: 5,
      functions: 10,
      statements: 10,
    },
  },
  extend: {
    test: {
      // check-model's directive-mode action can exceed the 5s vitest default
      // under CI's ~40-task concurrent monorepo run (flaked on Node 22, main
      // run 30716101816, ec35b2cf — same class as reservations' buildApp()
      // cold-start timeout, see services/reservations/vitest.config.ts).
      testTimeout: 15000,
    },
  },
});
