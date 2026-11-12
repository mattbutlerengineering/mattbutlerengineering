import { describe, expect, it } from "vitest";
import {
  rowsOf,
  rule,
  specialHours,
  THURSDAYS,
  TODAY,
  venue,
  window,
} from "./hub-rows-test-helpers.js";

const weekly = (weekday: number) => ({ repeat: { version: 1 as const, weekdays: [weekday] } });

describe("hubRows: 3 special dates and holidays", () => {
  it("lists the next two special dates and counts the holidays not planned", () => {
    const config = venue([
      specialHours("r-dec-31", "2026-12-31"),
      specialHours("r-dec-24", "2026-12-24"),
      rule("r-nov-26", { startsOn: "2026-11-26", endsOn: "2026-11-26" }),
      specialHours("r-past", "2026-11-01"),
    ]);
    const holidays = [
      { state: { kind: "undecided" } },
      { state: { kind: "closed", ruleId: "r-nov-26" } },
      { state: { kind: "undecided" } },
      { state: { kind: "openAsUsual" } },
      { state: { kind: "undecided" } },
    ] as const;
    expect(rowsOf(config, { holidays })[2]).toEqual({
      row: 3,
      next: [
        {
          ruleId: "r-nov-26",
          kind: "closed",
          nextOn: "2026-11-26",
          startsOn: "2026-11-26",
          endsOn: "2026-11-26",
          weekdays: null,
        },
        {
          ruleId: "r-dec-24",
          kind: "specialHours",
          nextOn: "2026-12-24",
          startsOn: "2026-12-24",
          endsOn: "2026-12-24",
          weekdays: null,
        },
      ],
      holidaysNotPlanned: 3,
    });
  });

  it("lists nothing when there are no special dates, and still counts the holidays", () => {
    const holidays = [{ state: { kind: "undecided" } }] as const;
    expect(rowsOf(venue(), { holidays })[2]).toEqual({ row: 3, next: [], holidaysNotPlanned: 1 });
    expect(rowsOf(venue())[2]).toEqual({ row: 3, next: [], holidaysNotPlanned: 0 });
  });

  it("does not list a closure of part of the venue or part of a day as a special date", () => {
    const config = venue([
      rule("r-from-six", { window: window(1080) }),
      rule("r-online", { targetKind: "booking", bookingTypes: ["online"] }),
    ]);
    expect(rowsOf(config)[2].next).toEqual([]);
  });

  it("orders by the next date each rule covers, not by when the rule started", () => {
    const config = venue([
      specialHours("r-sundays", "2026-01-04", { endsOn: null, ...weekly(0) }),
      specialHours("r-mondays", "2026-02-02", { endsOn: null, ...weekly(1) }),
      specialHours("r-tomorrow", "2026-11-13"),
    ]);
    expect(rowsOf(config)[2].next).toMatchObject([
      { ruleId: "r-tomorrow", nextOn: "2026-11-13", weekdays: null },
      { ruleId: "r-sundays", nextOn: "2026-11-15", startsOn: "2026-01-04", weekdays: [0] },
    ]);
  });

  it("drops a weekly rule with no date left before it ends", () => {
    // Mondays up to today, a Thursday: the last Monday was Nov 9.
    const config = venue([
      specialHours("r-mondays", "2026-11-01", { endsOn: TODAY, ...weekly(1) }),
    ]);
    expect(rowsOf(config)[2].next).toEqual([]);
  });

  it("drops a closure series whose only date left is skipped", () => {
    const series = rule("r-series", { ...THURSDAYS, endsOn: TODAY });
    const skip = rule("r-skip", { kind: "skip", seriesId: "r-series" });
    expect(rowsOf(venue([series]))[2].next).toMatchObject([{ ruleId: "r-series", nextOn: TODAY }]);
    expect(rowsOf(venue([series, skip]))[2].next).toEqual([]);
  });

  it("steps a series past a date its one-date edit replaces", () => {
    const series = rule("r-series", THURSDAYS);
    const edit = rule("r-edit", { seriesId: "r-series", window: window(1080) });
    expect(rowsOf(venue([series, edit]))[2].next).toMatchObject([
      { ruleId: "r-series", kind: "closed", nextOn: "2026-11-19" },
    ]);
  });
});
