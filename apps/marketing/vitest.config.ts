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
      css: {
        modules: {
          classNameStrategy: "non-scoped",
        },
      },
    },
  },
});
