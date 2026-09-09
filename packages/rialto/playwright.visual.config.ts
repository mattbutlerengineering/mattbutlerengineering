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
