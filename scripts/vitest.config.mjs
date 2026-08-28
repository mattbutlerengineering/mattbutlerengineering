import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    // 60s, not 15s: visual-defect-reproduction.test.mjs runs 49 whole-image
    // pixel loops, and v8 coverage costs 8.3x over that shape (measured: 3859ms
    // -> 32123ms for the same file). Slowest single test in CI is 7.63s, but a
    // pnpm-lock.yaml touch cold-busts every turbo task and roughly doubles
    // durations — the mechanism that red main at #3588 and via deposits.test.ts.
    // 1.97x headroom was not enough to survive that; this is ~7.9x.
    testTimeout: 60000,
    include: ["scripts/__tests__/**/*.test.mjs"],
    reporters: ["default", "junit"],
    outputFile: { junit: "scripts/test-results/junit.xml" },
    coverage: {
      provider: "v8",
      reportsDirectory: "scripts/coverage",
      reporter: ["text", "json", "html"],
      include: ["scripts/**/*.mjs", "scripts/**/*.js"],
      exclude: ["scripts/__tests__/**", "scripts/coverage/**"],
    },
  },
});
