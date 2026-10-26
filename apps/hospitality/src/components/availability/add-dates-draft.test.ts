import { describe, expect, it } from "vitest";
import { resolveDay, validateConfig } from "@mbe/availability";
import type { ClosureImpact } from "@mbe/types";
import {
  combineImpacts,
  decisionsFor,
  emptyRow,
  regularServices,
  ruleItems,
  saveLabelParts,
  validateRows,
  type AddDatesForm,
  type DateRow,
} from "./add-dates-draft.js";
import { FIXTURE_TIMEZONE, fixtureConfig } from "./resolved-day-fixtures.js";

const TODAY = "2026-10-26";
const config = fixtureConfig();

const row = (patch: Partial<DateRow>): DateRow => ({ ...emptyRow("r1", ""), ...patch });
const form = (rows: DateRow[], patch: Partial<AddDatesForm> = {}): AddDatesForm => ({
  rows,
  shareMessage: false,
  sharedMessage: "",
  ...patch,
});

describe("validateRows", () => {
  it("needs a date on every row, today or later, and no date twice", () => {
    expect(validateRows(form([row({ key: "a", date: "" })]), config, TODAY)).toEqual({
      key: "a",
      field: "date",
    });
    expect(validateRows(form([row({ key: "a", date: "2026-10-25" })]), config, TODAY)?.field).toBe(
      "date"
    );
    const dup = form([
      row({ key: "a", date: "2026-12-24" }),
      row({ key: "b", date: "2026-12-24" }),
    ]);
    expect(validateRows(dup, config, TODAY)).toEqual({ key: "b", field: "date" });
    expect(validateRows(form([row({ key: "a", date: "2026-12-24" })]), config, TODAY)).toBeNull();
  });

  it("holds a special-hours row to at least one service", () => {
    const hours = row({ key: "a", date: "2026-12-24", kind: "hours", services: [] });
    expect(validateRows(form([hours]), config, TODAY)).toEqual({ key: "a", field: "hours" });
  });

  it("only counts a repeating hours rule on the weekdays it covers", () => {
    const [fridayLunch] = regularServices(config, FIXTURE_TIMEZONE, 5, TODAY);
    const fridays = fixtureConfig({
      id: "fridays",
      kind: "special_hours",
      targetKind: "venue",
      startsOn: "2026-12-01",
      endsOn: null,
      repeat: { version: 1, weekdays: [5] },
      payload: { version: 1, services: [] },
    });
    const hoursOn = (date: string) =>
      form([row({ key: "a", date, kind: "same", sameAs: 5, services: [fridayLunch!] })]);
    // 2026-12-22 is a Tuesday, 2026-12-25 a Friday.
    expect(validateRows(hoursOn("2026-12-22"), fridays, TODAY)).toBeNull();
    expect(validateRows(hoursOn("2026-12-25"), fridays, TODAY)).toEqual({
      key: "a",
      field: "date",
    });
  });

  it("refuses a service the venue does not have yet, and a date with hours of its own", () => {
    const [fridayLunch] = regularServices(config, FIXTURE_TIMEZONE, 5, TODAY);
    const brandNew = row({
      key: "a",
      date: "2026-12-24",
      kind: "hours",
      services: [{ ...fridayLunch!, venueServiceId: null, name: "Brunch" }],
    });
    expect(validateRows(form([brandNew]), config, TODAY)).toEqual({ key: "a", field: "hours" });

    const owned = fixtureConfig({
      id: "own",
      kind: "special_hours",
      targetKind: "venue",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
      payload: { version: 1, services: [] },
    });
    const same = row({
      key: "b",
      date: "2026-12-24",
      kind: "same",
      sameAs: 5,
      services: [fridayLunch!],
    });
    expect(validateRows(form([same]), owned, TODAY)).toEqual({ key: "b", field: "date" });
  });
});

describe("rows to saves", () => {
  const rows = [
    row({ key: "a", date: "2026-12-24", kind: "closed", message: "Private party" }),
    row({ key: "b", date: "2026-12-25", kind: "closed" }),
    row({ key: "c", date: "2026-12-31", kind: "same", sameAs: 5 }),
  ];

  it("makes a closure for each Closed row, with its own message or the shared one", () => {
    const own = ruleItems(form(rows.slice(0, 2)), TODAY, (k) => `id-${k}`);
    expect(own.map((i) => [i.rowKey, i.rule.id, i.rule.guestMessage])).toEqual([
      ["a", "id-a", "Private party"],
      ["b", "id-b", undefined],
    ]);
    const shared = ruleItems(
      form(rows.slice(0, 2), { shareMessage: true, sharedMessage: "Closed for the holiday" }),
      TODAY,
      (k) => `id-${k}`
    );
    expect(shared.map((i) => i.rule.guestMessage)).toEqual([
      "Closed for the holiday",
      "Closed for the holiday",
    ]);
  });

  it("seeds Same as Friday from the regular Friday, whatever the date", () => {
    const services = regularServices(config, FIXTURE_TIMEZONE, 5, TODAY);
    expect(services.map((s) => [s.name, s.opensAt, s.closesAt])).toEqual([
      ["Lunch", 690, 900],
      ["Dinner", 1020, 1380],
    ]);
  });

  it("writes Special hours and Same as rows as special-hours rules, in row order with the closures", () => {
    const hoursRow = row({
      key: "h",
      date: "2026-12-24",
      kind: "hours",
      message: "Early dinner",
      services: regularServices(config, FIXTURE_TIMEZONE, 5, TODAY).map((s, i, all) =>
        i === all.length - 1 ? { ...s, lastSeatingAt: 1140, closesAt: 1200 } : s
      ),
    });
    const same = row({
      key: "c",
      date: "2026-12-31",
      kind: "same",
      sameAs: 5,
      services: regularServices(config, FIXTURE_TIMEZONE, 5, TODAY),
    });
    const items = ruleItems(form([hoursRow, rows[1]!, same]), TODAY, (k) => `id-${k}`);
    expect(items.map((i) => [i.rowKey, i.rule.kind, i.rule.startsOn, i.rule.guestMessage])).toEqual(
      [
        ["h", "special_hours", "2026-12-24", "Early dinner"],
        ["b", "closure", "2026-12-25", undefined],
        ["c", "special_hours", "2026-12-31", undefined],
      ]
    );
    const next = { ...config, dateRules: items.map((i) => i.rule) };
    expect(validateConfig(next)).toEqual([]);
    const at = (date: string) => resolveDay({ timezone: FIXTURE_TIMEZONE, config: next }, date);
    expect(at("2026-12-24").services.at(-1)?.closesAt).toBe(1200);
    expect(at("2026-12-31").services.at(-1)?.closesAt).toBe(1380);
  });
});

describe("the combined Step 2", () => {
  const impact = (date: string, count: number, deposits = 0): ClosureImpact => ({
    reservations: count,
    covers: count * 2,
    depositsHeld: deposits,
    groups: [
      {
        groupKey: `${date}:closed`,
        date,
        kind: "closed",
        covers: count * 2,
        depositsHeld: 0,
        reservations: Array.from({ length: count }, (_, i) => ({
          id: `${date}-${i}`,
          startTime: `${date}T20:00:00.000Z`,
          endTime: `${date}T21:30:00.000Z`,
          partySize: 2,
          guestName: "G",
          deposit: null,
          runsIntoClosure: false,
        })),
      },
    ],
  });

  it("joins the groups of every row, sorted by date, and sums the header", () => {
    const joined = combineImpacts([impact("2026-12-25", 3, 1), impact("2026-12-24", 2)]);
    expect(joined.groups.map((g) => g.date)).toEqual(["2026-12-24", "2026-12-25"]);
    expect([joined.reservations, joined.covers, joined.depositsHeld]).toEqual([5, 10, 1]);
  });

  it("splits one choice map back into each row's decisions", () => {
    const impacts = [impact("2026-12-24", 2), impact("2026-12-25", 3)];
    const choices = {
      "2026-12-24:closed": { action: "cancel" as const, acknowledged: false },
      "2026-12-25:closed": { action: "keep_silent" as const, acknowledged: true },
    };
    expect(decisionsFor(impacts, choices)).toEqual([
      [{ groupKey: "2026-12-24:closed", action: "cancel" }],
      [{ groupKey: "2026-12-25:closed", action: "keep_silent", acknowledged: true }],
    ]);
  });

  it("names the outcome: dates saved, then what happens to bookings", () => {
    expect(saveLabelParts(2, { cancel: 9, move: 5, keep_notify: 0, keep_silent: 0 })).toEqual({
      dates: 2,
      parts: [
        { action: "cancel", count: 9 },
        { action: "move", count: 5 },
      ],
    });
  });
});
