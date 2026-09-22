/**
 * evals-freshness.js — classify what an agent-eval reading actually evidences,
 * so a reading carried forward from a run months ago can never be published as
 * a current one (#4199).
 *
 * The trap this module closes is narrower than "no data". `measureEvals`
 * already returned `n: 0, status: "unknown"` for a corpus with nothing inside
 * its 30-day window — it was correct. What it could not survive is `audit.js`
 * throwing that correct answer away:
 *
 *     evals: evalsSummary.n > 0
 *       ? { ...evalsSummary, measured_at: new Date().toISOString() }
 *       : (prior.behavioral?.evals ?? null),
 *
 * The fallback substitutes the previous state.json value whenever the current
 * measurement is empty, and every display site then renders that substitute
 * exactly like a live one. Measured on the audit state committed at
 * `47a029433` on 2026-09-21: `behavioral.evals` carried
 * `lastRun: "2026-05-10T21:42:57.095Z"` and
 * `measured_at: "2026-05-30T17:04:57.036Z"` — 133 days since the eval suite
 * last ran, 114 days since the number was last genuinely measured — while the
 * audit printed
 *
 *     Agent evals: 86% pass · score 1.00 (n=37, status: green)
 *
 * and `report.md` filed the same figures under the heading
 * "## Agent evals (last 30 days)". Every one of the 37 rows behind that number
 * is dated 2026-05-07..2026-05-10 in `metrics/acmm-evals.jsonl`; the harness
 * has not written a row since. Nothing in either output said so.
 *
 * Why a stale reading is worse than no reading: an absent number prompts
 * someone to go run the evals, while a confident green one closes the
 * question. The ACMM audit's whole job is to report the repo's real maturity,
 * and this was the one behavioral signal quietly frozen in May. Same family as
 * `classifyCiGateStatus`'s `gate-missing` (an absent check reading as green),
 * `classifyMutationRun`'s `harness-broken` (a harness that ran nothing
 * reading as a 0% score), and `classifyBuildFreshness`'s `unknown` — an
 * absence that renders identically to a fine result.
 *
 * States, none of which can be conflated with another:
 *   - `absent`     — no reading at all. Nothing measured, nothing carried.
 *   - `never-run`  — a reading that evidences no run ever (`lastRun` absent).
 *                    NOT a 0% score: the suite never executed.
 *   - `stale`      — a real measurement whose newest run predates the window
 *                    it claims to describe. The number is true of some past
 *                    moment and says nothing about now.
 *   - `current`    — newest run inside the window; the number means what it
 *                    says.
 *
 * Classification keys on `lastRun` (when the eval suite actually ran), never on
 * `measured_at` (when the audit last looked). `measured_at` is refreshed on
 * every audit that takes a real measurement, so it is recent by construction
 * and would report a four-month-old corpus as fresh — that asymmetry is the
 * whole reason the staleness stayed invisible.
 *
 * Fails closed on an age it cannot establish: a reading with runs but an
 * unparseable `lastRun` is `stale` with `ageDays: null`, never `current`. An
 * existing reading is never trusted merely because its staleness could not be
 * proven.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Matches `measureEvals`'s own default window. */
const DEFAULT_WINDOW_DAYS = 30;

/**
 * @typedef {"absent" | "never-run" | "stale" | "current"} EvalsFreshnessState
 *
 * @typedef {Object} EvalsFreshnessVerdict
 * @property {EvalsFreshnessState} state
 * @property {number|null} ageDays   Whole days since `lastRun`; null when it
 *                                   cannot be established or does not apply.
 * @property {string|null} lastRun   The reading's own `lastRun`, echoed.
 */

/**
 * Classify what an eval reading evidences right now.
 *
 * @param {object|null|undefined} reading - A `behavioral.evals` object, fresh
 *   from {@link measureEvals} or carried forward from a prior state.json.
 * @param {{ now?: Date, windowDays?: number }} [opts]
 * @returns {EvalsFreshnessVerdict}
 */
export function classifyEvalsReading(reading, opts = {}) {
  if (!reading) return { state: "absent", ageDays: null, lastRun: null };

  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? reading.windowDays ?? DEFAULT_WINDOW_DAYS;
  const lastRun = typeof reading.lastRun === "string" ? reading.lastRun : null;
  const ts = lastRun === null ? Number.NaN : Date.parse(lastRun);

  if (Number.isNaN(ts)) {
    // No usable timestamp. A reading with no runs behind it never ran; one
    // with runs behind it ran at an unknowable time, which is not `current`.
    const hasRuns = typeof reading.n === "number" && reading.n > 0;
    return { state: hasRuns ? "stale" : "never-run", ageDays: null, lastRun };
  }

  const ageDays = Math.floor((now.getTime() - ts) / MS_PER_DAY);
  return { state: ageDays > windowDays ? "stale" : "current", ageDays, lastRun };
}

/**
 * Render the audit's one-line eval summary, honouring {@link
 * classifyEvalsReading}'s verdict. Only a `current` reading may render as a
 * bare pass-rate; the other three states name themselves.
 *
 * @param {object|null|undefined} reading
 * @param {{ now?: Date, windowDays?: number }} [opts]
 * @returns {string}
 */
export function formatEvalsLine(reading, opts = {}) {
  const { state, ageDays, lastRun } = classifyEvalsReading(reading, opts);

  if (state === "current") {
    const pct = (reading.passRate * 100).toFixed(0);
    return `Agent evals: ${pct}% pass · score ${reading.medianScore.toFixed(2)} (n=${reading.n}, status: ${reading.status})`;
  }

  if (state === "stale") {
    const age = ageDays === null ? "an unknown time" : `${ageDays} days`;
    const when = lastRun === null ? "an unrecorded date" : lastRun.slice(0, 10);
    return `Agent evals: STALE — last ran ${age} ago (${when}); the suite has not run since. Not a current reading. Re-run: node plugins/acmm/scripts/evals/index.js`;
  }

  return "Agent evals: no runs ever recorded — the suite has never executed (this is not a 0% score). Seed via `node plugins/acmm/scripts/evals/index.js`";
}
