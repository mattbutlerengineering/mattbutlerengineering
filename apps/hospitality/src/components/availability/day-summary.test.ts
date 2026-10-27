import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { AvailabilityDaySummary } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { presentDay } from "./day-summary.js";

const t = ((key: string, values?: Record<string, string>) =>
  values ? `${key} ${Object.values(values).join("|")}` : key) as unknown as TFunction;
const format = {
  formatLocalTime: (time: string) => time,
  formatCalendarDate: () => "Friday, October 30",
} as unknown as VenueFormat;

const baseSummary: AvailabilityDaySummary = {
  serviceDate: "2026-10-30",
  label: "Regular hours",
  scheduleId: "sch-1",
  serviceCount: 2,
  closures: [],
  bookingOpen: { online: true, phone: true, waitlist: true },
  services: [
    { venueServiceId: "svc-1", name: "Lunch", opensAt: 660, lastSeatingAt: 810, closesAt: 840 },
    { venueServiceId: "svc-2", name: "Dinner", opensAt: 1080, lastSeatingAt: 1290, closesAt: 1320 },
  ],
};

describe("presentDay services", () => {
  it("emits a service line per service when detailed", () => {
    const view = presentDay("2026-10-30", baseSummary, true, t, format);
    expect(view.services).toEqual([
      { key: "svc-1", text: "availability.calendar.serviceLine Lunch|11:00|14:00" },
      { key: "svc-2", text: "availability.calendar.serviceLine Dinner|18:00|22:00" },
    ]);
  });

  it("speaks the services in order in the accessible details", () => {
    const view = presentDay("2026-10-30", baseSummary, true, t, format);
    expect(view.accessibleDetails).toBe(
      "Regular hours, availability.calendar.services 2, " +
        "availability.calendar.serviceLine Lunch|11:00|14:00, " +
        "availability.calendar.serviceLine Dinner|18:00|22:00"
    );
  });

  it("omits service lines when not detailed", () => {
    const view = presentDay("2026-10-30", baseSummary, false, t, format);
    expect(view.services).toEqual([]);
  });

  it("omits service lines when there is no summary", () => {
    const view = presentDay("2026-10-30", undefined, true, t, format);
    expect(view.services).toEqual([]);
  });
});
