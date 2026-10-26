import { describe, expect, it } from "vitest";
import type { AvailabilityConfig } from "@mbe/types";
import { currentServiceDate } from "./current-service-date.js";

// Every day: one Dinner service 17:00 to 02:00 (past midnight).
const config: AvailabilityConfig = {
  schedules: [{ id: "s1", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [{ id: "v1", name: "Dinner", position: 0 }],
  scheduleServices: [
    {
      id: "ss1",
      scheduleId: "s1",
      venueServiceId: "v1",
      opensAt: 1020,
      lastSeatingAt: 1380,
      closesAt: 1560,
      seating: { version: 1, interval: 15 },
      bookingTypes: ["online", "phone"],
    },
  ],
  assignments: [{ id: "a1", scheduleId: "s1", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 }],
  dateRules: [],
};

const TZ = "America/Los_Angeles";

describe("currentServiceDate", () => {
  it("is the calendar date while a service is open", () => {
    // Thu 2026-10-22 20:00 PDT
    expect(currentServiceDate(config, TZ, new Date("2026-10-23T03:00:00Z"))).toBe("2026-10-22");
  });

  it("stays on the previous day at 00:30 while service runs past midnight", () => {
    // Fri 2026-10-23 00:30 PDT is still Thursday's service
    expect(currentServiceDate(config, TZ, new Date("2026-10-23T07:30:00Z"))).toBe("2026-10-22");
  });

  it("is the calendar date before the first service opens", () => {
    // Fri 2026-10-23 10:00 PDT
    expect(currentServiceDate(config, TZ, new Date("2026-10-23T17:00:00Z"))).toBe("2026-10-23");
  });
});
