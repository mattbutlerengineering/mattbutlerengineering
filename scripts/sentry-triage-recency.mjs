/**
 * sentry-triage-recency.mjs — decide whether a Sentry issue is worth filing
 * a GitHub issue for, using the event count INSIDE the triage window rather
 * than the issue's lifetime total.
 *
 * Why this module exists (#5534, #5535, #5536, filed 2026-09-20):
 * `.claude/skills/sentry-triage/scripts/triage.mjs` fetched issues with
 * `?statsPeriod=14d` and then filtered on `parseInt(i.count) >= 5`.
 * `statsPeriod` does NOT bound the result set by `lastSeen` — it only
 * selects which `stats` series comes back — and `count` is the issue's
 * LIFETIME event total, not the total within that period. So a long-dead
 * issue whose events all landed months ago still passes a
 * "5 events in the last 14 days" filter forever, and the issue body then
 * states `**Events:** <lifetime> in last 14 days`, which is simply false.
 *
 * Measured on 2026-09-20 (project-issues endpoint), the three issues this
 * module was written for:
 *
 *   Sentry id    lifetime count   sum(stats["14d"])   last event    verdict
 *   7708233758        12                  0           2026-09-02    stale
 *   7708660134         9                  0           2026-09-03    stale
 *   7734806348        94                 95           2026-09-16    in-window
 *
 * All three were already fixed on `main` (#4927, #4957, #5426 respectively).
 * This module only closes the first two: their events fell entirely outside
 * the window, and the data proving it was already in the same payload
 * triage.mjs was reading — the `stats` series it ignored.
 *
 * DELIBERATE LIMITATION: 7734806348 fired 95 times INSIDE the window, so
 * recency cannot reject it and this module does not try to. It was stale
 * for a different reason — a fix landed after its last event. Detecting
 * that needs a different signal ("no events since the fix deployed"), which
 * is not what this module measures. Do not extend the recency gate to cover
 * it; a gate that rejects in-window errors would suppress live incidents.
 *
 * Failure direction: this module fails CLOSED. A missing or unparseable
 * window series yields `window-unknown` (never actionable) rather than
 * falling back to the lifetime count, because that fallback is precisely
 * the defect above. Callers are expected to LOG skipped issues so a payload
 * shape change surfaces as visible skips instead of a silent no-op — see
 * the `window-unknown` handling in triage.mjs.
 */

/** Sentry levels that represent a real application failure. */
const SEVERE_LEVELS = new Set(["error", "fatal"]);

/**
 * Total events for `issue` inside `period`, read from the `stats` series
 * Sentry returns alongside `?statsPeriod=<period>`.
 *
 * The series is an array of `[unixSeconds, count]` buckets. Returns `null`
 * — never 0 — when the series is absent or not an array, so "Sentry did not
 * tell us" stays distinguishable from "Sentry told us zero".
 */
export function countEventsInWindow(issue, period) {
  const series = issue?.stats?.[period];
  if (!Array.isArray(series)) {
    return null;
  }

  return series.reduce((total, bucket) => {
    const count = Array.isArray(bucket) ? Number(bucket[1]) : Number.NaN;
    return total + (Number.isFinite(count) ? count : 0);
  }, 0);
}

/**
 * Classify one Sentry issue as actionable or not.
 *
 * Returns `{ actionable, reason, eventsInWindow }` where `reason` is one of
 * `not-severe` | `window-unknown` | `stale` | `below-threshold` |
 * `actionable`. `eventsInWindow` is surfaced so the caller can put a
 * TRUE event count in the GitHub issue body instead of the lifetime total.
 */
export function classifySentryIssueActionability(issue, { severityThreshold, period }) {
  if (!SEVERE_LEVELS.has(issue?.level)) {
    return { actionable: false, reason: "not-severe", eventsInWindow: null };
  }

  const eventsInWindow = countEventsInWindow(issue, period);
  if (eventsInWindow === null) {
    return { actionable: false, reason: "window-unknown", eventsInWindow: null };
  }
  if (eventsInWindow === 0) {
    return { actionable: false, reason: "stale", eventsInWindow };
  }
  if (eventsInWindow < severityThreshold) {
    return { actionable: false, reason: "below-threshold", eventsInWindow };
  }

  return { actionable: true, reason: "actionable", eventsInWindow };
}
