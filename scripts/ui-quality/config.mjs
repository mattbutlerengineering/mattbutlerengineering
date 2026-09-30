/**
 * config.mjs — every tunable of the ui-quality loop, in one module
 * (docs/features/ui-quality-loop/architecture.md, frontmatter "Constants").
 *
 * Zero imports. A knob lives here or nowhere: callers import the constant,
 * they never restate its value.
 */

/** A row audited longer ago than this is due again, even if nothing changed. */
export const AUDIT_TTL_DAYS = 28;

/** Upper bound on routes planned by one `ledger.mjs due` (one routine fire). */
export const MAX_ROUTES_PER_FIRE = 40;

/** P2 findings filed as issues per fire before the rest become backlog seeds. */
export const MAX_P2_ISSUES_PER_FIRE = 3;

/** More P1 findings than this on one tell in one fire → one aggregate issue. */
export const P1_BURST_AGGREGATE_AT = 5;

/** Taste-eligible routes sampled per app per fire. */
export const TASTE_SAMPLE_ROUTES = 3;

/** References each sampled route is compared against. */
export const TASTE_REFERENCES_PER_ROUTE = 2;

/** Every capture is taken at each of these — desktop, then phone. */
export const VIEWPORTS = Object.freeze([
  Object.freeze({ width: 1280, height: 720 }),
  Object.freeze({ width: 375, height: 812 }),
]);

/**
 * Blank render (`bugs/blank-render`): the main landmark holds fewer text
 * characters than this, or less of the viewport than BLANK_MIN_PAINTED_RATIO
 * is covered by anything but <html>/<body>.
 */
export const BLANK_MIN_TEXT_CHARS = 1;
export const BLANK_MIN_PAINTED_RATIO = 0.05;

/** A labelled calibration set smaller than this never passes (`rate.mjs calibrate` exits 2). */
export const CALIBRATION_MIN_PAIRS = 10;
