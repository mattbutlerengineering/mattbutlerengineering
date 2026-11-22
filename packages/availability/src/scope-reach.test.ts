import type { DateRule } from "@mbe/types";
import { describe, expect, it } from "vitest";
import { SCOPE_HORIZON_DAYS, coversDate, isHoursRule } from "./scope-reach.js";

const rule = (over: Partial<DateRule> = {}): DateRule =>
  ({
    id: "dr-1",
    kind: "special_hours",
    targetKind: "venue",
    startsOn: "2027-01-04",
    endsOn: "2027-01-31",
    ...over,
  }) as DateRule;

describe("SCOPE_HORIZON_DAYS", () => {
  it("settles an open end 366 days out", () => {
    expect(SCOPE_HORIZON_DAYS).toBe(366);
  });
});

describe("coversDate", () => {
  it("includes both ends of the range and nothing outside it", () => {
    const r = rule();
    expect(coversDate(r, "2027-01-03")).toBe(false);
    expect(coversDate(r, "2027-01-04")).toBe(true);
    expect(coversDate(r, "2027-01-31")).toBe(true);
    expect(coversDate(r, "2027-02-01")).toBe(false);
  });

  it("treats a null or missing end as open", () => {
    expect(coversDate(rule({ endsOn: null }), "2030-06-01")).toBe(true);
    expect(coversDate(rule({ endsOn: undefined }), "2030-06-01")).toBe(true);
  });

  it("limits a repeat to its weekdays (0 = Sunday)", () => {
    const r = rule({ repeat: { version: 1, weekdays: [1] } });
    expect(coversDate(r, "2027-01-04")).toBe(true); // Monday
    expect(coversDate(r, "2027-01-05")).toBe(false);
    expect(coversDate(r, "2027-01-11")).toBe(true);
  });

  it("does not special-case Tonight or series rows: the stored range alone decides", () => {
    expect(coversDate(rule({ kind: "skip", seriesId: "s" }), "2027-01-10")).toBe(true);
  });
});

describe("isHoursRule", () => {
  it("is true for special_hours and use_schedule that are not series edits", () => {
    expect(isHoursRule(rule({ kind: "special_hours" }))).toBe(true);
    expect(isHoursRule(rule({ kind: "use_schedule" }))).toBe(true);
  });

  it("is false for an edit of a series, and for other kinds", () => {
    expect(isHoursRule(rule({ kind: "special_hours", seriesId: "s" }))).toBe(false);
    expect(isHoursRule(rule({ kind: "closure" }))).toBe(false);
    expect(isHoursRule(rule({ kind: "skip" }))).toBe(false);
  });
});
