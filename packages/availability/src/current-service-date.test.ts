import type { AvailabilityConfig } from "@mbe/types";
import { describe, expect, it } from "vitest";
import { currentServiceDate } from "./current-service-date.js";

const TZ = "America/Los_Angeles";

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
      weekdays: [],
      dayHours: { version: 1, sets: [] },
    },
  ],
  assignments: [{ id: "a1", scheduleId: "s1", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 }],
  dateRules: [],
};

const at = (iso: string) => currentServiceDate({ timezone: TZ, config }, new Date(iso));

describe("currentServiceDate", () => {
  it("is today's date while today's service is open", () => {
    // 2026-10-22 20:00 PDT
    expect(at("2026-10-23T03:00:00Z")).toBe("2026-10-22");
  });

  it("is still yesterday's past midnight while its service runs", () => {
    // 2026-10-23 00:30 PDT
    expect(at("2026-10-23T07:30:00Z")).toBe("2026-10-22");
  });

  it("is today's date once last night's service has closed, before tonight opens", () => {
    // 2026-10-23 10:00 PDT
    expect(at("2026-10-23T17:00:00Z")).toBe("2026-10-23");
  });

  it("uses the venue's calendar date, not UTC", () => {
    // 2026-10-23 01:30 PDT is 08:30 UTC on the 23rd, where nothing would be open
    expect(at("2026-10-23T08:30:00Z")).toBe("2026-10-22");
  });
});
