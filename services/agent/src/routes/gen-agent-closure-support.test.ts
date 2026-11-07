import { describe, it, expect, vi } from "vitest";
import type { z } from "zod";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import {
  dayNumber,
  checkSpan,
  spanOf,
  spanText,
  scopeOf,
  scopeNeedsService,
  affectedResult,
  closureFailure,
  closedDays,
  closureOnDay,
  hasSpecialHours,
  findReopenable,
  checkHours,
  UNTIL_REOPENED,
  type ClosureRule,
} from "./gen-agent-closure-support.js";

/** What `ApiClientError` looks like to the tools: a status-bearing ProblemDetails. */
function problem(status: number, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(`${status} refused`), {
    problemDetails: { type: "about:blank", title: "Refused", status, detail: "Refused.", ...extra },
  });
}

function config(dateRules: unknown[] = [], venueServices: unknown[] = []): AvailabilityConfig {
  return {
    schedules: [],
    venueServices: venueServices as AvailabilityConfig["venueServices"],
    scheduleServices: [],
    assignments: [],
    dateRules: dateRules as DateRule[],
  };
}

describe("dayNumber", () => {
  it("reads a real date as days since the epoch", () => {
    expect(dayNumber("2026-12-24")).toBe(dayNumber("2026-12-25")! - 1);
    expect(typeof dayNumber("2026-12-24")).toBe("number");
  });

  it("rejects a calendar date that doesn't exist", () => {
    expect(dayNumber("2026-02-30")).toBeUndefined();
  });

  it("rejects text that isn't a date", () => {
    expect(dayNumber("next friday")).toBeUndefined();
  });
});

describe("checkSpan", () => {
  const TODAY = "2026-10-28";

  it("reads a one-day span with no end date", () => {
    expect(checkSpan("2026-12-24", undefined, TODAY)).toEqual({
      from: "2026-12-24",
      to: "2026-12-24",
    });
  });

  it("reads a multi-day span", () => {
    expect(checkSpan("2026-12-24", "2026-12-26", TODAY)).toEqual({
      from: "2026-12-24",
      to: "2026-12-26",
    });
  });

  it("refuses an unreadable date", () => {
    expect(checkSpan("next friday", undefined, TODAY)).toEqual({
      error: expect.stringMatching(/can't be read.*YYYY-MM-DD/),
    });
  });

  it("refuses a date in the past", () => {
    expect(checkSpan("2026-10-01", undefined, TODAY)).toEqual({
      error: expect.stringMatching(/in the past.*2026-10-28/),
    });
  });

  it("refuses today and points at the Tonight tool", () => {
    expect(checkSpan(TODAY, undefined, TODAY)).toEqual({
      error: expect.stringMatching(/Today.*change_tonight_availability/),
    });
  });

  it("refuses an end date before the start", () => {
    expect(checkSpan("2026-12-24", "2026-12-20", TODAY)).toEqual({
      error: expect.stringMatching(/before/),
    });
  });

  it("refuses a span longer than the API allows", () => {
    expect(checkSpan("2026-11-01", "2028-01-01", TODAY)).toEqual({
      error: expect.stringMatching(/366 days/),
    });
  });

  it("allows a span of exactly the maximum length", () => {
    expect(checkSpan("2026-11-01", "2027-11-01", TODAY)).toEqual({
      from: "2026-11-01",
      to: "2027-11-01",
    });
  });
});

describe("spanOf", () => {
  it("reads a rule's real end date", () => {
    const rule = { startsOn: "2026-12-24", endsOn: "2026-12-26" } as ClosureRule;
    expect(spanOf(rule)).toEqual({ from: "2026-12-24", to: "2026-12-26" });
  });

  it("reads a rule with no end as until reopened", () => {
    const rule = { startsOn: "2026-12-24", endsOn: null } as ClosureRule;
    expect(spanOf(rule)).toEqual({ from: "2026-12-24", to: UNTIL_REOPENED });
  });
});

describe("spanText", () => {
  it("renders a rule's real span", () => {
    expect(spanText({ startsOn: "2026-12-24", endsOn: "2026-12-26" })).toBe(
      "from 2026-12-24 to 2026-12-26"
    );
  });

  it("renders a rule with no end as until reopened", () => {
    expect(spanText({ startsOn: "2026-12-24", endsOn: null })).toBe(
      "from 2026-12-24 until reopened"
    );
  });
});

describe("scopeOf", () => {
  const cfg = config([], [{ id: "svc-dinner", name: "Dinner", position: 0 }]);

  it("names a service by its id", () => {
    expect(
      scopeOf({ targetKind: "service", venueServiceId: "svc-dinner", bookingTypes: undefined }, cfg)
    ).toBe("Dinner");
  });

  it("falls back when a service target has no known service", () => {
    expect(
      scopeOf({ targetKind: "service", venueServiceId: "missing", bookingTypes: undefined }, cfg)
    ).toBe("a service");
  });

  it("names a booking-type scope", () => {
    expect(
      scopeOf(
        { targetKind: "booking", venueServiceId: undefined, bookingTypes: ["online", "phone"] },
        cfg
      )
    ).toBe("online and phone booking");
  });

  it("names a tables scope", () => {
    expect(
      scopeOf({ targetKind: "tables", venueServiceId: undefined, bookingTypes: undefined }, cfg)
    ).toBe("some tables");
  });

  it("names the whole venue by default", () => {
    expect(
      scopeOf({ targetKind: "venue", venueServiceId: undefined, bookingTypes: undefined }, cfg)
    ).toBe("the whole venue");
  });
});

describe("scopeNeedsService", () => {
  function ctx() {
    return { addIssue: vi.fn() } as unknown as z.RefinementCtx;
  }

  it("requires a service when the scope is service", () => {
    const c = ctx();
    scopeNeedsService({ scope: "service", service: undefined }, c);
    expect(c.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ path: ["service"], message: expect.stringContaining("needs") })
    );
  });

  it("allows scope service with a service named", () => {
    const c = ctx();
    scopeNeedsService({ scope: "service", service: "Dinner" }, c);
    expect(c.addIssue).not.toHaveBeenCalled();
  });

  it("refuses a service named alongside whole_venue", () => {
    const c = ctx();
    scopeNeedsService({ scope: "whole_venue", service: "Dinner" }, c);
    expect(c.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        path: ["service"],
        message: expect.stringContaining("only applies"),
      })
    );
  });

  it("allows whole_venue with no service", () => {
    const c = ctx();
    scopeNeedsService({ scope: "whole_venue", service: undefined }, c);
    expect(c.addIssue).not.toHaveBeenCalled();
  });
});

describe("affectedResult", () => {
  it("summarizes the affected bookings and dates", () => {
    const result = affectedResult({
      reservations: 3,
      covers: 11,
      groups: [{ date: "2026-12-24" }, { date: "2026-12-24" }, { date: "2026-12-25" }] as never,
    });

    expect(result).toEqual({
      refused: true,
      needsDecisions: true,
      error: expect.stringMatching(
        /3 bookings \(11 covers\) on 2026-12-24, 2026-12-25.*Nothing was changed/s
      ),
    });
  });

  it("uses the singular for exactly one booking and cover", () => {
    const result = affectedResult({
      reservations: 1,
      covers: 1,
      groups: [{ date: "2026-12-24" }] as never,
    });

    expect(result.error).toMatch(/1 booking \(1 cover\) on 2026-12-24/);
  });
});

describe("closureFailure", () => {
  const UNSURE = "Couldn't confirm. Check list_closures.";

  it("falls back to unsure text for a non-refusal error", () => {
    expect(closureFailure(new Error("timeout"), UNSURE)).toEqual({ error: UNSURE });
  });

  it("explains a decision-required refusal", () => {
    expect(closureFailure(problem(422, { code: "decision-required" }), UNSURE)).toMatchObject({
      refused: true,
      code: "decision-required",
      needsDecisions: true,
      error: expect.stringMatching(/decision.*Nothing was changed/s),
    });
  });

  it("explains a version-conflict refusal", () => {
    expect(closureFailure(problem(409, { code: "version-conflict" }), UNSURE)).toMatchObject({
      refused: true,
      error: expect.stringMatching(/changed since it was read/),
    });
  });

  it("explains a closure-exists refusal", () => {
    expect(closureFailure(problem(422, { code: "closure-exists" }), UNSURE)).toMatchObject({
      refused: true,
      error: "That closure was already saved. Nothing more was changed.",
    });
  });

  it("explains a forbidden refusal by status alone", () => {
    expect(closureFailure(problem(403), UNSURE)).toMatchObject({
      refused: true,
      error: expect.stringMatching(/permission.*manager/is),
    });
  });

  it("passes on the server's detail and issue messages for an unrecognised code", () => {
    const err = problem(422, {
      code: "invalid-config",
      detail: "The rule is invalid.",
      issues: [{ message: "Dinner overlaps Lunch." }],
    });

    expect(closureFailure(err, UNSURE)).toMatchObject({
      refused: true,
      code: "invalid-config",
      error: "The rule is invalid. Dinner overlaps Lunch. Nothing was changed.",
    });
  });
});

describe("closedDays / closureOnDay", () => {
  const closure = {
    id: "c1",
    kind: "closure",
    targetKind: "venue",
    startsOn: "2026-12-24",
    endsOn: "2026-12-26",
  };

  it("finds the whole-venue closure covering each day in a span", () => {
    const cfg = config([closure]);
    expect(closedDays(cfg, undefined, "2026-12-24", "2026-12-26")).toEqual([
      { date: "2026-12-24", rule: closure },
      { date: "2026-12-25", rule: closure },
      { date: "2026-12-26", rule: closure },
    ]);
  });

  it("returns nothing when no closure covers the span", () => {
    const cfg = config([closure]);
    expect(closedDays(cfg, undefined, "2026-12-27", "2026-12-28")).toEqual([]);
  });

  it("does not read a from-time closure as closing the whole day", () => {
    const fromSix = { ...closure, window: { version: 1, from: 1080, to: 2880 } };
    const cfg = config([fromSix]);
    expect(closureOnDay(cfg, undefined, "2026-12-24")).toBeUndefined();
  });

  it("does not read a service closure as closing the whole venue", () => {
    const dinner = { ...closure, targetKind: "service", venueServiceId: "svc-dinner" };
    const cfg = config([dinner]);
    expect(closureOnDay(cfg, undefined, "2026-12-24")).toBeUndefined();
    expect(closureOnDay(cfg, "svc-dinner", "2026-12-24")).toMatchObject({ id: "c1" });
  });
});

describe("hasSpecialHours", () => {
  it("finds special hours on a date", () => {
    const cfg = config([
      {
        id: "sh1",
        kind: "special_hours",
        targetKind: "venue",
        startsOn: "2026-12-24",
        endsOn: "2026-12-24",
        payload: { version: 1, services: [] },
      },
    ]);
    expect(hasSpecialHours(cfg, "2026-12-24")).toBe(true);
  });

  it("says no when nothing covers the date", () => {
    const cfg = config([
      {
        id: "sh1",
        kind: "special_hours",
        targetKind: "venue",
        startsOn: "2026-12-24",
        endsOn: "2026-12-24",
        payload: { version: 1, services: [] },
      },
    ]);
    expect(hasSpecialHours(cfg, "2026-12-27")).toBe(false);
  });
});

describe("findReopenable", () => {
  const closure = {
    id: "c1",
    kind: "closure",
    targetKind: "venue",
    startsOn: "2026-12-24",
    endsOn: "2026-12-26",
  };
  const want = {
    from: "2026-12-24",
    to: "2026-12-26",
    scope: "whole_venue" as const,
    serviceId: undefined,
  };

  it("finds the one closure whose scope and span match exactly", () => {
    const cfg = config([closure]);
    expect(findReopenable(cfg, want)).toEqual({ rule: closure });
  });

  it("refuses when no closed rules are there", () => {
    const cfg = config([]);
    expect(findReopenable(cfg, want)).toEqual({
      error: expect.stringMatching(/No closure or special hours cover 2026-12-24/),
    });
  });

  it("refuses when a closure covers the dates but not that scope", () => {
    const cfg = config([{ ...closure, targetKind: "service", venueServiceId: "svc-dinner" }]);
    expect(findReopenable(cfg, want)).toEqual({
      error: expect.stringMatching(/not for that scope/),
    });
  });

  it("refuses when only part of the span matches", () => {
    const cfg = config([closure]);
    expect(findReopenable(cfg, { ...want, to: "2026-12-25" })).toEqual({
      error: expect.stringMatching(/runs from 2026-12-24 to 2026-12-26/),
    });
  });

  it("refuses when more than one closure shares the scope and span", () => {
    const cfg = config([closure, { ...closure, id: "c2" }]);
    expect(findReopenable(cfg, want)).toEqual({
      error: expect.stringMatching(/can't be told apart/),
    });
  });

  it("refuses special hours, which can't be reopened from the chat", () => {
    const cfg = config([
      { ...closure, kind: "special_hours", payload: { version: 1, services: [] } },
    ]);
    expect(findReopenable(cfg, want)).toEqual({
      error: expect.stringMatching(/Special hours can't be removed from the chat/),
    });
  });

  it("refuses a closure that belongs to a repeating series", () => {
    const cfg = config([{ ...closure, seriesId: "series-1" }]);
    expect(findReopenable(cfg, want)).toEqual({
      error: expect.stringMatching(/repeats or belongs to a repeating series/),
    });
  });
});

describe("checkHours", () => {
  it("reads normal same-day hours", () => {
    expect(checkHours({ opensAt: "17:00", lastSeating: "21:00", closesAt: "23:00" })).toEqual({
      opensAt: 1020,
      lastSeatingAt: 1260,
      closesAt: 1380,
    });
  });

  it("wraps a close after midnight onto the two-day scale", () => {
    expect(checkHours({ opensAt: "17:00", lastSeating: "00:30", closesAt: "01:00" })).toEqual({
      opensAt: 1020,
      lastSeatingAt: 1470,
      closesAt: 1500,
    });
  });

  it("refuses closing at the same time as opening", () => {
    expect(checkHours({ opensAt: "17:00", lastSeating: "17:00", closesAt: "17:00" })).toEqual({
      error: expect.stringMatching(/opening and closing/),
    });
  });

  it("refuses a last seating after the close", () => {
    expect(checkHours({ opensAt: "17:00", lastSeating: "23:30", closesAt: "23:00" })).toEqual({
      error: expect.stringMatching(/last seating/),
    });
  });
});
