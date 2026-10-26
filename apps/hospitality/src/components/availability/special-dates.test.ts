import { describe, expect, it } from "vitest";
import type { ClosureSummary, DateRule } from "@mbe/types";
import { hoursEditDate, orphanRefundRules, specialDateRows } from "./special-dates.js";

describe("hoursEditDate", () => {
  const range = (startsOn: string, endsOn: string | null) =>
    ({ id: "r", kind: "special_hours", targetKind: "venue", startsOn, endsOn }) as DateRule;

  it("is the rule's own date for a single date", () => {
    expect(hoursEditDate(range("2026-12-31", "2026-12-31"), "2026-12-01")).toBe("2026-12-31");
  });

  it("is the next covered weekday for a repeating rule that started in the past", () => {
    const fridays = {
      ...range("2026-09-04", null),
      repeat: { version: 1, weekdays: [5] },
    } as DateRule;
    // 2026-10-26 is a Monday; the rule's first date is a Friday long gone.
    expect(hoursEditDate(fridays, "2026-10-26")).toBe("2026-10-30");
    expect(hoursEditDate(fridays, "2026-09-01")).toBe("2026-09-04");
  });

  it("is the first date not yet past for a range already under way", () => {
    expect(hoursEditDate(range("2026-12-01", "2026-12-31"), "2026-12-10")).toBe("2026-12-10");
    expect(hoursEditDate(range("2026-12-20", null), "2026-12-10")).toBe("2026-12-20");
  });
});

const closure = (id: string, startsOn: string, over: Partial<DateRule> = {}) =>
  ({ id, kind: "closure", targetKind: "venue", startsOn, endsOn: startsOn, ...over }) as DateRule;

const hours = (id: string, startsOn: string) =>
  ({
    id,
    kind: "special_hours",
    targetKind: "venue",
    startsOn,
    endsOn: startsOn,
    payload: { version: 1, services: [] },
  }) as unknown as DateRule;

const summary = (ruleId: string, over: Partial<ClosureSummary> = {}): ClosureSummary => ({
  ruleId,
  total: 0,
  cancelled: 0,
  sent: 0,
  rebooked: 0,
  unreachable: 0,
  refundFailed: 0,
  refundPending: 0,
  ...over,
});

const TODAY = "2026-12-01";
const RULES: DateRule[] = [
  closure("past", "2026-11-20"),
  hours("hours", "2026-12-31"),
  closure("xmas", "2026-12-24"),
  closure("mondays", "2027-01-05", {
    repeat: { version: 1, weekdays: [1] },
    endsOn: "2027-03-30",
  }),
  { id: "tonight", kind: "tonight", targetKind: "venue", startsOn: TODAY } as unknown as DateRule,
  { id: "skip", kind: "skip", targetKind: "venue", startsOn: "2026-12-10" } as DateRule,
];

const ids = (filter: Parameters<typeof specialDateRows>[2]) =>
  specialDateRows(RULES, TODAY, filter).map((r) => r.rule.id);

describe("specialDateRows", () => {
  it("lists closures and special hours, upcoming first, without past or non-closure rules", () => {
    expect(ids("all")).toEqual(["xmas", "hours", "mondays"]);
  });

  it("filters to closures, special hours, repeating or past", () => {
    expect(ids("closures")).toEqual(["xmas", "mondays"]);
    expect(ids("special_hours")).toEqual(["hours"]);
    expect(ids("repeating")).toEqual(["mondays"]);
    expect(ids("past")).toEqual(["past"]);
  });

  it("keeps an open-ended closure upcoming", () => {
    const open = closure("open", "2026-11-01", { endsOn: null });
    expect(specialDateRows([open], TODAY, "all")).toHaveLength(1);
  });
});

describe("orphanRefundRules", () => {
  it("returns outcomes with refunds a retry can touch whose rule is not listed", () => {
    const summaries = [
      summary("xmas", { refundFailed: 1 }),
      summary("tonight", { refundPending: 2 }),
      summary("reopened", { refundFailed: 1 }),
      summary("settled", { total: 3 }),
    ];

    expect(orphanRefundRules(summaries, ["xmas"]).map((s) => s.ruleId)).toEqual([
      "tonight",
      "reopened",
    ]);
  });
});
