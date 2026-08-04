import { describe, it, expect, vi } from "vitest";
import {
  compare,
  findPriorRegressionIssue,
  fetchIssuesByLabel,
  fileRegressionIssueIfNew,
} from "../lib/ratchet.mjs";

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

describe("findPriorRegressionIssue (shared dedupe lookup)", () => {
  const MARKER = "<!-- acmm-regression -->";

  it("finds an open issue carrying the marker", () => {
    const issues = [{ number: 10, body: `something ${MARKER} else`, state: "open" }];
    expect(findPriorRegressionIssue(issues, MARKER)).toBe(10);
  });

  it("returns null when no issue carries the marker", () => {
    const issues = [{ number: 10, body: "unrelated", state: "open" }];
    expect(findPriorRegressionIssue(issues, MARKER)).toBeNull();
  });

  it("also finds a closed issue that carries the marker — feeds the reopen path", () => {
    const issues = [{ number: 10, body: MARKER, state: "closed" }];
    expect(findPriorRegressionIssue(issues, MARKER)).toBe(10);
  });

  it("returns null for an empty list", () => {
    expect(findPriorRegressionIssue([], MARKER)).toBeNull();
  });

  it("is scoped to the marker passed in — a different marker does not match", () => {
    const issues = [{ number: 10, body: MARKER, state: "open" }];
    expect(findPriorRegressionIssue(issues, "<!-- antipattern-regression -->")).toBeNull();
  });
});

describe("fetchIssuesByLabel (gh CLI wiring via the injected ghClient)", () => {
  it("fetches issues across every state for a label via ghClient.issue.list", () => {
    const issues = [{ number: 1, body: "x", state: "open" }];
    const ghClient = { issue: { list: vi.fn().mockReturnValue(issues) } };

    const result = fetchIssuesByLabel("acmm", ghClient);

    expect(ghClient.issue.list).toHaveBeenCalledWith([
      "--label",
      "acmm",
      "--state",
      "all",
      "--limit",
      "100",
      "--json",
      "number,body,state",
    ]);
    expect(result).toEqual(issues);
  });

  it("returns an empty array when ghClient.issue.list returns a non-array", () => {
    const ghClient = { issue: { list: vi.fn().mockReturnValue(null) } };
    expect(fetchIssuesByLabel("acmm", ghClient)).toEqual([]);
  });
});

describe("fileRegressionIssueIfNew (threads the injected ghClient through fileIssue())", () => {
  const MARKER = "<!-- acmm-regression -->";

  function makeGhClient(overrides = {}) {
    return {
      issue: {
        list: vi.fn().mockReturnValue([]),
        create: vi.fn().mockReturnValue("https://github.com/owner/repo/issues/42"),
        view: vi.fn(),
        reopen: vi.fn(),
        ...overrides,
      },
    };
  }

  it("does not create an issue when a matching open regression issue already exists", async () => {
    const ghClient = makeGhClient({
      list: vi.fn().mockReturnValue([{ number: 1, body: MARKER, state: "open" }]),
      view: vi.fn().mockReturnValue({ state: "open" }),
    });

    const result = await fileRegressionIssueIfNew({
      label: "acmm",
      marker: MARKER,
      payload: { title: "t", body: "b", labels: ["acmm"] },
      ghClient,
    });

    expect(result).toEqual({ filed: false, reason: "duplicate" });
    expect(ghClient.issue.create).not.toHaveBeenCalled();
  });

  it("creates a new issue via the injected ghClient when no duplicate exists", async () => {
    const ghClient = makeGhClient();

    const result = await fileRegressionIssueIfNew({
      label: "acmm",
      marker: MARKER,
      payload: { title: "t", body: "b", labels: ["acmm"] },
      ghClient,
    });

    expect(result).toEqual({ filed: true, action: "create" });
    expect(ghClient.issue.create).toHaveBeenCalledTimes(1);
    expect(ghClient.issue.create).toHaveBeenCalledWith([
      "--title",
      "t",
      "--body",
      "b",
      "--label",
      "acmm",
    ]);
  });

  it("reopens a previously-closed regression issue instead of filing a duplicate (improvement over the old open-only check)", async () => {
    const ghClient = makeGhClient({
      list: vi.fn().mockReturnValue([{ number: 7, body: MARKER, state: "closed" }]),
      view: vi.fn().mockReturnValue({ state: "closed" }),
    });

    const result = await fileRegressionIssueIfNew({
      label: "acmm",
      marker: MARKER,
      payload: { title: "t", body: "b", labels: ["acmm"] },
      ghClient,
    });

    expect(result).toEqual({ filed: true, action: "reopen" });
    expect(ghClient.issue.reopen).toHaveBeenCalledWith(7);
    expect(ghClient.issue.create).not.toHaveBeenCalled();
  });

  it("fails open (treats as no-match, still files) when the search itself throws", async () => {
    const ghClient = makeGhClient({
      list: vi.fn().mockImplementation(() => {
        throw new Error("gh rate limited");
      }),
    });

    const result = await fileRegressionIssueIfNew({
      label: "acmm",
      marker: MARKER,
      payload: { title: "t", body: "b", labels: ["acmm"] },
      ghClient,
    });

    expect(result).toEqual({ filed: true, action: "create" });
    expect(ghClient.issue.create).toHaveBeenCalledTimes(1);
  });
});
