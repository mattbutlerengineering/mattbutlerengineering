import { describe, it, expect } from "vitest";
import {
  STREAK_THRESHOLD,
  parseEvalHistory,
  classifyTaskStreaks,
  streakDedupeKey,
} from "../eval-task-streaks.mjs";

// One persisted eval report row, oldest = day 1. `outcomes` maps taskId -> passed.
const row = (day, outcomes) => ({
  timestamp: `2026-11-${String(day).padStart(2, "0")}T06:00:00.000Z`,
  runId: `eval-${day * 7}`,
  tasks: Object.entries(outcomes).map(([taskId, passed]) => ({ taskId, passed })),
});

const FLAT = { good: true };

describe("classifyTaskStreaks", () => {
  it("names the threshold as a constant of 3", () => {
    expect(STREAK_THRESHOLD).toBe(3);
  });

  it("reports a task failing N consecutive runs even when the suite score is flat", () => {
    const history = [1, 2, 3, 4].map((d) => row(d, { ...FLAT, "dep-bump": false }));
    const verdict = classifyTaskStreaks(history);
    expect(verdict.status).toBe("alarm");
    expect(verdict.alarms).toEqual([
      expect.objectContaining({
        taskId: "dep-bump",
        streak: 4,
        dedupeKey: streakDedupeKey("dep-bump"),
      }),
    ]);
  });

  it("does not report a task failing fewer than N consecutive runs", () => {
    const history = [
      row(1, { ...FLAT, t: true }),
      row(2, { ...FLAT, t: false }),
      row(3, { ...FLAT, t: false }),
    ];
    expect(classifyTaskStreaks(history)).toMatchObject({ status: "ok", alarms: [] });
  });

  it("resets the streak on a pass (fail, pass, fail)", () => {
    const history = [
      row(1, { t: false }),
      row(2, { t: false }),
      row(3, { t: true }),
      row(4, { t: false }),
    ];
    expect(classifyTaskStreaks(history)).toMatchObject({ status: "ok", alarms: [] });
  });

  it("does not alarm on a newly added task with a short history", () => {
    const history = [row(1, FLAT), row(2, FLAT), row(3, { ...FLAT, fresh: false })];
    expect(classifyTaskStreaks(history)).toMatchObject({ status: "ok", alarms: [] });
  });

  it("fails closed on an empty history", () => {
    expect(classifyTaskStreaks([])).toMatchObject({ status: "undeterminable" });
  });

  it("fails closed when no row carries a task array", () => {
    expect(classifyTaskStreaks([{ timestamp: "2026-11-01T00:00:00Z" }])).toMatchObject({
      status: "undeterminable",
    });
  });

  it("orders by timestamp, not file order", () => {
    const history = [
      row(3, { t: false }),
      row(1, { t: false }),
      row(4, { t: true }),
      row(2, { t: false }),
    ];
    // chronologically F F F P -> latest run passed, no streak
    expect(classifyTaskStreaks(history)).toMatchObject({ status: "ok", alarms: [] });
  });
});

describe("streakDedupeKey", () => {
  it("is keyed on the task id alone, stable across runs", () => {
    expect(streakDedupeKey("dep-bump")).toBe(streakDedupeKey("dep-bump"));
    expect(streakDedupeKey("dep-bump")).toContain("dep-bump");
    expect(streakDedupeKey("a")).not.toBe(streakDedupeKey("b"));
  });
});

describe("parseEvalHistory", () => {
  it("parses JSONL and skips blank lines", () => {
    const text = `${JSON.stringify(row(1, FLAT))}\n\n${JSON.stringify(row(2, FLAT))}\n`;
    expect(parseEvalHistory(text).entries).toHaveLength(2);
  });

  it("counts unparseable lines instead of dropping them silently", () => {
    const text = `${JSON.stringify(row(1, FLAT))}\n{not json\n`;
    expect(parseEvalHistory(text)).toMatchObject({ malformed: 1 });
  });

  it("returns no entries for an empty file", () => {
    expect(parseEvalHistory("")).toEqual({ entries: [], malformed: 0 });
  });
});
