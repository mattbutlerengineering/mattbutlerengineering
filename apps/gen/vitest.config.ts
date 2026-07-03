import { resolve } from "path";
import { defineVitestConfig } from "@mbe/config/vitest/react";

export default defineVitestConfig({
  include: ["src/**/*.test.{ts,tsx}"],
  coverage: {
    include: ["src/**/*.ts", "src/**/*.tsx"],
    exclude: ["src/**/*.test.{ts,tsx}", "src/main.tsx"],
    thresholds: {
      lines: 70,
      branches: 55,
      functions: 70,
      statements: 70,
    },
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
      css: {
        modules: {
          classNameStrategy: "non-scoped",
        },
      },
    },
  },
});
