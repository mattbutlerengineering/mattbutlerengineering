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
 * Serves a `vite build` through `vite preview`, like marketing's and
 * rialto-web's visual configs: the base config's dev server can re-optimise
 * dependencies cold and reload mid-test, and it is not what ships. Same port
 * as the base config, so the `VITE_API_URL`/`VITE_AUTH_REDIRECT_URI` values
 * e2e.yml bakes in stay valid; a dev server already on it fails the run rather
 * than being screenshotted.
 *
 *   E2E_AUTH0_…/E2E_AUTH_… + VITE_AUTH_… + VITE_API_URL set, then
 *   pnpm --dir apps/hospitality exec playwright test --config playwright.visual.config.ts
 */
const BASE_URL = "http://localhost:3002/hospitality/";

// api-mocks.ts dates its fixtures on the Node side (`localDay()`/`atLocal()`),
// so the workers' zone must match the browser's pinned `timezoneId` below or
// a reservation's wall clock shifts by the runner's offset. Workers inherit it.
process.env.TZ = "UTC";

export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  testMatch: /visual\.spec\.ts$/,
  snapshotPathTemplate: "{testDir}/screenshots/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      // MEASURED, not chosen: scripts/visual-tolerance-rule.mjs's verdict `ok`
      // over the three-leg Linux capture named below (visual-noise-floor.yml,
      // app=hospitality). An absolute pixel budget, never a ratio; `threshold` is
      // explicit so Playwright's 0.2 default cannot hide a whole-page shift.
      // scripts/__tests__/visual-tolerance-guard.test.mjs reds if either value
      // moves without its provenance line; re-measure to re-tune.
      // noise-floor: run 36782403630 · ubuntu24 20260927.320.1 · playwright 1.63.0
      // noise-floor-values: threshold=0 maxDiffPixels=202
      threshold: 0,
      maxDiffPixels: 202,
    },
  },
  use: {
    ...baseConfig.use,
    baseURL: BASE_URL,
    // Rendered times must not depend on the runner's zone (FIXED_NOW is UTC).
    timezoneId: "UTC",
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
  webServer: {
    // The build bakes in the VITE_* env this process holds. `pnpm exec vite
    // preview`, never `pnpm preview -- --port`: pnpm forwards the `--`
    // literally and vite then ignores the flags.
    command: "pnpm exec vite build && pnpm exec vite preview --port 3002 --strictPort",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
