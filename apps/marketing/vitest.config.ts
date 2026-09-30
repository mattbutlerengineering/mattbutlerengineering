import { defaultExclude } from "vitest/config";
import { resolve } from "path";
import { defineVitestConfig } from "@mbe/config/vitest/react";

export default defineVitestConfig({
  include: ["src/**/*.test.{ts,tsx}"],
  coverage: {
    include: ["src/**/*.ts", "src/**/*.tsx"],
    exclude: ["src/**/*.test.{ts,tsx}", "src/main.tsx", "src/vite-env.d.ts"],
    thresholds: {
      lines: 80,
    },
  },
  extend: {
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
        "@gen": resolve(__dirname, "../gen/src"),
        "@mbe/types": resolve(__dirname, "../../packages/types/src/index.ts"),
      },
    },
    test: {
      setupFiles: ["./src/setupTests.ts"],
      exclude: [...defaultExclude, "**/*.spec.ts"],
      // 15s, not the 5s vitest default: slowest test measured warm is only
      // 0.187s (HomePage heading hierarchy), but jsdom environment setup
      // dominates this suite (18.97s aggregate across 28 files) and under
      // cold-cache full-parallel `pnpm test` (~40 concurrent tasks — the
      // pnpm-lock.yaml turbo cache-bust class, gotchas.md) starvation was
      // observed pushing tests past the default despite an 80x warm margin.
      // 15s is the repo's established tier for this failure class.
      testTimeout: 15000,
      css: {
        modules: {
          classNameStrategy: "non-scoped",
        },
      },
    },
  },
});
