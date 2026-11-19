import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "./e2e/test-results",
  // Fails the run with a clear message when BASE_URL is absent: there is no default target.
  globalSetup: "./e2e/support/global-setup.ts",
  // Specs are independent: a failing check must not hide the others.
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  workers: process.env["CI"] ? 2 : undefined,
  timeout: 120_000,
  reporter: [["list"], ["./e2e/support/reporter.ts"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env["BASE_URL"],
    viewport: { width: 1280, height: 600 },
    actionTimeout: 15_000,
    screenshot: "off",
    video: "off",
    reducedMotion: "reduce",
  },
});
