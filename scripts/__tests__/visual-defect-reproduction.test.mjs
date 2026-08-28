import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readToleranceDirectives } from "../visual-tolerance.mjs";
import { resolvePlaywrightCoreDir, shiftPngChannels } from "../visual-noise-floor.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const require_ = createRequire(import.meta.url);

const CONFIG_PATH = "apps/rialto-web/playwright.config.ts";
const SCREENSHOT_DIR = resolve(ROOT, "apps/rialto-web/e2e/screenshots");

/**
 * The declared sensitivity is not blind to the regression this run exists to catch.
 *
 * `defect.md` § A turned from a one-off Capture measurement into a standing
 * assertion: brighten every pixel of every committed baseline by a constant
 * per-channel delta, run it through the *same* comparator the suite uses under
 * the *live* config, and require the comparator to see it.
 *
 * **Why this is a separate module from the drift guard.** The guard is textual,
 * names no number, and reaches no image; that purity is why it stays green
 * through a legitimate re-tune. This one executes the comparator and means
 * something different when it reds — not "a value moved without evidence" but
 * "the declared sensitivity cannot see the defect". Different failure, different
 * module.
 *
 * **Why it exists at all**, now that the decision rule cannot select a sweep
 * point blind to the defect: the rule constrains what the *instrument* emits.
 * Nothing constrains a later hand edit, and the guard — which asserts only that
 * the config agrees with its own provenance line — would stay green through one.
 * This is the only check in the design evaluable without a measurement, which is
 * what makes it the right shape for `CI Gate`.
 *
 * See docs/fixes/visual-tolerance-threshold/architecture.md § Components 8.
 */

/**
 * The largest per-channel delta a prior real run actually produced
 * (`defect.md` § D). It is the **subject** under test, not a tolerance — this
 * file holds no copy of any tolerance value, reading the live pair out of the
 * config's text instead.
 */
const DEFECT_AMPLITUDE = 36;

const directives = readToleranceDirectives(readFileSync(resolve(ROOT, CONFIG_PATH), "utf8"));

/**
 * The live config as the comparator sees it: a directive the config does not
 * declare is *omitted*, so Playwright's own default applies — which is exactly
 * what the running suite does with it. Reproducing the defect means reproducing
 * the defaults it hid behind.
 */
const liveOptions = {
  ...(directives.threshold === null ? {} : { threshold: directives.threshold }),
  ...(directives.maxDiffPixels === null ? {} : { maxDiffPixels: directives.maxDiffPixels }),
};

const { utils } = require_(join(resolvePlaywrightCoreDir(), "lib/coreBundle.js"));
const compare = utils.getComparator("image/png");

const baselines = readdirSync(SCREENSHOT_DIR)
  .filter((name) => name.endsWith(".png"))
  .sort();

describe("the declared visual sensitivity can see defect.md § A's reproduction", () => {
  it("has baselines to test at all", () => {
    // A silently-empty set would make every assertion below vacuous, which is
    // the failure mode this repo has hit before: work that passes because it
    // never ran. The count is deliberately a floor, not an equality — adding a
    // snapshot must not red this file.
    expect(baselines.length).toBeGreaterThan(0);
  });

  it.each(baselines)("%s", (name) => {
    const expected = readFileSync(join(SCREENSHOT_DIR, name));
    const actual = shiftPngChannels(expected, DEFECT_AMPLITUDE);

    // `null` is the comparator's verdict for "these images match". A uniform
    // whole-image brightening returning `null` is the defect: a change to every
    // single pixel that the suite reports as no difference at all.
    const result = compare(actual, expected, liveOptions);

    expect(
      result,
      `a uniform +${DEFECT_AMPLITUDE}/255 shift on every pixel of ${name} is invisible ` +
        `to the tolerance declared in ${CONFIG_PATH}`
    ).not.toBeNull();
  });
});
