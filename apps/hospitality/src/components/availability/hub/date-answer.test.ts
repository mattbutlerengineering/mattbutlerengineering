import { describe, expect, it } from "vitest";
import { validateConfig } from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { dateAnswer } from "./date-answer.js";

const TIMEZONE = "America/Los_Angeles";
const SEATING = { version: 1, interval: 15 } as const;
const BOOKING_TYPES: ("online" | "phone")[] = ["online", "phone"];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** A Thursday inside Winter hours: ux.md walkthrough 7. */
const DEC_24 = "2026-12-24";
/** A Thursday before Winter hours start. */
const NOV_12 = "2026-11-12";

const dinner = (opensAt: number, lastSeatingAt: number, closesAt: number) => ({
  venueServiceId: "vs-dinner",
  opensAt,
  lastSeatingAt,
  closesAt,
  seating: SEATING,
  bookingTypes: BOOKING_TYPES,
});

/**
 * Regular hours from Jan 1, 2026: Dinner 5:00 PM to 10:00 PM every day. Winter hours, Dec 1 to
 * Feb 28: Dinner 5:00 PM to 9:00 PM.
 */
function venue(...dateRules: DateRule[]): AvailabilityConfig {
  const config: AvailabilityConfig = {
    schedules: [
      { id: "regular", name: "Regular hours", kind: "regular", isRegular: true },
      { id: "winter", name: "Winter hours", kind: "alternate", isRegular: false },
    ],
    venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
    scheduleServices: [
      {
        id: "ss-regular-dinner",
        scheduleId: "regular",
        ...dinner(1020, 1260, 1320),
        weekdays: [],
        dayHours: { version: 1, sets: [] },
      },
      {
        id: "ss-winter-dinner",
        scheduleId: "winter",
        ...dinner(1020, 1200, 1260),
        weekdays: [],
        dayHours: { version: 1, sets: [] },
      },
    ],
    assignments: [
      {
        id: "as-regular",
        scheduleId: "regular",
        weekdays: EVERY_DAY,
        startsOn: "2026-01-01",
        precedence: 0,
      },
      {
        id: "as-winter",
        scheduleId: "winter",
        weekdays: EVERY_DAY,
        startsOn: "2026-12-01",
        endsOn: "2027-02-28",
        precedence: 1,
      },
    ],
    dateRules,
  };
  // A fixture the server would refuse proves nothing about a real venue.
  expect(validateConfig(config)).toEqual([]);
  return config;
}

/** Special date: Dinner 4:00 PM to 8:00 PM on Dec 24. */
const SPECIAL_DEC_24: DateRule = {
  id: "r-special",
  kind: "special_hours",
  targetKind: "venue",
  startsOn: DEC_24,
  endsOn: DEC_24,
  payload: { version: 1, services: [dinner(960, 1140, 1200)] },
};

/** The venue closes from 6:00 PM on Dec 24. */
const CLOSED_FROM_SIX: DateRule = {
  id: "r-closure",
  kind: "closure",
  targetKind: "venue",
  startsOn: DEC_24,
  endsOn: DEC_24,
  window: { version: 1, from: 1080, to: 2880 },
};

/** Closed every Thursday from 6:00 PM through the winter, and Dec 24 taken out of it. */
const THURSDAYS_FROM_SIX: DateRule = {
  id: "r-series",
  kind: "closure",
  targetKind: "venue",
  startsOn: "2026-12-01",
  endsOn: "2027-02-28",
  repeat: { version: 1, weekdays: [4] },
  window: { version: 1, from: 1080, to: 2880 },
};
const SKIP_DEC_24: DateRule = {
  id: "r-skip",
  kind: "skip",
  targetKind: "venue",
  startsOn: DEC_24,
  endsOn: DEC_24,
  seriesId: "r-series",
};

/** A change made for tonight: close at 8:00 PM on Nov 12. */
const TONIGHT_CLOSE_AT_EIGHT: DateRule = {
  id: "r-tonight",
  kind: "tonight",
  targetKind: "venue",
  startsOn: NOV_12,
  endsOn: NOV_12,
  payload: { version: 1, closeAt: 1200 },
};

const REGULAR = { kind: "regular", scheduleId: "regular", name: "Regular hours" };
const WINTER = { kind: "seasonal", scheduleId: "winter", name: "Winter hours" };

describe("dateAnswer", () => {
  it("names regular hours, with nothing beneath, when they alone cover the date", () => {
    expect(dateAnswer(venue(), TIMEZONE, NOV_12)).toEqual({
      date: NOV_12,
      services: [{ name: "Dinner", opensAt: 1020, closesAt: 1320 }],
      closedBand: null,
      deciding: REGULAR,
      beneath: null,
      hubRow: 1,
    });
  });

  it("names seasonal hours over regular hours", () => {
    const answer = dateAnswer(venue(), TIMEZONE, "2026-12-10");
    expect(answer).toMatchObject({ deciding: WINTER, beneath: REGULAR, hubRow: 2 });
    expect(answer?.services).toEqual([{ name: "Dinner", opensAt: 1020, closesAt: 1260 }]);
  });

  it("names a special date over seasonal hours", () => {
    const answer = dateAnswer(venue(SPECIAL_DEC_24), TIMEZONE, DEC_24);
    expect(answer).toMatchObject({
      deciding: { kind: "special", ruleId: "r-special" },
      beneath: WINTER,
      hubRow: 3,
      closedBand: null,
    });
    expect(answer?.services).toEqual([{ name: "Dinner", opensAt: 960, closesAt: 1200 }]);
  });

  it("names a closure from a time over a special date (walkthrough 7)", () => {
    expect(dateAnswer(venue(SPECIAL_DEC_24, CLOSED_FROM_SIX), TIMEZONE, DEC_24)).toEqual({
      date: DEC_24,
      services: [{ name: "Dinner", opensAt: 960, closesAt: 1200 }],
      closedBand: { from: 1080, to: 2880 },
      deciding: { kind: "closure", ruleId: "r-closure" },
      beneath: { kind: "special", ruleId: "r-special" },
      hubRow: 4,
    });
  });

  it("never names a skip: a skipped series date falls to the hours beneath", () => {
    const config = venue(THURSDAYS_FROM_SIX, SKIP_DEC_24);
    expect(dateAnswer(config, TIMEZONE, DEC_24)).toMatchObject({
      deciding: WINTER,
      beneath: REGULAR,
      hubRow: 2,
      closedBand: null,
    });
    // The Thursday before is still closed by the series.
    expect(dateAnswer(config, TIMEZONE, "2026-12-17")).toMatchObject({
      deciding: { kind: "closure", ruleId: "r-series" },
      beneath: WINTER,
      hubRow: 4,
    });
  });

  it("names a tonight change over the hours it changes", () => {
    const answer = dateAnswer(venue(TONIGHT_CLOSE_AT_EIGHT), TIMEZONE, NOV_12);
    expect(answer).toMatchObject({
      deciding: { kind: "tonight", ruleId: "r-tonight" },
      beneath: REGULAR,
      hubRow: 4,
    });
    expect(answer?.services).toEqual([{ name: "Dinner", opensAt: 1020, closesAt: 1200 }]);
  });

  it("answers closed with no deciding rule for a date no rule covers", () => {
    expect(dateAnswer(venue(), TIMEZONE, "2025-12-01")).toEqual({
      date: "2025-12-01",
      services: [],
      closedBand: null,
      deciding: null,
      beneath: null,
      hubRow: null,
    });
  });

  it.each(["", "not-a-date", "12/24/2026", "2026-02-30", "2026-13-01"])(
    "returns null for the invalid date %j",
    (date) => {
      expect(dateAnswer(venue(), TIMEZONE, date)).toBeNull();
    }
  );
});
