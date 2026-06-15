import { defineConfig, devices } from "playwright/test";

/**
 * Playwright configuration for visual regression tests.
 *
 * Serves the pre-built storybook-static/ directory via a local http server
 * so tests can navigate stories without a running Storybook dev process.
 *
 * Build storybook first: pnpm --dir packages/rialto build-storybook
 */
export default defineConfig({
  testDir: "./src/test/visual",
  testMatch: "**/*.spec.ts",
  outputDir: "./src/test/__diff__",
  snapshotDir: "./src/test/__screenshots__",
  // Omit platform and project from snapshot filename so the same baselines
  // work across macOS (local dev) and Linux (CI). Pixel rendering is
  // controlled by the viewport, scale factor, and disabled animations.
  snapshotPathTemplate: "{snapshotDir}/{testFileDir}/{arg}{ext}",
  updateSnapshots: "none",
  fullyParallel: false,
  // One worker for deterministic ordering and no port contention
  workers: 1,
  timeout: 60_000,
  expect: {
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
    },
  },
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "playwright-visual-report",
        open: "never",
      },
    ],
  ],
  use: {
    baseURL: "http://localhost:6007",
    // Fixed viewport for deterministic screenshot dimensions
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    screenshot: "only-on-failure",
    video: "off",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node scripts/serve-storybook.mjs 6007",
    url: "http://localhost:6007",
    reuseExistingServer: !process.env["CI"],
    timeout: 30_000,
  },
});
