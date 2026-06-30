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
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
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
