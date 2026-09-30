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
      // MEASURED, not chosen: scripts/visual-tolerance-rule.mjs's verdict `ok`
      // over the three-leg Linux capture named below (visual-noise-floor.yml,
      // app=marketing). An absolute pixel budget, never a ratio; `threshold` is
      // explicit so Playwright's 0.2 default cannot hide a whole-page shift.
      // scripts/__tests__/visual-tolerance-guard.test.mjs reds if either value
      // moves without its provenance line; re-measure to re-tune.
      // noise-floor: run 36684428015 · ubuntu24 20260920.314.1 · playwright 1.63.0
      // noise-floor-values: threshold=0 maxDiffPixels=300
      threshold: 0,
      maxDiffPixels: 300,
    },
  },
  use: {
    ...baseConfig.use,
    baseURL: BASE_URL,
    // Rendered times must not depend on the runner's zone (FIXED_NOW is UTC).
    timezoneId: "UTC",
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
