import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://localhost:3000",
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],

  webServer: {
    // CI serves the production build (`vite preview`) — marketing has no
    // backend proxy to keep warm, so there's no reason to pay for the dev
    // server's HMR overhead. Locally, `pnpm dev` gives fast iteration.
    // `pnpm exec vite preview` (not `pnpm preview --`) because the preview
    // script's own subcommand ("vite preview") means pnpm's `--` separator
    // gets forwarded as a literal `--` to vite's CLI parser, which then
    // treats --port/--strictPort as positional args and silently ignores them.
    command: process.env.CI
      ? "pnpm exec vite preview --port 3000 --strictPort"
      : "pnpm dev -- --port 3000 --strictPort",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
