import { defineVitestConfig } from "@mbe/config/vitest/node";

/**
 * The edge worker is plain ESM JavaScript (no build step, no tsconfig), so it
 * uses a .mjs config like scripts/ rather than the .ts configs the TypeScript
 * packages use.
 */
export default defineVitestConfig({
  include: ["**/*.test.js"],
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
