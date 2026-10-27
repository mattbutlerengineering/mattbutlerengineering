import { describe, expect, it } from "vitest";
import { resolveDay } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import { findStrandedReservations, summarizeDay } from "./availability-config-checks.js";

const TZ = "America/Los_Angeles";

const CONFIG: AvailabilityConfig = {
  schedules: [{ id: "sch-1", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
  scheduleServices: [
    {
      id: "ss-1",
      scheduleId: "sch-1",
      venueServiceId: "vs-dinner",
      opensAt: 1020,
      lastSeatingAt: 1260,
      closesAt: 1320,
      seating: { version: 1, interval: 15 },
      bookingTypes: ["online", "phone"],
    },
  ],
  assignments: [
    { id: "as-1", scheduleId: "sch-1", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
  ],
  dateRules: [],
};

const closedOn = (date: string): AvailabilityConfig => ({
  ...CONFIG,
  dateRules: [{ id: "dr-c", kind: "closure", targetKind: "venue", startsOn: date, endsOn: date }],
});

// 2026-11-06 19:00 in Los Angeles (PST, UTC-8).
const BOOKING = {
  id: "res-1",
  tableId: "t-1",
  startTime: new Date("2026-11-07T03:00:00.000Z"),
  partySize: 2,
};

describe("findStrandedReservations", () => {
  it("reports a booking the change closes", () => {
    const stranded = findStrandedReservations(
      { timezone: TZ, config: CONFIG },
      { timezone: TZ, config: closedOn("2026-11-06") },
      [BOOKING]
    );

    expect(stranded).toEqual([
      { id: "res-1", startTime: "2026-11-07T03:00:00.000Z", partySize: 2, reason: "closed" },
    ]);
  });

  it("reports a booking left outside shortened hours", () => {
    const shortened = {
      ...CONFIG,
      scheduleServices: [{ ...CONFIG.scheduleServices[0]!, lastSeatingAt: 1080, closesAt: 1110 }],
    };

    const stranded = findStrandedReservations(
      { timezone: TZ, config: CONFIG },
      { timezone: TZ, config: shortened },
      [BOOKING]
    );

    expect(stranded.map((s) => s.reason)).toEqual(["outside_service"]);
  });

  it("reports a past-midnight booking against the service day it belongs to", () => {
    // Dinner runs 17:00 – 02:00; 00:30 on Sat 7 Nov is Friday's service day.
    const late = {
      ...CONFIG,
      scheduleServices: [{ ...CONFIG.scheduleServices[0]!, lastSeatingAt: 1530, closesAt: 1560 }],
    };
    const booking = { ...BOOKING, startTime: new Date("2026-11-07T08:30:00.000Z") };

    const stranded = findStrandedReservations(
      { timezone: TZ, config: late },
      { timezone: TZ, config: { ...late, dateRules: closedOn("2026-11-06").dateRules } },
      [booking]
    );

    expect(stranded.map((s) => s.reason)).toEqual(["closed"]);
  });

  it("ignores a booking that was already outside service before the change", () => {
    const closed = { timezone: TZ, config: closedOn("2026-11-06") };
    expect(findStrandedReservations(closed, closed, [BOOKING])).toEqual([]);
  });

  it("ignores a booking the change leaves bookable", () => {
    const later = {
      ...CONFIG,
      scheduleServices: [{ ...CONFIG.scheduleServices[0]!, closesAt: 1380 }],
    };
    expect(
      findStrandedReservations({ timezone: TZ, config: CONFIG }, { timezone: TZ, config: later }, [
        BOOKING,
      ])
    ).toEqual([]);
  });
});

describe("summarizeDay", () => {
  it("labels a regular day with its schedule name", () => {
    const day = resolveDay({ timezone: TZ, config: CONFIG }, "2026-11-06");
    expect(summarizeDay(CONFIG, day)).toMatchObject({
      serviceDate: "2026-11-06",
      label: "Regular",
      serviceCount: 1,
      closures: [],
      services: [
        {
          venueServiceId: "vs-dinner",
          name: "Dinner",
          opensAt: 1020,
          lastSeatingAt: 1260,
          closesAt: 1320,
        },
      ],
    });
  });

  it("labels a whole-day closure Closed, keeps its band and returns no services", () => {
    const config = closedOn("2026-11-06");
    const day = resolveDay({ timezone: TZ, config }, "2026-11-06");
    expect(summarizeDay(config, day)).toMatchObject({
      label: "Closed",
      closures: [{ ruleId: "dr-c", targetKind: "venue", from: 0, to: 2880 }],
      services: [],
    });
  });

  it("names the paused channels of a booking closure and omits them elsewhere", () => {
    const config: AvailabilityConfig = {
      ...CONFIG,
      dateRules: [
        {
          id: "dr-b",
          kind: "closure",
          targetKind: "booking",
          bookingTypes: ["online"],
          startsOn: "2026-11-06",
          endsOn: "2026-11-06",
        },
        {
          id: "dr-v",
          kind: "closure",
          targetKind: "venue",
          startsOn: "2026-11-06",
          endsOn: "2026-11-06",
        },
      ],
    };
    const day = resolveDay({ timezone: TZ, config }, "2026-11-06");
    const { closures } = summarizeDay(config, day);
    expect(closures.find((c) => c.ruleId === "dr-b")?.bookingTypes).toEqual(["online"]);
    expect(closures.find((c) => c.ruleId === "dr-v")).not.toHaveProperty("bookingTypes");
  });

  it("labels special hours", () => {
    const config: AvailabilityConfig = {
      ...CONFIG,
      dateRules: [
        {
          id: "dr-s",
          kind: "special_hours",
          targetKind: "venue",
          startsOn: "2026-11-06",
          endsOn: "2026-11-06",
          payload: { version: 1, services: [] },
        },
      ],
    };
    const day = resolveDay({ timezone: TZ, config }, "2026-11-06");
    expect(summarizeDay(config, day).label).toBe("Closed");
    const open: AvailabilityConfig = {
      ...config,
      dateRules: [
        {
          ...config.dateRules[0]!,
          kind: "special_hours",
          payload: {
            version: 1,
            services: [
              {
                venueServiceId: "vs-dinner",
                opensAt: 1080,
                lastSeatingAt: 1200,
                closesAt: 1260,
                seating: { version: 1, interval: 15 },
                bookingTypes: ["online"],
              },
            ],
          },
        },
      ],
    };
    const openDay = resolveDay({ timezone: TZ, config: open }, "2026-11-06");
    expect(summarizeDay(open, openDay).label).toBe("Special hours");
  });

  it("keeps a schedule named 'Closed' its own services, not the closed-day empty list", () => {
    const config: AvailabilityConfig = {
      ...CONFIG,
      schedules: [{ id: "sch-1", name: "Closed", kind: "regular", isRegular: true }],
    };
    const day = resolveDay({ timezone: TZ, config }, "2026-11-06");
    const result = summarizeDay(config, day);
    expect(result.label).toBe("Closed");
    expect(result.services).toEqual([
      {
        venueServiceId: "vs-dinner",
        name: "Dinner",
        opensAt: 1020,
        lastSeatingAt: 1260,
        closesAt: 1320,
      },
    ]);
  });
});
