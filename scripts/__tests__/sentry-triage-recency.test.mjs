import { describe, test, expect } from "vitest";

/**
 * Regression tests for the stale-issue defect that filed #5534 and #5535 on
 * 2026-09-20 — GitHub issues for Sentry errors whose last events were 17 and
 * 18 days old, both already fixed on main.
 *
 * Measured payloads (Sentry project-issues endpoint, statsPeriod=14d,
 * fetched 2026-09-20): both carried a lifetime `count` over the severity
 * threshold AND a `stats["14d"]` series summing to exactly 0. The data
 * needed to reject them was already on the wire; triage.mjs read the wrong
 * field.
 *
 * #5536 is deliberately covered as a NEGATIVE case: it fired 95 times
 * inside the window, so recency correctly leaves it alone.
 */
describe("sentry-triage-recency", () => {
  describe("countEventsInWindow", () => {
    test("sums the stats series for the requested period", async () => {
      const { countEventsInWindow } = await import("../sentry-triage-recency.mjs");

      const issue = {
        stats: {
          "14d": [
            [1_757_000_000, 3],
            [1_757_086_400, 0],
            [1_757_172_800, 4],
          ],
        },
      };

      expect(countEventsInWindow(issue, "14d")).toBe(7);
    });

    test("returns null when the period series is absent (never guesses)", async () => {
      const { countEventsInWindow } = await import("../sentry-triage-recency.mjs");

      expect(countEventsInWindow({ stats: {} }, "14d")).toBeNull();
      expect(countEventsInWindow({}, "14d")).toBeNull();
    });
  });

  describe("classifySentryIssueActionability", () => {
    const OPTS = { severityThreshold: 5, period: "14d" };

    test("#5535 repro: lifetime count 12, zero events in window -> stale, NOT actionable", async () => {
      const { classifySentryIssueActionability } = await import("../sentry-triage-recency.mjs");

      // Verbatim shape of Sentry issue 7708233758 ("FastifyError: The
      // decorator 'opentelemetry' has already been added!"). All 12 of its
      // events landed on 2026-09-02; triage ran 2026-09-20.
      const result = classifySentryIssueActionability(
        { level: "fatal", count: 12, stats: { "14d": [[1_757_000_000, 0]] } },
        OPTS
      );

      expect(result.actionable).toBe(false);
      expect(result.reason).toBe("stale");
      expect(result.eventsInWindow).toBe(0);
    });

    test("#5534 repro: lifetime count 9, zero events in window -> stale", async () => {
      const { classifySentryIssueActionability } = await import("../sentry-triage-recency.mjs");

      // Sentry issue 7708660134 ("HTTP 503: GET /ready"), all 9 events on
      // 2026-09-03.
      const result = classifySentryIssueActionability(
        { level: "error", count: 9, stats: { "14d": [[1_757_000_000, 0]] } },
        OPTS
      );

      expect(result.actionable).toBe(false);
      expect(result.reason).toBe("stale");
    });

    test("#5536 is NOT rejected: 95 events inside the window is a live signal", async () => {
      const { classifySentryIssueActionability } = await import("../sentry-triage-recency.mjs");

      // Sentry issue 7734806348, measured 2026-09-20: lifetime 94 but
      // sum(stats["14d"]) == 95 — its burst landed 2026-09-16, inside the
      // window. It was stale for an unrelated reason (a fix landed after
      // the last event), which recency cannot and must not detect. Pinned
      // so nobody "fixes" the gate into suppressing live incidents.
      const result = classifySentryIssueActionability(
        { level: "error", count: 94, stats: { "14d": [[1_757_000_000, 95]] } },
        OPTS
      );

      expect(result.actionable).toBe(true);
      expect(result.eventsInWindow).toBe(95);
    });

    test("a genuinely active issue over the threshold is actionable", async () => {
      const { classifySentryIssueActionability } = await import("../sentry-triage-recency.mjs");

      const result = classifySentryIssueActionability(
        {
          level: "error",
          count: 200,
          stats: {
            "14d": [
              [1_757_000_000, 6],
              [1_757_086_400, 9],
            ],
          },
        },
        OPTS
      );

      expect(result.actionable).toBe(true);
      expect(result.reason).toBe("actionable");
      expect(result.eventsInWindow).toBe(15);
    });

    test("the window count, not the lifetime count, is compared to the threshold", async () => {
      const { classifySentryIssueActionability } = await import("../sentry-triage-recency.mjs");

      // Huge lifetime history, only 2 events inside the window: below a
      // threshold of 5 even though `count` is 5000.
      const result = classifySentryIssueActionability(
        { level: "error", count: 5000, stats: { "14d": [[1_757_000_000, 2]] } },
        OPTS
      );

      expect(result.actionable).toBe(false);
      expect(result.reason).toBe("below-threshold");
      expect(result.eventsInWindow).toBe(2);
    });

    test("non-error levels are rejected before anything else", async () => {
      const { classifySentryIssueActionability } = await import("../sentry-triage-recency.mjs");

      const result = classifySentryIssueActionability(
        { level: "warning", count: 99, stats: { "14d": [[1_757_000_000, 99]] } },
        OPTS
      );

      expect(result.actionable).toBe(false);
      expect(result.reason).toBe("not-severe");
    });

    test("fails closed (never actionable) when the window series is missing", async () => {
      const { classifySentryIssueActionability } = await import("../sentry-triage-recency.mjs");

      const result = classifySentryIssueActionability({ level: "error", count: 100 }, OPTS);

      expect(result.actionable).toBe(false);
      expect(result.reason).toBe("window-unknown");
      expect(result.eventsInWindow).toBeNull();
    });
  });
});
