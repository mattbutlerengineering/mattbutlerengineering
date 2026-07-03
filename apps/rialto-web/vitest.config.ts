import { defaultExclude } from "vitest/config";
import { resolve } from "path";
import { defineVitestConfig } from "@mbe/config/vitest/react";

export default defineVitestConfig({
  include: ["src/**/*.test.{ts,tsx}"],
  coverage: {
    include: ["src/**/*.ts", "src/**/*.tsx"],
    exclude: [
      "src/**/*.test.{ts,tsx}",
      "src/main.tsx",
      "src/vite-env.d.ts",
      "src/routes.tsx",
      "src/pages/**", // Exclude static documentation pages
    ],
    thresholds: {
      lines: 80,
      branches: 65,
      functions: 80,
      statements: 80,
    },
  },
  extend: {
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
        "@mbe/types": resolve(__dirname, "../../packages/types/src/index.ts"),
      },
    },
    css: {
      modules: {
        localsConvention: "camelCase",
      },
    },
    test: {
      setupFiles: ["./src/setupTests.ts"],
      exclude: [...defaultExclude, "**/*.spec.ts"],
      css: {
        modules: {
          classNameStrategy: "non-scoped",
        },
      },
    },
  },
});
