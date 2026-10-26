import type { AvailabilityConfig, ScheduleAssignment, ScheduleService } from "@mbe/types";
import { describe, expect, it } from "vitest";
import { serviceDayInstant } from "./instant.js";
import { resolveDay, type AvailabilitySnapshot } from "./resolve-day.js";

const TZ = "America/Los_Angeles";

const service = (
  id: string,
  scheduleId: string,
  opensAt: number,
  lastSeatingAt: number,
  closesAt: number
): ScheduleService => ({
  id,
  scheduleId,
  venueServiceId: `vs-${id.split("-")[1]}`,
  opensAt,
  lastSeatingAt,
  closesAt,
  seating: { version: 1, interval: 15 },
  bookingTypes: ["online", "phone"],
});

const assignment = (
  id: string,
  scheduleId: string,
  weekdays: number[],
  precedence: number,
  range: Pick<ScheduleAssignment, "startsOn" | "endsOn"> = {}
): ScheduleAssignment => ({ id, scheduleId, weekdays, precedence, ...range });

const BASE: AvailabilityConfig = {
  schedules: [
    { id: "regular", name: "Regular", kind: "regular", isRegular: true },
    { id: "summer", name: "Summer", kind: "alternate", isRegular: false },
  ],
  venueServices: [
    { id: "vs-lunch", name: "Lunch", position: 0 },
    { id: "vs-dinner", name: "Dinner", position: 1 },
    { id: "vs-late", name: "Late Night", position: 2 },
  ],
  scheduleServices: [
    service("regular-dinner", "regular", 1020, 1260, 1380),
    service("regular-lunch", "regular", 690, 840, 900),
    service("summer-dinner", "summer", 1080, 1320, 1440),
  ],
  // Closed Mondays.
  assignments: [assignment("as-regular", "regular", [0, 2, 3, 4, 5, 6], 0)],
  dateRules: [],
};

const snapshot = (config: Partial<AvailabilityConfig> = {}): AvailabilitySnapshot => ({
  timezone: TZ,
  config: { ...BASE, ...config },
});

const serviceIds = (s: AvailabilitySnapshot, date: string) =>
  resolveDay(s, date).services.map((r) => r.scheduleServiceId);

describe("resolveDay — regular schedule", () => {
  it("returns the regular schedule's services in opening order", () => {
    const day = resolveDay(snapshot(), "2026-10-23"); // Friday
    expect(day.serviceDate).toBe("2026-10-23");
    expect(day.scheduleId).toBe("regular");
    expect(day.services).toEqual([
      {
        scheduleServiceId: "regular-lunch",
        venueServiceId: "vs-lunch",
        name: "Lunch",
        opensAt: 690,
        lastSeatingAt: 840,
        closesAt: 900,
        seating: { version: 1, interval: 15 },
        bookingTypes: ["online", "phone"],
      },
      expect.objectContaining({ scheduleServiceId: "regular-dinner", name: "Dinner" }),
    ]);
  });

  it("is closed on a weekday no assignment covers", () => {
    const day = resolveDay(snapshot(), "2026-10-26"); // Monday
    expect(day.scheduleId).toBeNull();
    expect(day.services).toEqual([]);
  });

  it("leaves out services whose venue service is archived", () => {
    const s = snapshot({
      venueServices: BASE.venueServices.map((v) =>
        v.id === "vs-lunch" ? { ...v, archivedAt: "2026-10-01T00:00:00Z" } : v
      ),
    });
    expect(serviceIds(s, "2026-10-23")).toEqual(["regular-dinner"]);
  });

  it("ignores assignments of an archived schedule", () => {
    const s = snapshot({
      schedules: BASE.schedules.map((sch) =>
        sch.id === "summer" ? { ...sch, archivedAt: "2026-10-01T00:00:00Z" } : sch
      ),
      assignments: [...BASE.assignments, assignment("as-summer", "summer", [5], 10)],
    });
    expect(resolveDay(s, "2026-10-23").scheduleId).toBe("regular");
  });
});

describe("resolveDay — assignments", () => {
  const summer = assignment("as-summer", "summer", [4, 5, 6], 10, {
    startsOn: "2027-06-01",
    endsOn: "2027-08-31",
  });
  const s = snapshot({ assignments: [...BASE.assignments, summer] });

  it("lets the higher precedence win where assignments overlap", () => {
    expect(resolveDay(s, "2027-07-02").scheduleId).toBe("summer"); // Friday
    expect(serviceIds(s, "2027-07-02")).toEqual(["summer-dinner"]);
  });

  it("keeps the lower precedence on weekdays the winner doesn't cover", () => {
    expect(resolveDay(s, "2027-07-04").scheduleId).toBe("regular"); // Sunday
  });

  it("starts a range on its first date and ends it after its last", () => {
    expect(resolveDay(s, "2027-05-29").scheduleId).toBe("regular"); // Sat before
    expect(resolveDay(s, "2027-06-03").scheduleId).toBe("summer"); // first Thursday in range
    expect(resolveDay(s, "2027-06-01").scheduleId).toBe("regular"); // Tuesday — not a summer weekday
    expect(resolveDay(s, "2027-08-28").scheduleId).toBe("summer"); // last Saturday
    expect(resolveDay(s, "2027-09-02").scheduleId).toBe("regular"); // Thursday after
  });

  it("includes both boundary dates of a range", () => {
    const boundary = snapshot({
      assignments: [
        ...BASE.assignments,
        assignment("as-one", "summer", [0, 1, 2, 3, 4, 5, 6], 5, {
          startsOn: "2027-06-01",
          endsOn: "2027-06-02",
        }),
      ],
    });
    expect(resolveDay(boundary, "2027-05-31").scheduleId).toBeNull(); // Monday, closed
    expect(resolveDay(boundary, "2027-06-01").scheduleId).toBe("summer");
    expect(resolveDay(boundary, "2027-06-02").scheduleId).toBe("summer");
    expect(resolveDay(boundary, "2027-06-03").scheduleId).toBe("regular");
  });

  it("supports an open-ended range", () => {
    const openEnded = snapshot({
      assignments: [
        ...BASE.assignments,
        assignment("as-from", "summer", [5], 5, { startsOn: "2027-01-01" }),
      ],
    });
    expect(resolveDay(openEnded, "2026-12-25").scheduleId).toBe("regular");
    expect(resolveDay(openEnded, "2030-01-04").scheduleId).toBe("summer");
  });
});

describe("resolveDay — services past midnight (ADR-029)", () => {
  const s = snapshot({
    scheduleServices: [
      ...BASE.scheduleServices,
      service("regular-late", "regular", 1380, 1500, 1560), // 23:00 → 02:00
    ],
  });

  it("belongs to the service day it opened on", () => {
    const friday = resolveDay(s, "2026-10-23");
    expect(friday.services.at(-1)).toMatchObject({
      scheduleServiceId: "regular-late",
      opensAt: 1380,
      closesAt: 1560,
    });
  });

  it("does not appear on the next calendar date's service day", () => {
    // Sunday 00:00–02:00 is Saturday's Late Night, not Sunday's: Sunday's own
    // services all open on Sunday, and none starts at or before 02:00.
    const sunday = resolveDay(s, "2026-10-25");
    expect(sunday.services.length).toBeGreaterThan(0);
    expect(sunday.services.every((r) => r.opensAt >= 120)).toBe(true);
    expect(sunday.services.map((r) => r.opensAt)).toEqual([690, 1020, 1380]);
  });
});

describe("resolveDay — DST weekends", () => {
  const late = snapshot({
    scheduleServices: [
      ...BASE.scheduleServices,
      service("regular-late", "regular", 1380, 1500, 1560),
    ],
  });

  it("resolves the fall-back weekend by civil date, and its late service spans one extra hour", () => {
    const saturday = resolveDay(late, "2026-10-31");
    expect(saturday.scheduleId).toBe("regular");
    const lateNight = saturday.services.find((r) => r.scheduleServiceId === "regular-late");
    expect(lateNight).toBeDefined();
    const opens = serviceDayInstant("2026-10-31", lateNight!.opensAt, TZ);
    const closes = serviceDayInstant("2026-10-31", lateNight!.closesAt, TZ);
    // 23:00 PDT → 02:00 PST is four real hours, not three.
    expect(closes!.getTime() - opens!.getTime()).toBe(4 * 60 * 60_000);
  });

  it("resolves the spring-forward weekend by civil date, in any process time zone", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
        process.env.TZ = tz;
        expect(resolveDay(late, "2027-03-13").scheduleId).toBe("regular"); // Saturday
        expect(resolveDay(late, "2027-03-14").scheduleId).toBe("regular"); // Sunday
        expect(resolveDay(late, "2027-03-15").scheduleId).toBeNull(); // Monday
      }
    } finally {
      process.env.TZ = original;
    }
    const saturday = resolveDay(late, "2027-03-13");
    const lateNight = saturday.services.find((r) => r.scheduleServiceId === "regular-late")!;
    const opens = serviceDayInstant("2027-03-13", lateNight.opensAt, TZ)!;
    const closes = serviceDayInstant("2027-03-13", lateNight.closesAt, TZ)!;
    // 23:00 PST → 02:00 on spring-forward night; 02:00 doesn't exist, so it is null.
    expect(closes).toBeNull();
    expect(opens.toISOString()).toBe("2027-03-14T07:00:00.000Z");
  });
});
