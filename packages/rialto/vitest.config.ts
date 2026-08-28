import { defineVitestConfig } from "@mbe/config/vitest/react";

export default defineVitestConfig({
  include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
  coverage: {
    include: ["src/**/*.{ts,tsx}"],
    exclude: [
      "src/**/*.test.{ts,tsx}",
      "src/**/index.ts",
      "src/test/**",
      "src/**/*.stories.{ts,tsx}",
      "src/showcase/**",
    ],
    thresholds: {
      lines: 70,
      branches: 55,
      functions: 70,
      statements: 70,
    },
  },
  extend: {
    css: {
      modules: {
        localsConvention: "camelCase",
      },
    },
    test: {
      setupFiles: ["./src/test/setup.ts"],
      environmentMatchGlobs: [["scripts/**/*.test.ts", "node"]],
      // 15s, not the 5s vitest default: slowest test measured warm is 3.405s
      // (scripts/all-artifacts.drift.test.ts, a full introspectComponents()
      // parse) — only 1.47x under the default. A pnpm-lock.yaml touch
      // cold-busts every turbo task and roughly doubles durations (the
      // mechanism that red main at #3588), putting it at ~6.8s — past the
      // default, which matches this package's observed flake under
      // full-parallel local runs. 15s clears the warm measurement 4.4x and
      // the cold-doubled estimate 2.2x, on the repo's established 15s tier
      // (gotchas.md; tools/cli and service route-test precedent).
      testTimeout: 15000,
      css: {
        modules: {
          classNameStrategy: "non-scoped",
        },
      },
    },
  },
});
