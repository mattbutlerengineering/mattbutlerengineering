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
      css: {
        modules: {
          classNameStrategy: "non-scoped",
        },
      },
    },
  },
});
