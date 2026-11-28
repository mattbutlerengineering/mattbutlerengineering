import { resolve } from "path";
import { defineVitestConfig } from "@mbe/config/vitest/react";
import thresholds from "./.coverage-thresholds.json" with { type: "json" };

export default defineVitestConfig({
  include: [
    "src/**/*.test.{ts,tsx}",
    "scripts/**/*.test.mjs",
    "vite.manualChunks.test.ts",
    "e2e/fixtures/**/*.test.ts",
    "e2e/journeys/**/*.test.ts",
    "e2e/workflow-coverage.test.ts",
    "e2e/ui-quality-invite-mock.test.ts",
    "e2e/launch-demo/**/*.test.ts",
  ],
  // Everything else runs under node with no setup file (#10158). A new `.test.ts` that
  // needs the DOM, the i18n runtime or the jest-dom matchers fails there ("document is
  // not defined"): name it here, or follow the component and hook conventions below.
  domInclude: [
    "src/**/*.test.tsx",
    "src/hooks/**/*.test.ts",
    "src/**/use*.test.ts",
    "src/constants/auth.test.ts",
    "src/pages/timeline-focus.test.ts",
    "src/lib/arrival-chime.test.ts",
    "src/lib/describe-api-error.test.ts",
    "src/lib/logo-palette-canvas.test.ts",
    "src/components/timeline/seat-guest.test.ts",
    "src/components/booking-widget/formatDepositCancellationTerms.test.ts",
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
      // Cold jsdom + rialto renders pass 5 s under load (gotchas.md, cold-cache test timeouts).
      testTimeout: 15000,
      setupFiles: ["./src/test/setup.ts"],
      css: {
        modules: {
          classNameStrategy: "non-scoped",
        },
      },
    },
  },
});
