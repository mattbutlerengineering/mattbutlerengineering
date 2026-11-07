import { describe, expect, it } from "vitest";
import type { DateRule } from "@mbe/types";
import { buildCloseRule, closureForm, editAlongside, isEditableClosure } from "./close-draft.js";

const TODAY = "2026-12-01";
const closure = (patch: Partial<DateRule> = {}) =>
  ({
    id: "c1",
    kind: "closure",
    targetKind: "venue",
    startsOn: "2026-12-24",
    endsOn: "2026-12-26",
    ...patch,
  }) as DateRule;

describe("isEditableClosure (#7984)", () => {
  it.each([
    ["a range", closure()],
    ["one date", closure({ endsOn: "2026-12-24" })],
    [
      "an open-ended pause of some channels",
      closure({ targetKind: "booking", bookingTypes: ["online"], endsOn: null }),
    ],
    [
      "one service from a set time",
      closure({
        targetKind: "service",
        venueServiceId: "vs-dinner",
        window: { version: 1, from: 1320, to: 2880 },
      }),
    ],
  ])("offers %s", (_name, rule) => {
    expect(isEditableClosure(rule)).toBe(true);
  });

  it.each([
    ["a repeating closure, which is a series", closure({ repeat: { version: 1, weekdays: [1] } })],
    ["a skip or one-date edit of a series", closure({ seriesId: "series-1" })],
    ["special hours", { ...closure(), kind: "special_hours" } as unknown as DateRule],
    ["a closure of some tables", closure({ targetKind: "tables" })],
    [
      "a closure ending before the day does",
      closure({ window: { version: 1, from: 1320, to: 1500 } }),
    ],
  ])("does not offer %s", (_name, rule) => {
    expect(isEditableClosure(rule)).toBe(false);
  });
});

describe("closureForm (#7984)", () => {
  it.each([
    ["a range", closure(), { kind: "range", from: "2026-12-24", to: "2026-12-26" }],
    ["one date", closure({ endsOn: "2026-12-24" }), { kind: "date", date: "2026-12-24" }],
    ["no end", closure({ endsOn: null }), { kind: "until-reopen", from: "2026-12-24" }],
  ])("reads %s back as When", (_name, rule, when) => {
    expect(closureForm(rule).when).toEqual(when);
  });

  it("reads what, the start time and both notes back, so an untouched form rebuilds the closure", () => {
    const rule = closure({
      targetKind: "service",
      venueServiceId: "vs-dinner",
      window: { version: 1, from: 1320, to: 2880 },
      staffNote: "Private event",
      guestMessage: "Closed for the holidays",
    });
    const form = closureForm(rule);

    expect(form).toMatchObject({
      what: { kind: "service", serviceId: "vs-dinner" },
      fromMinute: 1320,
      staffNote: "Private event",
      guestMessage: "Closed for the holidays",
    });
    expect(buildCloseRule(form, "c1", TODAY)).toMatchObject({
      targetKind: "service",
      venueServiceId: "vs-dinner",
      startsOn: "2026-12-24",
      endsOn: "2026-12-26",
      window: { from: 1320, to: 2880 },
      staffNote: "Private event",
      guestMessage: "Closed for the holidays",
    });
  });
});

describe("editAlongside (#7984)", () => {
  it("removes the saved closure and names the row as it was read", () => {
    const rule = closure();
    expect(editAlongside(rule)).toEqual({ upsert: [], remove: ["c1"], replaces: rule });
  });
});
