import { defineVitestConfig } from "@mbe/config/vitest/react";

export default defineVitestConfig({
  coverage: {
    include: ["src/**/*.{ts,tsx}"],
    exclude: ["src/**/*.test.{ts,tsx}", "src/**/index.ts"],
    thresholds: {
      lines: 65,
      branches: 55,
      functions: 65,
      statements: 65,
    },
  },
  extend: {
    test: {
      css: false,
    },
  },
});
