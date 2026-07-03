import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["vitest.setup.ts"],
    testTimeout: 15000,
    // buildApp() Fastify cold-start in beforeEach can exceed the 10s default
    // hook timeout on a loaded CI runner (guests.test.ts flaked on Node 22).
    hookTimeout: 15000,
    env: {
      AUTH_BYPASS_IN_TESTS: "true",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: {
        lines: 60,
        branches: 40,
        functions: 60,
        statements: 60,
      },
    },
  },
});
