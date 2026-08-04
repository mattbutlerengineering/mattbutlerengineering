import { defineConfig, devices } from "@playwright/test";

/**
 * Config for the daily synthetic venue-onboarding journey against the LIVE
 * site (.github/workflows/venue-journey.yml).
 *
 * Deliberately separate from playwright.config.ts:
 *   - no `webServer` — nothing is built or served, we hit production;
 *   - no `setup` project — the journey does its own ROPC sign-in because it
 *     also needs the raw access token for API sweep/cleanup;
 *   - `retries: 0` — a retry would re-run venue creation against prod.
 * The PR-time suite excludes ./e2e/journeys via its own `testIgnore`.
 */
export default defineConfig({
  testDir: "./e2e/journeys",
  testMatch: /.*\.spec\.ts/,
  outputDir: "./e2e/test-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  // Every wait in this journey crosses the public internet and can hit a cold
  // prod API (the dashboard's stats query gates the readiness tiles behind
  // Skeletons). `actionTimeout` does NOT cover web-first assertions, so the
  // 5 s expect default would be the flakiest wait in the run without this.
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env["JOURNEY_BASE_URL"] ?? "https://mattbutlerengineering.com/hospitality/",
    actionTimeout: 15_000,
    screenshot: "off",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
    },
  ],
});
