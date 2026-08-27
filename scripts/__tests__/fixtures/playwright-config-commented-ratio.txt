import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // csp.spec.ts belongs to playwright.csp.config.ts, which serves the built
  // output under the real production CSP. Running it here would point it at a
  // dev server that sets no policy at all — a green run proving nothing.
  testIgnore: "**/csp.spec.ts",
  outputDir: "./e2e/test-results",
  snapshotPathTemplate: "{testDir}/screenshots/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  expect: {
    toHaveScreenshot: {
      // Absolute pixel budget, not a ratio (#4450). A ratio scales with
      // canvas size, so a large sparse section (e.g. tape-chart-stress) buys
      // the most slack exactly where a whole-row layout change is easiest to
      // hide — a 45px row-height growth on that section passed under
      // maxDiffPixelRatio: 0.01 (~8.4k px budget) because most of the diff
      // washed out against empty background. 300px absorbs the ±1px
      // anti-aliasing churn from the harness's fixed Dialog/Drawer overlays
      // while staying far below the pixel count any real layout shift
      // produces.
      maxDiffPixels: 300,
    },
  },

  use: {
    baseURL: "http://localhost:5173/rialto/",
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
    command: "pnpm --filter @mbe/rialto-web dev -- --port 5173 --strictPort",
    url: "http://localhost:5173/rialto/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
