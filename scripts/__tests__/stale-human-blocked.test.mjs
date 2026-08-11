import { describe, it, expect, vi } from "vitest";
import {
  findStaleHumanBlockedIssues,
  runStaleHumanBlocked,
  STALE_THRESHOLD_DAYS,
  STALE_THRESHOLD_MS,
  EXCLUDED_LABELS,
  READY_FOR_HUMAN_LABEL,
  ISSUE_JSON_FIELDS,
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

  it("ISSUE_JSON_FIELDS includes the fields the selection logic reads", () => {
    expect(ISSUE_JSON_FIELDS).toContain("number");
    expect(ISSUE_JSON_FIELDS).toContain("state");
    expect(ISSUE_JSON_FIELDS).toContain("updatedAt");
    expect(ISSUE_JSON_FIELDS).toContain("labels");
  });
});
