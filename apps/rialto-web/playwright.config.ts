import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  snapshotPathTemplate: "{testDir}/screenshots/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
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
