import { defineVitestConfig } from "@mbe/config/vitest/node";

export default defineVitestConfig({
  globals: false,
  include: ["src/**/*.test.ts"],
  coverage: {
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
    thresholds: {
      lines: 80,
      branches: 70,
      functions: 80,
      statements: 80,
    },
  },
  // The guard boots three Fastify apps and drives the whole @mbe/api-client
  // surface. Adding a workspace package changes pnpm-lock.yaml — a turbo
  // `globalDependencies` entry — so this run's CI executes every task cold and
  // fully parallel, and that load has twice tipped default-5s suites over and
  // broken main (.claude/rules/gotchas.md § CI). Boot costs here are real, not
  // marginal, so the raise is not speculative.
  extend: { test: { testTimeout: 30_000, hookTimeout: 30_000 } },
});
