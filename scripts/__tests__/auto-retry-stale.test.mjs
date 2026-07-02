import { describe, it, expect, vi } from "vitest";
import {
  selectStaleForRetry,
  runAutoRetry,
  RETRY_THRESHOLD_MS,
  DEFAULT_RETRY_CAP,
  RETRY_COMMENT,
  ISSUE_JSON_FIELDS,
} from "../auto-retry-stale.mjs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Fixed reference "now" so every test is deterministic and TZ-independent.
const NOW = Date.parse("2026-06-28T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const at = (msAgo) => new Date(NOW - msAgo).toISOString();

const makeIssue = (overrides = {}) => ({
  number: 1,
  createdAt: at(4 * DAY),
  labels: [{ name: "agent-failed" }],
  ...overrides,
});

// ---------------------------------------------------------------------------
// selectStaleForRetry — pure selection logic
// ---------------------------------------------------------------------------

describe("selectStaleForRetry", () => {
  it("selects an agent-failed issue older than the 3-day threshold", () => {
    const issues = [makeIssue({ number: 7, createdAt: at(4 * DAY) })];
    expect(selectStaleForRetry(issues, NOW).map((i) => i.number)).toEqual([7]);
  });

  it("excludes an agent-failed issue younger than 3 days", () => {
    const issues = [makeIssue({ number: 7, createdAt: at(2 * DAY) })];
    expect(selectStaleForRetry(issues, NOW)).toEqual([]);
  });

  it("treats exactly 3 days as not-yet-stale (strict greater-than)", () => {
    const issues = [
      makeIssue({ number: 7, createdAt: new Date(NOW - RETRY_THRESHOLD_MS).toISOString() }),
    ];
    expect(selectStaleForRetry(issues, NOW)).toEqual([]);
  });

  it("excludes issues also labeled agent-skip", () => {
    const issues = [
      makeIssue({ number: 7, labels: [{ name: "agent-failed" }, { name: "agent-skip" }] }),
    ];
    expect(selectStaleForRetry(issues, NOW)).toEqual([]);
  });

  it("ignores issues without the agent-failed label", () => {
    const issues = [makeIssue({ number: 7, labels: [{ name: "ready" }] })];
    expect(selectStaleForRetry(issues, NOW)).toEqual([]);
  });

  it("caps the result at DEFAULT_RETRY_CAP (2), oldest first", () => {
    const issues = [
      makeIssue({ number: 1, createdAt: at(4 * DAY) }),
      makeIssue({ number: 2, createdAt: at(6 * DAY) }),
      makeIssue({ number: 3, createdAt: at(5 * DAY) }),
    ];
    // oldest first: #2 (6d), #3 (5d), then #1 — capped to 2
    expect(selectStaleForRetry(issues, NOW).map((i) => i.number)).toEqual([2, 3]);
  });

  it("honors an explicit cap override", () => {
    const issues = [
      makeIssue({ number: 1, createdAt: at(4 * DAY) }),
      makeIssue({ number: 2, createdAt: at(6 * DAY) }),
    ];
    expect(selectStaleForRetry(issues, NOW, { cap: 1 }).map((i) => i.number)).toEqual([2]);
  });

  it("excludes issues with a malformed createdAt", () => {
    const issues = [makeIssue({ number: 7, createdAt: "not-a-date" })];
    expect(selectStaleForRetry(issues, NOW)).toEqual([]);
  });

  it("supports string labels as well as {name} objects", () => {
    const issues = [makeIssue({ number: 7, labels: ["agent-failed"], createdAt: at(4 * DAY) })];
    expect(selectStaleForRetry(issues, NOW).map((i) => i.number)).toEqual([7]);
  });

  it("returns [] for empty or nullish input", () => {
    expect(selectStaleForRetry([], NOW)).toEqual([]);
    expect(selectStaleForRetry(null, NOW)).toEqual([]);
    expect(selectStaleForRetry(undefined, NOW)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const issues = [
      makeIssue({ number: 1, createdAt: at(4 * DAY) }),
      makeIssue({ number: 2, createdAt: at(6 * DAY) }),
    ];
    const snapshot = issues.map((i) => i.number);
    selectStaleForRetry(issues, NOW);
    expect(issues.map((i) => i.number)).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// runAutoRetry — side-effecting orchestration with injected gh ops
// ---------------------------------------------------------------------------

describe("runAutoRetry", () => {
  const makeDeps = (issues) => ({
    listIssues: vi.fn(async () => issues),
    editLabels: vi.fn(async () => {}),
    comment: vi.fn(async () => {}),
  });

  it("re-queues each selected issue via the shared markReady transition, then comments", async () => {
    const issues = [makeIssue({ number: 7, createdAt: at(4 * DAY) })];
    const deps = makeDeps(issues);
    const retried = await runAutoRetry({ ...deps, now: NOW });

    expect(retried).toEqual([7]);
    expect(deps.editLabels).toHaveBeenCalledWith(7, {
      add: ["ready"],
      remove: ["has-pr", "in-progress", "agent-failed", "agent-skip"],
    });
    expect(deps.comment).toHaveBeenCalledWith(7, RETRY_COMMENT);
  });

  it("dry-run reports the selection but performs no mutations", async () => {
    const issues = [makeIssue({ number: 7, createdAt: at(4 * DAY) })];
    const deps = makeDeps(issues);
    const retried = await runAutoRetry({ ...deps, now: NOW, dryRun: true });

    expect(retried).toEqual([7]);
    expect(deps.editLabels).not.toHaveBeenCalled();
    expect(deps.comment).not.toHaveBeenCalled();
  });

  it("respects the per-run cap", async () => {
    const issues = [
      makeIssue({ number: 1, createdAt: at(4 * DAY) }),
      makeIssue({ number: 2, createdAt: at(6 * DAY) }),
      makeIssue({ number: 3, createdAt: at(5 * DAY) }),
    ];
    const deps = makeDeps(issues);
    const retried = await runAutoRetry({ ...deps, now: NOW });
    expect(retried.length).toBe(DEFAULT_RETRY_CAP);
    expect(deps.editLabels).toHaveBeenCalledTimes(DEFAULT_RETRY_CAP);
    expect(deps.comment).toHaveBeenCalledTimes(DEFAULT_RETRY_CAP);
  });

  it("does nothing when no issues qualify", async () => {
    const deps = makeDeps([makeIssue({ number: 7, createdAt: at(1 * DAY) })]);
    const retried = await runAutoRetry({ ...deps, now: NOW });
    expect(retried).toEqual([]);
    expect(deps.editLabels).not.toHaveBeenCalled();
    expect(deps.comment).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("threshold is exactly 3 days in ms", () => {
    expect(RETRY_THRESHOLD_MS).toBe(3 * DAY);
  });

  it("default cap is 2 per run", () => {
    expect(DEFAULT_RETRY_CAP).toBe(2);
  });

  it("comment text matches the documented spec", () => {
    expect(RETRY_COMMENT).toBe(
      "Auto-retrying — this issue has been in agent-failed state for 3+ days."
    );
  });

  it("ISSUE_JSON_FIELDS includes the fields the selection logic reads", () => {
    expect(ISSUE_JSON_FIELDS).toContain("number");
    expect(ISSUE_JSON_FIELDS).toContain("createdAt");
    expect(ISSUE_JSON_FIELDS).toContain("labels");
  });
});
