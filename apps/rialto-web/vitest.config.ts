import { defaultExclude } from "vitest/config";
import { resolve } from "path";
import { defineVitestConfig } from "@mbe/config/vitest/react";
import { resolveRialtoTokenCount } from "./token-count.config";
import { resolveRialtoComponentCount } from "./component-count.config";

export default defineVitestConfig({
  // e2e/workflow-coverage.test.ts is a plain vitest test (not a Playwright
  // spec), listed by exact path rather than a glob — e2e/a11y.test.ts is a
  // pre-existing Playwright-authored *.test.ts file and would break under
  // vitest if a broader glob picked it up too.
  include: [
    "src/**/*.test.{ts,tsx}",
    "e2e/workflow-coverage.test.ts",
    "e2e/noise-floor-coverage.test.ts",
    "e2e/eager-route-manifest.test.ts",
    "e2e/build-script.test.ts",
    "e2e/theme-color-meta.test.ts",
  ],
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
      __RIALTO_COMPONENT_COUNT__: JSON.stringify(resolveRialtoComponentCount()),
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
      // 15s, not the 5s vitest default: src/data/page-registry.test.ts's
      // "non-comingSoon entries resolve to an object with a default export"
      // (and its siblings) dynamically import every showcase page in one
      // test, measured at ~1.7s warm and isolated — comfortably under 5s
      // locally, but nightly-compliance's `pnpm test` runs cold via turbo
      // with ~50 concurrent test tasks (the same full-parallel contention
      // documented at packages/rialto/vitest.config.ts, which hit this
      // exact wall and was fixed the same way). Recurring nightly-compliance
      // drift issues (#5102, #5203, #5243, #5302, #5334, #5360, #5494) never
      // reproduced under `ci.yml`'s warmer/less-contended test job — only
      // under nightly-compliance's cold full-repo run — which matches a
      // timeout tipping over under contention rather than a real assertion
      // failure. 15s matches the repo's established tier for this class.
      testTimeout: 15000,
      css: {
        modules: {
          classNameStrategy: "non-scoped",
        },
      },
    },
  },
});
