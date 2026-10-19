/**
 * Tests for the stale-human-blocked read-side verdict (#7091).
 *
 * Fixture rows are the real batch from metrics/stale-human-blocked.jsonl
 * (detected_at 2026-09-20T18:13:25.350Z, nine issues all closed by 09-25) —
 * the input that made the 2026-10-18 retro read dead issues as current.
 */

import { describe, it, expect } from "vitest";
import { classifyLatestBatch } from "../stale-human-blocked-latest.mjs";

const DETECTED_AT = "2026-09-20T18:13:25.350Z";
const row = (issue, days_stale) => ({
  issue,
  last_human_touch_at: "2026-08-23T09:43:29.000Z",
  days_stale,
  detected_at: DETECTED_AT,
  labeled: true,
});
const ROWS = [
  row(4111, 39),
  row(3978, 30),
  row(3585, 29),
  row(3388, 33),
  row(3253, 39),
  row(3322, 25),
  row(4487, 28),
  row(4706, 20),
  row(4876, 19),
];
const DAY = 24 * 60 * 60 * 1000;
const at = (iso) => Date.parse(iso);
const OPEN_ALL = ROWS.map((r) => r.issue);

describe("classifyLatestBatch", () => {
  it("the 2026-10-18 retro input is stale, with no usable ordering", () => {
    const v = classifyLatestBatch({
      rows: ROWS,
      openIssues: [7043],
      nowMs: at("2026-10-18T15:23:00Z"),
    });
    expect(v.verdict).toBe("stale");
    expect(v.usable).toBe(false);
    expect(v.ordered).toEqual([]);
    expect(v.detectedAt).toBe(DETECTED_AT);
    expect(v.unknown).toEqual([{ issue: 7043, age: "unknown" }]);
  });

  it("a batch inside period + tolerance is fresh and sorted by days_stale desc", () => {
    const v = classifyLatestBatch({
      rows: ROWS,
      openIssues: OPEN_ALL,
      nowMs: at("2026-09-27T15:23:00Z"),
    });
    expect(v.verdict).toBe("fresh");
    expect(v.usable).toBe(true);
    expect(v.ordered.map((r) => r.days_stale)).toEqual([39, 39, 33, 30, 29, 28, 25, 20, 19]);
  });

  it("the stale boundary is period + tolerance days", () => {
    const base = Date.parse(DETECTED_AT);
    const verdict = (ms) =>
      classifyLatestBatch({
        rows: ROWS,
        openIssues: OPEN_ALL,
        nowMs: ms,
        toleranceDays: 2,
      }).verdict;
    expect(verdict(base + 9 * DAY)).toBe("fresh");
    expect(verdict(base + 9 * DAY + 1)).toBe("stale");
  });

  it("a batch whose every row is closed is all-closed", () => {
    const v = classifyLatestBatch({
      rows: ROWS,
      openIssues: [],
      nowMs: at("2026-09-27T15:23:00Z"),
    });
    expect(v.verdict).toBe("all-closed");
    expect(v.usable).toBe(false);
    expect(v.ordered).toEqual([]);
  });

  it("only the latest detected_at batch is used, and closed rows are dropped", () => {
    const newer = { ...row(9001, 8), detected_at: "2026-09-27T18:00:00.000Z" };
    const v = classifyLatestBatch({
      rows: [...ROWS, newer],
      openIssues: [9001, 4111],
      nowMs: at("2026-09-28T00:00:00Z"),
    });
    expect(v.verdict).toBe("fresh");
    expect(v.ordered.map((r) => r.issue)).toEqual([9001]);
    expect(v.unknown).toEqual([{ issue: 4111, age: "unknown" }]);
  });

  it("empty rows are empty; a missing file is missing", () => {
    const nowMs = at("2026-09-27T00:00:00Z");
    expect(classifyLatestBatch({ rows: [], nowMs }).verdict).toBe("empty");
    expect(classifyLatestBatch({ rows: null, nowMs }).verdict).toBe("missing");
    expect(classifyLatestBatch({ rows: undefined, nowMs }).verdict).toBe("missing");
  });

  it("an unparseable detected_at is never fresh", () => {
    const v = classifyLatestBatch({
      rows: [{ ...row(4111, 39), detected_at: "garbage" }, { issue: 1 }],
      openIssues: [4111],
      nowMs: at("2026-09-21T00:00:00Z"),
    });
    expect(v.verdict).toBe("stale");
    expect(v.usable).toBe(false);
  });

  it("never derives an age from updatedAt: open issues without a row are age unknown", () => {
    const v = classifyLatestBatch({
      rows: ROWS,
      openIssues: [4111, 7777],
      nowMs: at("2026-09-27T00:00:00Z"),
    });
    expect(v.unknown).toEqual([{ issue: 7777, age: "unknown" }]);
    for (const entry of [...v.ordered, ...v.unknown]) {
      expect(JSON.stringify(entry)).not.toMatch(/updated/i);
    }
  });
});
