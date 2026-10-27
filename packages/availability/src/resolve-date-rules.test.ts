import type { AvailabilityConfig, DateRule, ScheduleService } from "@mbe/types";
import { describe, expect, it } from "vitest";
import { resolveDay, type AvailabilitySnapshot, type ResolvedDay } from "./resolve-day.js";

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

const BASE: AvailabilityConfig = {
  schedules: [
    { id: "regular", name: "Regular", kind: "regular", isRegular: true },
    { id: "brunch", name: "Brunch", kind: "alternate", isRegular: false },
  ],
  venueServices: [
    { id: "vs-lunch", name: "Lunch", position: 0 },
    { id: "vs-dinner", name: "Dinner", position: 1 },
    { id: "vs-brunch", name: "Brunch", position: 2 },
  ],
  scheduleServices: [
    service("regular-lunch", "regular", 690, 840, 900),
    service("regular-dinner", "regular", 1020, 1260, 1380),
    service("brunch-brunch", "brunch", 600, 780, 840),
  ],
  assignments: [
    { id: "as-week", scheduleId: "regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
  ],
  dateRules: [],
};

const withRules = (...dateRules: DateRule[]): AvailabilitySnapshot => ({
  timezone: "America/Los_Angeles",
  config: { ...BASE, dateRules },
});

const FRIDAY = "2026-12-25";
const OPEN = { online: true, phone: true, waitlist: true };

const ids = (day: ResolvedDay) => day.services.map((s) => s.scheduleServiceId);

/** resolveDay with the row `id` removed, without its explanation. */
function resolvedWithout(snapshot: AvailabilitySnapshot, id: string, date: string) {
  const { config } = snapshot;
  const { explanation: _, ...day } = resolveDay(
    {
      ...snapshot,
      config: {
        ...config,
        assignments: config.assignments.filter((a) => a.id !== id),
        dateRules: config.dateRules.filter((r) => r.id !== id),
      },
    },
    date
  );
  return day;
}

describe("resolveDay — no date rules", () => {
  it("is open on every booking type with a single schedule layer", () => {
    const day = resolveDay(withRules(), FRIDAY);
    expect(day.bookingOpen).toEqual(OPEN);
    expect(day.closures).toEqual([]);
    expect(day.explanation.map((l) => [l.kind, l.id])).toEqual([["schedule", "as-week"]]);
  });
});

describe("resolveDay — special_hours", () => {
  const rule: DateRule = {
    id: "dr-eve",
    kind: "special_hours",
    targetKind: "venue",
    startsOn: FRIDAY,
    endsOn: FRIDAY,
    payload: {
      version: 1,
      services: [
        {
          venueServiceId: "vs-dinner",
          opensAt: 960,
          lastSeatingAt: 1140,
          closesAt: 1320,
          seating: { version: 1, fixed: [960, 1140] },
          bookingTypes: ["online"],
        },
      ],
    },
  };

  it("replaces the day's services", () => {
    const day = resolveDay(withRules(rule), FRIDAY);
    expect(day.services).toEqual([
      {
        scheduleServiceId: null,
        venueServiceId: "vs-dinner",
        name: "Dinner",
        opensAt: 960,
        lastSeatingAt: 1140,
        closesAt: 1320,
        seating: { version: 1, fixed: [960, 1140] },
        bookingTypes: ["online"],
      },
    ]);
    expect(day.explanation.map((l) => l.kind)).toEqual(["schedule", "special_hours"]);
  });

  it("leaves other dates alone", () => {
    expect(ids(resolveDay(withRules(rule), "2026-12-26"))).toEqual([
      "regular-lunch",
      "regular-dinner",
    ]);
  });
});

describe("resolveDay — use_schedule", () => {
  it("swaps in another schedule for the date", () => {
    const day = resolveDay(
      withRules({
        id: "dr-brunch",
        kind: "use_schedule",
        targetKind: "venue",
        startsOn: FRIDAY,
        useScheduleId: "brunch",
      }),
      FRIDAY
    );
    expect(day.scheduleId).toBe("brunch");
    expect(ids(day)).toEqual(["brunch-brunch"]);
  });
});

describe("resolveDay — closures", () => {
  it("closes the whole venue for the day", () => {
    const day = resolveDay(
      withRules({
        id: "dr-xmas",
        kind: "closure",
        targetKind: "venue",
        startsOn: FRIDAY,
        endsOn: FRIDAY,
        guestMessage: "Merry Christmas — see you on the 26th.",
      }),
      FRIDAY
    );
    expect(day.services).toEqual([]);
    expect(day.closures).toEqual([{ ruleId: "dr-xmas", targetKind: "venue", from: 0, to: 2880 }]);
    expect(day.guestMessage).toBe("Merry Christmas — see you on the 26th.");
  });

  it("closes one service", () => {
    const day = resolveDay(
      withRules({
        id: "dr-lunch",
        kind: "closure",
        targetKind: "service",
        venueServiceId: "vs-lunch",
        startsOn: FRIDAY,
      }),
      FRIDAY
    );
    expect(ids(day)).toEqual(["regular-dinner"]);
  });

  it("closes one booking type, keeping the services", () => {
    const day = resolveDay(
      withRules({
        id: "dr-phone-only",
        kind: "closure",
        targetKind: "booking",
        bookingTypes: ["online", "waitlist"],
        startsOn: FRIDAY,
      }),
      FRIDAY
    );
    expect(ids(day)).toEqual(["regular-lunch", "regular-dinner"]);
    expect(day.bookingOpen).toEqual({ online: false, phone: true, waitlist: false });
  });

  it("keeps services but records a band for a windowed closure", () => {
    const day = resolveDay(
      withRules({
        id: "dr-band",
        kind: "closure",
        targetKind: "venue",
        startsOn: FRIDAY,
        window: { version: 1, from: 1320, to: 1380 },
      }),
      FRIDAY
    );
    expect(ids(day)).toEqual(["regular-lunch", "regular-dinner"]);
    expect(day.closures).toEqual([
      { ruleId: "dr-band", targetKind: "venue", from: 1320, to: 1380 },
    ]);
  });

  it("records the tables a table closure blocks", () => {
    const day = resolveDay(
      withRules({
        id: "dr-patio",
        kind: "closure",
        targetKind: "tables",
        tableIds: ["t-1", "t-2"],
        startsOn: FRIDAY,
      }),
      FRIDAY
    );
    expect(day.closures).toEqual([
      { ruleId: "dr-patio", targetKind: "tables", tableIds: ["t-1", "t-2"], from: 0, to: 2880 },
    ]);
  });

  it("covers every date of a range, inclusive", () => {
    const vacation = withRules({
      id: "dr-vacation",
      kind: "closure",
      targetKind: "venue",
      startsOn: "2027-01-04",
      endsOn: "2027-01-10",
    });
    expect(resolveDay(vacation, "2027-01-03").services).not.toEqual([]);
    expect(resolveDay(vacation, "2027-01-04").services).toEqual([]);
    expect(resolveDay(vacation, "2027-01-10").services).toEqual([]);
    expect(resolveDay(vacation, "2027-01-11").services).not.toEqual([]);
  });

  it("stays in force when open-ended", () => {
    const paused = withRules({
      id: "dr-pause",
      kind: "closure",
      targetKind: "booking",
      bookingTypes: ["online"],
      startsOn: "2026-11-01",
      endsOn: null,
      guestMessage: "Online booking is paused — call us.",
    });
    expect(resolveDay(paused, "2026-10-31").bookingOpen.online).toBe(true);
    expect(resolveDay(paused, "2031-06-01").bookingOpen.online).toBe(false);
  });

  it("repeats only on its weekdays within its range", () => {
    const mondays = withRules({
      id: "dr-mondays",
      kind: "closure",
      targetKind: "venue",
      startsOn: "2027-01-01",
      endsOn: "2027-03-31",
      repeat: { version: 1, weekdays: [1] },
    });
    expect(resolveDay(mondays, "2027-01-04").services).toEqual([]); // Monday
    expect(resolveDay(mondays, "2027-01-05").services).not.toEqual([]); // Tuesday
    expect(resolveDay(mondays, "2027-04-05").services).not.toEqual([]); // Monday after
  });
});

describe("resolveDay — skip", () => {
  const series: DateRule = {
    id: "dr-mondays",
    kind: "closure",
    targetKind: "venue",
    startsOn: "2027-01-01",
    endsOn: "2027-03-31",
    repeat: { version: 1, weekdays: [1] },
  };
  const skip: DateRule = {
    id: "dr-skip",
    kind: "skip",
    targetKind: "venue",
    startsOn: "2027-01-11",
    endsOn: "2027-01-11",
    seriesId: "dr-mondays",
  };

  it("resolves a skipped series date as bookable", () => {
    const day = resolveDay(withRules(series, skip), "2027-01-11");
    expect(ids(day)).toEqual(["regular-lunch", "regular-dinner"]);
    expect(day.closures).toEqual([]);
    expect(day.explanation.map((l) => [l.kind, l.id])).toEqual([
      ["schedule", "as-week"],
      ["skip", "dr-skip"],
    ]);
  });

  it("leaves the rest of the series in force", () => {
    expect(resolveDay(withRules(series, skip), "2027-01-18").services).toEqual([]);
  });

  it("lets an edited date replace its series on that date", () => {
    const edited: DateRule = {
      ...series,
      id: "dr-edit",
      repeat: null,
      startsOn: "2027-01-25",
      endsOn: "2027-01-25",
      window: { version: 1, from: 1200, to: 2880 },
      seriesId: "dr-mondays",
    };
    const day = resolveDay(withRules(series, edited), "2027-01-25");
    expect(ids(day)).toEqual(["regular-lunch", "regular-dinner"]);
    expect(day.closures).toEqual([
      { ruleId: "dr-edit", targetKind: "venue", from: 1200, to: 2880 },
    ]);
  });
});

describe("resolveDay — review follow-ups", () => {
  const series: DateRule = {
    id: "dr-fridays",
    kind: "closure",
    targetKind: "venue",
    startsOn: "2026-11-01",
    endsOn: "2026-12-31",
    repeat: { version: 1, weekdays: [5] },
  };

  it("names the series a skip takes out", () => {
    const day = resolveDay(
      withRules(series, {
        id: "dr-skip",
        kind: "skip",
        targetKind: "venue",
        startsOn: "2026-11-06",
        seriesId: "dr-fridays",
      }),
      "2026-11-06"
    );
    expect(day.explanation.find((l) => l.kind === "skip")?.label).toBe(
      "Skipped from: Closed · Fridays · 2026-11-01 – 2026-12-31"
    );
  });

  it("keeps a skip to its own date even without an end date", () => {
    const s = withRules(series, {
      id: "dr-skip",
      kind: "skip",
      targetKind: "venue",
      startsOn: "2026-11-06",
      seriesId: "dr-fridays",
    });
    expect(resolveDay(s, "2026-11-06").services).not.toEqual([]);
    expect(resolveDay(s, "2026-11-13").services).toEqual([]);
  });

  it("ignores a Tonight close-early aimed at booking types or tables", () => {
    const day = resolveDay(
      withRules({
        id: "dr-tonight",
        kind: "tonight",
        targetKind: "booking",
        bookingTypes: ["online"],
        startsOn: FRIDAY,
        payload: { version: 1, closeAt: 960 },
      }),
      FRIDAY
    );
    expect(ids(day)).toEqual(["regular-lunch", "regular-dinner"]);
  });
});

describe("resolveDay — tonight", () => {
  const closeEarly: DateRule = {
    id: "dr-tonight",
    kind: "tonight",
    targetKind: "venue",
    startsOn: FRIDAY,
    endsOn: FRIDAY,
    payload: { version: 1, closeAt: 1200 },
  };

  it("closes early on its own service date", () => {
    const day = resolveDay(withRules(closeEarly), FRIDAY);
    expect(day.services.find((s) => s.venueServiceId === "vs-dinner")).toMatchObject({
      lastSeatingAt: 1200,
      closesAt: 1200,
    });
  });

  it("drops a service that would open after the early close", () => {
    const day = resolveDay(
      withRules({ ...closeEarly, payload: { version: 1, closeAt: 960 } }),
      FRIDAY
    );
    expect(ids(day)).toEqual(["regular-lunch"]);
  });

  it("is ignored on any other service date, even inside a stale range", () => {
    const stale = withRules({ ...closeEarly, endsOn: "2026-12-31" });
    expect(resolveDay(stale, "2026-12-26").services.at(-1)?.closesAt).toBe(1380);
    expect(resolveDay(stale, "2026-12-26").explanation.map((l) => l.kind)).toEqual(["schedule"]);
  });

  it("stops a slot for its target", () => {
    const day = resolveDay(
      withRules({
        ...closeEarly,
        targetKind: "booking",
        bookingTypes: ["online"],
        payload: { version: 1, stop: { from: 1140, to: 2880 } },
      }),
      FRIDAY
    );
    expect(day.closures).toEqual([
      {
        ruleId: "dr-tonight",
        targetKind: "booking",
        bookingTypes: ["online"],
        from: 1140,
        to: 2880,
      },
    ]);
  });

  it("closes the booking types of a whole-day stop, not of a windowed one", () => {
    const pause: DateRule = {
      ...closeEarly,
      targetKind: "booking",
      bookingTypes: ["online"],
      payload: { version: 1, stop: { from: 0, to: 2880 } },
    };
    expect(resolveDay(withRules(pause), FRIDAY).bookingOpen).toEqual({
      online: false,
      phone: true,
      waitlist: true,
    });
    const windowed = { ...pause, payload: { version: 1 as const, stop: { from: 1140, to: 2880 } } };
    expect(resolveDay(withRules(windowed), FRIDAY).bookingOpen.online).toBe(true);
  });

  it("lowers tonight's pacing", () => {
    const day = resolveDay(
      withRules({ ...closeEarly, payload: { version: 1, pacing: { covers: 12 } } }),
      FRIDAY
    );
    expect(day.pacingCovers).toBe(12);
  });
});

describe("resolveDay — explanation", () => {
  const stack = withRules(
    {
      id: "dr-brunch",
      kind: "use_schedule",
      targetKind: "venue",
      startsOn: FRIDAY,
      useScheduleId: "brunch",
    },
    {
      id: "dr-pause",
      kind: "closure",
      targetKind: "booking",
      bookingTypes: ["online"],
      startsOn: "2026-12-01",
      guestMessage: "Call us to book.",
    },
    {
      id: "dr-tonight",
      kind: "tonight",
      targetKind: "venue",
      startsOn: FRIDAY,
      payload: { version: 1, closeAt: 780 },
    }
  );

  it("lists contributing layers bottom-up", () => {
    expect(resolveDay(stack, FRIDAY).explanation.map((l) => [l.kind, l.id])).toEqual([
      ["schedule", "as-week"],
      ["use_schedule", "dr-brunch"],
      ["closure", "dr-pause"],
      ["tonight", "dr-tonight"],
    ]);
  });

  it("gives each layer a label and an effect", () => {
    for (const layer of resolveDay(stack, FRIDAY).explanation) {
      expect(layer.label).not.toBe("");
      expect(layer.effect).not.toBe("");
    }
  });

  it("makes each layer's removalResult equal resolveDay with that layer removed", () => {
    for (const layer of resolveDay(stack, FRIDAY).explanation) {
      expect(layer.removalResult).toEqual(resolvedWithout(stack, layer.id, FRIDAY));
    }
  });

  it("does the same for a skip layer", () => {
    const skipped = withRules(
      {
        id: "dr-mondays",
        kind: "closure",
        targetKind: "venue",
        startsOn: "2027-01-01",
        repeat: { version: 1, weekdays: [1] },
      },
      {
        id: "dr-skip",
        kind: "skip",
        targetKind: "venue",
        startsOn: "2027-01-11",
        seriesId: "dr-mondays",
      }
    );
    for (const layer of resolveDay(skipped, "2027-01-11").explanation) {
      expect(layer.removalResult).toEqual(resolvedWithout(skipped, layer.id, "2027-01-11"));
    }
  });
});
