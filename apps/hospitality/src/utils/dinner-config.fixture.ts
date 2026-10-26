import type { AvailabilityConfig } from "@mbe/types";

/** Test fixture: every day, one Dinner service 17:00 to 02:00 (runs past midnight). */
export const DINNER_CONFIG: AvailabilityConfig = {
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

export const DINNER_TZ = "America/Los_Angeles";
