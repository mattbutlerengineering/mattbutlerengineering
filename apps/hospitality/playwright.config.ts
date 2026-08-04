import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // journeys/ runs against the LIVE site and writes production data — it is
  // driven only by .github/workflows/venue-journey.yml via
  // playwright.journey.config.ts, never by the PR-time E2E suite.
  testIgnore: ["**/fixtures/*.test.ts", "**/journeys/**"],
  outputDir: "./e2e/test-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // In CI: emit GitHub-native annotations AND a JSON file for failure-rate
  // computation (scripts/e2e-failure-rate.mjs reads playwright-results.json).
  reporter: process.env.CI
    ? [["github"], ["json", { outputFile: "playwright-results.json" }]]
    : "list",

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
        // Load auth session saved by auth.setup.ts — one ROPC call per run.
        storageState: "e2e/.auth/user.json",
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
