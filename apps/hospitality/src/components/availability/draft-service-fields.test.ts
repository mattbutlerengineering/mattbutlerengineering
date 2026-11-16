import { describe, expect, it } from "vitest";
import type { DraftService } from "./draft-changes.js";
import { applyFieldsToService, serviceFieldsOf } from "./draft-service-fields.js";

const DINNER: DraftService = {
  key: "dinner",
  venueServiceId: "svc-dinner",
  scheduleServiceId: null,
  name: "Dinner",
  opensAt: 17 * 60,
  lastSeatingAt: 21 * 60,
  closesAt: 22 * 60,
  seating: { version: 1, interval: 15 },
  bookingTypes: ["online", "phone"],
};

describe("serviceFieldsOf", () => {
  it("reads minutes as clocks and never follows the close with the last seating", () => {
    expect(serviceFieldsOf(DINNER)).toEqual({
      opens: "17:00",
      lastSeating: "21:00",
      closes: "22:00",
      lastSeatingLinked: false,
      seating: DINNER.seating,
      bookingTypes: DINNER.bookingTypes,
    });
  });

  it("reads a close past midnight as the clock it shows", () => {
    expect(serviceFieldsOf({ ...DINNER, closesAt: 25 * 60 }).closes).toBe("01:00");
  });
});

describe("applyFieldsToService", () => {
  const apply = (service: DraftService, patch: Partial<ReturnType<typeof serviceFieldsOf>>) =>
    applyFieldsToService(service, { ...serviceFieldsOf(service), ...patch });

  it("hands back the same row when nothing changed", () => {
    expect(apply(DINNER, {})).toBe(DINNER);
  });

  it("keeps the clocks shown when the opening moves, and only re-places the day they fall on", () => {
    const next = apply(
      { ...DINNER, opensAt: 22 * 60, closesAt: 25 * 60, lastSeatingAt: 24 * 60 },
      {
        opens: "23:30",
      }
    );
    expect(next.opensAt).toBe(23 * 60 + 30);
    expect(next.lastSeatingAt).toBe(24 * 60);
    expect(next.closesAt).toBe(25 * 60);
  });

  it("puts a close earlier than the opening on the next day", () => {
    expect(apply(DINNER, { closes: "01:00" }).closesAt).toBe(25 * 60);
  });

  it("puts a last seating earlier than the opening on the next day", () => {
    expect(apply(DINNER, { lastSeating: "00:15" }).lastSeatingAt).toBe(24 * 60 + 15);
  });

  it("leaves a time alone while the picker is cleared", () => {
    expect(apply(DINNER, { closes: null })).toBe(DINNER);
  });

  it("takes seating and booking types as given", () => {
    const next = apply(DINNER, {
      seating: { version: 1, interval: 30 },
      bookingTypes: ["online"],
    });
    expect(next.seating).toEqual({ version: 1, interval: 30 });
    expect(next.bookingTypes).toEqual(["online"]);
    expect(next.opensAt).toBe(DINNER.opensAt);
  });
});
