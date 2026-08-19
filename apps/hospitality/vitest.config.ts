import { resolve } from "path";
import { defineVitestConfig } from "@mbe/config/vitest/react";
import thresholds from "./.coverage-thresholds.json" with { type: "json" };

export default defineVitestConfig({
  include: [
    "src/**/*.test.{ts,tsx}",
    "e2e/fixtures/**/*.test.ts",
    "e2e/journeys/**/*.test.ts",
    "e2e/workflow-coverage.test.ts",
  ],
  coverage: {
    include: ["src/**/*.ts", "src/**/*.tsx"],
    exclude: ["src/**/*.test.{ts,tsx}", "src/index.ts", "src/vite-env.d.ts"],
    thresholds,
  },
  extend: {
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
    css: {
      modules: {
        localsConvention: "camelCase",
      },
    },
    test: {
      setupFiles: ["./src/test/setup.ts"],
      css: {
        modules: {
          classNameStrategy: "non-scoped",
        },
      },
    },
  },
});
