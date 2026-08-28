#!/usr/bin/env node

/**
 * visual-tolerance-rule.mjs — which `(threshold, maxDiffPixels)` pair a
 * measurement set justifies, and — equally its job — saying that **no pair is
 * justified**.
 *
 * Pure arithmetic over a table of integers. **Zero imports, by design:** the
 * rule is the policy and the analyzer is the detail, so the dependency points
 * the other way — the rule declares the `Measurement` row shape it needs and
 * the analyzer produces rows to that shape. Neither this module nor its test
 * can reach an image, a filesystem, or a comparator.
 *
 * Row shape consumed (docs/fixes/visual-tolerance-threshold/architecture.md
 * § Data model):
 *
 *   { snapshot, width, height, area, pairing, threshold, count, ratio }
 *
 * with `pairing` one of `run` (replica-a vs replica-b — instantaneous
 * rendering noise, and the ONLY noise term), `drift` (replica-a vs the
 * committed baseline — reported and triaged, never a term), `signal`
 * (perturbed vs replica-a — the regression the suite must catch) and
 * `reproduction` (replica-a vs replica-a shifted by `defectAmplitude` — a
 * synthetic regression of KNOWN amplitude, the only term that is a function of
 * amplitude rather than of one particular perturbation).
 *
 * Five outcomes, none of them a guess: `"ok"` with a pair, three hard stops —
 * `"signal-not-observed"` (clause 0: the instrument did not perturb something
 * it should have), `"no-separation"` (clause 2: pixel counting cannot separate
 * this regression from this suite's noise), `"defect-not-caught"` (clause 2: no
 * sweep point admits a budget that both clears the noise floor and stays under
 * the defect's own reproduction) — and a throw on a malformed set.
 *
 * Usage (reads a measurement JSON on stdin, writes a Recommendation on stdout):
 *   node scripts/visual-tolerance-rule.mjs < measurement.json > recommendation.json
 */

/** Every verdict this module can return. Exhaustive. */
export const VERDICTS = ["ok", "signal-not-observed", "no-separation", "defect-not-caught"];

/** The four pairings a well-formed measurement set carries. */
export const PAIRINGS = ["run", "drift", "signal", "reproduction"];

/**
 * Every knob, defaulted. The resolved set is echoed into `evidence.opts`, so a
 * Recommendation is self-describing and no caller has to be consulted to read
 * one.
 *
 * | field                | default | meaning                                             |
 * | -------------------- | ------- | --------------------------------------------------- |
 * | `separationFactor`   | `10`    | required signal-to-noise ratio (clause 1, clause 0) |
 * | `noiseHeadroom`      | `2`     | lower clamp multiplier on `Ñ(t)` (clause 3)         |
 * | `signalMargin`       | `2`     | upper clamp divisor on `S(t)` (clause 3)            |
 * | `defectAmplitude`    | `36`    | per-channel delta behind the `reproduction` pairing |
 * | `driftPercentile`    | `90`    | percentile over `drift` — REPORTED, never a term    |
 * | `formReviewDecades`  | `0.3`   | headroom gap at which clause 4 flags the form       |
 * | `excludedFromSignal` | `[]`    | `{ snapshot, reason }[]` — human-supplied           |
 *
 * `defectAmplitude` is not applied here — the analyzer applies it when it
 * builds the `reproduction` rows. It is carried so a Recommendation records the
 * amplitude its `R(t)` column was taken at: a set measured at a different
 * amplitude is a different measurement, not a comparable one.
 */
export const DEFAULT_OPTS = {
  separationFactor: 10,
  noiseHeadroom: 2,
  signalMargin: 2,
  defectAmplitude: 36,
  driftPercentile: 90,
  formReviewDecades: 0.3,
  excludedFromSignal: [],
};

/**
 * Nearest-rank percentile. Defined here rather than shared, because sharing it
 * would mean importing something.
 */
function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)];
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validate the set and index it. Every failure throws: an empty or partial set
 * is never worked around, and the rule never extrapolates across a missing
 * sweep point.
 */
function index(measurements) {
  if (!Array.isArray(measurements)) {
    throw new Error("measurement set must be an array of Measurement rows");
  }
  if (measurements.length === 0) {
    throw new Error("measurement set is empty — refusing to recommend from nothing");
  }

  const cells = new Map();
  const snapshots = new Set();
  const thresholds = new Set();
  const areas = new Map();

  for (const row of measurements) {
    if (typeof row?.snapshot !== "string" || row.snapshot === "") {
      throw new Error(`Measurement row has no snapshot name: ${JSON.stringify(row)}`);
    }
    if (!PAIRINGS.includes(row.pairing)) {
      throw new Error(`${row.snapshot}: unknown pairing ${JSON.stringify(row.pairing)}`);
    }
    if (!isFiniteNumber(row.threshold)) {
      throw new Error(`${row.snapshot}: threshold is not a number`);
    }
    if (!isFiniteNumber(row.count)) {
      throw new Error(
        `${row.snapshot} (${row.pairing}, t=${row.threshold}): count is not a number`
      );
    }
    if (!isFiniteNumber(row.ratio)) {
      throw new Error(
        `${row.snapshot} (${row.pairing}, t=${row.threshold}): ratio is not a number`
      );
    }
    if (!isFiniteNumber(row.area) || row.area <= 0) {
      throw new Error(`${row.snapshot}: area is not a positive number`);
    }

    const key = `${row.snapshot} ${row.pairing} ${row.threshold}`;
    if (cells.has(key)) {
      throw new Error(`${row.snapshot} (${row.pairing}, t=${row.threshold}): duplicate row`);
    }
    cells.set(key, row);
    snapshots.add(row.snapshot);
    thresholds.add(row.threshold);
    areas.set(row.snapshot, row.area);
  }

  const snapshotList = [...snapshots].sort();
  const thresholdList = [...thresholds].sort((a, b) => a - b);

  if (!thresholdList.includes(0)) {
    throw new Error(
      "measurement set has no threshold 0 rows — clause 0 (`observed`) is evaluated at t = 0 " +
        "and the rule never extrapolates across a missing sweep point"
    );
  }

  // A set with no `reproduction` rows is rejected by the completeness loop
  // below, for the same reason a set with no `t = 0` rows is rejected above:
  // clause 1(b) becomes unevaluable, and the rule never skips a clause it
  // cannot evaluate.
  for (const snapshot of snapshotList) {
    for (const pairing of PAIRINGS) {
      for (const threshold of thresholdList) {
        if (!cells.has(`${snapshot} ${pairing} ${threshold}`)) {
          throw new Error(
            `${snapshot}: measurement set is partial — no ${pairing} row at threshold ${threshold}`
          );
        }
      }
    }
  }

  const at = (pairing, snapshot, threshold) => cells.get(`${snapshot} ${pairing} ${threshold}`);

  return { snapshots: snapshotList, thresholds: thresholdList, at, areas };
}

function resolveOpts(opts) {
  const resolved = { ...DEFAULT_OPTS, ...opts };
  resolved.excludedFromSignal = [...(resolved.excludedFromSignal ?? [])];
  return resolved;
}

/**
 * `signalSet` = every snapshot minus the explicit exclusions.
 *
 * A derived predicate, never a stored field and never a hand-maintained list.
 * Each exclusion must carry a reason: it echoes into `evidence.excluded` and
 * therefore into the provenance record, so shrinking the signal set can never
 * happen quietly.
 *
 * An excluded snapshot still contributes to `N_run`, the drift percentile and
 * `R` — its noise, its drift and its response to a known-amplitude shift are
 * real properties of this suite whether or not the perturbation reached it.
 */
function resolveSignalSet(snapshots, excludedFromSignal) {
  const excludedNames = new Set();
  for (const entry of excludedFromSignal) {
    const snapshot = entry?.snapshot;
    const reason = entry?.reason;
    if (typeof snapshot !== "string" || snapshot.trim() === "") {
      throw new Error(`excludedFromSignal entry has no snapshot: ${JSON.stringify(entry)}`);
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      throw new Error(
        `excludedFromSignal entry for ${snapshot} has no reason — an exclusion without one ` +
          "is exactly the silent loosening this rule exists to prevent"
      );
    }
    if (!snapshots.includes(snapshot)) {
      throw new Error(`excludedFromSignal names ${snapshot}, which is not in the measurement set`);
    }
    excludedNames.add(snapshot);
  }

  const signalSet = snapshots.filter((s) => !excludedNames.has(s));
  if (signalSet.length === 0) {
    throw new Error(
      "excludedFromSignal empties the signal set — there would be no S(t) to compute"
    );
  }
  return signalSet;
}

/**
 * The aggregates at one sweep point, in either the absolute (`count`) or the
 * ratio domain — clause 4 needs the second, and it costs one more pass over
 * rows that already carry `ratio`.
 *
 * `N(t) = N_run(t)`. `drift` is NOT a noise term (revision 3): it is
 * contaminated by real un-baselined UI change by construction, and P90 is not a
 * de-contaminant on a distribution that is mostly zeros. It keeps its
 * percentile, its named outlier list and — at the selected `t` —
 * `driftAboveBudget`, none of which move the answer.
 *
 * Separation is THREE-valued. `S >= factor x N` at `N = 0` reads `S >= 0`,
 * which is true for every threshold and every signal whatsoever; a boolean
 * cannot hold both "not violated" and "not measured", so `"unbounded"` records
 * the truth. It is neither a disqualification nor a recommendation.
 */
function aggregatesAt({ snapshots, signalSet, at }, threshold, opts, field) {
  const nRun = Math.max(...snapshots.map((s) => at("run", s, threshold)[field]));
  const driftP90 = percentile(
    snapshots.map((s) => at("drift", s, threshold)[field]),
    opts.driftPercentile
  );
  const s = Math.min(...signalSet.map((x) => at("signal", x, threshold)[field]));
  // R is a minimum over ALL snapshots, not the signal set: the suite must catch
  // the defect's amplitude on the baseline where that amplitude is hardest to
  // see, and an exclusion is about the perturbation, not about the amplitude.
  const r = Math.min(...snapshots.map((x) => at("reproduction", x, threshold)[field]));
  const n = nRun;

  let separationState;
  if (n === 0) separationState = "unbounded";
  else if (s >= opts.separationFactor * n) separationState = "separated";
  else separationState = "unseparated";

  return {
    nRun,
    n,
    driftP90,
    s,
    r,
    separationState,
    // Unbounded separation is reported as `null`, not `Infinity`: JSON has no
    // spelling for Infinity and would silently write `null` anyway.
    separation: n === 0 ? null : s / n,
  };
}

/** Snapshots whose `drift` count exceeds P90 at this sweep point, by name. */
function driftOutliersAt({ snapshots, at }, threshold, driftP90) {
  return snapshots.filter((s) => at("drift", s, threshold).count > driftP90);
}

/**
 * The snapshots whose committed baseline sits FURTHER from replica-a than the
 * emitted budget — the baseline-regeneration precondition the emitted pair
 * depends on, because the pair is green only for baselines equal to replica-a.
 */
function driftAboveBudgetAt({ snapshots, at }, threshold, budget) {
  return snapshots
    .map((snapshot) => ({ snapshot, count: at("drift", snapshot, threshold).count }))
    .filter((d) => d.count > budget)
    .sort((a, b) => b.count - a.count || a.snapshot.localeCompare(b.snapshot));
}

/** The snapshots that determine `S` (the weakest signal) and `N` (the loudest noise). */
function drivingSnapshotsAt({ snapshots, signalSet, at }, threshold, agg) {
  const driving = [];
  for (const s of signalSet) {
    if (at("signal", s, threshold).count === agg.s) driving.push(s);
  }
  for (const s of snapshots) {
    if (at("run", s, threshold).count === agg.nRun && !driving.includes(s)) driving.push(s);
  }
  return driving;
}

/**
 * ── Clause 4: the budget FORM is fixed, and reviewed rather than chosen ──
 *
 * The emitted form is always `maxDiffPixels`. `maxDiffPixelRatio` is never
 * emitted, on any verdict — the ratio form has already failed on this suite
 * once (#4450 -> #4496), image width is near-constant across the set, and
 * `parseMaxDiffPixels` on `main` returns `null` the moment a ratio appears.
 *
 * A fiat is worth exactly as much as the evidence that it costs nothing, so the
 * same aggregates are recomputed over the `ratio` column and the two domains
 * are compared as HEADROOM — decades of room between the noise ceiling and the
 * signal floor at the selected `t`:
 *
 *   H_abs   = log10( (S  / signalMargin) / (noiseHeadroom × Ñ) )
 *   H_ratio = log10( (Sr / signalMargin) / max(noiseHeadroom × Nr, 1 / maxArea) )
 *
 * `H_abs` takes its floor from clause 3 rather than inventing one: `Ñ(t)` is
 * already floored on `N0`, a measurement, so `max(…, 1)` would be a constant
 * with nothing behind it. `H_ratio` is untouched and keeps its `1 / maxArea`
 * quantum — one pixel in the largest image, the smallest resolvable non-zero
 * quantity in that domain, and the reading recorded in breakdown.md § Design
 * gaps. `Nr` and `maxArea` are both reported, so a reviewer can see when the
 * comparison rests on the floor.
 *
 * This clause NEVER changes what is emitted. It is a trigger to re-open the
 * form question with a number attached, not a reversal.
 */
function headroomAt(set, threshold, opts, maxArea, { S, Ntilde }) {
  const rat = aggregatesAt(set, threshold, opts, "ratio");

  const hAbs = Math.log10(S / opts.signalMargin / (opts.noiseHeadroom * Ntilde));
  const hRatio = Math.log10(
    rat.s / opts.signalMargin / Math.max(opts.noiseHeadroom * rat.n, 1 / maxArea)
  );

  return {
    Sr: rat.s,
    Nr_run: rat.nRun,
    Nr: rat.n,
    maxArea,
    H_abs: hAbs,
    H_ratio: hRatio,
    formReview:
      hRatio - hAbs > opts.formReviewDecades ? "ratio-has-more-headroom" : "absolute-confirmed",
  };
}

/**
 * The rule.
 *
 * @param {Array<object>} measurements the `Measurement` row set
 * @param {object} [opts] see {@link DEFAULT_OPTS}
 * @returns {{verdict: string, threshold: number|null, maxDiffPixels?: number, evidence: object}}
 */
export function recommend(measurements, opts = {}) {
  const resolved = resolveOpts(opts);
  const { snapshots, thresholds, at, areas } = index(measurements);
  const signalSet = resolveSignalSet(snapshots, resolved.excludedFromSignal);
  const set = { snapshots, signalSet, at };
  // `maxArea` is the largest area in the measurement set — clause 4's ratio-domain
  // floor is one pixel in the largest image (breakdown.md § Design gaps).
  const maxArea = Math.max(...areas.values());

  // ── Clause 0: did the instrument actually perturb what it claims to? ──
  //
  // observed(s) ⟺ count(signal, s, 0) >= separationFactor × max(count(run, s, 0), 1)
  //
  // A snapshot that fails is a HARD STOP, never a silent exclusion: dropping it
  // from the `min` can only RAISE S, which raises the budget, which loosens the
  // suite — the defect's own direction, arriving most easily on exactly the
  // low-contrast snapshots where the perturbation is hardest to see.
  const observed = {};
  const unobserved = [];
  for (const snapshot of signalSet) {
    const signalAtZero = at("signal", snapshot, 0).count;
    const runAtZero = at("run", snapshot, 0).count;
    const required = resolved.separationFactor * Math.max(runAtZero, 1);
    const ok = signalAtZero >= required;
    observed[snapshot] = { signalAtZero, runAtZero, required, observed: ok };
    if (!ok) unobserved.push(snapshot);
  }

  const baseEvidence = {
    opts: resolved,
    excluded: resolved.excludedFromSignal,
    signalSet,
    thresholds,
    observed,
    unobserved,
  };

  if (unobserved.length > 0) {
    // No numbers on this return. The verdict is about the instrument, not the
    // suite, and there is nothing here to tune.
    return { verdict: "signal-not-observed", threshold: null, evidence: baseEvidence };
  }

  // ── Clause 3's floor, computed once: no bound is ever derived from a
  // measured zero. `N0` is run-to-run noise at the STRICTEST sweep point — the
  // suite's noise floor in the literal sense. Every `N_run(t)` above it is that
  // same noise seen through a filter, so a zero there is an artefact of the
  // filter and never evidence of absence. The floor of 1 covers the rest: one
  // run of two replicas can BOUND the noise, it cannot establish that noise
  // cannot occur.
  const n0 = Math.max(aggregatesAt(set, 0, resolved, "count").nRun, 1);

  // ── Clause 1: eligibility, per sweep point, with every rejection reasoned ──
  const perThreshold = thresholds.map((threshold) => {
    const abs = aggregatesAt(set, threshold, resolved, "count");
    const ntilde = Math.max(abs.n, n0);
    const lower = Math.ceil(resolved.noiseHeadroom * ntilde);
    // `R(t) - 1` is clause 1(b): a budget strictly below the reproduction's own
    // count means the reproduction FAILS, structurally, for every pair this
    // rule is capable of emitting. At R = 0 the interval is empty and the point
    // is disqualified BY MEASUREMENT, not by a fiat about Playwright's default.
    const upper = Math.min(Math.floor(abs.s / resolved.signalMargin), abs.r - 1);
    const feasible = lower <= upper;

    return {
      threshold,
      N_run: abs.nRun,
      N: abs.n,
      Ntilde: ntilde,
      S: abs.s,
      R: abs.r,
      separationState: abs.separationState,
      separation: abs.separation,
      budgetInterval: { lower, upper },
      feasible,
      infeasibleReason: feasible ? null : abs.r === 0 ? "blind-to-defect" : "clamps-cross",
      eligible: abs.separationState !== "unseparated" && feasible,
    };
  });

  const eligible = perThreshold.filter((p) => p.eligible);

  if (eligible.length === 0) {
    // ── Clause 2: two hard stops, and neither is a fallback ──
    if (perThreshold.every((p) => p.separationState === "unseparated")) {
      // Pixel counting cannot separate this regression from this suite's noise.
      const best = perThreshold.reduce((a, b) =>
        (b.separation ?? Infinity) > (a.separation ?? Infinity) ? b : a
      );
      const absBest = aggregatesAt(set, best.threshold, resolved, "count");
      const ratioBest = aggregatesAt(set, best.threshold, resolved, "ratio");

      return {
        verdict: "no-separation",
        threshold: null,
        evidence: {
          ...baseEvidence,
          perThreshold,
          N0: n0,
          bestThreshold: best.threshold,
          N_run: best.N_run,
          N: best.N,
          Ntilde: best.Ntilde,
          S: best.S,
          R: best.R,
          separationState: best.separationState,
          separation: best.separation,
          // If this clears separationFactor while the absolute domain did not,
          // the route back to Architect is a FORM question rather than a
          // comparator question. Recorded, never auto-taken.
          ratioDomainSeparation: ratioBest.separation,
          drivingSnapshots: drivingSnapshotsAt(set, best.threshold, absBest),
          driftP90: absBest.driftP90,
          driftOutliers: driftOutliersAt(set, best.threshold, absBest.driftP90),
        },
      };
    }

    // Some point separates (or has no measurable noise to separate from), but
    // no sweep point admits a budget that sits both above the noise floor and
    // below the defect's own reproduction. Not an instrument failure, and not a
    // re-dispatch: a design question. `infeasibleReason` per sweep point says
    // which kind — `blind-to-defect` (R = 0) or `clamps-cross`.
    return {
      verdict: "defect-not-caught",
      threshold: null,
      evidence: { ...baseEvidence, perThreshold, N0: n0 },
    };
  }

  // ── Clause 1: select the SMALLEST eligible `t` ──
  //
  // Smallest, not largest: a threshold's blindness is unbounded in area — at
  // threshold `t` a change whose per-pixel colour distance falls under the
  // cutoff is invisible across ANY number of pixels — while a budget's
  // blindness is bounded in area, since at budget `B` at most `B` pixels can
  // change undetected whatever their amplitude. Noise tolerance is spent on the
  // budget, where the damage it admits is capped.
  const selected = eligible[0];

  // ── Clause 3: the budget magnitude ──
  //
  // The geometric mean sits centrally between noise and signal on a log scale,
  // which is the scale these quantities differ on. The lower clamp guarantees
  // observed noise still passes; the upper guarantees both that the known
  // regression still fails with a factor-of-`signalMargin` margin and that the
  // defect's own reproduction still fails.
  const { lower, upper } = selected.budgetInterval;
  const geometricMean = Math.round(Math.sqrt(selected.Ntilde * selected.S));
  const budget = Math.min(Math.max(geometricMean, lower), upper);

  const absSelected = aggregatesAt(set, selected.threshold, resolved, "count");
  const driftAboveBudget = driftAboveBudgetAt(set, selected.threshold, budget);

  return {
    verdict: "ok",
    threshold: selected.threshold,
    maxDiffPixels: budget,
    evidence: {
      ...baseEvidence,
      perThreshold,
      N0: n0,
      N_run: selected.N_run,
      N: selected.N,
      Ntilde: selected.Ntilde,
      S: selected.S,
      R: selected.R,
      separationState: selected.separationState,
      separation: selected.separation,
      budgetInterval: selected.budgetInterval,
      geometricMean,
      defectMargin: selected.R - budget,
      driftP90: absSelected.driftP90,
      driftOutliers: driftOutliersAt(set, selected.threshold, absSelected.driftP90),
      driftAboveBudget,
      // Not in architecture.md § recommend's Output contract; derived from
      // `driftAboveBudget` being non-empty, per breakdown.md § Design gaps
      // ("recorded, not routed"). It summarises, and can never change the pair.
      driftReview:
        driftAboveBudget.length > 0 ? "regeneration-required" : "no-regeneration-required",
      ...headroomAt(set, selected.threshold, resolved, maxArea, selected),
    },
  };
}

/** Read all of stdin without reaching for `node:fs`. */
async function readStdin() {
  process.stdin.setEncoding("utf8");
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  const args = process.argv.slice(2);
  const optsIdx = args.indexOf("--opts");
  const opts = optsIdx !== -1 ? JSON.parse(args[optsIdx + 1]) : {};

  const raw = await readStdin();
  const parsed = JSON.parse(raw);
  const measurements = Array.isArray(parsed) ? parsed : parsed.measurements;

  const recommendation = recommend(measurements, opts);
  process.stdout.write(`${JSON.stringify(recommendation, null, 2)}\n`);
}

if (process.argv[1] === import.meta.filename) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
