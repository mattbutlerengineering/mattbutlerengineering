import { describe, it, expect } from "vitest";
import { compare, hasOpenRegressionIssue } from "../lib/ratchet.mjs";

describe("compare (shared ratchet core)", () => {
  it("flags a regression when a metric drops below baseline (default direction)", () => {
    const { regressions } = compare({ pass_rate: 90 }, { pass_rate: 96 });
    expect(regressions).toHaveLength(1);
    expect(regressions[0]).toMatchObject({
      metric: "pass_rate",
      current: 90,
      baseline: 96,
      delta: -6,
    });
  });

  it("does not flag a metric that stayed the same or improved (decrease direction)", () => {
    expect(compare({ pass_rate: 96 }, { pass_rate: 96 }).regressions).toHaveLength(0);
    expect(compare({ pass_rate: 99 }, { pass_rate: 96 }).regressions).toHaveLength(0);
  });

  it("flags a regression when a metric rises above baseline (increase direction)", () => {
    const { regressions } = compare(
      { magicTimeouts: 8 },
      { magicTimeouts: 5 },
      { direction: "increase" }
    );
    expect(regressions).toHaveLength(1);
    expect(regressions[0]).toMatchObject({
      metric: "magicTimeouts",
      current: 8,
      baseline: 5,
      delta: 3,
    });
  });

  it("does not flag a metric that fell (increase direction)", () => {
    const { regressions } = compare(
      { magicTimeouts: 3 },
      { magicTimeouts: 5 },
      { direction: "increase" }
    );
    expect(regressions).toHaveLength(0);
  });

  it("respects a threshold — delta must strictly exceed it to count", () => {
    const atThreshold = compare({ score: 90 }, { score: 95 }, { threshold: 5 });
    expect(atThreshold.regressions).toHaveLength(0);

    const pastThreshold = compare({ score: 89 }, { score: 95 }, { threshold: 5 });
    expect(pastThreshold.regressions).toHaveLength(1);
  });

  it("treats a nullish baseline as first-run data — never a regression", () => {
    expect(compare({ level: 3 }, null).regressions).toHaveLength(0);
    expect(compare({ level: 3 }, undefined).regressions).toHaveLength(0);
  });

  it("defaults a metric missing from a present baseline object to 0", () => {
    const { regressions } = compare({ newPattern: 3 }, {}, { direction: "increase" });
    expect(regressions).toHaveLength(1);
    expect(regressions[0]).toMatchObject({ metric: "newPattern", current: 3, baseline: 0 });
  });

  it("does not flag a new metric whose value is already at the no-op baseline", () => {
    const { regressions } = compare({ newPattern: 0 }, {}, { direction: "increase" });
    expect(regressions).toHaveLength(0);
  });

  it("only reports metrics present in `current`, ignoring extra baseline-only keys", () => {
    const { regressions } = compare({ a: 1 }, { a: 1, b: 999 });
    expect(regressions).toHaveLength(0);
  });

  it("evaluates every key in `current` independently", () => {
    const { regressions } = compare({ pass_rate: 90, cost: 5 }, { pass_rate: 96, cost: 5 });
    expect(regressions.map((r) => r.metric)).toEqual(["pass_rate"]);
  });

  it("does not mutate the current or baseline inputs", () => {
    const current = { pass_rate: 90 };
    const baseline = { pass_rate: 96 };
    compare(current, baseline);
    expect(current).toEqual({ pass_rate: 90 });
    expect(baseline).toEqual({ pass_rate: 96 });
  });

  it("defaults regression severity to medium below 2x threshold, high past it", () => {
    const { regressions: medium } = compare({ x: 89 }, { x: 96 }, { threshold: 5 });
    expect(medium[0].severity).toBe("medium");

    const { regressions: high } = compare({ x: 80 }, { x: 96 }, { threshold: 5 });
    expect(high[0].severity).toBe("high");
  });

  it("honors a custom severityFor override", () => {
    const { regressions } = compare(
      { x: 80 },
      { x: 96 },
      { threshold: 5, severityFor: () => "critical" }
    );
    expect(regressions[0].severity).toBe("critical");
  });

  it("returns severity: null when there are no regressions", () => {
    expect(compare({ pass_rate: 96 }, { pass_rate: 96 }).severity).toBeNull();
  });

  it("returns the highest severity across multiple regressions", () => {
    const { severity } = compare({ a: 80, b: 89 }, { a: 96, b: 96 }, { threshold: 5 });
    expect(severity).toBe("high");
  });
});

describe("hasOpenRegressionIssue (shared dedupe check)", () => {
  const MARKER = "<!-- acmm-regression -->";

  it("returns true when an open issue carries the marker", () => {
    const issues = [{ number: 10, body: `something ${MARKER} else`, state: "open" }];
    expect(hasOpenRegressionIssue(issues, MARKER)).toBe(true);
  });

  it("returns false when no issue carries the marker", () => {
    const issues = [{ number: 10, body: "unrelated", state: "open" }];
    expect(hasOpenRegressionIssue(issues, MARKER)).toBe(false);
  });

  it("ignores closed issues that carry the marker", () => {
    const issues = [{ number: 10, body: MARKER, state: "closed" }];
    expect(hasOpenRegressionIssue(issues, MARKER)).toBe(false);
  });

  it("returns false for an empty list", () => {
    expect(hasOpenRegressionIssue([], MARKER)).toBe(false);
  });

  it("is scoped to the marker passed in — a different marker does not match", () => {
    const issues = [{ number: 10, body: MARKER, state: "open" }];
    expect(hasOpenRegressionIssue(issues, "<!-- antipattern-regression -->")).toBe(false);
  });
});
