import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recommend, DEFAULT_OPTS, VERDICTS, PAIRINGS } from "../visual-tolerance-rule.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const MODULE_SOURCE = readFileSync(resolve(ROOT, "scripts/visual-tolerance-rule.mjs"), "utf8");
const TEST_SOURCE = readFileSync(
  resolve(ROOT, "scripts/__tests__/visual-tolerance-rule.test.mjs"),
  "utf8"
);

/**
 * A `reproduction` count so far above any budget these fixtures can produce
 * that clause 1(b)'s `R(t) - 1` clamp never binds. The defect-blindness gate
 * gets its own fixtures below, where `R` is the quantity under test — every
 * other fixture states "the defect is plainly visible here" rather than
 * silently omitting the term.
 */
const REPRODUCTION_ABUNDANT = 1_000_000;

/**
 * The rule declares the `Measurement` row shape it needs; the analyzer produces
 * rows to that shape. Nothing here reaches the analyzer or a comparator — these
 * are integers in a table.
 */
function buildRows({
  snapshots,
  thresholds,
  area = 1000,
  counts,
  reproduction = () => REPRODUCTION_ABUNDANT,
}) {
  const rows = [];
  for (const snapshot of snapshots) {
    const a = typeof area === "function" ? area(snapshot) : area;
    for (const pairing of ["run", "drift", "signal", "reproduction"]) {
      for (const threshold of thresholds) {
        const count =
          pairing === "reproduction"
            ? reproduction(snapshot, threshold)
            : counts(pairing, snapshot, threshold);
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
 * The healthy set. Ten snapshots; `snap-09` is a deliberate `drift` outlier,
 * which since revision 3 is REPORTED and never a term.
 *
 *   t     | N_run = N | Ñ (N0 = 5) | S    | separationState
 *   0     |     5     |     5      | 1000 | separated (200x)
 *   0.05  |     3     |     5      |  900 | separated (300x)
 *   0.1   |     1     |     5      |  500 | separated (500x)
 *
 * Every t is eligible, so clause 1 takes the SMALLEST: t = 0.
 * B = round(sqrt(Ñ x S)) = round(sqrt(5 x 1000)) = 71, inside [10, 500].
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
      defectAmplitude: 36,
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

  it("names every verdict it can return — four, since revision 3", () => {
    expect(VERDICTS).toEqual(["ok", "signal-not-observed", "no-separation", "defect-not-caught"]);
    expect(VERDICTS).toContain(recommend(healthy()).verdict);
  });

  it("consumes four pairings", () => {
    expect(PAIRINGS).toEqual(["run", "drift", "signal", "reproduction"]);
  });
});

describe("recommend — clause 1 selection and clause 3 budget", () => {
  it("selects the SMALLEST eligible sweep point, reversed from pass 1's largest", () => {
    // Every sweep point in `healthy` is eligible, so the ordering is the only
    // thing that decides. Pass 1 took t = 0.1 here; a threshold's blindness is
    // unbounded in area and a budget's is bounded in area, so noise tolerance
    // is spent on the budget and the threshold is taken as small as the
    // evidence allows.
    const result = recommend(healthy());
    expect(result.verdict).toBe("ok");
    expect(result.evidence.perThreshold.every((p) => p.eligible)).toBe(true);
    expect(result.threshold).toBe(0);
    expect(result.maxDiffPixels).toBe(71);
  });

  it("never emits maxDiffPixelRatio, on any verdict", () => {
    expect(recommend(healthy())).not.toHaveProperty("maxDiffPixelRatio");
  });

  it("reports N_run, N, Ñ, N0, S, R and the separation ratio at the selected t", () => {
    const { evidence } = recommend(healthy());
    expect(evidence.N_run).toBe(5);
    expect(evidence.N).toBe(5);
    expect(evidence.Ntilde).toBe(5);
    expect(evidence.N0).toBe(5);
    expect(evidence.S).toBe(1000);
    expect(evidence.R).toBe(REPRODUCTION_ABUNDANT);
    expect(evidence.separationState).toBe("separated");
    expect(evidence.separation).toBe(200);
    expect(evidence.budgetInterval).toEqual({ lower: 10, upper: 500 });
    expect(evidence.defectMargin).toBe(REPRODUCTION_ABUNDANT - 71);
  });

  it("shows every sweep point's own rejection reason, which a single `qualifies` column hid", () => {
    const { evidence } = recommend(healthy());
    expect(evidence.perThreshold).toHaveLength(HEALTHY_THRESHOLDS.length);
    for (const point of evidence.perThreshold) {
      expect(Object.keys(point).sort()).toEqual(
        [
          "threshold",
          "N_run",
          "N",
          "Ntilde",
          "S",
          "R",
          "separationState",
          "separation",
          "budgetInterval",
          "feasible",
          "infeasibleReason",
          "eligible",
        ].sort()
      );
    }
  });

  it("computes the geometric mean of Ñ and S, clamped to the budget interval", () => {
    const { evidence, maxDiffPixels } = recommend(healthy());
    expect(evidence.geometricMean).toBe(Math.round(Math.sqrt(5 * 1000)));
    expect(maxDiffPixels).toBe(evidence.geometricMean);
    expect(maxDiffPixels).toBeGreaterThanOrEqual(evidence.budgetInterval.lower);
    expect(maxDiffPixels).toBeLessThanOrEqual(evidence.budgetInterval.upper);
  });
});

describe("recommend — clause 1(a), separation is three-valued and never vacuous", () => {
  const stateAt = (rows, threshold) =>
    recommend(rows).evidence.perThreshold.find((p) => p.threshold === threshold);

  it("reports `separated` / `unseparated` around an inclusive boundary, with N > 0", () => {
    const at = (signalAtTenth) =>
      buildRows({
        snapshots: ["a", "b"],
        thresholds: [0, 0.1],
        counts: (pairing, _s, t) => {
          if (pairing === "run") return 1;
          if (pairing === "drift") return 1;
          return t === 0 ? 100 : signalAtTenth;
        },
      });

    // S(0.1) = 10 = 10 x N(0.1): separated, the boundary is inclusive.
    expect(stateAt(at(10), 0.1).separationState).toBe("separated");
    // One pixel under, and the same point is unseparated.
    expect(stateAt(at(9), 0.1).separationState).toBe("unseparated");
  });

  it("reports `unbounded` when N = 0 — separation there is UNDEFINED, not satisfied", () => {
    const point = stateAt(
      buildRows({
        snapshots: ["a"],
        thresholds: [0],
        counts: (pairing) => (pairing === "signal" ? 100 : 0),
      }),
      0
    );
    expect(point.N).toBe(0);
    expect(point.separationState).toBe("unbounded");
    // Unbounded separation is reported as null, not Infinity — JSON has no
    // spelling for Infinity and would silently write null anyway.
    expect(point.separation).toBeNull();
  });

  it("does NOT let a measured zero qualify six sweep points and hand `largest` the loosest", () => {
    // The defect run 33107801311 exposed, pinned directly: `S >= factor x N` at
    // N = 0 reads `S >= 0`, true for any signal whatsoever. Six points then
    // "qualified" on no evidence at all and clause 1 took t = 0.2 — Playwright's
    // own default, the value defect.md indicts by name.
    const rows = buildRows({
      snapshots: ["a"],
      thresholds: [0, 0.005, 0.01, 0.02, 0.05, 0.1],
      counts: (pairing, _s, t) => {
        if (pairing === "run") return t === 0 ? 4 : 0;
        if (pairing === "drift") return 0;
        return t === 0 ? 113509 : 40000;
      },
    });
    const { threshold, evidence } = recommend(rows);

    const unbounded = evidence.perThreshold.filter((p) => p.separationState === "unbounded");
    expect(unbounded).toHaveLength(5);
    for (const point of unbounded) expect(point.separation).toBeNull();

    expect(threshold).toBe(0);
    expect(threshold).not.toBe(0.1);
  });
});

describe("recommend — clause 1(b), the sweep point must not be blind to the defect", () => {
  const rowsWithReproduction = (reproductionAtTenth) =>
    buildRows({
      snapshots: ["a", "b"],
      thresholds: [0, 0.1],
      counts: (pairing) => {
        if (pairing === "run") return 1;
        if (pairing === "drift") return 1;
        return 1000;
      },
      reproduction: (_s, t) => (t === 0.1 ? reproductionAtTenth : 5000),
    });

  it("makes R(t) = 0 ineligible BY MEASUREMENT — the interval is empty, not a fiat", () => {
    // Same set twice; only R at t = 0.1 moves. Nothing in the rule mentions
    // Playwright's default: what disqualifies the point is that a uniform
    // defectAmplitude shift over every pixel of every baseline counts ZERO
    // differing pixels there.
    const blind = recommend(rowsWithReproduction(0)).evidence.perThreshold.find(
      (p) => p.threshold === 0.1
    );
    expect(blind.R).toBe(0);
    expect(blind.budgetInterval.upper).toBe(-1);
    expect(blind.feasible).toBe(false);
    expect(blind.infeasibleReason).toBe("blind-to-defect");
    expect(blind.eligible).toBe(false);

    const seeing = recommend(rowsWithReproduction(5000)).evidence.perThreshold.find(
      (p) => p.threshold === 0.1
    );
    expect(seeing.feasible).toBe(true);
    expect(seeing.eligible).toBe(true);
    expect(seeing.infeasibleReason).toBeNull();
  });

  it("clamps the budget strictly BELOW R, so the reproduction fails structurally", () => {
    const { maxDiffPixels, evidence } = recommend(
      buildRows({
        snapshots: ["a"],
        thresholds: [0],
        counts: (pairing) => {
          if (pairing === "signal") return 1000;
          return 1;
        },
        reproduction: () => 40,
      })
    );
    expect(evidence.R).toBe(40);
    expect(evidence.budgetInterval.upper).toBe(39);
    expect(maxDiffPixels).toBeLessThan(evidence.R);
    expect(evidence.defectMargin).toBe(evidence.R - maxDiffPixels);
  });

  it("takes R over ALL snapshots — an excluded one still constrains the budget", () => {
    const rows = buildRows({
      snapshots: ["a", "b"],
      thresholds: [0],
      counts: (pairing, snapshot) => {
        if (pairing === "run") return 1;
        if (pairing === "drift") return 1;
        return snapshot === "a" ? 60 : 1000;
      },
      // `a` is the snapshot the defect is hardest to see on.
      reproduction: (snapshot) => (snapshot === "a" ? 30 : 900),
    });
    const excluded = recommend(rows, {
      excludedFromSignal: [{ snapshot: "a", reason: "low-contrast, verified by eye" }],
    });
    expect(excluded.evidence.signalSet).toEqual(["b"]);
    expect(excluded.evidence.R).toBe(30);
  });
});

describe("recommend — clause 3, no bound is ever derived from a measured zero", () => {
  it("floors N at N0 = max(N_run(0), 1) and emits a NON-ZERO budget on run 33107801311's shape", () => {
    // The exact shape the real measurement produced: run-to-run noise exists at
    // t = 0 and measures 0 at every filtered sweep point above it. Revision 2's
    // rule pinned maxDiffPixels: 0 here, and the first runner-image bump that
    // moves a single pixel would have redded the suite.
    const thresholds = [0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.15, 0.2];
    const signal = {
      0: 113509,
      0.005: 113463,
      0.01: 113414,
      0.02: 49316,
      0.05: 44289,
      0.1: 40865,
      0.15: 39310,
      0.2: 17967,
    };
    const rows = buildRows({
      snapshots: ["a"],
      thresholds,
      counts: (pairing, _s, t) => {
        if (pairing === "run") return t === 0 ? 4 : 0;
        if (pairing === "drift") return 0;
        return signal[t];
      },
      reproduction: (_s, t) => (t >= 0.15 ? 0 : 113840),
    });

    const { verdict, threshold, maxDiffPixels, evidence } = recommend(rows);
    expect(verdict).toBe("ok");
    expect(threshold).toBe(0);
    expect(evidence.N0).toBe(4);
    expect(evidence.Ntilde).toBe(4);
    expect(maxDiffPixels).not.toBe(0);
    expect(maxDiffPixels).toBe(Math.round(Math.sqrt(evidence.Ntilde * evidence.S)));

    // The two sweep points revision 2's `largest` would have taken are removed
    // on evidence, not on a fiat about Playwright's default.
    for (const t of [0.15, 0.2]) {
      const point = evidence.perThreshold.find((p) => p.threshold === t);
      expect(point.R).toBe(0);
      expect(point.infeasibleReason).toBe("blind-to-defect");
      expect(point.eligible).toBe(false);
    }
  });

  it("uses Ñ in BOTH places N appeared — the geometric mean and the lower clamp", () => {
    const { evidence, maxDiffPixels } = recommend(
      buildRows({
        snapshots: ["a"],
        thresholds: [0],
        counts: (pairing) => (pairing === "signal" ? 100 : 0),
      })
    );
    expect(evidence.N).toBe(0);
    expect(evidence.N0).toBe(1); // max(N_run(0), 1) — one run can bound noise, not disprove it
    expect(evidence.Ntilde).toBe(1);
    expect(evidence.budgetInterval.lower).toBe(2); // ceil(noiseHeadroom x Ñ), not 0
    expect(maxDiffPixels).toBe(10); // round(sqrt(1 x 100)), not round(sqrt(0 x 100))
    expect(evidence.separationState).toBe("unbounded");
    expect(evidence.separation).toBeNull();
  });
});

describe("recommend — `drift` is reported and triaged, and is NEVER a noise term", () => {
  const louder = () =>
    buildRows({
      snapshots: TEN,
      thresholds: HEALTHY_THRESHOLDS,
      counts: (pairing, snapshot, threshold) => {
        if (pairing === "run") return RUN_AT[threshold];
        // Every drift value an order of magnitude larger than `healthy`'s.
        if (pairing === "drift") {
          return (snapshot === "snap-09" ? DRIFT_AT[threshold] * 10 : DRIFT_AT[threshold]) * 10;
        }
        return SIGNAL_AT[threshold];
      },
    });

  it("moving a drift value cannot move N, the threshold, or the budget", () => {
    const before = recommend(healthy());
    const after = recommend(louder());
    expect(after.evidence.N).toBe(before.evidence.N);
    expect(after.evidence.Ntilde).toBe(before.evidence.Ntilde);
    expect(after.threshold).toBe(before.threshold);
    expect(after.maxDiffPixels).toBe(before.maxDiffPixels);
  });

  it("but it still moves driftP90, the named outlier list, and driftAboveBudget", () => {
    const before = recommend(healthy());
    const after = recommend(louder());
    expect(before.evidence.driftP90).toBe(40);
    expect(after.evidence.driftP90).toBe(400);
    expect(before.evidence.driftOutliers).toEqual(["snap-09"]);
    expect(after.evidence.driftOutliers).toEqual(["snap-09"]);

    // driftAboveBudget: the baselines whose staleness the emitted budget cannot
    // absorb — the regeneration precondition the emitted pair depends on.
    expect(before.evidence.driftAboveBudget).toEqual([{ snapshot: "snap-09", count: 400 }]);
    expect([...after.evidence.driftAboveBudget.map((d) => d.snapshot)].sort()).toEqual(TEN);
  });

  it("derives driftReview from driftAboveBudget being non-empty, and says so", () => {
    expect(recommend(healthy()).evidence.driftReview).toBe("regeneration-required");
    const clean = recommend(
      buildRows({
        snapshots: ["a"],
        thresholds: [0],
        counts: (pairing) => {
          if (pairing === "signal") return 1000;
          if (pairing === "drift") return 0;
          return 1;
        },
      })
    );
    expect(clean.evidence.driftAboveBudget).toEqual([]);
    expect(clean.evidence.driftReview).toBe("no-regeneration-required");
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

describe("recommend — clause 2, two hard stops, neither a fallback", () => {
  const noSeparation = buildRows({
    snapshots: ["small", "large"],
    thresholds: [0],
    area: (s) => (s === "small" ? 100 : 10000),
    counts: (pairing, snapshot) => {
      if (pairing === "run") return snapshot === "small" ? 1 : 100;
      if (pairing === "drift") return 1;
      return snapshot === "small" ? 50 : 5000;
    },
  });

  it("returns no-separation and never a guessed number", () => {
    const result = recommend(noSeparation);
    expect(result.verdict).toBe("no-separation");
    expect(result.threshold).toBeNull();
    expect(result).not.toHaveProperty("maxDiffPixels");
    expect(result).not.toHaveProperty("maxDiffPixelRatio");
  });

  it("carries the best achievable ratio and the snapshots driving it", () => {
    const { evidence } = recommend(noSeparation);
    expect(evidence.bestThreshold).toBe(0);
    expect(evidence.separation).toBe(0.5); // S = 50, N = 100
    expect(evidence.drivingSnapshots).toEqual(
      expect.arrayContaining(["small", "large"]) // the S minimum and the N maximum
    );
  });

  it("reports ratioDomainSeparation — the datum that says form question vs comparator question", () => {
    // Absolute domain separates 0.5x; the ratio domain separates 50x, because
    // the noise is concentrated in the large image and the signal is not.
    const { evidence } = recommend(noSeparation);
    expect(evidence.ratioDomainSeparation).toBeCloseTo(50, 6);
  });

  it("returns defect-not-caught — a DIFFERENT stop — when the sweep is blind to the defect", () => {
    const result = recommend(
      buildRows({
        snapshots: ["a"],
        thresholds: [0],
        counts: (pairing) => (pairing === "signal" ? 1000 : 1),
        reproduction: () => 0,
      })
    );
    expect(result.verdict).toBe("defect-not-caught");
    expect(result.threshold).toBeNull();
    expect(result).not.toHaveProperty("maxDiffPixels");
    expect(result).not.toHaveProperty("maxDiffPixelRatio");

    const point = result.evidence.perThreshold[0];
    expect(point.separationState).toBe("separated");
    expect(point.R).toBe(0);
    expect(point.budgetInterval).toEqual({ lower: 2, upper: -1 });
    expect(point.infeasibleReason).toBe("blind-to-defect");
  });

  it("distinguishes `clamps-cross` — the defect is visible, but not by enough", () => {
    const result = recommend(
      buildRows({
        snapshots: ["a"],
        thresholds: [0],
        counts: (pairing) => {
          if (pairing === "signal") return 100;
          if (pairing === "drift") return 0;
          return 10;
        },
        reproduction: () => 15,
      })
    );
    expect(result.verdict).toBe("defect-not-caught");
    const point = result.evidence.perThreshold[0];
    expect(point.separationState).toBe("separated"); // 100 >= 10 x 10, inclusive
    expect(point.R).toBe(15);
    expect(point.budgetInterval).toEqual({ lower: 20, upper: 14 });
    expect(point.infeasibleReason).toBe("clamps-cross");
  });

  it("keeps the two stops apart — same shape, different diagnosis, neither a number", () => {
    const stops = [
      recommend(noSeparation).verdict,
      recommend(
        buildRows({
          snapshots: ["a"],
          thresholds: [0],
          counts: (pairing) => (pairing === "signal" ? 1000 : 1),
          reproduction: () => 0,
        })
      ).verdict,
    ];
    expect(new Set(stops).size).toBe(2);
    expect(stops).toEqual(["no-separation", "defect-not-caught"]);
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

  it("changes S and leaves N unchanged — an excluded snapshot still feeds N_run and driftP90", () => {
    const before = recommend(skewed);
    const after = recommend(skewed, {
      excludedFromSignal: [{ snapshot: "snap-00", reason: "low-contrast, verified by eye" }],
    });

    expect(before.evidence.S).toBe(300);
    expect(after.evidence.S).toBe(1000);
    expect(after.evidence.N_run).toBe(before.evidence.N_run);
    expect(after.evidence.driftP90).toBe(before.evidence.driftP90);
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

  it("throws when the set carries no `reproduction` rows, which makes clause 1(b) unevaluable", () => {
    const rows = healthy().filter((r) => r.pairing !== "reproduction");
    expect(() => recommend(rows)).toThrow(/reproduction/);
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
 * RUN noise is concentrated in the large image while the signal is
 * proportionally identical in both, so the RATIO domain leaves two decades more
 * slack.
 *
 *   S  = 5000     Ñ  = 400        H_abs   = log10((5000/2) / (2 x 400))  = 0.49485
 *   Sr = 0.5      Nr = 0.0004     H_ratio = log10((0.5/2)  / 0.0008)     = 2.49485
 */
function ratioFavouring() {
  return buildRows({
    snapshots: ["small", "large"],
    thresholds: [0],
    area: (s) => (s === "small" ? 10000 : 1000000),
    counts: (pairing, snapshot) => {
      if (pairing === "run") return snapshot === "small" ? 1 : 400;
      if (pairing === "drift") return 1;
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
        snapshots: ["small", "large"],
        thresholds: [0],
        counts: (pairing, snapshot) => {
          if (pairing === "run") return snapshot === "small" ? 1 : 100;
          if (pairing === "drift") return 1;
          return snapshot === "small" ? 50 : 5000;
        },
      })
    );
    expect(noSeparation.verdict).toBe("no-separation");
    expect(noSeparation).not.toHaveProperty("maxDiffPixelRatio");

    const notCaught = recommend(
      buildRows({
        snapshots: ["a"],
        thresholds: [0],
        counts: (pairing) => (pairing === "signal" ? 1000 : 1),
        reproduction: () => 0,
      })
    );
    expect(notCaught.verdict).toBe("defect-not-caught");
    expect(notCaught).not.toHaveProperty("maxDiffPixelRatio");
  });
});

describe("recommend — clause 4, the headroom diagnostic", () => {
  it("floors H_abs's denominator on Ñ, not on the arbitrary constant 1", () => {
    const { evidence } = recommend(healthy());
    // (S / signalMargin) / (noiseHeadroom x Ñ) = (1000/2) / (2 x 5) = 50.
    expect(evidence.H_abs).toBeCloseTo(Math.log10(50), 9);
    // Uniform areas: the ratio domain is the absolute domain scaled by a
    // constant, so the two headrooms coincide exactly.
    expect(evidence.H_ratio).toBeCloseTo(evidence.H_abs, 9);
  });

  it("takes its floor from Ñ even where N itself measures 0", () => {
    // The discriminating case. At t = 0.1 the run pairing measures 0, so pass
    // 2's `max(noiseHeadroom x N, 1)` collapsed onto the constant — a floor
    // with no measurement behind it. Clause 3 already floors Ñ on N0, so the
    // denominator is `noiseHeadroom x Ñ` and nothing else.
    //
    // Noise lives in `noisy`, the weak signal in `quiet`, so clause 0 — which
    // is per-snapshot against that snapshot's OWN run count — passes on both
    // while clause 1(a), reading S as a min against N as a max, does not.
    //
    //   t    | N_run = N | Ñ (N0 = 4) | S  | separationState | eligible
    //   0    |     4     |     4      | 36 | unseparated (9x)| no
    //   0.1  |     0     |     4      | 32 | unbounded       | yes
    const { evidence, threshold, maxDiffPixels } = recommend(
      buildRows({
        snapshots: ["quiet", "noisy"],
        thresholds: [0, 0.1],
        counts: (pairing, snapshot, t) => {
          if (pairing === "run") return snapshot === "noisy" && t === 0 ? 4 : 0;
          if (pairing === "drift") return 0;
          if (snapshot === "noisy") return t === 0 ? 400 : 350;
          return t === 0 ? 36 : 32;
        },
      })
    );

    expect(threshold).toBe(0.1);
    expect(evidence.N).toBe(0);
    expect(evidence.N0).toBe(4);
    expect(evidence.Ntilde).toBe(4);
    // (S / signalMargin) / (noiseHeadroom x Ñ) = (32/2) / (2 x 4) = 2.
    expect(evidence.H_abs).toBeCloseTo(Math.log10(2), 9);
    // H_ratio is untouched and still rests on its own `1 / maxArea` quantum,
    // which at Nr = 0 leaves it a factor of 8 above H_abs — so the same floor
    // change is what lets clause 4 see the gap at all.
    expect(evidence.H_ratio).toBeCloseTo(Math.log10(16), 9);
    expect(evidence.formReview).toBe("ratio-has-more-headroom");
    // And it changes nothing that is emitted.
    expect(maxDiffPixels).toBe(11); // round(sqrt(4 x 32)), inside [8, 16]
  });

  it("reports the ratio-domain aggregates it was computed from", () => {
    const { evidence } = recommend(ratioFavouring());
    expect(evidence.Sr).toBeCloseTo(0.5, 9);
    expect(evidence.Nr_run).toBeCloseTo(0.0004, 9);
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
    // H_abs's floor is Ñ = max(N(0), N0) = max(0, 1) = 1, so its denominator is
    // `noiseHeadroom x 1` = 2 — half the ratio domain's, one log10(2) apart.
    expect(evidence.H_abs).toBeCloseTo(Math.log10(200), 9);
    expect(evidence.formReview).toBe("ratio-has-more-headroom");
    expect(maxDiffPixels).toBe(28); // round(sqrt(1 x 800)), inside [2, 400]
  });
});

describe("recommend — the sweep point where S(t) itself measures 0", () => {
  it("is INELIGIBLE, not selectable — re-pinned from pass 2's `ok` with budget 0", () => {
    // Pass 2 recorded `verdict ok, threshold 0.1, maxDiffPixels 0` here, with
    // H_abs and H_ratio both -Infinity. Revision 3 makes the point unreachable
    // by construction: at S = 0 the upper clamp is min(floor(0/2), R-1) = 0
    // while the lower clamp is ceil(2 x Ñ) >= 2, so the interval is empty.
    const result = recommend(
      buildRows({
        snapshots: ["a"],
        thresholds: [0, 0.1],
        counts: (pairing, _s, t) => (pairing === "signal" && t === 0 ? 100 : 0),
      })
    );

    const degenerate = result.evidence.perThreshold.find((p) => p.threshold === 0.1);
    expect(degenerate.S).toBe(0);
    expect(degenerate.budgetInterval).toEqual({ lower: 2, upper: 0 });
    expect(degenerate.feasible).toBe(false);
    expect(degenerate.infeasibleReason).toBe("clamps-cross");
    expect(degenerate.eligible).toBe(false);

    // The rule still answers, from the point that IS eligible.
    expect(result.verdict).toBe("ok");
    expect(result.threshold).toBe(0);
    expect(result.maxDiffPixels).toBe(10);
    expect(Number.isFinite(result.evidence.H_abs)).toBe(true);
  });
});
