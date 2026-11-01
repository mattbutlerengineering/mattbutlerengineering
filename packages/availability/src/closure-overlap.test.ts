import { describe, expect, it } from "vitest";
import type { DateRule } from "@mbe/types";
import { alreadyClosed, stillClosedAfterReopen } from "./closure-overlap.js";

const TODAY = "2026-12-01";
const CHRISTMAS = "2026-12-25";

function closure(id: string, fields: Partial<DateRule> = {}): DateRule {
  return {
    id,
    kind: "closure",
    targetKind: "venue",
    startsOn: CHRISTMAS,
    endsOn: CHRISTMAS,
    window: null,
    ...fields,
  } as DateRule;
}
const dinner = { targetKind: "service", venueServiceId: "vs-dinner" } as const;
const fromSix = { window: { version: 1, from: 1080, to: 2880 } } as const;
const online: Partial<DateRule> = { targetKind: "booking", bookingTypes: ["online"] };

const closedOn = (rules: readonly DateRule[], draft: DateRule) => {
  const found = alreadyClosed(rules, draft, TODAY);
  return { every: found.everyDate, by: found.by.map((b) => [b.ruleId, b.dates]) };
};

describe("alreadyClosed", () => {
  it("finds the closure that already closes the whole of a one-date draft", () => {
    expect(closedOn([closure("first")], closure("draft"))).toEqual({
      every: true,
      by: [["first", [CHRISTMAS]]],
    });
  });

  it("carries what names the closure, not just its id", () => {
    const first = closure("first", { endsOn: "2026-12-26", ...dinner });
    const draft = closure("draft", dinner);
    expect(alreadyClosed([first], draft, TODAY).by[0]).toMatchObject({
      targetKind: "service",
      venueServiceId: "vs-dinner",
      startsOn: CHRISTMAS,
      endsOn: "2026-12-26",
    });
  });

  it("says which date of a range is already closed, and that the others are not", () => {
    const draft = closure("draft", { startsOn: "2026-12-24", endsOn: "2026-12-26" });
    expect(closedOn([closure("first")], draft)).toEqual({
      every: false,
      by: [["first", [CHRISTMAS]]],
    });
  });

  it("says which date of a repeat is already closed, reading only the repeat's weekdays", () => {
    // Dec 25, 2026 is a Friday.
    const fridays = closure("draft", {
      startsOn: "2026-12-14",
      endsOn: "2027-01-03",
      repeat: { version: 1, weekdays: [5] },
    });
    expect(closedOn([closure("first")], fridays)).toEqual({
      every: false,
      by: [["first", [CHRISTMAS]]],
    });
    const mondays = closure("draft", { ...fridays, repeat: { version: 1, weekdays: [1] } });
    expect(closedOn([closure("first")], mondays)).toEqual({ every: false, by: [] });
  });

  it("reads an open-ended draft and an open-ended closure, without running forever", () => {
    const open = closure("first", { startsOn: "2026-12-20", endsOn: null });
    const draft = closure("draft", { endsOn: null });
    const found = alreadyClosed([open], draft, TODAY);
    expect(found.everyDate).toBe(true);
    expect(found.by[0]?.dates[0]).toBe(CHRISTMAS);
  });

  it("does not call a wider closure covered by a narrower one", () => {
    expect(closedOn([closure("first", dinner)], closure("draft")).by).toEqual([]);
    expect(closedOn([closure("first", fromSix)], closure("draft")).by).toEqual([]);
    expect(closedOn([closure("first", online)], closure("draft")).by).toEqual([]);
  });

  it("reads a service or a from-time closure as covered by the closure that shuts it already", () => {
    expect(closedOn([closure("first")], closure("draft", dinner)).every).toBe(true);
    expect(closedOn([closure("first")], closure("draft", fromSix)).every).toBe(true);
    expect(closedOn([closure("first", dinner)], closure("draft", dinner)).every).toBe(true);
  });

  it("does not read one service's closure as covering another's", () => {
    const lunch = closure("first", { targetKind: "service", venueServiceId: "vs-lunch" });
    expect(closedOn([lunch], closure("draft", dinner)).by).toEqual([]);
  });

  it("reads a later start as not covering an earlier one, and an earlier one as covering", () => {
    const fromFive = { window: { version: 1, from: 1020, to: 2880 } } as const;
    expect(closedOn([closure("first", fromSix)], closure("draft", fromFive)).by).toEqual([]);
    expect(closedOn([closure("first", fromFive)], closure("draft", fromSix)).every).toBe(true);
  });

  it("treats a channel pause as different from a closed venue, but the same pause as a repeat", () => {
    expect(closedOn([closure("first")], closure("draft", online)).by).toEqual([]);
    expect(closedOn([closure("first", online)], closure("draft", online)).every).toBe(true);
    const both = closure("first", { targetKind: "booking", bookingTypes: ["online", "phone"] });
    expect(closedOn([both], closure("draft", online)).every).toBe(true);
    expect(closedOn([closure("first", online)], closure("draft", both)).by).toEqual([]);
  });

  it("ignores dates before `from`, the draft itself, and anything that is not a closure", () => {
    const past = closure("first", { startsOn: "2026-11-01", endsOn: "2026-11-30" });
    const draft = closure("draft", { startsOn: "2026-11-30", endsOn: "2026-12-02" });
    expect(closedOn([past], draft).by).toEqual([]);
    expect(closedOn([closure("draft")], closure("draft")).by).toEqual([]);
    const hours = {
      ...closure("first"),
      kind: "special_hours",
      payload: { version: 1, services: [] },
    } as DateRule;
    expect(closedOn([hours], closure("draft")).by).toEqual([]);
  });

  it("honours a skip: a series does not close the date it skips", () => {
    const series = closure("s1", {
      startsOn: "2026-12-04",
      endsOn: "2027-01-29",
      repeat: { version: 1, weekdays: [5] },
    });
    const skip = closure("skip", { kind: "skip", seriesId: "s1" } as Partial<DateRule>);
    expect(closedOn([series], closure("draft")).every).toBe(true);
    expect(closedOn([series, skip], closure("draft")).by).toEqual([]);
  });

  it("does not read a one-date edit of a series as closed by the series it replaces", () => {
    const series = closure("s1", {
      startsOn: "2026-12-04",
      endsOn: "2027-01-29",
      repeat: { version: 1, weekdays: [5] },
    });
    expect(closedOn([series], closure("draft", { seriesId: "s1" })).by).toEqual([]);
  });
});

describe("stillClosedAfterReopen", () => {
  const after = (rules: readonly DateRule[], rule: DateRule) => {
    const found = stillClosedAfterReopen(rules, rule, TODAY);
    return { every: found.everyDate, by: found.by.map((b) => [b.ruleId, b.dates]) };
  };

  it("says the date stays closed by the other closure", () => {
    const [first, second] = [closure("first"), closure("second")];
    expect(after([first, second], first)).toEqual({
      every: true,
      by: [["second", [CHRISTMAS]]],
    });
  });

  it("finds nothing when no other closure is there", () => {
    expect(after([closure("first")], closure("first"))).toEqual({ every: false, by: [] });
  });

  it("says which date of a reopened range stays closed", () => {
    const range = closure("range", { startsOn: "2026-12-24", endsOn: "2026-12-26" });
    expect(after([range, closure("second")], range)).toEqual({
      every: false,
      by: [["second", [CHRISTMAS]]],
    });
  });

  it("is told apart across several closures that together keep every date closed", () => {
    const range = closure("range", { startsOn: "2026-12-25", endsOn: "2026-12-26" });
    const other = closure("other", { startsOn: "2026-12-26", endsOn: "2026-12-26" });
    expect(after([range, closure("second"), other], range)).toEqual({
      every: true,
      by: [
        ["second", [CHRISTMAS]],
        ["other", ["2026-12-26"]],
      ],
    });
  });

  it("names a part of the day or a service that stays closed, without calling the date shut", () => {
    const first = closure("first");
    expect(after([first, closure("later", fromSix)], first)).toEqual({
      every: false,
      by: [["later", [CHRISTMAS]]],
    });
    expect(after([first, closure("dinner", dinner)], first)).toEqual({
      every: false,
      by: [["dinner", [CHRISTMAS]]],
    });
  });

  it("does not count a pause or another service as keeping the closure's own thing closed", () => {
    const first = closure("first");
    expect(after([first, closure("pause", online)], first).by).toEqual([]);
    const lunch = closure("lunch", { targetKind: "service", venueServiceId: "vs-lunch" });
    expect(after([closure("dinner", dinner), lunch], closure("dinner", dinner)).by).toEqual([]);
  });

  it("counts a closed venue as keeping a reopened service closed", () => {
    const service = closure("dinner", dinner);
    expect(after([service, closure("venue")], service).every).toBe(true);
  });

  it("ignores the series' own skips and edits, which go with it", () => {
    const series = closure("s1", {
      startsOn: "2026-12-04",
      endsOn: "2027-01-29",
      repeat: { version: 1, weekdays: [5] },
    });
    const edit = closure("e1", { startsOn: "2027-01-01", endsOn: "2027-01-01", seriesId: "s1" });
    expect(after([series, edit], series)).toEqual({ every: false, by: [] });
  });

  it("does not report dates the rule had already skipped", () => {
    const series = closure("s1", {
      startsOn: "2026-12-25",
      endsOn: "2027-01-01",
      repeat: { version: 1, weekdays: [5] },
    });
    const skip = closure("skip", { kind: "skip", seriesId: "s1" } as Partial<DateRule>);
    expect(after([series, skip, closure("second")], series)).toEqual({ every: false, by: [] });
  });

  it("says nothing of a past closure or of a rule that is not a closure", () => {
    const past = closure("first", { startsOn: "2026-11-01", endsOn: "2026-11-01" });
    expect(
      after([past, closure("x", { startsOn: "2026-11-01", endsOn: "2026-11-01" })], past)
    ).toEqual({ every: false, by: [] });
    const hours = {
      ...closure("h"),
      kind: "special_hours",
      payload: { version: 1, services: [] },
    } as DateRule;
    expect(after([hours, closure("second")], hours)).toEqual({ every: false, by: [] });
  });
});
