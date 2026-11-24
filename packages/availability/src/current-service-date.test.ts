import type { AvailabilityConfig } from "@mbe/types";
import { describe, expect, it } from "vitest";
import { currentServiceDate, lastServiceDate } from "./current-service-date.js";

const TZ = "America/Los_Angeles";

// Every day: one Dinner service 17:00 to 02:00 (past midnight).
const dinnerConfig = (closesAt: number, lastSeatingAt: number): AvailabilityConfig => ({
  schedules: [{ id: "s1", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [{ id: "v1", name: "Dinner", position: 0 }],
  scheduleServices: [
    {
      id: "ss1",
      scheduleId: "s1",
      venueServiceId: "v1",
      opensAt: 1020,
      lastSeatingAt,
      closesAt,
      seating: { version: 1, interval: 15 },
      bookingTypes: ["online", "phone"],
      weekdays: [],
      dayHours: { version: 1, sets: [] },
    },
  ],
  assignments: [{ id: "a1", scheduleId: "s1", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 }],
  dateRules: [],
});

const config = dinnerConfig(1560, 1380);

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

describe("lastServiceDate", () => {
  const last = (cfg: AvailabilityConfig, iso: string) =>
    lastServiceDate({ timezone: TZ, config: cfg }, new Date(iso));

  it("is Friday at Sat 01:15 after a Fri 17:00-01:00 service", () => {
    expect(last(dinnerConfig(1500, 1440), "2026-11-07T09:15:00Z")).toBe("2026-11-06");
  });

  it("is Friday at Sat 00:15 after a Fri 17:00-23:00 service", () => {
    expect(last(dinnerConfig(1380, 1320), "2026-11-07T08:15:00Z")).toBe("2026-11-06");
  });

  it("is Saturday at Sat 18:00, during that evening's service", () => {
    expect(last(dinnerConfig(1380, 1320), "2026-11-08T02:00:00Z")).toBe("2026-11-07");
  });

  it("is still last night's day while its service runs past midnight", () => {
    expect(last(config, "2026-11-07T09:00:00Z")).toBe("2026-11-06");
  });

  it("is yesterday on a day with no services at all", () => {
    const closed = { ...dinnerConfig(1380, 1320), assignments: [] };
    expect(last(closed, "2026-11-07T18:00:00Z")).toBe("2026-11-06");
  });
});
