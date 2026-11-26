import { describe, expect, it } from "vitest";
import { validateConfig } from "@mbe/availability";
import type { ClosureImpact } from "@mbe/types";
import {
  combineImpacts,
  emptyRow,
  ruleItems,
  saveLabelParts,
  validateRows,
  type AddDatesForm,
  type DateRow,
} from "./add-dates-draft.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const TODAY = "2026-10-26";
const config = fixtureConfig();

const row = (patch: Partial<DateRow>): DateRow => ({
  ...emptyRow("r1", ""),
  ...patch,
});
const form = (rows: DateRow[], patch: Partial<AddDatesForm> = {}): AddDatesForm => ({
  rows,
  shareMessage: false,
  sharedMessage: "",
  ...patch,
});

describe("validateRows", () => {
  it("needs a date on every row, today or later, and no date twice", () => {
    expect(validateRows(form([row({ key: "a", date: "" })]), TODAY)).toEqual({
      key: "a",
      field: "dateMissing",
    });
    expect(validateRows(form([row({ key: "a", date: "2026-10-25" })]), TODAY)?.field).toBe("date");
    const dup = form([
      row({ key: "a", date: "2026-12-24" }),
      row({ key: "b", date: "2026-12-24" }),
    ]);
    expect(validateRows(dup, TODAY)).toEqual({ key: "b", field: "date" });
    expect(validateRows(form([row({ key: "a", date: "2026-12-24" })]), TODAY)).toBeNull();
  });

  it("lets a Special hours row through alone, and refuses it among several dates", () => {
    const hours = row({ key: "a", date: "2026-12-24", kind: "hours" });
    expect(validateRows(form([hours]), TODAY)).toBeNull();
    const other = row({ key: "b", date: "2026-12-25" });
    expect(validateRows(form([hours, other]), TODAY)).toEqual({
      key: "a",
      field: "hours",
    });
  });

  it("does not hold a Special hours row to the message length, which it never sends", () => {
    const hours = row({
      key: "a",
      date: "2026-12-24",
      kind: "hours",
      message: "x".repeat(201),
    });
    expect(validateRows(form([hours]), TODAY)).toBeNull();
  });
});

describe("rows to saves", () => {
  const rows = [
    row({
      key: "a",
      date: "2026-12-24",
      kind: "closed",
      message: "Private party",
    }),
    row({ key: "b", date: "2026-12-25", kind: "closed" }),
  ];

  it("makes a closure for each Closed row, with its own message or the shared one", () => {
    const own = ruleItems(form(rows), TODAY, (k) => `id-${k}`);
    expect(own.map((i) => [i.rowKey, i.rule.id, i.rule.guestMessage])).toEqual([
      ["a", "id-a", "Private party"],
      ["b", "id-b", undefined],
    ]);
    const shared = ruleItems(
      form(rows, {
        shareMessage: true,
        sharedMessage: "Closed for the holiday",
      }),
      TODAY,
      (k) => `id-${k}`
    );
    expect(shared.map((i) => i.rule.guestMessage)).toEqual([
      "Closed for the holiday",
      "Closed for the holiday",
    ]);
    expect(validateConfig({ ...config, dateRules: own.map((i) => i.rule) })).toEqual([]);
  });

  it("saves nothing for a Special hours row: the day editor takes its date", () => {
    const hours = row({ key: "h", date: "2026-12-24", kind: "hours" });
    expect(ruleItems(form([hours]), TODAY, (k) => `id-${k}`)).toEqual([]);
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
