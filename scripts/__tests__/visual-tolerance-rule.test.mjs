import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recommend, DEFAULT_OPTS, VERDICTS } from "../visual-tolerance-rule.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const MODULE_SOURCE = readFileSync(resolve(ROOT, "scripts/visual-tolerance-rule.mjs"), "utf8");
const TEST_SOURCE = readFileSync(
  resolve(ROOT, "scripts/__tests__/visual-tolerance-rule.test.mjs"),
  "utf8"
);

/**
 * The rule declares the `Measurement` row shape it needs; the analyzer produces
 * rows to that shape. Nothing here reaches the analyzer or a comparator — these
 * are integers in a table.
 */
function buildRows({ snapshots, thresholds, area = 1000, counts }) {
  const rows = [];
  for (const snapshot of snapshots) {
    const a = typeof area === "function" ? area(snapshot) : area;
    for (const pairing of ["run", "drift", "signal"]) {
      for (const threshold of thresholds) {
        const count = counts(pairing, snapshot, threshold);
        rows.push({
          snapshot,
          width: a,
          height: 1,
          area: a,
          pairing,
          threshold,
          count,
          ratio: count / a,
        });
      }
    }
  }
  return rows;
}

const TEN = Array.from({ length: 10 }, (_, i) => `snap-0${i}`);

/**
 * The healthy set. Ten snapshots; `snap-09` is a deliberate `drift` outlier so
 * P90 (not max) is observably load-bearing.
 *
 *   t     | N_run | N_drift (P90) | N  | S
 *   0     |   5   |      40       | 40 | 1000
 *   0.05  |   3   |      20       | 20 |  900
 *   0.1   |   1   |       8       |  8 |  500
 *
 * Every t separates by >= 10x, so clause 1 takes the LARGEST: t = 0.1.
 * B = round(sqrt(8 * 500)) = round(63.245) = 63, inside [16, 250].
 */
const HEALTHY_THRESHOLDS = [0, 0.05, 0.1];
const RUN_AT = { 0: 5, 0.05: 3, 0.1: 1 };
const DRIFT_AT = { 0: 40, 0.05: 20, 0.1: 8 };
const SIGNAL_AT = { 0: 1000, 0.05: 900, 0.1: 500 };

function healthy(overrides = {}) {
  return buildRows({
    snapshots: TEN,
    thresholds: HEALTHY_THRESHOLDS,
    counts: (pairing, snapshot, threshold) => {
      if (pairing === "run") return RUN_AT[threshold];
      if (pairing === "drift") {
        return snapshot === "snap-09" ? DRIFT_AT[threshold] * 10 : DRIFT_AT[threshold];
      }
      return SIGNAL_AT[threshold];
    },
    ...overrides,
  });
}

describe("recommend — the opts contract", () => {
  it("defaults exactly to architecture.md § recommend's table", () => {
    expect(DEFAULT_OPTS).toEqual({
      separationFactor: 10,
      noiseHeadroom: 2,
      signalMargin: 2,
      driftPercentile: 90,
      formReviewDecades: 0.3,
      excludedFromSignal: [],
    });
  });

  it("echoes the RESOLVED opts into evidence, so a Recommendation is self-describing", () => {
    const result = recommend(healthy());
    expect(result.evidence.opts).toEqual(DEFAULT_OPTS);

    const tuned = recommend(healthy(), { separationFactor: 5 });
    expect(tuned.evidence.opts.separationFactor).toBe(5);
    expect(tuned.evidence.opts.noiseHeadroom).toBe(2);
  });

  it("names every verdict it can return", () => {
    expect(VERDICTS).toEqual(["ok", "signal-not-observed", "no-separation"]);
    expect(VERDICTS).toContain(recommend(healthy()).verdict);
  });
});

describe("recommend — clause 1 selection and clause 3 budget", () => {
  it("selects the LARGEST qualifying sweep point and clamps the geometric mean", () => {
    const result = recommend(healthy());
    expect(result.verdict).toBe("ok");
    expect(result.threshold).toBe(0.1);
    expect(result.maxDiffPixels).toBe(63);
  });

  it("never emits maxDiffPixelRatio, on any verdict", () => {
    expect(recommend(healthy())).not.toHaveProperty("maxDiffPixelRatio");
  });

  it("reports N_run, N_drift (P90, not max), N, S and the separation ratio at the selected t", () => {
    const { evidence } = recommend(healthy());
    expect(evidence.N_run).toBe(1);
    expect(evidence.N_drift).toBe(8); // P90 of nine 8s and one 80
    expect(evidence.N).toBe(8);
    expect(evidence.S).toBe(500);
    expect(evidence.separation).toBe(62.5);
  });

  it("names the above-P90 drift outliers, for human triage", () => {
    const { evidence } = recommend(healthy());
    expect(evidence.driftOutliers).toEqual(["snap-09"]);
  });

  it("qualifies at exactly separationFactor x N — the boundary is inclusive", () => {
    const at = (signalAtTenth) =>
      recommend(
        buildRows({
          snapshots: ["a", "b"],
          thresholds: [0, 0.1],
          counts: (pairing, _s, t) => {
            if (pairing === "run") return 1;
            if (pairing === "drift") return 1;
            return t === 0 ? 100 : signalAtTenth;
          },
        })
      );

    // S(0.1) = 10 = 10 x N(0.1): qualifies, so the larger t wins.
    const boundary = at(10);
    expect(boundary.threshold).toBe(0.1);
    expect(boundary.maxDiffPixels).toBe(3); // round(sqrt(1 * 10)) = 3, inside [2, 5]

    // One pixel under and the same set falls back to t = 0.
    const under = at(9);
    expect(under.threshold).toBe(0);
  });

  it("handles N(t) = 0 with a lower clamp of 0 rather than dividing by it", () => {
    const result = recommend(
      buildRows({
        snapshots: ["a", "b"],
        thresholds: [0],
        counts: (pairing) => (pairing === "signal" ? 100 : 0),
      })
    );
    expect(result.verdict).toBe("ok");
    expect(result.maxDiffPixels).toBe(0);
    expect(result.evidence.N).toBe(0);
    // Unbounded separation is reported as null, not Infinity — JSON has no
    // spelling for Infinity and would silently write null anyway.
    expect(result.evidence.separation).toBeNull();
  });
});

describe("recommend — clause 0, the instrument checks itself first", () => {
  it("returns signal-not-observed, naming every failing snapshot, with no numbers", () => {
    const rows = buildRows({
      snapshots: TEN,
      thresholds: HEALTHY_THRESHOLDS,
      counts: (pairing, snapshot, threshold) => {
        if (pairing === "run") return RUN_AT[threshold];
        if (pairing === "drift") return DRIFT_AT[threshold];
        // snap-00 is perturbed but barely: 40 < 10 x max(5, 1) = 50.
        if (snapshot === "snap-00") return threshold === 0 ? 40 : 40;
        return SIGNAL_AT[threshold];
      },
    });

    const result = recommend(rows);
    expect(result.verdict).toBe("signal-not-observed");
    expect(result.evidence.unobserved).toEqual(["snap-00"]);

    // No guessed number, anywhere on the return.
    expect(result.threshold).toBeNull();
    expect(result).not.toHaveProperty("maxDiffPixels");
    expect(result).not.toHaveProperty("maxDiffPixelRatio");
  });

  it("reports an unobserved snapshot rather than silently dropping it from the min", () => {
    // Dropping it can only RAISE S, which raises the budget, which loosens the
    // suite — the defect's own direction. So the same set must NOT come back
    // "ok" just because the rest of the suite separates cleanly.
    const rows = buildRows({
      snapshots: TEN,
      thresholds: HEALTHY_THRESHOLDS,
      counts: (pairing, snapshot, threshold) => {
        if (pairing === "run") return RUN_AT[threshold];
        if (pairing === "drift") return DRIFT_AT[threshold];
        if (snapshot === "snap-00") return 40;
        return SIGNAL_AT[threshold];
      },
    });
    expect(recommend(rows).verdict).not.toBe("ok");
  });

  it("evaluates observed(s) at t = 0 against max(run, 1), per snapshot", () => {
    const { evidence } = recommend(healthy());
    expect(evidence.observed["snap-00"]).toEqual({
      signalAtZero: 1000,
      runAtZero: 5,
      required: 50,
      observed: true,
    });
  });

  it("uses a floor of 1 on the run count so a zero-noise snapshot still needs real signal", () => {
    const rows = buildRows({
      snapshots: ["a"],
      thresholds: [0],
      counts: (pairing) => {
        if (pairing === "run") return 0;
        if (pairing === "drift") return 0;
        return 9; // 9 < 10 x max(0, 1) = 10
      },
    });
    expect(recommend(rows).verdict).toBe("signal-not-observed");
  });
});

describe("recommend — clause 2, the no-separation hard stop", () => {
  const rows = buildRows({
    snapshots: ["small", "large"],
    thresholds: [0],
    area: (s) => (s === "small" ? 100 : 10000),
    counts: (pairing, snapshot) => {
      if (pairing === "run") return 1;
      if (pairing === "drift") return snapshot === "small" ? 1 : 100;
      return snapshot === "small" ? 50 : 5000;
    },
  });

  it("returns no-separation and never a guessed number", () => {
    const result = recommend(rows);
    expect(result.verdict).toBe("no-separation");
    expect(result.threshold).toBeNull();
    expect(result).not.toHaveProperty("maxDiffPixels");
    expect(result).not.toHaveProperty("maxDiffPixelRatio");
  });

  it("carries the best achievable ratio and the snapshots driving it", () => {
    const { evidence } = recommend(rows);
    expect(evidence.bestThreshold).toBe(0);
    expect(evidence.separation).toBe(0.5); // S = 50, N = 100
    expect(evidence.drivingSnapshots).toEqual(
      expect.arrayContaining(["small", "large"]) // the S minimum and the N maximum
    );
  });

  it("reports ratioDomainSeparation — the datum that says form question vs comparator question", () => {
    // Absolute domain separates 0.5x; the ratio domain separates 50x, because
    // the noise is concentrated in the large image and the signal is not.
    const { evidence } = recommend(rows);
    expect(evidence.ratioDomainSeparation).toBeCloseTo(50, 6);
  });
});

describe("recommend — excludedFromSignal is explicit, reasoned, and never automatic", () => {
  const skewed = buildRows({
    snapshots: TEN,
    thresholds: [0],
    counts: (pairing, snapshot) => {
      if (pairing === "run") return snapshot === "snap-00" ? 20 : 1;
      if (pairing === "drift") return 1;
      // snap-00 is the weakest signal AND the loudest noise.
      return snapshot === "snap-00" ? 300 : 1000;
    },
  });

  it("changes S and leaves N unchanged — an excluded snapshot still feeds N_run and N_drift", () => {
    const before = recommend(skewed);
    const after = recommend(skewed, {
      excludedFromSignal: [{ snapshot: "snap-00", reason: "low-contrast, verified by eye" }],
    });

    expect(before.evidence.S).toBe(300);
    expect(after.evidence.S).toBe(1000);
    expect(after.evidence.N_run).toBe(before.evidence.N_run);
    expect(after.evidence.N_drift).toBe(before.evidence.N_drift);
    expect(after.evidence.N).toBe(before.evidence.N);
  });

  it("echoes exclusions verbatim into evidence, so they can never happen quietly", () => {
    const excluded = [{ snapshot: "snap-00", reason: "low-contrast, verified by eye" }];
    expect(recommend(skewed, { excludedFromSignal: excluded }).evidence.excluded).toEqual(excluded);
  });

  it("rejects an exclusion with no reason", () => {
    expect(() => recommend(skewed, { excludedFromSignal: [{ snapshot: "snap-00" }] })).toThrow(
      /reason/i
    );
    expect(() =>
      recommend(skewed, { excludedFromSignal: [{ snapshot: "snap-00", reason: "  " }] })
    ).toThrow(/reason/i);
  });

  it("rejects an exclusion naming a snapshot the set does not contain", () => {
    expect(() =>
      recommend(skewed, { excludedFromSignal: [{ snapshot: "typo.png", reason: "x" }] })
    ).toThrow(/typo\.png/);
  });

  it("refuses to empty the signal set", () => {
    expect(() =>
      recommend(skewed, {
        excludedFromSignal: TEN.map((snapshot) => ({ snapshot, reason: "all of them" })),
      })
    ).toThrow(/signal set/i);
  });
});

describe("recommend — a malformed measurement set throws, never extrapolates", () => {
  it("throws on a non-array", () => {
    expect(() => recommend(null)).toThrow();
    expect(() => recommend({})).toThrow();
  });

  it("throws on an empty set", () => {
    expect(() => recommend([])).toThrow(/empty/i);
  });

  it("throws when the sweep has no t = 0, which makes clause 0 unevaluable", () => {
    const rows = buildRows({
      snapshots: ["a"],
      thresholds: [0.05, 0.1],
      counts: (pairing) => (pairing === "signal" ? 1000 : 1),
    });
    expect(() => recommend(rows)).toThrow(/t = 0|threshold 0/i);
  });

  it("throws when a snapshot is missing a pairing", () => {
    const rows = healthy().filter(
      (r) => !(r.snapshot === "snap-03" && r.pairing === "drift" && r.threshold === 0.05)
    );
    expect(() => recommend(rows)).toThrow(/snap-03/);
  });

  it("throws on a row whose count is not a number", () => {
    const rows = healthy();
    rows[0] = { ...rows[0], count: "17" };
    expect(() => recommend(rows)).toThrow(/count/i);
  });
});

describe("the rule is the policy — it reaches nothing", () => {
  it("has zero import statements", () => {
    expect(MODULE_SOURCE).not.toMatch(/^\s*import\s/m);
  });

  it("names no module specifier — not the comparator's, not the analyzer's", () => {
    expect(MODULE_SOURCE).not.toContain("playwright-core");
    expect(MODULE_SOURCE).not.toContain("visual-noise-floor");
  });

  it("has no dynamic escape hatch either — no require(), no import()", () => {
    expect(MODULE_SOURCE).not.toMatch(/\brequire\s*\(/);
    expect(MODULE_SOURCE).not.toMatch(/\bimport\s*\(/);
  });

  it("and neither does its own test", () => {
    expect(TEST_SOURCE).not.toMatch(/^\s*import\s.*(playwright|visual-noise-floor)/m);
  });
});

// ---------------------------------------------------------------------------
// Clause 4 — the budget form is FIXED, and reviewed against a named statistic
// ---------------------------------------------------------------------------

/**
 * Absolute separation is 12.5x (5000 vs 400), so the verdict is `ok` — but the
 * noise is concentrated in the large image while the signal is proportionally
 * identical in both, so the RATIO domain leaves two decades more slack.
 *
 *   S  = 5000     N  = 400        H_abs   = log10((5000/2) / 800)   = 0.49485
 *   Sr = 0.5      Nr = 0.0004     H_ratio = log10((0.5/2) / 0.0008) = 2.49485
 */
function ratioFavouring() {
  return buildRows({
    snapshots: ["small", "large"],
    thresholds: [0],
    area: (s) => (s === "small" ? 10000 : 1000000),
    counts: (pairing, snapshot) => {
      if (pairing === "run") return 1;
      if (pairing === "drift") return snapshot === "small" ? 1 : 400;
      return snapshot === "small" ? 5000 : 500000;
    },
  });
}

describe("recommend — clause 4, the emitted form", () => {
  it("emits maxDiffPixels and never maxDiffPixelRatio, on every return shape", () => {
    const ok = recommend(healthy());
    expect(ok.verdict).toBe("ok");
    expect(ok).toHaveProperty("maxDiffPixels");
    expect(ok).not.toHaveProperty("maxDiffPixelRatio");

    const notObserved = recommend(
      buildRows({
        snapshots: ["a"],
        thresholds: [0],
        counts: (pairing) => (pairing === "signal" ? 5 : 1),
      })
    );
    expect(notObserved.verdict).toBe("signal-not-observed");
    expect(notObserved).not.toHaveProperty("maxDiffPixelRatio");

    const noSeparation = recommend(
      buildRows({
        snapshots: ["a", "b"],
        thresholds: [0],
        counts: (pairing) => {
          if (pairing === "run") return 1;
          if (pairing === "drift") return 50;
          return 100;
        },
      })
    );
    expect(noSeparation.verdict).toBe("no-separation");
    expect(noSeparation).not.toHaveProperty("maxDiffPixelRatio");
  });
});

describe("recommend — clause 4, the headroom diagnostic", () => {
  it("computes H_abs and H_ratio at the selected t, in decades", () => {
    const { evidence } = recommend(healthy());
    // Uniform areas: the ratio domain is the absolute domain scaled by a
    // constant, so the two headrooms coincide exactly.
    expect(evidence.H_abs).toBeCloseTo(Math.log10(250 / 16), 9);
    expect(evidence.H_ratio).toBeCloseTo(evidence.H_abs, 9);
  });

  it("reports the ratio-domain aggregates it was computed from", () => {
    const { evidence } = recommend(ratioFavouring());
    expect(evidence.Sr).toBeCloseTo(0.5, 9);
    expect(evidence.Nr_run).toBeCloseTo(0.0001, 9);
    expect(evidence.Nr_drift).toBeCloseTo(0.0004, 9);
    expect(evidence.Nr).toBeCloseTo(0.0004, 9);
    expect(evidence.maxArea).toBe(1000000);
  });

  it("flags ratio-has-more-headroom past the 0.3-decade boundary, carrying both numbers", () => {
    const { evidence } = recommend(ratioFavouring());
    expect(evidence.H_abs).toBeCloseTo(0.494850021, 8);
    expect(evidence.H_ratio).toBeCloseTo(2.494850021, 8);
    expect(evidence.H_ratio - evidence.H_abs).toBeCloseTo(2, 8);
    expect(evidence.formReview).toBe("ratio-has-more-headroom");
  });

  it("does NOT change the emitted form on that branch — it is a trigger to re-open, not a reversal", () => {
    const result = recommend(ratioFavouring());
    expect(result.evidence.formReview).toBe("ratio-has-more-headroom");
    expect(result.verdict).toBe("ok");
    expect(result.threshold).toBe(0);
    expect(result.maxDiffPixels).toBe(1414); // round(sqrt(400 * 5000)), inside [800, 2500]
    expect(result).not.toHaveProperty("maxDiffPixelRatio");
  });

  it("reports absolute-confirmed otherwise, and the boundary is strictly greater-than", () => {
    expect(recommend(healthy()).evidence.formReview).toBe("absolute-confirmed");

    // The same set, read against a boundary it hits exactly: 2 decades.
    expect(recommend(ratioFavouring(), { formReviewDecades: 2 }).evidence.formReview).toBe(
      "absolute-confirmed"
    );
    expect(recommend(ratioFavouring(), { formReviewDecades: 1.999 }).evidence.formReview).toBe(
      "ratio-has-more-headroom"
    );
  });

  it("keeps H_ratio finite when the ratio-domain noise floor measures exactly 0", () => {
    // The floor is one pixel in the largest image — `1 / maxArea`, the reading
    // recorded in breakdown.md § Design gaps. With Nr = 0 it is what H_ratio
    // rests on, so evidence names both Nr and maxArea for the reviewer.
    const { evidence, maxDiffPixels } = recommend(
      buildRows({
        snapshots: ["a"],
        thresholds: [0],
        area: 1000,
        counts: (pairing) => (pairing === "signal" ? 800 : 0),
      })
    );
    expect(evidence.Nr).toBe(0);
    expect(evidence.maxArea).toBe(1000);
    expect(Number.isFinite(evidence.H_ratio)).toBe(true);
    expect(evidence.H_ratio).toBeCloseTo(Math.log10(400), 9);
    expect(evidence.H_abs).toBeCloseTo(Math.log10(400), 9);
    expect(evidence.formReview).toBe("absolute-confirmed");
    expect(maxDiffPixels).toBe(0);
  });
});

describe("recommend — clause 4 at the degenerate sweep point architecture.md does not name", () => {
  it("stays on the two specified branches when S(t) itself measures 0", () => {
    // Reachable: at a high t the perturbation can vanish alongside the noise,
    // and `0 >= separationFactor x 0` qualifies. Recorded rather than routed
    // back — the emitted pair is TIGHTER (budget 0), the safe direction, and
    // clause 4 is diagnostic only. Pinned so it is known, not discovered.
    const result = recommend(
      buildRows({
        snapshots: ["a"],
        thresholds: [0, 0.1],
        counts: (pairing, _s, t) => (pairing === "signal" && t === 0 ? 100 : 0),
      })
    );
    expect(result.verdict).toBe("ok");
    expect(result.threshold).toBe(0.1);
    expect(result.maxDiffPixels).toBe(0);

    // log10(0) is -Infinity in both domains, so the difference is NaN and the
    // strict `>` lands on the second branch. Two branches, still exhaustive.
    expect(result.evidence.H_abs).toBe(-Infinity);
    expect(result.evidence.H_ratio).toBe(-Infinity);
    expect(result.evidence.formReview).toBe("absolute-confirmed");

    // JSON has no spelling for -Infinity, so the recorded artifact reads null.
    const roundTripped = JSON.parse(JSON.stringify(result));
    expect(roundTripped.evidence.H_abs).toBeNull();
    expect(roundTripped.evidence.H_ratio).toBeNull();
    expect(roundTripped.evidence.formReview).toBe("absolute-confirmed");
  });
});
