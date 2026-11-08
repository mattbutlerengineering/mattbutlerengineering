import { describe, expect, it } from "vitest";
import type { AvailabilityConfig, DateRule, HolidayDecision } from "@mbe/types";
import { holidayStates, HOLIDAY_HORIZON_DAYS } from "./holiday-decisions.js";

const EMPTY: AvailabilityConfig = {
  schedules: [],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
  dateRules: [],
};

const rule = (startsOn: string, extra: Record<string, unknown> = {}): DateRule =>
  ({
    id: `r-${startsOn}-${String(extra["kind"] ?? "closure")}`,
    kind: "closure",
    targetKind: "venue",
    startsOn,
    endsOn: startsOn,
    ...extra,
  }) as DateRule;

const hours = (startsOn: string, extra: Record<string, unknown> = {}): DateRule =>
  rule(startsOn, {
    kind: "special_hours",
    payload: { version: 1, services: [] },
    ...extra,
  });

const decision = (serviceDate: string): HolidayDecision => ({
  serviceDate,
  decision: "open_as_usual",
  createdAt: "2026-11-08T12:00:00.000Z",
});

const config = (...dateRules: DateRule[]): AvailabilityConfig => ({ ...EMPTY, dateRules });

const stateOf = (
  rules: readonly DateRule[],
  decisions: readonly HolidayDecision[],
  date: string,
  today = "2026-11-08"
) => holidayStates("US", today, config(...rules), decisions).find((h) => h.date === date)?.state;

describe("holidayStates horizon", () => {
  it("lists every holiday from today (inclusive) to 365 days, across the year boundary", () => {
    const states = holidayStates("US", "2026-11-08", EMPTY, []);
    expect(HOLIDAY_HORIZON_DAYS).toBe(365);
    expect(states[0]).toMatchObject({ id: "thanksgiving", date: "2026-11-26" });
    expect(states.some((h) => h.date === "2027-01-01")).toBe(true);
    expect(states.some((h) => h.id === "thanksgiving" && h.date === "2027-11-25")).toBe(false);
    expect(states.some((h) => h.id === "independenceDay" && h.date === "2027-07-04")).toBe(true);
    const dates = states.map((h) => h.date);
    expect(dates).toEqual([...dates].sort());
    expect(states.every((h) => h.state.kind === "undecided")).toBe(true);
  });

  it("includes a holiday that is today and one on the last day of the horizon", () => {
    expect(holidayStates("US", "2026-11-26", EMPTY, [])[0]?.id).toBe("thanksgiving");
    const last = holidayStates("US", "2026-11-26", EMPTY, []).at(-1);
    // 2026-11-26 + 365 days = 2027-11-26; the 2027 Thanksgiving (Nov 25) is the last.
    expect(last).toMatchObject({ id: "thanksgiving", date: "2027-11-25" });
  });
});

describe("holidayStates precedence", () => {
  it("is undecided with no rule and no decision", () => {
    expect(stateOf([], [], "2026-11-26")).toEqual({ kind: "undecided" });
  });

  it("reads a decision as open as usual", () => {
    expect(stateOf([], [decision("2026-11-26")], "2026-11-26")).toEqual({ kind: "openAsUsual" });
  });

  it("reads a one-date whole-venue closure as closed, with its rule id", () => {
    const closed = rule("2026-11-26");
    expect(stateOf([closed], [], "2026-11-26")).toEqual({ kind: "closed", ruleId: closed.id });
  });

  it("reads a one-date venue special-hours rule as special hours, with its rule id", () => {
    const special = hours("2026-11-26");
    expect(stateOf([special], [], "2026-11-26")).toEqual({
      kind: "specialHours",
      ruleId: special.id,
    });
  });

  it("lets a closure outrank an open mark left behind", () => {
    const closed = rule("2026-11-26");
    expect(stateOf([closed], [decision("2026-11-26")], "2026-11-26")).toEqual({
      kind: "closed",
      ruleId: closed.id,
    });
  });

  it("lets special hours outrank an open mark left behind", () => {
    const special = hours("2026-11-26");
    expect(stateOf([special], [decision("2026-11-26")], "2026-11-26")).toEqual({
      kind: "specialHours",
      ruleId: special.id,
    });
  });

  it("prefers a closure over special hours on the same date", () => {
    const closed = rule("2026-11-26");
    expect(stateOf([hours("2026-11-26"), closed], [], "2026-11-26")).toEqual({
      kind: "closed",
      ruleId: closed.id,
    });
  });

  it.each([
    ["a range", rule("2026-12-24", { endsOn: "2026-12-26" })],
    ["an open-ended closure", rule("2026-12-01", { endsOn: null })],
    [
      "a repeating closure",
      rule("2026-12-01", { endsOn: null, repeat: { version: 1, weekdays: [4] } }),
    ],
    ["a closure with a window", rule("2026-12-24", { window: { from: 1200, to: null } })],
    ["a service closure", rule("2026-12-24", { targetKind: "service", venueServiceId: "s1" })],
    ["a booking closure", rule("2026-12-24", { targetKind: "booking", bookingTypes: ["online"] })],
    ["a section closure", rule("2026-12-24", { targetKind: "tables", sectionId: "sec" })],
    ["a one-date edit of a series", rule("2026-12-24", { seriesId: "series-1" })],
    ["a use_schedule rule", rule("2026-12-24", { kind: "use_schedule", useScheduleId: "sch" })],
    ["special hours for a service", hours("2026-12-24", { targetKind: "service" })],
    ["repeating special hours", hours("2026-12-24", { repeat: { version: 1, weekdays: [4] } })],
  ])("reads %s as other, even over an open mark", (_name, other) => {
    expect(stateOf([other], [], "2026-12-24")).toEqual({ kind: "other" });
    expect(stateOf([other], [decision("2026-12-24")], "2026-12-24")).toEqual({ kind: "other" });
  });

  it("applies a repeating rule only on its weekdays", () => {
    // Thursdays from Dec 1: Dec 24 (Thu) is covered, Dec 25 (Fri) is not.
    const thursdays = rule("2026-12-01", { endsOn: null, repeat: { version: 1, weekdays: [4] } });
    expect(stateOf([thursdays], [], "2026-12-24")).toEqual({ kind: "other" });
    expect(stateOf([thursdays], [], "2026-12-25")).toEqual({ kind: "undecided" });
  });

  it("ignores skip and tonight rules, and rules that end before or start after the date", () => {
    expect(stateOf([rule("2026-11-26", { kind: "skip" })], [], "2026-11-26")).toEqual({
      kind: "undecided",
    });
    expect(stateOf([rule("2026-11-26", { kind: "tonight" })], [], "2026-11-26")).toEqual({
      kind: "undecided",
    });
    expect(stateOf([rule("2026-11-25")], [], "2026-11-26")).toEqual({ kind: "undecided" });
    expect(stateOf([rule("2026-11-27")], [], "2026-11-26")).toEqual({ kind: "undecided" });
  });

  it("keeps an open mark on a date a skip alone touches", () => {
    expect(
      stateOf([rule("2026-11-26", { kind: "skip" })], [decision("2026-11-26")], "2026-11-26")
    ).toEqual({ kind: "openAsUsual" });
  });

  it("ignores decisions outside the holidays, and the year boundary holds", () => {
    expect(stateOf([], [decision("2026-11-27")], "2026-11-26")).toEqual({ kind: "undecided" });
    expect(stateOf([rule("2027-01-01")], [], "2027-01-01")).toMatchObject({ kind: "closed" });
    expect(stateOf([], [decision("2026-12-31")], "2026-12-31")).toEqual({ kind: "openAsUsual" });
  });
});
