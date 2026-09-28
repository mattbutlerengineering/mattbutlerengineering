/**
 * behavioral-freshness.js — classify what a carried-forward behavioral
 * reading (`flake` / `agent_pr` / `auto_qa_tuning`) actually evidences, so a
 * value frozen from a run days ago can never feed a behavioral gate as if it
 * were live (#5852 AC3).
 *
 * Same shape of trap as `evals-freshness.js` (#4199/#5655): `audit.js` falls
 * back to `prior.behavioral.flake`/`prior.behavioral.agent_pr` whenever `gh`
 * is unavailable that run, and every one of those readings carries its own
 * `measured_at` from whenever it was last genuinely measured — unlike
 * `evals`, `measured_at` here is NOT refreshed on a carried-forward value
 * (see `audit.js`'s behavioral-snapshot assembly), so it is a trustworthy
 * "how old is this number" signal on its own, without a separate `lastRun`
 * field to distinguish.
 *
 * A reading older than `maxAgeDays` (7, matching the flake/PR-outcome 30-day
 * windows' own weekly cadence) must be treated as MISSING for gating purposes
 * — not read as a live measurement — while still being displayable with its
 * age so the report can say why a gate is unverifiable instead of silently
 * omitting the number.
 *
 * Fails closed on an age it cannot establish: a reading with no parseable
 * `measured_at` is stale, never fresh.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Matches the flake/PR-outcome behavioral gates' own re-measurement cadence. */
export const DEFAULT_MAX_AGE_DAYS = 7;

/**
 * @typedef {Object} BehavioralFreshnessVerdict
 * @property {boolean} stale
 * @property {number|null} ageDays  Whole days since `measured_at`; null when
 *                                  absent or unparseable.
 */

/**
 * @param {string} [measuredAt]
 * @param {Date} [now]
 * @returns {number|null}
 */
export function ageInDays(measuredAt, now = new Date()) {
  const ts = typeof measuredAt === "string" ? Date.parse(measuredAt) : Number.NaN;
  if (Number.isNaN(ts)) return null;
  return Math.floor((now.getTime() - ts) / MS_PER_DAY);
}

/**
 * @param {{ measured_at?: string }|null|undefined} reading
 * @param {{ now?: Date, maxAgeDays?: number }} [opts]
 * @returns {BehavioralFreshnessVerdict}
 */
export function classifyBehavioralFreshness(reading, opts = {}) {
  if (!reading) return { stale: true, ageDays: null };
  const ageDays = ageInDays(reading.measured_at, opts.now ?? new Date());
  if (ageDays === null) return { stale: true, ageDays: null };
  return { stale: ageDays > (opts.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS), ageDays };
}

/**
 * Returns `reading` unchanged when fresh, or `null` when stale/unparseable —
 * so a carried-forward value that has aged past the freshness window is
 * treated as MISSING data by computeLevel's gates (unverifiable), never read
 * as a live measurement.
 *
 * @param {{ measured_at?: string }|null|undefined} reading
 * @param {{ now?: Date, maxAgeDays?: number }} [opts]
 */
export function freshBehavioralReading(reading, opts = {}) {
  return classifyBehavioralFreshness(reading, opts).stale ? null : reading;
}

/**
 * One-line description of a reading's age for console/report output —
 * printed regardless of whether the reading feeds a gate, so a stale value
 * is visible rather than silently dropped.
 *
 * @param {string} label
 * @param {{ measured_at?: string }|null|undefined} reading
 * @param {{ now?: Date, maxAgeDays?: number }} [opts]
 * @returns {string}
 */
export function describeBehavioralAge(label, reading, opts = {}) {
  if (!reading) return `${label}: no reading`;
  const { stale, ageDays } = classifyBehavioralFreshness(reading, opts);
  if (ageDays === null) return `${label}: unrecorded measurement time (treated as stale)`;
  return stale
    ? `${label}: STALE — ${ageDays}d old (measured ${reading.measured_at?.slice(0, 10)}), treated as unverifiable`
    : `${label}: fresh (${ageDays}d old)`;
}
