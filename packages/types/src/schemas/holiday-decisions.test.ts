import { describe, expect, it } from "vitest";
import {
  HOLIDAY_DECISIONS_MAX_RANGE,
  HolidayDecisionKindSchema,
  HolidayDecisionSchema,
  HolidayDecisionsQuerySchema,
  SetHolidayDecisionBodySchema,
} from "./holiday-decisions.js";
import { holidayDecisionEndpoints } from "../endpoints/holiday-decisions.js";

describe("HolidayDecisionSchema", () => {
  const row = {
    serviceDate: "2026-11-26",
    decision: "open_as_usual",
    createdAt: "2026-11-08T10:00:00.000Z",
  };

  it("accepts a decision row", () => {
    expect(HolidayDecisionSchema.parse(row)).toEqual(row);
  });

  it("rejects a bad date and a decision it does not know", () => {
    expect(HolidayDecisionSchema.safeParse({ ...row, serviceDate: "26/11/2026" }).success).toBe(
      false
    );
    expect(HolidayDecisionSchema.safeParse({ ...row, decision: "closed" }).success).toBe(false);
  });

  it("has one kind today", () => {
    expect(HolidayDecisionKindSchema.options).toEqual(["open_as_usual"]);
  });
});

describe("SetHolidayDecisionBodySchema", () => {
  it("accepts open_as_usual and rejects anything else", () => {
    expect(SetHolidayDecisionBodySchema.safeParse({ decision: "open_as_usual" }).success).toBe(
      true
    );
    expect(SetHolidayDecisionBodySchema.safeParse({ decision: "closed" }).success).toBe(false);
    expect(SetHolidayDecisionBodySchema.safeParse({}).success).toBe(false);
  });
});

describe("HolidayDecisionsQuerySchema", () => {
  it("accepts a range, a single day and the longest allowed range", () => {
    expect(
      HolidayDecisionsQuerySchema.safeParse({ from: "2026-11-08", to: "2027-11-08" }).success
    ).toBe(true);
    expect(
      HolidayDecisionsQuerySchema.safeParse({ from: "2026-11-08", to: "2026-11-08" }).success
    ).toBe(true);
    // 2026-01-01 .. 2027-02-04 is 400 days inclusive.
    expect(HOLIDAY_DECISIONS_MAX_RANGE).toBe(400);
    expect(
      HolidayDecisionsQuerySchema.safeParse({ from: "2026-01-01", to: "2027-02-04" }).success
    ).toBe(true);
  });

  it("rejects to before from, a range over 400 days, and a bad date", () => {
    expect(
      HolidayDecisionsQuerySchema.safeParse({ from: "2026-11-09", to: "2026-11-08" }).success
    ).toBe(false);
    expect(
      HolidayDecisionsQuerySchema.safeParse({ from: "2026-01-01", to: "2027-02-05" }).success
    ).toBe(false);
    expect(
      HolidayDecisionsQuerySchema.safeParse({ from: "2026-02-31", to: "2026-03-01" }).success
    ).toBe(false);
    expect(HolidayDecisionsQuerySchema.safeParse({ from: "nope", to: "2026-03-01" }).success).toBe(
      false
    );
  });
});

describe("holidayDecisionEndpoints", () => {
  it("declares list, set and clear under the venues prefix", () => {
    expect(holidayDecisionEndpoints.list).toMatchObject({
      method: "GET",
      path: "/api/v1/venues/:id/availability/holiday-decisions",
    });
    expect(holidayDecisionEndpoints.set).toMatchObject({
      method: "PUT",
      path: "/api/v1/venues/:id/availability/holiday-decisions/:serviceDate",
    });
    expect(holidayDecisionEndpoints.clear).toMatchObject({
      method: "DELETE",
      path: "/api/v1/venues/:id/availability/holiday-decisions/:serviceDate",
    });
  });
});
