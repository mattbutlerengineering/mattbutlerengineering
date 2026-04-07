import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  globalTimeout: 120_000, // 2 minute total budget
  retries: 1,
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? "https://mattbutlerengineering.com",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    {
      name: "smoke",
      use: { browserName: "chromium" },
    },
  ],
});
