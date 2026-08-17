import { describe, it, expect, vi } from "vitest";
import {
  findStaleHumanBlockedIssues,
  runStaleHumanBlocked,
  lastHumanTouchAt,
  daysStale,
  buildStaleMetricRow,
  STALE_THRESHOLD_DAYS,
  STALE_THRESHOLD_MS,
  EXCLUDED_LABELS,
  READY_FOR_HUMAN_LABEL,
  ISSUE_JSON_FIELDS,
  STALE_METRICS_PATH,
  LABEL_ONLY_EVENTS,
} from "../stale-human-blocked.mjs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Fixed reference "now" so every test is deterministic and TZ-independent.
const NOW = Date.parse("2026-08-10T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const at = (msAgo) => new Date(NOW - msAgo).toISOString();

const makeIssue = (overrides = {}) => ({
  number: 3322,
  title: "fix(ci): Release 'Publish to npm' 401",
  state: "OPEN",
  updatedAt: at(30 * DAY),
  labels: [{ name: "ci-fix" }],
  ...overrides,
});

// ---------------------------------------------------------------------------
// findStaleHumanBlockedIssues — pure selection logic
// ---------------------------------------------------------------------------

describe("findStaleHumanBlockedIssues", () => {
  it("reports the #3322 case: stale with no blocker label at all", () => {
    const issues = [
      makeIssue({ number: 3322, updatedAt: at(30 * DAY), labels: [{ name: "ci-fix" }] }),
    ];
    expect(findStaleHumanBlockedIssues(issues, NOW).map((i) => i.number)).toEqual([3322]);
  });

  it("reports an issue stale by an existing blocker label (already found today)", () => {
    const issues = [
      makeIssue({ number: 1, updatedAt: at(20 * DAY), labels: [{ name: "ready-for-human" }] }),
    ];
    expect(findStaleHumanBlockedIssues(issues, NOW).map((i) => i.number)).toEqual([1]);
  });

  it("does not report a fresh issue", () => {
    const issues = [makeIssue({ number: 2, updatedAt: at(1 * DAY) })];
    expect(findStaleHumanBlockedIssues(issues, NOW)).toEqual([]);
  });

  it.each(EXCLUDED_LABELS)(
    "does not report a stale issue carrying the excluded label %s",
    (label) => {
      const issues = [makeIssue({ number: 4, updatedAt: at(30 * DAY), labels: [{ name: label }] })];
      expect(findStaleHumanBlockedIssues(issues, NOW)).toEqual([]);
    }
  );

  it("does not report a closed issue, however stale", () => {
    const issues = [makeIssue({ number: 5, state: "CLOSED", updatedAt: at(90 * DAY) })];
    expect(findStaleHumanBlockedIssues(issues, NOW)).toEqual([]);
  });

  it("treats exactly the threshold as not-yet-stale (strict greater-than, matches auto-retry-stale precedent)", () => {
    const issues = [
      makeIssue({ number: 6, updatedAt: new Date(NOW - STALE_THRESHOLD_MS).toISOString() }),
    ];
    expect(findStaleHumanBlockedIssues(issues, NOW)).toEqual([]);
  });

  it("reports an issue 1ms past the threshold", () => {
    const issues = [
      makeIssue({ number: 7, updatedAt: new Date(NOW - STALE_THRESHOLD_MS - 1).toISOString() }),
    ];
    expect(findStaleHumanBlockedIssues(issues, NOW).map((i) => i.number)).toEqual([7]);
  });

  it("honors an explicit thresholdMs override", () => {
    const issues = [makeIssue({ number: 8, updatedAt: at(2 * DAY) })];
    expect(
      findStaleHumanBlockedIssues(issues, NOW, { thresholdMs: 1 * DAY }).map((i) => i.number)
    ).toEqual([8]);
  });

  it("supports string labels as well as {name} objects", () => {
    const issues = [makeIssue({ number: 9, updatedAt: at(30 * DAY), labels: ["vetoed"] })];
    expect(findStaleHumanBlockedIssues(issues, NOW)).toEqual([]);
  });

  it("excludes issues with a malformed updatedAt", () => {
    const issues = [makeIssue({ number: 10, updatedAt: "not-a-date" })];
    expect(findStaleHumanBlockedIssues(issues, NOW)).toEqual([]);
  });

  it("returns [] for empty or nullish input", () => {
    expect(findStaleHumanBlockedIssues([], NOW)).toEqual([]);
    expect(findStaleHumanBlockedIssues(null, NOW)).toEqual([]);
    expect(findStaleHumanBlockedIssues(undefined, NOW)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const issues = [
      makeIssue({ number: 1, updatedAt: at(20 * DAY) }),
      makeIssue({ number: 2, updatedAt: at(30 * DAY) }),
    ];
    const snapshot = issues.map((i) => i.number);
    findStaleHumanBlockedIssues(issues, NOW);
    expect(issues.map((i) => i.number)).toEqual(snapshot);
  });

  it("sorts most-stale first", () => {
    const issues = [
      makeIssue({ number: 1, updatedAt: at(20 * DAY) }),
      makeIssue({ number: 2, updatedAt: at(90 * DAY) }),
      makeIssue({ number: 3, updatedAt: at(40 * DAY) }),
    ];
    expect(findStaleHumanBlockedIssues(issues, NOW).map((i) => i.number)).toEqual([2, 3, 1]);
  });
});

// ---------------------------------------------------------------------------
// runStaleHumanBlocked — side-effecting orchestration with injected gh ops
// ---------------------------------------------------------------------------

describe("runStaleHumanBlocked", () => {
  const makeDeps = (issues) => ({
    listOpenIssues: vi.fn(async () => issues),
    applyLabel: vi.fn(async () => {}),
  });

  it("labels each newly-found stale issue with ready-for-human", async () => {
    const issues = [makeIssue({ number: 3322, updatedAt: at(30 * DAY) })];
    const deps = makeDeps(issues);
    const result = await runStaleHumanBlocked({ ...deps, now: NOW });

    expect(result.stale).toEqual([3322]);
    expect(result.labeled).toEqual([3322]);
    expect(deps.applyLabel).toHaveBeenCalledWith(3322);
  });

  it("is idempotent: skips applying the label to an issue that already carries it (re-running changes nothing)", async () => {
    const issues = [
      makeIssue({
        number: 3322,
        updatedAt: at(30 * DAY),
        labels: [{ name: "ci-fix" }, { name: READY_FOR_HUMAN_LABEL }],
      }),
    ];
    const deps = makeDeps(issues);
    const result = await runStaleHumanBlocked({ ...deps, now: NOW });

    expect(result.stale).toEqual([3322]);
    expect(result.labeled).toEqual([]);
    expect(deps.applyLabel).not.toHaveBeenCalled();
  });

  it("dry-run reports the selection but performs no mutations", async () => {
    const issues = [makeIssue({ number: 3322, updatedAt: at(30 * DAY) })];
    const deps = makeDeps(issues);
    const result = await runStaleHumanBlocked({ ...deps, now: NOW, dryRun: true });

    expect(result.stale).toEqual([3322]);
    expect(result.labeled).toEqual([]);
    expect(deps.applyLabel).not.toHaveBeenCalled();
  });

  it("does nothing when no issues qualify", async () => {
    const deps = makeDeps([makeIssue({ number: 1, updatedAt: at(1 * DAY) })]);
    const result = await runStaleHumanBlocked({ ...deps, now: NOW });

    expect(result.stale).toEqual([]);
    expect(result.labeled).toEqual([]);
    expect(deps.applyLabel).not.toHaveBeenCalled();
  });

  it("fails loudly (rejects) rather than reporting an empty list when the issue query throws", async () => {
    const deps = {
      listOpenIssues: vi.fn(async () => {
        throw new Error("gh: authentication failed");
      }),
      applyLabel: vi.fn(),
    };

    await expect(runStaleHumanBlocked({ ...deps, now: NOW })).rejects.toThrow(
      /authentication failed/
    );
    expect(deps.applyLabel).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// lastHumanTouchAt / daysStale / buildStaleMetricRow — #4274
// ---------------------------------------------------------------------------

describe("lastHumanTouchAt", () => {
  it("ignores a label-only event: an issue whose only post-creation event is `labeled` reports its createdAt", () => {
    // The regression this whole module exists to prevent — a run of this
    // workflow must not move a later run's last_human_touch_at.
    const issue = { number: 3253, createdAt: at(60 * DAY), comments: [] };
    const timeline = [{ event: "labeled", created_at: at(0) }];

    expect(lastHumanTouchAt(issue, timeline)).toBe(new Date(NOW - 60 * DAY).toISOString());
  });

  it("ignores `unlabeled` too", () => {
    const issue = { number: 1, createdAt: at(30 * DAY), comments: [] };
    const timeline = [{ event: "unlabeled", created_at: at(0) }];

    expect(lastHumanTouchAt(issue, timeline)).toBe(new Date(NOW - 30 * DAY).toISOString());
  });

  it("takes the last comment when it is newer than creation", () => {
    const issue = {
      number: 3253,
      createdAt: at(60 * DAY),
      comments: [{ createdAt: at(50 * DAY) }, { createdAt: at(37 * DAY) }],
    };

    expect(lastHumanTouchAt(issue, [])).toBe(new Date(NOW - 37 * DAY).toISOString());
  });

  it("counts a non-label timeline event as a human touch", () => {
    const issue = { number: 1, createdAt: at(60 * DAY), comments: [] };
    const timeline = [
      { event: "labeled", created_at: at(0) },
      { event: "assigned", created_at: at(5 * DAY) },
    ];

    expect(lastHumanTouchAt(issue, timeline)).toBe(new Date(NOW - 5 * DAY).toISOString());
  });

  it("is stable across a second run that only added labels", () => {
    const issue = {
      number: 3253,
      createdAt: at(60 * DAY),
      comments: [{ createdAt: at(37 * DAY) }],
    };
    const firstRun = lastHumanTouchAt(issue, []);
    const secondRun = lastHumanTouchAt(issue, [
      { event: "labeled", created_at: at(0) },
      { event: "labeled", created_at: at(0) },
    ]);

    expect(secondRun).toBe(firstRun);
  });

  it("returns null when nothing is parseable", () => {
    expect(lastHumanTouchAt({ number: 1 }, [])).toBeNull();
    expect(lastHumanTouchAt(null)).toBeNull();
  });
});

describe("daysStale", () => {
  it("floors to whole days", () => {
    expect(daysStale(at(37 * DAY + 3600_000), NOW)).toBe(37);
  });

  it("is 0, never negative, for a future timestamp", () => {
    expect(daysStale(new Date(NOW + DAY).toISOString(), NOW)).toBe(0);
  });

  it("returns null for a missing or malformed timestamp", () => {
    expect(daysStale(null, NOW)).toBeNull();
    expect(daysStale("not-a-date", NOW)).toBeNull();
  });
});

describe("buildStaleMetricRow", () => {
  it("records issue, last human touch, days stale, detection time and whether this run labeled it", () => {
    const issue = {
      number: 3253,
      createdAt: at(60 * DAY),
      comments: [{ createdAt: at(37 * DAY) }],
    };

    expect(
      buildStaleMetricRow({
        issue,
        timelineEvents: [{ event: "labeled", created_at: at(0) }],
        nowMs: NOW,
        labeled: true,
      })
    ).toEqual({
      issue: 3253,
      last_human_touch_at: new Date(NOW - 37 * DAY).toISOString(),
      days_stale: 37,
      detected_at: new Date(NOW).toISOString(),
      labeled: true,
    });
  });
});

// ---------------------------------------------------------------------------
// runStaleHumanBlocked — metrics recording (#4274)
// ---------------------------------------------------------------------------

describe("runStaleHumanBlocked metrics", () => {
  it("records the row BEFORE the label write that would destroy the measurement", async () => {
    const order = [];
    const issue = makeIssue({ number: 3253, createdAt: at(60 * DAY), comments: [] });

    await runStaleHumanBlocked({
      listOpenIssues: async () => [issue],
      applyLabel: async (n) => order.push(`label:${n}`),
      recordMetric: async (row) => order.push(`metric:${row.issue}`),
      now: NOW,
    });

    expect(order).toEqual(["metric:3253", "label:3253"]);
  });

  it("records a row for an already-labeled issue too, marked labeled:false", async () => {
    const issue = makeIssue({
      number: 3277,
      createdAt: at(40 * DAY),
      comments: [],
      labels: [{ name: READY_FOR_HUMAN_LABEL }],
    });
    const rows = [];

    const result = await runStaleHumanBlocked({
      listOpenIssues: async () => [issue],
      applyLabel: async () => {
        throw new Error("must not label an issue that already carries it");
      },
      recordMetric: async (row) => rows.push(row),
      now: NOW,
    });

    expect(rows).toEqual([
      {
        issue: 3277,
        last_human_touch_at: new Date(NOW - 40 * DAY).toISOString(),
        days_stale: 40,
        detected_at: new Date(NOW).toISOString(),
        labeled: false,
      },
    ]);
    expect(result.labeled).toEqual([]);
  });

  it("uses the timeline when one is available, and asks for it per issue", async () => {
    const fetched = [];
    const rows = [];

    await runStaleHumanBlocked({
      listOpenIssues: async () => [makeIssue({ number: 7, createdAt: at(60 * DAY), comments: [] })],
      applyLabel: async () => {},
      fetchTimeline: async (n) => {
        fetched.push(n);
        return [
          { event: "labeled", created_at: at(0) },
          { event: "cross-referenced", created_at: at(9 * DAY) },
        ];
      },
      recordMetric: async (row) => rows.push(row),
      now: NOW,
    });

    expect(fetched).toEqual([7]);
    expect(rows[0].days_stale).toBe(9);
  });

  it("dry-run writes no metrics and applies no labels", async () => {
    const rows = [];

    const result = await runStaleHumanBlocked({
      listOpenIssues: async () => [makeIssue({ number: 3253, createdAt: at(60 * DAY) })],
      applyLabel: async () => {
        throw new Error("dry-run must not label");
      },
      fetchTimeline: async () => {
        throw new Error("dry-run must not query the timeline");
      },
      recordMetric: async (row) => rows.push(row),
      dryRun: true,
      now: NOW,
    });

    expect(rows).toEqual([]);
    expect(result.labeled).toEqual([]);
    expect(result.recorded).toEqual([]);
    expect(result.stale).toEqual([3253]);
  });

  it("still labels when no metrics recorder is injected (default is a no-op, not a crash)", async () => {
    const labeled = [];

    await runStaleHumanBlocked({
      listOpenIssues: async () => [makeIssue({ number: 1, createdAt: at(60 * DAY) })],
      applyLabel: async (n) => labeled.push(n),
      now: NOW,
    });

    expect(labeled).toEqual([1]);
  });
});

describe("constants", () => {
  it("default threshold is 14 days", () => {
    expect(STALE_THRESHOLD_DAYS).toBe(14);
    expect(STALE_THRESHOLD_MS).toBe(14 * DAY);
  });

  it("excludes the labels that age by design", () => {
    expect(EXCLUDED_LABELS).toEqual([
      "vetoed",
      "deferred",
      "wontfix",
      "tracking",
      "ideation-batch",
    ]);
  });

  it("records metrics next to the repo's other jsonl series", () => {
    expect(STALE_METRICS_PATH).toBe("metrics/stale-human-blocked.jsonl");
  });

  it("treats exactly the label writes as label-only events", () => {
    expect(LABEL_ONLY_EVENTS).toEqual(["labeled", "unlabeled"]);
  });

  it("ISSUE_JSON_FIELDS includes the fields the selection logic reads", () => {
    expect(ISSUE_JSON_FIELDS).toContain("number");
    expect(ISSUE_JSON_FIELDS).toContain("state");
    expect(ISSUE_JSON_FIELDS).toContain("updatedAt");
    expect(ISSUE_JSON_FIELDS).toContain("labels");
  });
});
