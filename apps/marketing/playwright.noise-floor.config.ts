import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import visualConfig from "./playwright.visual.config";

/**
 * The perturbed capture leg of marketing's noise-floor measurement
 * (.github/workflows/visual-noise-floor.yml with app=marketing).
 *
 * Identical to playwright.visual.config.ts in every way that affects
 * rendering, plus one injected stylesheet that dims the page. Run with
 * `--update-snapshots=all`, so it never compares. A second config rather than
 * an env-var branch, on rialto-web's precedent (its playwright.noise-floor.config.ts).
 */

const PERTURBATION_CSS = fileURLToPath(
  new URL("./e2e/noise-floor-perturbation.css", import.meta.url)
);

export default defineConfig({
  ...visualConfig,
  expect: {
    ...visualConfig.expect,
    toHaveScreenshot: {
      ...visualConfig.expect?.toHaveScreenshot,
      stylePath: PERTURBATION_CSS,
    },
  },
});
