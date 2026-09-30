import { defineConfig, devices } from "@playwright/test";
import baseConfig from "./playwright.config";

/**
 * Hospitality's visual regression floor
 * (docs/features/ui-quality-loop/architecture.md § Components "VR floor").
 *
 * Collects only e2e/visual.spec.ts (the base config ignores it). Keeps the
 * base config's `setup` project — auth.setup.ts signs the E2E user in once and
 * stores the session — so the `auth0` pages are screenshotted signed in; CI
 * holds that credential the way e2e.yml does. The API is mocked per test
 * (`mockedPage`). Baselines are Linux-only, committed from the noise-floor
 * workflow's `visual-actuals-replica-a` artifact.
 *
 *   E2E_AUTH0_…/E2E_AUTH_… + VITE_AUTH_… set, then
 *   pnpm --dir apps/hospitality exec playwright test --config playwright.visual.config.ts
 */
export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  testMatch: /visual\.spec\.ts$/,
  snapshotPathTemplate: "{testDir}/screenshots/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      // PROVISIONAL until measured: replaced by scripts/visual-tolerance-rule.mjs's
      // verdict over a visual-noise-floor.yml run with app=hospitality, with its
      // provenance lines (the rialto-web playwright.config.ts pattern).
      threshold: 0,
      maxDiffPixels: 0,
    },
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      testMatch: /visual\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
});
