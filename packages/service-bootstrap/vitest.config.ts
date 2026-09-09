import { defineVitestConfig } from "@mbe/config/vitest/node";

export default defineVitestConfig({
  coverage: {
    reporter: ["text", "json", "json-summary"],
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.test.ts"],
    thresholds: {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
  },
  extend: {
    test: {
      // 15s, not the 5s vitest default: slowest test measured warm is only
      // 0.177s (feature-flags-boundary), so no individual test is slow — but
      // this suite was still observed timing out under cold-cache
      // full-parallel `pnpm test` (~40 concurrent tasks starve the event
      // loop while create-service-app tests boot Fastify apps; suite import
      // alone is 3.77s). The default's 28x margin over the warm measurement
      // tipped over anyway, so headroom-vs-warm is the wrong axis here; 15s
      // is the repo's established tier for this failure class (gotchas.md)
      // and sits ~85x over the measured slowest test.
      testTimeout: 15000,
    },
  },
});
