import { describe, it, expect } from "vitest";
import {
  STREAK_THRESHOLD,
  parseEvalHistory,
  classifyEvalHistory,
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

// A raw task entry; `extra` carries turns/costUsd/judgeResult.
const task = (taskId, passed, extra = {}) => ({ taskId, passed, ...extra });
const at = (day, tasks, timestamp = `2026-11-${String(day).padStart(2, "0")}T06:00:00.000Z`) => ({
  ...(timestamp === null ? {} : { timestamp }),
  tasks,
});
const NON_RUN = { turns: 0, costUsd: 0 };
const JUDGE_THREW = {
  turns: 11,
  costUsd: 0.7,
  judgeResult: { passed: false, confidence: 0, evaluationFailed: true },
};
const JUDGED = { turns: 9, costUsd: 0.4, judgeResult: { passed: false, confidence: 0.2 } };

describe("classifyTaskStreaks: unjudged rows are skipped, never counted or resetting (#10139 review)", () => {
  it("does not count non-runs (0 turns, $0) as judged failures", () => {
    const history = [
      at(1, [task("a", false, JUDGED)]),
      at(2, [task("a", false, NON_RUN)]),
      at(3, [task("a", false, NON_RUN)]),
    ];
    expect(classifyTaskStreaks(history)).toMatchObject({ status: "ok", alarms: [] });
  });

  it("does not count rows where the judge threw as judged failures", () => {
    const history = [
      at(1, [task("a", false, JUDGED)]),
      at(2, [task("a", false, JUDGE_THREW)]),
      at(3, [task("a", false, JUDGE_THREW)]),
    ];
    expect(classifyTaskStreaks(history)).toMatchObject({ status: "ok", alarms: [] });
  });

  it("a non-run between judged failures neither counts nor resets", () => {
    const history = [
      at(1, [task("a", false, JUDGED)]),
      at(2, [task("a", false, JUDGED)]),
      at(3, [task("a", false, NON_RUN)]),
      at(4, [task("a", false, JUDGED)]),
    ];
    expect(classifyTaskStreaks(history)).toMatchObject({
      status: "alarm",
      alarms: [expect.objectContaining({ taskId: "a", streak: 3 })],
    });
  });

  it("treats passed:null like a task missing from the row: skipped, no reset", () => {
    const history = [
      at(1, [task("a", false)]),
      at(2, [task("a", false)]),
      at(3, [task("a", null)]),
      at(4, [task("a", false)]),
    ];
    expect(classifyTaskStreaks(history)).toMatchObject({ status: "alarm" });
  });

  it("treats a row with an empty tasks array the same way (no reset)", () => {
    const history = [
      at(1, [task("a", false)]),
      at(2, [task("a", false)]),
      at(3, []),
      at(4, [task("a", false)]),
    ];
    expect(classifyTaskStreaks(history)).toMatchObject({ status: "alarm" });
  });
});

describe("classifyTaskStreaks: rows without a timestamp (#10139 review)", () => {
  it("keeps an undated row at its file position instead of sorting it oldest", () => {
    const history = [
      at(1, [task("a", false)]),
      at(2, [task("a", false)]),
      at(3, [task("a", false)]),
      at(0, [task("a", true)], null),
    ];
    expect(classifyTaskStreaks(history)).toMatchObject({ status: "ok", alarms: [] });
  });
});

describe("classifyEvalHistory: truncated newest row fails closed (#10139 review)", () => {
  const lines = [1, 2, 3].map((d) => JSON.stringify(row(d, { t: false })));

  it("is undeterminable when the newest line is cut mid-write", () => {
    const text = `${lines.join("\n")}\n{"runId":"eval-9","tasks":[{"taskId":"t","pa`;
    expect(classifyEvalHistory(text)).toMatchObject({ status: "undeterminable", malformed: 1 });
  });

  it("still skips and counts a malformed line that is not the newest", () => {
    const text = `${lines[0]}\n{not json\n${lines[1]}\n${lines[2]}\n`;
    expect(classifyEvalHistory(text)).toMatchObject({ status: "alarm", malformed: 1 });
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
    expect(parseEvalHistory("")).toEqual({ entries: [], malformed: 0, newestMalformed: false });
  });
});
