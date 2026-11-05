import type { AvailabilityConfig } from "@mbe/types";

/**
 * Test fixture: the PRD demo week as one regular schedule. Lunch Mon-Fri, Dinner Tue-Sun
 * closing later Fri-Sat, Brunch Sat-Sun. Rows are in the canonical form `encodeWeek` produces,
 * so Dinner's base hours are the ones most of its days share (Tue, Wed, Thu, Sun) and Fri-Sat is
 * one set.
 */
const SEATING = { version: 1, interval: 15 } as const;
const BOOKING_TYPES = ["online", "phone"] as const;

export const DEMO_WEEK_CONFIG: AvailabilityConfig = {
  schedules: [{ id: "demo-regular", name: "Regular week", kind: "regular", isRegular: true }],
  venueServices: [
    { id: "demo-lunch", name: "Lunch", position: 0 },
    { id: "demo-dinner", name: "Dinner", position: 1 },
    { id: "demo-brunch", name: "Brunch", position: 2 },
  ],
  scheduleServices: [
    {
      id: "demo-ss-lunch",
      scheduleId: "demo-regular",
      venueServiceId: "demo-lunch",
      opensAt: 690,
      lastSeatingAt: 840,
      closesAt: 900,
      seating: SEATING,
      bookingTypes: [...BOOKING_TYPES],
      weekdays: [1, 2, 3, 4, 5],
      dayHours: { version: 1, sets: [] },
    },
    {
      id: "demo-ss-dinner",
      scheduleId: "demo-regular",
      venueServiceId: "demo-dinner",
      opensAt: 1020,
      lastSeatingAt: 1260,
      closesAt: 1380,
      seating: SEATING,
      bookingTypes: [...BOOKING_TYPES],
      weekdays: [2, 3, 4, 0],
      dayHours: {
        version: 1,
        sets: [
          {
            weekdays: [5, 6],
            opensAt: 1020,
            lastSeatingAt: 1320,
            closesAt: 1440,
            seating: SEATING,
            bookingTypes: [...BOOKING_TYPES],
          },
        ],
      },
    },
    {
      id: "demo-ss-brunch",
      scheduleId: "demo-regular",
      venueServiceId: "demo-brunch",
      opensAt: 600,
      lastSeatingAt: 780,
      closesAt: 840,
      seating: SEATING,
      bookingTypes: [...BOOKING_TYPES],
      weekdays: [6, 0],
      dayHours: { version: 1, sets: [] },
    },
  ],
  assignments: [
    {
      id: "demo-as-regular",
      scheduleId: "demo-regular",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      precedence: 0,
    },
  ],
  dateRules: [],
};

export const DEMO_WEEK_TZ = "America/Los_Angeles";
/** A Monday, so the demo week's Monday (Lunch only) can be resolved. */
export const DEMO_WEEK_MONDAY = "2026-11-02";
