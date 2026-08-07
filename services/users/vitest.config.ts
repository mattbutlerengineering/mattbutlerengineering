import { defineVitestConfig } from "@mbe/config/vitest/node";

export default defineVitestConfig({
  include: ["src/**/*.test.ts"],
  coverage: {
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.test.ts", "src/index.ts"],
    thresholds: {
      lines: 85,
      branches: 70,
      functions: 85,
      statements: 85,
    },
  },
  extend: {
    test: {
      // buildApp() Fastify cold-start (plugins, Prisma, JSON schema compilation)
      // can exceed the 5s vitest default under CI's ~40-task concurrent run,
      // which any pnpm-lock.yaml change triggers by cache-busting every turbo
      // task (see .claude/rules/gotchas.md § CI). 8 test files here call
      // buildApp(). Same class as services/reservations and tools/cli.
      testTimeout: 15000,
      hookTimeout: 15000,
    },
  },
});
