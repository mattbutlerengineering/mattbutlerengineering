import { defineVitestConfig } from "@mbe/config/vitest/node";

/**
 * The edge worker is plain ESM JavaScript (no build step, no tsconfig), so it
 * uses a .mjs config like scripts/ rather than the .ts configs the TypeScript
 * packages use.
 */
export default defineVitestConfig({
  include: ["**/*.test.js"],
  extend: {
    test: {
      // vitest's 5s default is not enough for the /health/system fan-out under
      // CI's ~40-task concurrent monorepo run, which any pnpm-lock.yaml change
      // triggers by cache-busting every turbo task (see .claude/rules/gotchas.md
      // § CI). edge-router.test.js's "returns coarse health response without
      // auth token" timed out at 5000ms on #5626, a dependency bump that
      // touches no worker code. Same class as tools/cli, services/reservations,
      // services/agent and services/users.
      testTimeout: 15000,
    },
  },
  coverage: {
    include: ["**/*.js"],
    exclude: ["**/*.test.js", "**/node_modules/**", "**/dist/**"],
    // Floors set just under the suite's standing numbers at the time it was
    // first wired into CI: 91.5% lines, 81% branches, 95.3% functions,
    // 90.8% statements.
    thresholds: {
      lines: 88,
      branches: 78,
      functions: 92,
      statements: 88,
    },
  },
});
