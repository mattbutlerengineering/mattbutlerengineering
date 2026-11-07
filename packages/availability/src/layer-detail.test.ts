import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { describe, expect, it } from "vitest";
import { resolveDay } from "./resolve-day.js";

const SEATING = { version: 1, interval: 15 } as const;
const DATE = "2026-10-30"; // a Friday

const CONFIG: AvailabilityConfig = {
  schedules: [
    { id: "regular", name: "Regular week", kind: "regular", isRegular: true },
    { id: "summer", name: "Summer", kind: "alternate", isRegular: false },
  ],
  venueServices: [{ id: "vs-lunch", name: "Lunch", position: 0 }],
  scheduleServices: [
    {
      id: "ss-lunch",
      scheduleId: "summer",
      venueServiceId: "vs-lunch",
      opensAt: 690,
      lastSeatingAt: 840,
      closesAt: 900,
      seating: SEATING,
      bookingTypes: ["online", "phone"],
      weekdays: [],
      dayHours: { version: 1, sets: [] },
    },
  ],
  assignments: [{ id: "as-regular", scheduleId: "regular", weekdays: [5], precedence: 0 }],
  dateRules: [],
};

const ON_DAY = { startsOn: DATE, endsOn: DATE } as const;

function layers(...dateRules: DateRule[]) {
  return resolveDay({ timezone: "America/Los_Angeles", config: { ...CONFIG, dateRules } }, DATE)
    .explanation;
}

describe("Layer structured fields", () => {
  it("names the schedule and its services, empty when it has none", () => {
    const [schedule] = layers();
    expect(schedule).toMatchObject({
      label: "Regular week",
      effect: "Closed",
      scheduleName: "Regular week",
      hours: [],
    });
  });

  it("names the used schedule and its hours beside the en-US strings", () => {
    const use: DateRule = {
      ...ON_DAY,
      id: "r-use",
      kind: "use_schedule",
      targetKind: "venue",
      useScheduleId: "summer",
    };
    const layer = layers(use).find((l) => l.kind === "use_schedule");
    expect(layer).toMatchObject({
      label: "Use Summer",
      effect: "Lunch 11:30 AM – 3:00 PM",
      scheduleName: "Summer",
      hours: [{ name: "Lunch", opensAt: 690, closesAt: 900 }],
    });
  });

  it("describes a service closure, a skip and Tonight as data", () => {
    const series: DateRule = {
      id: "r-series",
      kind: "closure",
      targetKind: "service",
      venueServiceId: "vs-lunch",
      startsOn: "2026-10-01",
      endsOn: "2026-12-31",
      repeat: { version: 1, weekdays: [5] },
      window: { version: 1, from: 720, to: 780 },
    };
    const skip: DateRule = {
      ...ON_DAY,
      id: "r-skip",
      kind: "skip",
      targetKind: "service",
      seriesId: "r-series",
    };
    const tonight: DateRule = {
      ...ON_DAY,
      id: "r-close",
      kind: "tonight",
      targetKind: "venue",
      payload: { version: 1, closeAt: 1260 },
    };
    const found = layers(series, skip, tonight);
    expect(found.find((l) => l.kind === "skip")).toMatchObject({
      skippedFrom: {
        target: { kind: "service", serviceName: "Lunch" },
        weekdays: [5],
        startsOn: "2026-10-01",
        endsOn: "2026-12-31",
      },
    });
    expect(found.find((l) => l.kind === "tonight")).toMatchObject({
      effect: "Closes at 9:00 PM",
      tonight: { closeAt: 1260 },
    });
    const closure = layers({
      ...series,
      ...ON_DAY,
      id: "r-one",
      repeat: undefined,
    } as DateRule).find((l) => l.kind === "closure");
    expect(closure).toMatchObject({
      label: "Lunch closed",
      target: { kind: "service", serviceName: "Lunch" },
      window: { from: 720, to: 780 },
    });
  });
});
