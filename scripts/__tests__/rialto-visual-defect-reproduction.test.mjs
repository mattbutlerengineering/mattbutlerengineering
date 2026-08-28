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

const CONFIG_PATH = "packages/rialto/playwright.visual.config.ts";
const SCREENSHOT_DIR = resolve(ROOT, "packages/rialto/src/test/visual/__screenshots__");

/**
 * The rialto Storybook visual suite's declared sensitivity is not blind to the
 * regression class documented in docs/fixes/visual-tolerance-threshold/.
 *
 * Sibling of visual-defect-reproduction.test.mjs (the rialto-web suite), which
 * holds the same assertion for apps/rialto-web — that run named this suite's
 * identical gap ("maxDiffPixelRatio: 0.01, threshold unset") twice, in
 * defect.md § Blast radius and architecture.md, as out of scope. This file
 * takes it: brighten every pixel of every committed Storybook baseline by a
 * constant per-channel delta, run it through the *same* comparator the suite
 * uses under the *live* config, and require the comparator to see it.
 *
 * Measured on the 53 committed baselines before the fix (threshold unset, so
 * Playwright's 0.2 default applied): the +36/255 shift counted ZERO differing
 * pixels on all 53 — at threshold 0.15 and above the raw filtered count is
 * literally 0 for every baseline, so no budget value could ever have failed.
 */

/**
 * The largest per-channel delta a real regression is documented to have
 * produced while escaping this comparator's default threshold
 * (docs/fixes/visual-tolerance-threshold/defect.md § D). It is the **subject**
 * under test, not a tolerance — this file holds no copy of any tolerance
 * value, reading the live options out of the config's text instead.
 */
const DEFECT_AMPLITUDE = 36;

/**
 * Baselines the live RATIO budget cannot see the reproduction on at ANY
 * threshold — measured (2026-08-28, installed playwright-core 1.62.1): even at
 * `threshold: 0` their raw diff count stays under `maxDiffPixelRatio: 0.01`'s
 * one percent of area, because their content is sparse on a white background
 * and pure-white pixels do not move under a clamped `min(255, v + 36)` shift.
 * This is the ratio-budget blind spot the rialto-web run switched to an
 * absolute `maxDiffPixels` to remove (#4450 → #4496 history in
 * apps/rialto-web/playwright.config.ts); removing it here needs the noise
 * measurement (.github/workflows/rialto-visual-noise-floor.yml), not a guess.
 *
 * Both directions fail closed: a baseline listed here that becomes visible
 * reds below (delete its entry — the budget can now see it), and a baseline
 * NOT listed here that goes blind reds in the main block (never silence).
 */
const KNOWN_RATIO_BUDGET_BLIND = [
  "data-display-timeline--default.png",
  "data-display-tree--default.png",
  "layout-stack--vertical.png",
  "specialty-scrollarea--default.png",
];

const directives = readToleranceDirectives(readFileSync(resolve(ROOT, CONFIG_PATH), "utf8"));

/**
 * The live config as the comparator sees it: a directive the config does not
 * declare is *omitted*, so Playwright's own default applies — which is exactly
 * what the running suite does with it.
 */
const liveOptions = {
  ...(directives.threshold === null ? {} : { threshold: directives.threshold }),
  ...(directives.maxDiffPixels === null ? {} : { maxDiffPixels: directives.maxDiffPixels }),
  ...(directives.maxDiffPixelRatio === null
    ? {}
    : { maxDiffPixelRatio: directives.maxDiffPixelRatio }),
};

const { utils } = require_(join(resolvePlaywrightCoreDir(), "lib/coreBundle.js"));
const compare = utils.getComparator("image/png");

const baselines = readdirSync(SCREENSHOT_DIR)
  .filter((name) => name.endsWith(".png"))
  .sort();

const catchable = baselines.filter((name) => !KNOWN_RATIO_BUDGET_BLIND.includes(name));

describe("the rialto Storybook suite's declared sensitivity can see the defect reproduction", () => {
  it("has baselines to test at all", () => {
    // A silently-empty set would make every assertion below vacuous. A floor,
    // not an equality — adding a story must not red this file.
    expect(baselines.length).toBeGreaterThan(0);
    expect(catchable.length).toBeGreaterThan(0);
  });

  it("declares `threshold` explicitly instead of inheriting Playwright's default", () => {
    // The defect, exactly: this suite never set `threshold`, so it ran at
    // Playwright's 0.2 from its introduction until this fix and could not see
    // a whole-image change.
    expect(directives.occurrences.threshold).toBe(1);
    expect(directives.threshold).not.toBeNull();
  });

  it("lists only real baselines as known-blind", () => {
    // A renamed or deleted baseline must not leave a stale allowlist entry —
    // a rotting exclusion list is the classic silent-loosening vector.
    for (const name of KNOWN_RATIO_BUDGET_BLIND) {
      expect(baselines, `${name} is in KNOWN_RATIO_BUDGET_BLIND but not on disk`).toContain(name);
    }
  });

  it.each(catchable)("%s", (name) => {
    const expected = readFileSync(join(SCREENSHOT_DIR, name));
    const actual = shiftPngChannels(expected, DEFECT_AMPLITUDE);

    // `null` is the comparator's verdict for "these images match". A uniform
    // whole-image brightening returning `null` is the defect: a change to
    // every pixel that the suite reports as no difference at all.
    const result = compare(actual, expected, liveOptions);

    expect(
      result,
      `a uniform +${DEFECT_AMPLITUDE}/255 shift on every pixel of ${name} is invisible ` +
        `to the tolerance declared in ${CONFIG_PATH}`
    ).not.toBeNull();
  });

  it.each(KNOWN_RATIO_BUDGET_BLIND)("%s stays in the known ratio-budget blind spot", (name) => {
    const expected = readFileSync(join(SCREENSHOT_DIR, name));
    const actual = shiftPngChannels(expected, DEFECT_AMPLITUDE);

    expect(
      compare(actual, expected, liveOptions),
      `${name} was a known ratio-budget blind spot but the live tolerance now sees the ` +
        `reproduction on it — remove it from KNOWN_RATIO_BUDGET_BLIND so the main block binds it`
    ).toBeNull();
  });
});
