import { describe, expect, it, vi } from "vitest";
import type { DateRule } from "@mbe/types";
import { carryByDate, rangeAround, splitIssues } from "./closure-reopen-date.js";

const range = (startsOn: string, endsOn: string | undefined, extra: Partial<DateRule> = {}) =>
  ({
    id: "r1",
    kind: "closure",
    targetKind: "venue",
    startsOn,
    ...(endsOn ? { endsOn } : {}),
    guestMessage: "Closed",
    ...extra,
  }) as DateRule;

const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};

describe("rangeAround", () => {
  it("splits a middle date into the dates before and after it, under new ids", () => {
    const parts = rangeAround(range("2026-12-24", "2026-12-28"), "2026-12-26", ids());
    expect(parts).toEqual({
      kind: "parts",
      parts: [
        expect.objectContaining({ id: "new-1", startsOn: "2026-12-24", endsOn: "2026-12-25" }),
        expect.objectContaining({ id: "new-2", startsOn: "2026-12-27", endsOn: "2026-12-28" }),
      ],
    });
  });

  it("keeps the message and everything else the rule carried", () => {
    const result = rangeAround(range("2026-12-24", "2026-12-28"), "2026-12-26", ids());
    expect(result.kind === "parts" && result.parts.map((p) => p.guestMessage)).toEqual([
      "Closed",
      "Closed",
    ]);
  });

  it("trims an edge date: one part only", () => {
    expect(rangeAround(range("2026-12-24", "2026-12-28"), "2026-12-24", ids())).toEqual({
      kind: "parts",
      parts: [expect.objectContaining({ startsOn: "2026-12-25", endsOn: "2026-12-28" })],
    });
    expect(rangeAround(range("2026-12-24", "2026-12-28"), "2026-12-28", ids())).toEqual({
      kind: "parts",
      parts: [expect.objectContaining({ startsOn: "2026-12-24", endsOn: "2026-12-27" })],
    });
  });

  it("leaves no part for a one-date rule", () => {
    expect(rangeAround(range("2026-12-24", "2026-12-24"), "2026-12-24", ids())).toEqual({
      kind: "parts",
      parts: [],
    });
  });

  it.each([
    ["a date outside the range", range("2026-12-24", "2026-12-28"), "2026-12-30"],
    ["an open end", range("2026-12-24", undefined), "2026-12-25"],
    [
      "a repeating rule",
      range("2026-12-24", "2027-02-28", { repeat: { version: 1, weekdays: [1] } }),
      "2026-12-28",
    ],
  ])("refuses %s", (_name, rule, date) => {
    expect(rangeAround(rule, date, ids()).kind).toBe("invalid");
  });
});

describe("a date that is not on the calendar", () => {
  it.each(["2027-02-31", "2027-02-29", "2027-04-31", "2026-11-31"])(
    "refuses %s, which a regex accepts and Date rolls into the next month",
    (date) => {
      const result = rangeAround(range("2027-02-25", "2027-03-10"), date, ids());
      expect(result.kind).toBe("invalid");
    }
  );

  it("accepts a real leap day", () => {
    expect(rangeAround(range("2028-02-27", "2028-03-02"), "2028-02-29", ids()).kind).toBe("parts");
  });
});

describe("splitIssues", () => {
  const config = (dateRules: DateRule[]) =>
    ({
      schedules: [],
      venueServices: [],
      scheduleServices: [],
      assignments: [],
      dateRules,
    }) as never;
  const inverted = range("2027-03-04", "2027-03-02", { id: "bad-existing" });

  it("names a problem in a rule the split created", () => {
    const made = range("2027-03-04", "2027-03-02", { id: "made" });
    const issues = splitIssues(config([inverted, made]), [made]);
    expect(issues.map((i) => [i.code, i.path])).toEqual([
      ["ends_before_start", "dateRules[1].endsOn"],
    ]);
  });

  it("ignores a rule the venue already held that is invalid, so a reopen is never held up by it", () => {
    const made = range("2027-03-03", "2027-03-05", { id: "made" });
    expect(splitIssues(config([inverted, made]), [made])).toEqual([]);
  });
});

describe("carryByDate", () => {
  it("moves each part's outcomes by service date and returns every id moved once", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([{ id: "o1" }])
      .mockResolvedValueOnce([{ id: "o2" }, { id: "o3" }]);
    const executeRaw = vi.fn().mockResolvedValue(1);
    const parts = [
      range("2026-12-24", "2026-12-25", { id: "a" }),
      range("2026-12-27", "2026-12-28", { id: "b" }),
    ];
    const carried = await carryByDate(
      { closureOutcome: { findMany }, $executeRaw: executeRaw } as never,
      "v1",
      "r1",
      parts
    );
    expect(carried).toEqual({ from: "r1", outcomeIds: ["o1", "o2", "o3"] });
    expect(findMany.mock.calls[0]![0].where).toMatchObject({
      venueId: "v1",
      dateRuleId: "r1",
      reservation: {
        date: { gte: new Date("2026-12-24T00:00:00Z"), lte: new Date("2026-12-25T00:00:00Z") },
      },
    });
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it("returns null when no outcome is on a part's dates", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const carried = await carryByDate(
      { closureOutcome: { findMany }, $executeRaw: vi.fn() } as never,
      "v1",
      "r1",
      [range("2026-12-24", "2026-12-25", { id: "a" })]
    );
    expect(carried).toBeNull();
  });
});
