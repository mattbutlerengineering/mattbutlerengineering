import { describe, it, expect } from "vitest";
import { computeReservationLayout } from "./reservationLayout.js";

describe("computeReservationLayout", () => {
  const baseParams = {
    startHour: 11,
    hourWidth: 120,
    isMobile: false,
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
});
