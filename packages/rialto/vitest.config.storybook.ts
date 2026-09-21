import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";

const dirname =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/writing-tests/integrations/vitest-addon
export default defineConfig({
  resolve: {
    alias: {
      // In Storybook 10, @storybook/test was folded into the storybook package
      "@storybook/test": "storybook/test",
    },
  },
  test: {
    reporters: ["default", "junit"],
    outputFile: { junit: "test-results/junit-storybook.xml" },
    projects: [
      {
        extends: true,
        plugins: [storybookTest({ configDir: path.join(dirname, ".storybook") })],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            // Pinned, not inherited. `browser.viewport` has documented the same
            // 414x896 default since vitest 4, but only vitest 5 actually sizes
            // the test iframe to it — so the bump silently moved every story
            // under rialto's `(max-width: 479px)` mobile breakpoint. Measured
            // on 5.0.1: `TapeChart > Overlaps` failed 4/4 runs with
            // `Found multiple elements with the role "button"`, because the
            // mobile branch (`TapeChartMobileStack`) renders one row per night
            // of a stay instead of one bar per reservation; the same story
            // passed 4/4 on 4.1.11 and passes again here. Stories assert
            // desktop layout, so state the desktop viewport explicitly rather
            // than depend on what the runner happens to apply.
            viewport: { width: 1280, height: 720 },
            provider: playwright({}),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
