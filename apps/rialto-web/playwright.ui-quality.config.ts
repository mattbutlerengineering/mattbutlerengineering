import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

/**
 * The ui-quality loop's capture run for rialto-web
 * (docs/features/ui-quality-loop/architecture.md § Components "Capture").
 *
 * Driven by the daily routine, never by CI: `ledger.mjs due` writes the plan,
 * `browser.mjs resolve` finds a Chromium, and this config serves the built
 * dist with `vite preview` so what gets judged is what ships. The base
 * config's default testMatch never collects `ui-quality.capture.ts`, so
 * `test:e2e` and the workflow-coverage test are unaffected.
 *
 *   UI_QUALITY_PLAN=$PWD/.ui-quality/plan.json UI_QUALITY_CHROMIUM=<path> \
 *     pnpm --dir apps/rialto-web exec playwright test --config playwright.ui-quality.config.ts
 */

const BASE_URL = "http://localhost:4176/rialto/";

// The webServer command is written from the repo root; pin its cwd.
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  testMatch: /ui-quality\.capture\.ts$/,
  // One worker, no retries: a capture is idempotent and the next fire is tomorrow.
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: "list",
  use: {
    ...baseConfig.use,
    baseURL: BASE_URL,
    launchOptions: { executablePath: process.env.UI_QUALITY_CHROMIUM || undefined },
  },
  webServer: {
    // `pnpm exec vite preview`, never `pnpm preview -- --port`: pnpm forwards
    // the `--` literally and vite then ignores the flags.
    command: "pnpm --dir apps/rialto-web exec vite preview --port 4176 --strictPort",
    cwd: REPO_ROOT,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
