import { describe, expect, it } from "vitest";
import type { WeekChange } from "@mbe/availability";
import type { DecidedHoliday, HolidayState } from "./holiday-decisions.js";
import { weekChangeRows } from "./week-changes-view.js";

const FROM = "2026-11-24";

const holiday = (
  date: string,
  state: HolidayState = { kind: "undecided" },
  id: DecidedHoliday["id"] = "thanksgiving"
): DecidedHoliday => ({ id, date, state });

const closure = (ruleId: string, ...dates: string[]): WeekChange => ({
  kind: "closure",
  ruleId,
  dates,
});
const reopen = (ruleId: string, date: string): WeekChange => ({ kind: "reopen", ruleId, date });

const rowsOf = (over: Partial<Parameters<typeof weekChangeRows>[0]> = {}) =>
  weekChangeRows({ changes: [], holidays: [], from: FROM, isManager: true, ...over });

describe("weekChangeRows", () => {
  it("has no rows when nothing changes and no holiday is undecided", () => {
    expect(rowsOf()).toEqual({ rows: [], first: [], more: 0 });
  });

  it("opens a change's first date", () => {
    const { rows } = rowsOf({ changes: [closure("c1", "2026-11-26", "2026-11-27")] });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toEqual({ type: "openDay", date: "2026-11-26" });
    expect(rows[0]?.date).toBe("2026-11-26");
  });

  it("lists an undecided holiday in the window for a Manager, with its holiday action", () => {
    const thanksgiving = holiday("2026-11-26");
    const { rows } = rowsOf({ holidays: [thanksgiving] });
    expect(rows.map((r) => r.action)).toEqual([{ type: "holiday", holiday: thanksgiving }]);
  });

  it("drops holiday rows for a Host, keeping the day rows", () => {
    const { rows } = rowsOf({
      isManager: false,
      holidays: [holiday("2026-11-26")],
      changes: [closure("c1", "2026-11-25")],
    });
    expect(rows.map((r) => r.action.type)).toEqual(["openDay"]);
  });

  it("drops holiday rows while the decisions are unknown (loading or failed)", () => {
    const { rows } = rowsOf({ holidays: undefined, changes: [closure("c1", "2026-11-25")] });
    expect(rows.map((r) => r.action.type)).toEqual(["openDay"]);
  });

  it("adds no row for a decided holiday", () => {
    const { rows } = rowsOf({
      holidays: [
        holiday("2026-11-26", { kind: "openAsUsual" }),
        holiday("2026-11-27", { kind: "closed", ruleId: "c1" }, "christmasDay"),
        holiday("2026-11-28", { kind: "other" }, "boxingDay"),
      ],
    });
    expect(rows).toEqual([]);
  });

  it("leaves out holidays outside the seven days starting at `from`", () => {
    const { rows } = rowsOf({
      holidays: [holiday("2026-11-23"), holiday("2026-11-30", undefined, "christmasDay")],
    });
    expect(rows.map((r) => r.date)).toEqual(["2026-11-30"]);
    expect(rowsOf({ holidays: [holiday("2026-12-01")] }).rows).toEqual([]);
  });

  it("merges holiday rows into date order, after the day's own changes", () => {
    const { rows } = rowsOf({
      changes: [closure("c1", "2026-11-25"), closure("c2", "2026-11-26")],
      holidays: [holiday("2026-11-26")],
    });
    expect(rows.map((r) => `${r.date}:${r.action.type}`)).toEqual([
      "2026-11-25:openDay",
      "2026-11-26:openDay",
      "2026-11-26:holiday",
    ]);
  });

  it("shows one reopen row per date, however many chained closures end on it", () => {
    const { rows } = rowsOf({
      changes: [reopen("c1", "2026-11-28"), reopen("c2", "2026-11-28"), reopen("c3", "2026-11-29")],
    });
    expect(rows.map((r) => r.date)).toEqual(["2026-11-28", "2026-11-29"]);
  });

  it("gives every row a distinct key", () => {
    const { rows } = rowsOf({
      changes: [closure("c1", "2026-11-26"), reopen("c1", "2026-11-27")],
      holidays: [holiday("2026-11-26")],
    });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("shows the first four and counts the rest as more", () => {
    const changes = ["24", "25", "26", "27", "28", "29"].map((d) =>
      closure(`c${d}`, `2026-11-${d}`)
    );
    const { rows, first, more } = rowsOf({ changes });
    expect(rows).toHaveLength(6);
    expect(first.map((r) => r.date)).toEqual([
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
    ]);
    expect(more).toBe(2);
  });
});
