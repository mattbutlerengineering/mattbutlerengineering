import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Rialto visual regression tests.
 *
 * Each Storybook story is screenshotted against committed baselines
 * in src/test/visual/__screenshots__/. Pixel-diff tolerance: 1%.
 *
 * Run tests:
 *   pnpm --dir packages/rialto test:visual
 *
 * Refresh baselines after intentional visual changes:
 *   pnpm --dir packages/rialto test:visual:update
 */
export default defineConfig({
  testDir: "./src/test/visual",
  // Restrict to *.spec.ts — this dir also holds *.test.ts vitest unit tests
  // (e.g. story-url.test.ts) that must NOT be collected as Playwright tests.
  testMatch: "**/*.spec.ts",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  // Failure output (*-actual.png / *-diff.png) must land inside
  // __screenshots__/ because the rialto-visual workflow uploads only that
  // directory as its failure artifact — CI actuals are what baselines get
  // regenerated from (#3305). "test-results" is gitignored at any depth.
  outputDir: "./src/test/visual/__screenshots__/test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  expect: {
    toHaveScreenshot: {
      // `threshold` is declared explicitly because omitting it inherits
      // Playwright's per-pixel default of 0.2, which filters pixels BEFORE the
      // budget below is ever consulted. At that default a uniform +36/255
      // brightening of every pixel of every committed baseline counted ZERO
      // differing pixels (measured 2026-08-28 with the installed comparator;
      // at threshold 0.15 and above the filtered count is literally 0 on all
      // 53 baselines, so no budget value could ever have failed). Same defect
      // class the rialto-web suite fixed in
      // docs/fixes/visual-tolerance-threshold/ — that run named this suite's
      // identical gap and left it untaken.
      // scripts/__tests__/rialto-visual-defect-reproduction.test.mjs holds the
      // reproduction permanently against whatever this file declares.
      //
      // The VALUE 0.01 is PROVISIONAL AND UNMEASURED. No noise-floor
      // measurement exists for this suite — deliberately no `// noise-floor:`
      // provenance line here, because that convention marks measured values
      // only. 0.01 is the loosest point of the standard sweep at which the
      // +36/255 reproduction stays visible on every baseline the ratio budget
      // can see it on (49 of 53; the other 4 are sparse-on-white and invisible
      // under a ratio budget at ANY threshold — see KNOWN_RATIO_BUDGET_BLIND
      // in the reproduction test). To replace both values with measured ones:
      // dispatch .github/workflows/rialto-visual-noise-floor.yml and apply
      // scripts/visual-tolerance-rule.mjs's recommendation.
      threshold: 0.01,
      // Unchanged since before this fix, and equally unmeasured. A ratio
      // budget scales with canvas size, which is how sparse baselines buy the
      // blind spot above — the measured re-tune should revisit the budget's
      // form, not just its value (#4450 → #4496 history in
      // apps/rialto-web/playwright.config.ts).
      maxDiffPixelRatio: 0.01,
    },
  },

  use: {
    baseURL: "http://localhost:6006",
    screenshot: "off",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  webServer: {
    command: "pnpm exec storybook dev -p 6006 --no-open",
    url: "http://localhost:6006",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
