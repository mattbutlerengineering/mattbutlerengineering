import { defaultExclude } from "vitest/config";
import { resolve } from "path";
import { defineVitestConfig } from "@mbe/config/vitest/react";
import { resolveRialtoTokenCount } from "./token-count.config";

export default defineVitestConfig({
  // e2e/workflow-coverage.test.ts is a plain vitest test (not a Playwright
  // spec), listed by exact path rather than a glob — e2e/a11y.test.ts is a
  // pre-existing Playwright-authored *.test.ts file and would break under
  // vitest if a broader glob picked it up too.
  include: ["src/**/*.test.{ts,tsx}", "e2e/workflow-coverage.test.ts"],
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
    define: {
      __RIALTO_TOKEN_COUNT__: JSON.stringify(resolveRialtoTokenCount()),
    },
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
