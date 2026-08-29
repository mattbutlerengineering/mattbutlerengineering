import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.visual.config";

/**
 * The perturbed capture leg of the rialto Storybook suite's noise-floor
 * measurement — see .github/workflows/rialto-visual-noise-floor.yml and, for
 * the design this instantiates, docs/fixes/visual-tolerance-threshold/
 * architecture.md § Components 3 (the rialto-web sibling it mirrors).
 *
 * Identical to the production visual config in every way that affects
 * rendering, plus one injected stylesheet that dims every screenshot subject.
 * Run with `--update-snapshots=all`, so it never compares — it writes actuals
 * that scripts/visual-noise-floor.mjs differences offline.
 *
 * A second config file rather than an env-var branch inside the production
 * config, on the precedent of apps/rialto-web/playwright.noise-floor.config.ts:
 * a production config that renders differently when an env var is set is a
 * production config that can be perturbed in silence.
 */

// `stylePath` is a config-level toHaveScreenshot option in the installed
// Playwright 1.62.1 (playwright/types/test.d.ts:233). Absolute, so it does
// not depend on the cwd the run is invoked from.
const PERTURBATION_CSS = fileURLToPath(
  new URL("./src/test/visual/noise-floor-perturbation.css", import.meta.url)
);

export default defineConfig({
  ...baseConfig,
  expect: {
    ...baseConfig.expect,
    toHaveScreenshot: {
      ...baseConfig.expect?.toHaveScreenshot,
      stylePath: PERTURBATION_CSS,
    },
  },
});
