import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

/**
 * The perturbed capture leg of the noise-floor measurement. See
 * docs/fixes/visual-tolerance-threshold/architecture.md § Components 3.
 *
 * Identical to the production config in every way that affects rendering,
 * plus one injected stylesheet that dims every screenshot subject. Run with
 * `--update-snapshots=all`, so it never compares — it writes actuals that
 * scripts/visual-noise-floor.mjs differences offline.
 *
 * A second config file rather than an env-var branch inside the production
 * config, on the precedent of playwright.csp.config.ts: a production config
 * that renders differently when an env var is set is a production config that
 * can be perturbed in silence, which is the failure class this run exists to
 * remove.
 */

// `stylePath` is a config-level toHaveScreenshot option in the installed
// Playwright 1.62.1 (playwright/types/test.d.ts:233). Absolute, so it does not
// depend on the cwd the run is invoked from.
const PERTURBATION_CSS = fileURLToPath(
  new URL("./e2e/noise-floor-perturbation.css", import.meta.url)
);

export default defineConfig({
  ...baseConfig,
  // Deliberately NOT reset the way playwright.csp.config.ts resets it: this
  // config must enumerate exactly the production test set, csp.spec.ts
  // included in the ignore, so the measured snapshots are the production ones.
  expect: {
    ...baseConfig.expect,
    toHaveScreenshot: {
      ...baseConfig.expect?.toHaveScreenshot,
      stylePath: PERTURBATION_CSS,
    },
  },
});
