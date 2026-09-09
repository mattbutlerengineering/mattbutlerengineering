import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // csp.spec.ts belongs to playwright.csp.config.ts, which serves the built
  // output under the real production CSP. Running it here would point it at a
  // dev server that sets no policy at all — a green run proving nothing.
  testIgnore: "**/csp.spec.ts",
  outputDir: "./e2e/test-results",
  snapshotPathTemplate: "{testDir}/screenshots/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  expect: {
    toHaveScreenshot: {
      // Absolute pixel budget, not a ratio (#4450). A ratio scales with
      // canvas size, so a large sparse section (e.g. tape-chart-stress) buys
      // the most slack exactly where a whole-row layout change is easiest to
      // hide — a 45px row-height growth on that section passed under
      // maxDiffPixelRatio: 0.01 (~8.4k px budget) because most of the diff
      // washed out against empty background.
      //
      // Both values below are MEASURED, not chosen — the output of
      // scripts/visual-tolerance-rule.mjs over a real three-leg Linux capture,
      // identified by the provenance lines below. `threshold` is declared
      // explicitly because omitting it inherits Playwright's 0.2, at which a
      // uniform 36/255 brightening of every pixel of every baseline reads as
      // "no difference"; that is the regression
      // scripts/__tests__/visual-defect-reproduction.test.mjs now holds
      // permanently. The budget sits over a measured run-to-run noise floor of
      // 4px across all 49 snapshots — two Linux runners in the same run — and
      // far below the 113,840px the defect's own reproduction produces.
      //
      // The guard below (scripts/__tests__/visual-tolerance-guard.test.mjs)
      // reds when either value moves WITHOUT its provenance line moving too —
      // it catches an undocumented edit, not a wrong one. Updating both in
      // lockstep passes it by design. What actually binds behaviour is
      // visual-defect-reproduction.test.mjs, which reds on all 49 baselines if
      // `threshold` rises far enough to hide a 36/255 shift; a value in
      // 0 < t <= 0.1 would satisfy both guards, so a re-tune still needs a
      // fresh measurement rather than a judgement call.
      // noise-floor: run 33107801311 · ubuntu24 20260823.283.1 · playwright 1.62.1
      // noise-floor-values: threshold=0 maxDiffPixels=674
      threshold: 0,
      maxDiffPixels: 674,
    },
  },

  use: {
    baseURL: "http://localhost:5173/rialto/",
    screenshot: "off",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  webServer: {
    command: "pnpm --filter @mbe/rialto-web dev -- --port 5173 --strictPort",
    url: "http://localhost:5173/rialto/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
