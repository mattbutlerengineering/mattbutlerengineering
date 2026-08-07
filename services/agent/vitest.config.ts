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
      // buildApp() Fastify cold-start (plugins, Prisma, JSON schema compilation)
      // can exceed the 5s vitest default under CI's ~40-task concurrent run,
      // which any pnpm-lock.yaml change triggers by cache-busting every turbo
      // task (see .claude/rules/gotchas.md § CI). 18 test files here call
      // buildApp(). Same class as services/reservations and tools/cli.
      testTimeout: 15000,
      hookTimeout: 15000,
      env: {
        AUTH_AUTHORITY: "https://test.auth0.com/",
        AUTH_AUDIENCE: "https://api.test.com",
        AUTH_BYPASS_IN_TESTS: "true",
      },
    },
  },
});
