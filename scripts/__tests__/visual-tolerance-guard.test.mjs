import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readToleranceDirectives } from "../visual-tolerance.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const CONFIG_PATH = "apps/rialto-web/playwright.config.ts";
const SPEC_PATH = "apps/rialto-web/e2e/visual.spec.ts";

const CONFIG = readFileSync(resolve(ROOT, CONFIG_PATH), "utf8");
const SPEC = readFileSync(resolve(ROOT, SPEC_PATH), "utf8");

/**
 * The rialto-web visual suite's sensitivity can never again change in silence.
 *
 * #4450 -> #4496 is the incident this guard exists for: a budget key changed
 * form, nothing went red, and `main` stayed red for 41h14m once the mismatch
 * finally surfaced. Before that, `threshold` was never set at all and the suite
 * inherited Playwright's 0.2 by omission for ~6 months — a whole-image 36/255
 * brightening reads as "no difference" at that threshold.
 *
 * **This file names no tolerance value, deliberately.** Its load-bearing
 * assertion compares the config against *itself* — the live directives against
 * the `noise-floor-values` provenance line sitting beside them — so there is no
 * external constant here to bump. A legitimate re-tune moves both together and
 * stays green; a silent one moves one and reds, naming both sides. The trap this
 * shape avoids is a drift test whose only guarantee is that a red run forces
 * someone to edit it, on the very PR that legitimately changes the budget.
 *
 * See docs/fixes/visual-tolerance-threshold/architecture.md
 * § `visual-tolerance-guard` — the assertions.
 */

/**
 * `// noise-floor: run <id> · <ImageOS> <ImageVersion> · playwright <version>`
 *
 * The measurement's identity: which CI run produced the numbers, on which
 * runner image, under which Playwright. It goes stale on purpose — staleness is
 * the signal that a re-measure is due, not a failure.
 */
const PROVENANCE_RUN =
  /^\s*\/\/\s*noise-floor:\s*run\s+(\d+)\s+·\s+(\S+)\s+(\S+)\s+·\s+playwright\s+(\S+)\s*$/m;

/**
 * `// noise-floor-values: threshold=<t> maxDiffPixels=<n>`
 *
 * Anchored at both ends: the grammar has exactly two keys. Revision 2 dropped
 * the optional ` maxDiffPixelRatio=<r>` tail — clause 4 of the decision rule
 * fixes the budget form, and a provenance grammar able to express a value the
 * rule never emits is a grammar this guard would have to keep true for nothing.
 */
const PROVENANCE_VALUES =
  /^\s*\/\/\s*noise-floor-values:\s*threshold=(\d[\d_]*(?:\.[\d_]+)?)\s+maxDiffPixels=(\d[\d_]*(?:\.[\d_]+)?)\s*$/m;

const directives = readToleranceDirectives(CONFIG);

describe("rialto-web visual tolerance — the drift guard", () => {
  it("declares `threshold` explicitly instead of inheriting Playwright's default", () => {
    // The defect, exactly: `threshold` was never set, so the suite ran at
    // Playwright's 0.2 for ~6 months and could not see a whole-image change.
    // Deleting the declaration again reds here. Direct analogue of
    // pulumi-cli-pin.test.mjs's "installs an explicit CLI version instead of
    // inheriting the runner image's".
    expect(directives.occurrences.threshold).toBe(1);
    expect(directives.threshold).not.toBeNull();
    expect(Number.isFinite(directives.threshold)).toBe(true);
  });

  it("keeps the budget an absolute pixel count, with no ratio anywhere", () => {
    // A *shape* assertion, not a value one: it reds on a change of form — an
    // Architect-level decision that should cost a design pass — and stays green
    // through a change of value, which is the expected re-tune lifecycle.
    //
    // The shape has two live consumers. `parseMaxDiffPixels`
    // (scripts/visual-diff-report.mjs) returns `null` the moment a ratio
    // appears, silently degrading the PR comment; and a ratio scales with
    // canvas size, which is how #4450's 45px row-height growth hid inside a
    // large sparse section's inflated budget.
    expect(directives.occurrences.maxDiffPixels).toBe(1);
    expect(directives.maxDiffPixels).not.toBeNull();
    expect(Number.isFinite(directives.maxDiffPixels)).toBe(true);
    expect(directives.occurrences.maxDiffPixelRatio).toBe(0);
    expect(directives.maxDiffPixelRatio).toBeNull();
  });

  it("lets no `toHaveScreenshot` call site override the suite-wide tolerance", () => {
    // 49 per-snapshot knobs are 49 places to loosen the suite quietly. One
    // suite-wide declaration is the only surface this guard has to watch, so the
    // spec's call sites must pass none of the three directives. Today all four
    // pass only `timeout`.
    const callSites = [...SPEC.matchAll(/toHaveScreenshot\s*\(([\s\S]*?)\)\s*;/g)];
    expect(callSites.length).toBeGreaterThan(0);

    for (const [, args] of callSites) {
      expect(args).not.toMatch(/\bthreshold\s*:/);
      expect(args).not.toMatch(/\bmaxDiffPixels\s*:/);
      expect(args).not.toMatch(/\bmaxDiffPixelRatio\s*:/);
    }
  });

  it("carries both provenance lines, in the data model's grammar", () => {
    // A run id can be typed — this cannot verify a measurement happened, only
    // that the author was made to name one. That is the honest ceiling for a
    // static guard; re-running the instrument in CI to check would cost three
    // runner legs on every PR.
    const run = PROVENANCE_RUN.exec(CONFIG);
    expect(run, `${CONFIG_PATH} is missing the \`// noise-floor:\` provenance line`).not.toBeNull();

    const values = PROVENANCE_VALUES.exec(CONFIG);
    expect(
      values,
      `${CONFIG_PATH} is missing the \`// noise-floor-values:\` provenance line`
    ).not.toBeNull();

    // The grammar has exactly two keys. A ratio tail would describe a value the
    // decision rule never emits.
    expect(CONFIG).not.toMatch(/noise-floor-values:.*maxDiffPixelRatio/);
  });

  it("keeps the live directives and their evidence line in agreement, key for key", () => {
    // The whole design of the guard: the comparison is between the file and
    // itself, so the second operand travels with the first. Change a value and
    // forget the evidence line and this reds, naming both sides; change both
    // together — a legitimate re-tune — and it stays green.
    const values = PROVENANCE_VALUES.exec(CONFIG);
    expect(
      values,
      `${CONFIG_PATH} is missing the \`// noise-floor-values:\` provenance line`
    ).not.toBeNull();

    const declared = {
      threshold: Number(values[1].replace(/_/g, "")),
      maxDiffPixels: Number(values[2].replace(/_/g, "")),
    };

    expect({
      threshold: directives.threshold,
      maxDiffPixels: directives.maxDiffPixels,
    }).toEqual(declared);
  });
});
