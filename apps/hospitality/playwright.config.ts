import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/fixtures/*.test.ts"],
  outputDir: "./e2e/test-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://localhost:3002/hospitality/",
    actionTimeout: 15_000,
    screenshot: "off",
    video: "off",
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "pnpm --filter @mbe/hospitality dev -- --port 3002 --strictPort",
    url: "http://localhost:3002/hospitality/",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
