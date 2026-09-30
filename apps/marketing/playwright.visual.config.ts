import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

/**
 * Marketing's visual regression floor
 * (docs/features/ui-quality-loop/architecture.md § Components "VR floor").
 *
 * Collects only e2e/visual.spec.ts (the base config ignores it) and serves the
 * built dist with `vite preview`, so what is screenshotted is what ships.
 * Baselines are Linux-only, committed from the noise-floor workflow's
 * `visual-actuals-replica-a` artifact.
 *
 *   pnpm --dir apps/marketing exec vite build
 *   pnpm --dir apps/marketing exec playwright test --config playwright.visual.config.ts
 */

const BASE_URL = "http://localhost:4176/";

export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  testMatch: /visual\.spec\.ts$/,
  snapshotPathTemplate: "{testDir}/screenshots/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      // PROVISIONAL until measured: replaced by scripts/visual-tolerance-rule.mjs's
      // verdict over a visual-noise-floor.yml run with app=marketing, with its
      // provenance lines (the rialto-web playwright.config.ts pattern).
      threshold: 0,
      maxDiffPixels: 0,
    },
  },
  use: {
    ...baseConfig.use,
    baseURL: BASE_URL,
    screenshot: "off",
    video: "off",
  },
  webServer: {
    // `pnpm exec vite preview`, never `pnpm preview -- --port`: pnpm forwards
    // the `--` literally and vite then ignores the flags.
    command: "pnpm exec vite preview --port 4176 --strictPort",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
