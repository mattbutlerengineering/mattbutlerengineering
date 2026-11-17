import type { DateRule } from "@mbe/types";
import { describe, expect, it } from "vitest";
import {
  activeRules,
  hoursEffect,
  seriesLabel,
  targetLabel,
  tonightEffect,
  windowEffect,
  type RuleOf,
} from "./date-rules.js";

const closure = (over: Partial<RuleOf<"closure">> = {}): RuleOf<"closure"> => ({
  id: "dr-1",
  kind: "closure",
  targetKind: "venue",
  startsOn: "2027-01-01",
  endsOn: "2027-01-31",
  ...over,
});

const tonight = (payload: RuleOf<"tonight">["payload"], over: Partial<DateRule> = {}) =>
  ({
    id: "dr-t",
    kind: "tonight",
    targetKind: "venue",
    startsOn: "2027-01-06",
    endsOn: "2027-01-31",
    payload,
    ...over,
  }) as RuleOf<"tonight">;

const ids = (rules: DateRule[]) => rules.map((r) => r.id);

describe("activeRules — covers modes", () => {
  it("includes a plain range rule inside its range, inclusive of both ends", () => {
    const rule = closure();
    expect(ids(activeRules([rule], "2027-01-01"))).toEqual(["dr-1"]);
    expect(ids(activeRules([rule], "2027-01-15"))).toEqual(["dr-1"]);
    expect(ids(activeRules([rule], "2027-01-31"))).toEqual(["dr-1"]);
  });

  it("excludes a plain range rule outside its range", () => {
    const rule = closure();
    expect(activeRules([rule], "2026-12-31")).toEqual([]);
    expect(activeRules([rule], "2027-02-01")).toEqual([]);
  });

  it("treats a null endsOn as open-ended", () => {
    const rule = closure({ endsOn: null });
    expect(ids(activeRules([rule], "2030-06-01"))).toEqual(["dr-1"]);
    expect(activeRules([rule], "2026-12-31")).toEqual([]);
  });

  it("applies a weekday repeat only on those weekdays", () => {
    const mondays = closure({ repeat: { version: 1, weekdays: [1] } });
    expect(ids(activeRules([mondays], "2027-01-04"))).toEqual(["dr-1"]); // Monday
    expect(activeRules([mondays], "2027-01-05")).toEqual([]); // Tuesday
  });

  it("lives a tonight rule on its start date only, whatever its stored range says", () => {
    const rule = tonight({ version: 1, closeAt: 1200 });
    expect(ids(activeRules([rule], "2027-01-06"))).toEqual(["dr-t"]);
    expect(activeRules([rule], "2027-01-07")).toEqual([]);
    expect(activeRules([rule], "2027-01-05")).toEqual([]);
  });

  it("lives a series edit on its start date only", () => {
    const edit = closure({ id: "dr-edit", seriesId: "dr-series", startsOn: "2027-01-10" });
    expect(ids(activeRules([edit], "2027-01-10"))).toEqual(["dr-edit"]);
    expect(activeRules([edit], "2027-01-11")).toEqual([]);
  });
});

describe("activeRules — series replacement", () => {
  const series = closure({
    id: "dr-series",
    startsOn: "2027-01-01",
    endsOn: "2027-03-31",
    repeat: { version: 1, weekdays: [1] },
  });
  const skip: DateRule = {
    id: "dr-skip",
    kind: "skip",
    targetKind: "venue",
    startsOn: "2027-01-11",
    endsOn: "2027-01-11",
    seriesId: "dr-series",
  };

  it("drops the parent series on the date its skip covers", () => {
    expect(ids(activeRules([series, skip], "2027-01-11"))).toEqual(["dr-skip"]);
  });

  it("keeps the parent series on other dates", () => {
    expect(ids(activeRules([series, skip], "2027-01-18"))).toEqual(["dr-series"]);
  });

  it("keeps stored order", () => {
    const other = closure({ id: "dr-other", startsOn: "2027-01-11", endsOn: "2027-01-11" });
    expect(ids(activeRules([other, series, skip], "2027-01-11"))).toEqual(["dr-other", "dr-skip"]);
  });
});

describe("targetLabel", () => {
  it("names a venue closure", () => {
    expect(targetLabel(closure(), undefined)).toBe("Closed");
  });

  it("names the service, with a fallback", () => {
    const rule = closure({ targetKind: "service" });
    expect(targetLabel(rule, "Lunch")).toBe("Lunch closed");
    expect(targetLabel(rule, undefined)).toBe("Service closed");
  });

  it("joins and capitalises booking types", () => {
    const one = closure({ targetKind: "booking", bookingTypes: ["online"] });
    const two = closure({ targetKind: "booking", bookingTypes: ["online", "phone"] });
    const three = closure({ targetKind: "booking", bookingTypes: ["online", "phone", "waitlist"] });
    expect(targetLabel(one, undefined)).toBe("Online booking closed");
    expect(targetLabel(two, undefined)).toBe("Online and phone booking closed");
    expect(targetLabel(three, undefined)).toBe("Online, phone, and waitlist booking closed");
  });

  it("copes with no booking types", () => {
    expect(targetLabel(closure({ targetKind: "booking", bookingTypes: null }), undefined)).toBe(
      " booking closed"
    );
  });

  it("names blocked tables", () => {
    expect(targetLabel(closure({ targetKind: "tables" }), undefined)).toBe("Tables blocked");
  });
});

describe("seriesLabel", () => {
  it("joins target, weekdays and range", () => {
    const rule = closure({
      startsOn: "2027-01-01",
      endsOn: "2027-03-31",
      repeat: { version: 1, weekdays: [1, 3] },
    });
    expect(seriesLabel(rule, undefined)).toBe(
      "Closed · Mondays, Wednesdays · 2027-01-01 – 2027-03-31"
    );
  });

  it("reads an open end as until reopened", () => {
    const rule = closure({ endsOn: null, repeat: { version: 1, weekdays: [0] } });
    expect(seriesLabel(rule, undefined)).toBe("Closed · Sundays · 2027-01-01 – until reopened");
  });

  it("omits the weekday part when there is no repeat", () => {
    expect(seriesLabel(closure({ targetKind: "service" }), "Dinner")).toBe(
      "Dinner closed · 2027-01-01 – 2027-01-31"
    );
  });
});

describe("windowEffect", () => {
  it("reads no window as all day", () => {
    expect(windowEffect(closure())).toBe("All day");
    expect(windowEffect(closure({ window: null }))).toBe("All day");
  });

  it("formats a window as a time range", () => {
    expect(windowEffect(closure({ window: { version: 1, from: 690, to: 900 } }))).toBe(
      "11:30 AM – 3:00 PM"
    );
  });
});

describe("tonightEffect", () => {
  it("reads closeAt", () => {
    expect(tonightEffect(tonight({ version: 1, closeAt: 1320 }))).toBe("Closes at 10:00 PM");
  });

  it("reads a stopped slot", () => {
    expect(tonightEffect(tonight({ version: 1, stop: { from: 1140, to: 1200 } }))).toBe(
      "Stopped 7:00 PM – 8:00 PM"
    );
  });

  it("reads pacing, singular and plural", () => {
    expect(tonightEffect(tonight({ version: 1, pacing: { covers: 1 } }))).toBe("Pacing 1 cover");
    expect(tonightEffect(tonight({ version: 1, pacing: { covers: 8 } }))).toBe("Pacing 8 covers");
  });
});

describe("hoursEffect", () => {
  it("reads no services as Closed", () => {
    expect(hoursEffect([])).toBe("Closed");
  });

  it("joins each service with its hours", () => {
    expect(
      hoursEffect([
        { name: "Lunch", opensAt: 690, closesAt: 900 },
        { name: "Dinner", opensAt: 1020, closesAt: 1380 },
      ])
    ).toBe("Lunch 11:30 AM – 3:00 PM, Dinner 5:00 PM – 11:00 PM");
  });
});
