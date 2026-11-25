import { fileURLToPath } from "node:url";
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
      // Absolute: Stryker runs vitest from a sandbox copy and would resolve a
      // relative path against the wrong root (#9616).
      setupFiles: [fileURLToPath(new URL("./vitest.setup.ts", import.meta.url))],
      testTimeout: 15000,
      // buildApp() Fastify cold-start in beforeEach can exceed the 10s default
      // hook timeout on a loaded CI runner (guests.test.ts flaked on Node 22).
      hookTimeout: 15000,
      env: {
        AUTH_BYPASS_IN_TESTS: "true",
      },
    },
  },
});
