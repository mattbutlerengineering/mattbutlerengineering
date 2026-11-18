import { defineVitestConfig } from "@mbe/config/vitest/react";

export default defineVitestConfig({
  include: ["src/**/*.test.{ts,tsx}"],
  coverage: {
    include: ["src/**/*.ts", "src/**/*.tsx"],
    exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/index.ts", "src/test-setup.ts"],
    thresholds: { lines: 85, branches: 75, functions: 85, statements: 85 },
  },
  extend: {
    test: {
      // Cold jsdom renders pass vitest's 5 s default under load (gotchas.md, cold-cache timeouts).
      testTimeout: 15000,
      setupFiles: ["./src/test-setup.ts"],
      css: { modules: { classNameStrategy: "non-scoped" } },
    },
  },
});
