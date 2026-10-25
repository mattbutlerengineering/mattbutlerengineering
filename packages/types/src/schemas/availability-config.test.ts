import { describe, expect, it } from "vitest";
import {
  AvailabilityConfigSchema,
  DateRuleSchema,
  ScheduleAssignmentSchema,
  ScheduleServiceSchema,
  SeatingSchema,
  TonightPayloadSchema,
  WindowSchema,
} from "./availability-config.js";

const DINNER = {
  id: "ss-dinner",
  scheduleId: "sch-regular",
  venueServiceId: "vs-dinner",
  opensAt: 1020,
  lastSeatingAt: 1260,
  closesAt: 1380,
  seating: { version: 1, interval: 15 },
  bookingTypes: ["online", "phone"],
};

const VALID_CONFIG = {
  schedules: [{ id: "sch-regular", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
  scheduleServices: [DINNER],
  assignments: [
    { id: "as-1", scheduleId: "sch-regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
  ],
  dateRules: [
    {
      id: "dr-xmas",
      kind: "closure",
      targetKind: "venue",
      startsOn: "2026-12-25",
      endsOn: "2026-12-25",
    },
  ],
};

describe("SeatingSchema", () => {
  it("accepts an interval and a fixed list of seating times", () => {
    expect(SeatingSchema.safeParse({ version: 1, interval: 15 }).success).toBe(true);
    expect(SeatingSchema.safeParse({ version: 1, fixed: [1080, 1245] }).success).toBe(true);
  });

  it("rejects an unknown payload version", () => {
    expect(SeatingSchema.safeParse({ version: 2, interval: 15 }).success).toBe(false);
  });

  it("rejects a zero interval and an empty fixed list", () => {
    expect(SeatingSchema.safeParse({ version: 1, interval: 0 }).success).toBe(false);
    expect(SeatingSchema.safeParse({ version: 1, fixed: [] }).success).toBe(false);
  });
});

describe("WindowSchema", () => {
  it("accepts minutes past the service day's midnight, including past midnight", () => {
    expect(WindowSchema.safeParse({ version: 1, from: 1320, to: 1500 }).success).toBe(true);
  });

  it("rejects a minute beyond two days", () => {
    expect(WindowSchema.safeParse({ version: 1, from: 0, to: 2881 }).success).toBe(false);
  });
});

describe("TonightPayloadSchema", () => {
  it("accepts each Tonight change", () => {
    expect(TonightPayloadSchema.safeParse({ version: 1, pacing: { covers: 20 } }).success).toBe(
      true
    );
    expect(TonightPayloadSchema.safeParse({ version: 1, closeAt: 1260 }).success).toBe(true);
    expect(
      TonightPayloadSchema.safeParse({ version: 1, stop: { from: 1140, to: 1200 } }).success
    ).toBe(true);
  });

  it("rejects an unknown payload version", () => {
    expect(TonightPayloadSchema.safeParse({ version: 3, closeAt: 1260 }).success).toBe(false);
  });
});

describe("ScheduleServiceSchema", () => {
  it("accepts a service that runs past midnight", () => {
    expect(
      ScheduleServiceSchema.safeParse({ ...DINNER, lastSeatingAt: 1440, closesAt: 1560 }).success
    ).toBe(true);
  });

  it("rejects an opening at or after the service day's end", () => {
    expect(ScheduleServiceSchema.safeParse({ ...DINNER, opensAt: 1440 }).success).toBe(false);
  });

  it("rejects an unknown booking type", () => {
    expect(ScheduleServiceSchema.safeParse({ ...DINNER, bookingTypes: ["waitlist"] }).success).toBe(
      false
    );
  });
});

describe("ScheduleAssignmentSchema", () => {
  it("rejects a weekday outside 0–6", () => {
    expect(
      ScheduleAssignmentSchema.safeParse({
        id: "as-1",
        scheduleId: "sch-regular",
        weekdays: [7],
        precedence: 0,
      }).success
    ).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(
      ScheduleAssignmentSchema.safeParse({
        id: "as-1",
        scheduleId: "sch-regular",
        weekdays: [1],
        startsOn: "2026-6-1",
        precedence: 0,
      }).success
    ).toBe(false);
  });
});

describe("DateRuleSchema", () => {
  it("requires a special-hours payload on a special_hours rule", () => {
    const rule = {
      id: "dr-1",
      kind: "special_hours",
      targetKind: "venue",
      startsOn: "2026-12-24",
    };
    expect(DateRuleSchema.safeParse(rule).success).toBe(false);
    expect(
      DateRuleSchema.safeParse({
        ...rule,
        payload: {
          version: 1,
          services: [
            {
              venueServiceId: "vs-dinner",
              opensAt: 960,
              lastSeatingAt: 1140,
              closesAt: 1260,
              seating: { version: 1, interval: 30 },
              bookingTypes: ["online"],
            },
          ],
        },
      }).success
    ).toBe(true);
  });

  it("requires the schedule on a use_schedule rule", () => {
    const rule = { id: "dr-2", kind: "use_schedule", targetKind: "venue", startsOn: "2026-07-01" };
    expect(DateRuleSchema.safeParse(rule).success).toBe(false);
    expect(DateRuleSchema.safeParse({ ...rule, useScheduleId: "sch-summer" }).success).toBe(true);
  });

  it("accepts an open-ended closure of online booking with a guest message", () => {
    expect(
      DateRuleSchema.safeParse({
        id: "dr-3",
        kind: "closure",
        targetKind: "booking",
        bookingTypes: ["online"],
        startsOn: "2026-11-01",
        endsOn: null,
        guestMessage: "Online booking is paused — call us.",
      }).success
    ).toBe(true);
  });

  it("rejects a guest message over 200 characters", () => {
    expect(
      DateRuleSchema.safeParse({
        id: "dr-4",
        kind: "closure",
        targetKind: "venue",
        startsOn: "2026-11-01",
        guestMessage: "x".repeat(201),
      }).success
    ).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(
      DateRuleSchema.safeParse({
        id: "dr-5",
        kind: "holiday",
        targetKind: "venue",
        startsOn: "2026-11-01",
      }).success
    ).toBe(false);
  });
});

describe("AvailabilityConfigSchema", () => {
  it("accepts a whole venue configuration", () => {
    expect(AvailabilityConfigSchema.safeParse(VALID_CONFIG).success).toBe(true);
  });

  it("reports an unknown payload version at its field path", () => {
    const result = AvailabilityConfigSchema.safeParse({
      ...VALID_CONFIG,
      scheduleServices: [{ ...DINNER, seating: { version: 9, interval: 15 } }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.slice(0, 3))).toContainEqual([
      "scheduleServices",
      0,
      "seating",
    ]);
  });
});
