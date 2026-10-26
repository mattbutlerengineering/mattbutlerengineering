import { describe, it, expect } from "vitest";
import { computeReservationLayout, serviceDayMinute } from "./reservationLayout.js";

describe("computeReservationLayout", () => {
  const baseParams = {
    startHour: 11,
    hourWidth: 120,
    isMobile: false,
    serviceDate: "2026-05-14",
  };

  it("computes left offset from startTime", () => {
    // 18:00 - 11:00 = 7 hours → 7 * 120 = 840
    const result = computeReservationLayout(
      "2026-05-14T18:00:00",
      "2026-05-14T20:00:00",
      baseParams
    );
    expect(result.left).toBe(840);
  });

  it("computes width from duration", () => {
    // 2 hours = 120 min → (120/60)*120 - 4 = 236
    const result = computeReservationLayout(
      "2026-05-14T18:00:00",
      "2026-05-14T20:00:00",
      baseParams
    );
    expect(result.width).toBe(236);
  });

  it("handles fractional hours in start time", () => {
    // 18:30 - 11:00 = 7.5 hours → 7.5 * 120 = 900
    const result = computeReservationLayout(
      "2026-05-14T18:30:00",
      "2026-05-14T20:00:00",
      baseParams
    );
    expect(result.left).toBe(900);
  });

  it("handles fractional hours in duration", () => {
    // 90 min → (90/60)*120 - 4 = 176
    const result = computeReservationLayout(
      "2026-05-14T18:00:00",
      "2026-05-14T19:30:00",
      baseParams
    );
    expect(result.width).toBe(176);
  });

  it("enforces minimum width of 40 on desktop", () => {
    // 5 min → (5/60)*120 - 4 = 6 → clamped to 40
    const result = computeReservationLayout(
      "2026-05-14T18:00:00",
      "2026-05-14T18:05:00",
      baseParams
    );
    expect(result.width).toBe(40);
  });

  it("enforces minimum width of 30 on mobile", () => {
    const result = computeReservationLayout("2026-05-14T18:00:00", "2026-05-14T18:05:00", {
      ...baseParams,
      isMobile: true,
      hourWidth: 60,
    });
    expect(result.width).toBe(30);
  });

  it("uses hourWidth to scale positions", () => {
    // hourWidth=60 (mobile): 7 hours → 7 * 60 = 420
    const result = computeReservationLayout("2026-05-14T18:00:00", "2026-05-14T20:00:00", {
      ...baseParams,
      hourWidth: 60,
    });
    expect(result.left).toBe(420);
  });

  it("handles startHour=0", () => {
    // midnight start
    const result = computeReservationLayout("2026-05-14T01:00:00", "2026-05-14T02:00:00", {
      ...baseParams,
      startHour: 0,
    });
    // 1 hour offset → 120
    expect(result.left).toBe(120);
  });

  describe("past midnight (ADR-029 service day)", () => {
    const tz = "America/Los_Angeles";
    // 23:30 PDT Thu 14 May = 06:30Z Fri 15 May
    const params = { ...baseParams, startHour: 17, serviceDate: "2026-05-14", timeZone: tz };

    it("lays out a 23:30-01:30 reservation with a positive width on the service day's axis", () => {
      const result = computeReservationLayout(
        "2026-05-15T06:30:00Z",
        "2026-05-15T08:30:00Z",
        params
      );
      // 23:30 - 17:00 = 6.5h -> 780; 120 min -> 236
      expect(result.left).toBe(780);
      expect(result.width).toBe(236);
    });

    it("places a 00:30 seating after Thursday's 23:00 edge, not at the start of the grid", () => {
      const result = computeReservationLayout(
        "2026-05-15T07:30:00Z",
        "2026-05-15T09:00:00Z",
        params
      );
      // 24:30 - 17:00 = 7.5h -> 900
      expect(result.left).toBe(900);
    });

    it("serviceDayMinute keeps counting past midnight and goes negative before it", () => {
      expect(serviceDayMinute(new Date("2026-05-15T07:30:00Z"), "2026-05-14", tz)).toBe(1470);
      expect(serviceDayMinute(new Date("2026-05-14T06:30:00Z"), "2026-05-14", tz)).toBe(-30);
      expect(serviceDayMinute(new Date("2026-05-15T01:00:00Z"), "2026-05-14", tz)).toBe(1080);
    });
  });
});
